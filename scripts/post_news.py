import argparse
import json
import re
import requests
import xml.etree.ElementTree as ET
import logging
import time
import subprocess
import os
import sys
from datetime import datetime, timedelta, timezone
from html import escape, unescape
import unicodedata

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

STATE_PATH = "state/last_post.json"
JANELA_DEDUPE_HORAS = 12
MIN_FONTE = 300


def _normalizar(titulo):
    """'Karoline Lima' e 'karoline lima' são a mesma trend."""
    sem_acento = unicodedata.normalize("NFKD", titulo or "")
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return " ".join(sem_acento.lower().split())


def _quando_de(post):
    try:
        quando = datetime.fromisoformat(post["quando"])
    except (KeyError, ValueError, TypeError):
        return None
    return quando.replace(tzinfo=timezone.utc) if quando.tzinfo is None else quando


def carregar_estado():
    """Janela de trends recentes. Aceita também o formato antigo de um post só."""
    try:
        with open(STATE_PATH) as f:
            dados = json.load(f)
    except (OSError, ValueError):
        return []
    if isinstance(dados, dict) and isinstance(dados.get("posts"), list):
        return dados["posts"]
    if isinstance(dados, dict) and dados.get("titulo"):
        return [dados]
    return []


def salvar_estado(posts):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w") as f:
        json.dump({"posts": posts}, f, ensure_ascii=False, indent=2)


def _urls_de(trend):
    return list(dict.fromkeys(
        u for u in [trend.get("news_url"), *trend.get("news_urls", [])] if u
    ))


def ja_publicado(trend, posts):
    """Evita repetir trend das últimas JANELA_DEDUPE_HORAS horas, por título ou por fonte."""
    limite = datetime.now(timezone.utc) - timedelta(hours=JANELA_DEDUPE_HORAS)
    alvo = _normalizar(trend["title"])
    urls = set(_urls_de(trend))
    for post in posts:
        quando = _quando_de(post)
        if not quando or quando <= limite:
            continue
        mesma_trend = _normalizar(post.get("titulo")) == alvo
        mesma_fonte = bool(urls & set(post.get("urls") or []))
        if mesma_trend or mesma_fonte:
            return True
    return False


def registrar_post(posts, trend):
    """Grava o post e poda o que saiu da janela. Falha de escrita não derruba o envio já feito."""
    agora = datetime.now(timezone.utc)
    limite = agora - timedelta(hours=JANELA_DEDUPE_HORAS)
    recentes = [p for p in posts if (_quando_de(p) or limite) > limite]
    recentes.append({
        "titulo": trend["title"],
        "urls": _urls_de(trend),
        "quando": agora.isoformat(),
    })
    try:
        salvar_estado(recentes)
    except OSError as e:
        logging.error(f"Estado não salvo ({e}); a próxima execução pode repetir esta trend.")

def extrair_texto(html, limite=6000):
    """A fonte chega como HTML bruto; o modelo precisa de texto, não de markup."""
    sem_script = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", " ", html)
    sem_tags = re.sub(r"(?s)<[^>]+>", " ", sem_script)
    texto = re.sub(r"\s+", " ", unescape(sem_tags)).strip()
    return texto[:limite]


class TrendFetcher:
    def __init__(self, rss_url):
        self.rss_url = rss_url

    def fetch_top_trend(self, retries=3):
        for i in range(retries):
            try:
                response = requests.get(self.rss_url, timeout=10)
                response.raise_for_status()
                root = ET.fromstring(response.content)
                ns = {'ht': 'https://trends.google.com/trending/rss'}
                
                items = []
                for item in root.findall('.//item'):
                    title = item.find('title').text
                    traffic_elem = item.find('ht:approx_traffic', ns)
                    traffic_str = traffic_elem.text if traffic_elem is not None else '0'
                    traffic = int(traffic_str.replace('+', '').replace(',', ''))
                    
                    # Extração de todas as notícias do item (o RSS traz 2-3 fontes)
                    urls, imagens = [], []
                    for noticia in item.findall('ht:news_item', ns):
                        u = noticia.find('ht:news_item_url', ns)
                        p = noticia.find('ht:news_item_picture', ns)
                        if u is not None and u.text:
                            urls.append(u.text)
                        if p is not None and p.text:
                            imagens.append(p.text)

                    items.append({
                        'title': title, 
                        'traffic': traffic,
                        'news_url': urls[0] if urls else None,
                        'news_urls': urls,
                        'image_url': imagens[0] if imagens else None
                    })
                
                if items:
                    return max(items, key=lambda x: x['traffic'])
            except Exception as e:
                logging.error(f"Attempt {i+1} failed: {e}")
                time.sleep(2)
        return None

class ContentGenerator:
    """Reescreve a matéria via API OpenAI-compatível (OpenAI, OmniRoute, OpenRouter...)."""

    def __init__(self):
        self.base_url = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.api_key = os.environ.get("LLM_API_KEY")
        self.model = os.environ.get("LLM_MODEL", "gpt-4o-mini")

    def generate(self, trend_data, source_content):
        if not self.api_key:
            raise SystemExit("LLM_API_KEY é obrigatório para reescrever a matéria")

        prompt = f"""
Você é jornalista sênior de um portal de notícias brasileiro.
Escreva uma matéria de blog, em português do Brasil, sobre o tema em alta: "{trend_data['title']}".

Baseie-se apenas nestes trechos da fonte original:
<fonte>
{source_content}
</fonte>

Regras:
1. Tom formal, impessoal e jornalístico. Sem gíria, sem "gente", sem primeira pessoa.
2. Texto longo e detalhado: de 5 a 8 parágrafos, no mínimo 450 palavras. Contextualize o assunto, explique o que aconteceu, quem está envolvido e o que se sabe até o momento. Não invente fatos ausentes da fonte; quando faltar informação, escreva de forma mais geral.
3. Título informativo e chamativo, sem sensacionalismo. NÃO adicione tags de qualquer tipo ao título.
4. Corpo em HTML usando apenas <p>, <h2> e <strong>. NÃO inclua imagem; ela é adicionada depois.
5. Responda APENAS com um objeto JSON: {{"titulo": "...", "html": "..."}}
"""

        resp = None
        for tentativa in range(1, 4):
            try:
                resp = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                    },
                    timeout=90,
                )
            except requests.RequestException as e:
                if tentativa == 3:
                    raise SystemExit(f"LLM inacessível após 3 tentativas: {e}")
                logging.warning(f"LLM inacessível ({e}); tentando de novo ({tentativa}/3).")
                time.sleep(5 * tentativa)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                if tentativa < 3:
                    logging.warning(f"LLM respondeu {resp.status_code}; tentando de novo ({tentativa}/3).")
                    time.sleep(5 * tentativa)
                    continue
            break

        if resp.status_code == 429:
            detalhe = resp.text[:300]
            raise SystemExit(f"LLM recusou por limite/cota (429): {detalhe}")
        resp.raise_for_status()
        bruto = resp.json()["choices"][0]["message"]["content"].strip()
        return self._parse(bruto, trend_data)

    @staticmethod
    def _parse(bruto, trend_data):
        texto = bruto.replace("```json", "").replace("```", "").strip()
        try:
            dados = json.loads(texto)
            return dados["titulo"], dados["html"]
        except (ValueError, KeyError, TypeError):
            logging.warning("Resposta da IA fora do formato JSON; usando fallback.")
            return trend_data["title"], f"<p>{texto}</p>"

    @staticmethod
    def montar_html(trend_data, corpo):
        imagem = escape(trend_data.get("image_url") or "", quote=True)
        if not imagem:
            return corpo
        titulo = escape(trend_data.get("title") or "", quote=True)
        return (
            f'<div style="text-align: center;">'
            f'<img src="{imagem}" alt="{titulo}" '
            f'style="max-width: 100%; width: 900px; height: auto; border-radius: 8px;">'
            f"</div>\n{corpo}"
        )

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    args = parser.parse_args(argv)

    fetcher = TrendFetcher("https://trends.google.com/trending/rss?geo=BR")
    generator = ContentGenerator()

    trend = fetcher.fetch_top_trend()
    if not trend:
        logging.error("No trend found.")
        return

    estado = carregar_estado()
    if ja_publicado(trend, estado):
        logging.info(f"Trend '{trend['title']}' já publicada nas últimas {JANELA_DEDUPE_HORAS}h. Nada a fazer.")
        return

    # Extração da fonte: tenta todas as URLs do RSS e usa o texto mais completo
    source_content = "Conteúdo indisponível na URL de origem."
    for url in dict.fromkeys([trend.get("news_url")] + trend.get("news_urls", [])):
        if not url:
            continue
        try:
            resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            texto = extrair_texto(resp.text)
        except Exception as e:
            logging.warning(f"Falha ao ler {url}: {e}")
            continue
        if len(texto) > len(source_content):
            source_content = texto
        if len(source_content) >= 1500:
            break

    if len(source_content) < MIN_FONTE:
        logging.error(
            f"Fonte com pouco conteúdo ({len(source_content)} chars); matéria não publicada "
            f"para evitar texto genérico. Trend registrada para não repetir."
        )
        registrar_post(estado, trend)
        return

    titulo, corpo = generator.generate(trend, source_content)
    content = generator.montar_html(trend, corpo)

    logging.info(f"Matéria gerada: {titulo}")

    # Envio do email
    try:
        logging.info(f"Sending email to {args.email}...")
        subprocess.run(
            [sys.executable, "scripts/enviar_email.py", args.email, titulo, content],
            check=True,
            env={**os.environ, "EMAIL_USER": os.environ.get("EMAIL_USER", ""), "APP_PASSWORD": os.environ.get("APP_PASSWORD", "")},
            capture_output=True,
            text=True
        )
        logging.info("Email sent successfully.")
    except subprocess.CalledProcessError as e:
        logging.error(f"Error sending email: {e.stderr}")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        sys.exit(1)

    registrar_post(estado, trend)


if __name__ == "__main__":
    main()
