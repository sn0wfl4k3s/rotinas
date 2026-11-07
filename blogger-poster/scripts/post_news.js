import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { sendEmail } from "./enviar_email.js";

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
/** Fica na raiz do repo, decidido pelo arquivo e não pelo diretório atual. */
export const STATE_PATH = path.join(AQUI, "..", "..", "state", "last_post.json");
export const JANELA_DEDUPE_HORAS = 12;
export const MIN_FONTE = 300;

const log = {
  info: (m) => console.error(`[info] ${m}`),
  warn: (m) => console.error(`[warn] ${m}`),
  error: (m) => console.error(`[error] ${m}`),
};

/** 'Karoline Lima' e 'karoline lima' são a mesma trend. */
export function normalizar(titulo) {
  return String(titulo ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Data sem timezone é tratada como UTC, igual ao script Python. */
export function quandoDe(post) {
  const bruto = post?.quando;
  if (!bruto) return null;
  const texto = String(bruto);
  const temFuso = /(Z|[+-]\d{2}:?\d{2})$/.test(texto);
  const data = new Date(temFuso ? texto : `${texto}Z`);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Aceita {"posts":[...]} e também o formato antigo, de um post só. */
export function carregarEstado(arquivo = STATE_PATH) {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, "utf-8"));
    if (Array.isArray(dados?.posts)) return dados.posts;
    if (dados?.titulo) return [dados];
  } catch {
    // arquivo ausente ou corrompido: começa do zero
  }
  return [];
}

export function salvarEstado(posts, arquivo = STATE_PATH) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify({ posts }, null, 2));
}

function urlsDe(trend) {
  return [...new Set([trend.news_url, ...(trend.news_urls || [])].filter(Boolean))];
}

export function jaPublicado(trend, posts) {
  const limite = Date.now() - JANELA_DEDUPE_HORAS * 3600_000;
  const alvo = normalizar(trend.title);
  const urls = new Set(urlsDe(trend));
  return posts.some((post) => {
    const quando = quandoDe(post);
    if (!quando || quando.getTime() <= limite) return false;
    const mesmaTrend = normalizar(post.titulo) === alvo;
    const mesmaFonte = (post.urls || []).some((u) => urls.has(u));
    return mesmaTrend || mesmaFonte;
  });
}

/** Grava o post e poda o que saiu da janela. Falha de escrita não derruba o envio já feito. */
export function registrarPost(posts, trend, arquivo = STATE_PATH) {
  const limite = Date.now() - JANELA_DEDUPE_HORAS * 3600_000;
  const recentes = posts.filter((p) => (quandoDe(p)?.getTime() ?? limite) > limite);
  recentes.push({
    titulo: trend.title,
    urls: urlsDe(trend),
    quando: new Date().toISOString(),
  });
  try {
    salvarEstado(recentes, arquivo);
  } catch (e) {
    log.error(`Estado não salvo (${e.message}); a próxima execução pode repetir esta trend.`);
  }
}

const ENTIDADES = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'",
  "&eacute;": "é", "&atilde;": "ã", "&ccedil;": "ç", "&oacute;": "ó", "&aacute;": "á",
  "&iacute;": "í", "&uacute;": "ú", "&acirc;": "â", "&ecirc;": "ê", "&ocirc;": "ô",
  "&agrave;": "à", "&otilde;": "õ", "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í",
  "&Oacute;": "Ó", "&Uacute;": "Ú", "&Atilde;": "Ã", "&Otilde;": "Õ", "&Ccedil;": "Ç",
  "&ldquo;": "\u201c", "&rdquo;": "\u201d", "&lsquo;": "\u2018", "&rsquo;": "\u2019",
  "&ndash;": "\u2013", "&mdash;": "\u2014", "&hellip;": "\u2026", "&laquo;": "\u00ab",
  "&raquo;": "\u00bb", "&deg;": "\u00b0", "&euro;": "\u20ac",
};

/** Resolve entidades nomeadas e numéricas. Tabela nomeada cobre o que aparece em notícia pt-BR. */
function decodificarEntidades(texto) {
  return texto.replace(/&(#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (inteiro, corpo) => {
    if (corpo.startsWith("#")) {
      const codigo = corpo[1] === "x" || corpo[1] === "X"
        ? Number.parseInt(corpo.slice(2), 16)
        : Number.parseInt(corpo.slice(1), 10);
      try {
        return String.fromCodePoint(codigo);
      } catch {
        return inteiro;
      }
    }
    return ENTIDADES[inteiro] ?? inteiro;
  });
}

/** A fonte chega como HTML bruto; o modelo precisa de texto, não de markup. */
export function extrairTexto(html, limite = 6000) {
  const semScript = String(html ?? "").replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const semTags = semScript.replace(/<[^>]+>/g, " ");
  const texto = decodificarEntidades(semTags).replace(/\s+/g, " ").trim();
  return texto.slice(0, limite);
}

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function montarHtml(trend, corpo) {
  const imagem = escaparHtml(trend.image_url || "");
  if (!imagem) return corpo;
  const titulo = escaparHtml(trend.title || "");
  return (
    '<div style="text-align: center;">' +
    `<img src="${imagem}" alt="${titulo}" ` +
    'style="max-width: 100%; width: 900px; height: auto; border-radius: 8px;">' +
    `</div>\n${corpo}`
  );
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class TrendFetcher {
  constructor(rssUrl, { fetchImpl = globalThis.fetch, sleep = esperar } = {}) {
    this.rssUrl = rssUrl;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
  }

  static parseXml(xml) {
    if (XMLValidator.validate(xml) !== true) throw new Error("RSS inválido");
    const doc = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      trimValues: true,
    }).parse(xml);
    const itens = [].concat(doc?.rss?.channel?.item ?? []);
    return itens
      .filter((item) => item?.title)
      .map((item) => {
        const noticias = [].concat(item.news_item ?? []);
        const urls = noticias.map((n) => n?.news_item_url).filter(Boolean);
        const imagens = noticias.map((n) => n?.news_item_picture).filter(Boolean);
        return {
          title: String(item.title),
          traffic: Number.parseInt(String(item.approx_traffic ?? "0").replace(/[+,]/g, ""), 10) || 0,
          news_url: urls[0] ?? null,
          news_urls: urls,
          image_url: imagens[0] ?? null,
        };
      });
  }

  async fetchTopTrend(retries = 3) {
    for (let i = 1; i <= retries; i++) {
      try {
        const resp = await this.fetchImpl(this.rssUrl, { signal: AbortSignal.timeout(10_000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const itens = TrendFetcher.parseXml(await resp.text());
        if (itens.length) return itens.reduce((a, b) => (b.traffic > a.traffic ? b : a));
      } catch (e) {
        log.error(`Tentativa ${i} falhou: ${e.message}`);
        await this.sleep(2000);
      }
    }
    return null;
  }
}

export class ContentGenerator {
  constructor({ fetchImpl = globalThis.fetch, sleep = esperar } = {}) {
    this.baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    this.apiKey = process.env.LLM_API_KEY;
    this.model = process.env.LLM_MODEL || "gpt-4o-mini";
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
  }

  async generate(trend, sourceContent) {
    if (!this.apiKey) throw new Error("LLM_API_KEY é obrigatório para reescrever a matéria");

    const prompt = `
Você é jornalista sênior de um portal de notícias brasileiro.
Escreva uma matéria de blog, em português do Brasil, sobre o tema em alta: "${trend.title}".

Baseie-se apenas nestes trechos da fonte original:
<fonte>
${sourceContent}
</fonte>

Regras:
1. Tom formal, impessoal e jornalístico. Sem gíria, sem "gente", sem primeira pessoa.
2. Texto longo e detalhado: de 5 a 8 parágrafos, no mínimo 450 palavras. Contextualize o assunto, explique o que aconteceu, quem está envolvido e o que se sabe até o momento. Não invente fatos ausentes da fonte; quando faltar informação, escreva de forma mais geral.
3. Título informativo e chamativo, sem sensacionalismo. NÃO adicione tags de qualquer tipo ao título.
4. Corpo em HTML usando apenas <p>, <h2> e <strong>. NÃO inclua imagem; ela é adicionada depois.
5. Responda APENAS com um objeto JSON: {"titulo": "...", "html": "..."}
`;

    let resp;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        resp = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(90_000),
        });
      } catch (e) {
        if (tentativa === 3) throw new Error(`LLM inacessível após 3 tentativas: ${e.message}`);
        log.warn(`LLM inacessível (${e.message}); tentando de novo (${tentativa}/3).`);
        await this.sleep(5000 * tentativa);
        continue;
      }
      if (resp.status === 429 || resp.status >= 500) {
        if (tentativa < 3) {
          log.warn(`LLM respondeu ${resp.status}; tentando de novo (${tentativa}/3).`);
          await this.sleep(5000 * tentativa);
          continue;
        }
      }
      break;
    }

    if (resp.status === 429) {
      throw new Error(`LLM recusou por limite/cota (429): ${(await resp.text()).slice(0, 300)}`);
    }
    if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const dados = await resp.json();
    return ContentGenerator.parse(dados.choices[0].message.content.trim(), trend);
  }

  static parse(bruto, trend) {
    const texto = bruto.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
      const dados = JSON.parse(texto);
      // Resposta truncada ainda é JSON válido: sem título ou sem corpo, publicaria vazio.
      if (typeof dados?.titulo === "string" && dados.titulo.trim() &&
          typeof dados?.html === "string" && dados.html.trim()) {
        return [dados.titulo, dados.html];
      }
    } catch {
      // fora do formato: cai no fallback abaixo
    }
    log.warn("Resposta da IA fora do formato JSON; usando fallback.");
    return [trend.title, `<p>${texto}</p>`];
  }
}

function lerArgEmail(argv) {
  const junto = argv.find((arg) => arg.startsWith("--email="));
  if (junto) return junto.slice("--email=".length) || null;
  const i = argv.indexOf("--email");
  return i === -1 ? null : argv[i + 1] || null;
}

export async function main(argv = [], deps = {}) {
  const {
    fetcher = new TrendFetcher("https://trends.google.com/trending/rss?geo=BR"),
    generator = new ContentGenerator(),
    fetchImpl = globalThis.fetch,
    sendEmail: enviar = sendEmail,
    stateFile = STATE_PATH,
    log: logger = log,
  } = deps;

  const email = lerArgEmail(argv);
  if (!email) {
    logger.error("--email é obrigatório");
    return 1;
  }

  const trend = await fetcher.fetchTopTrend();
  if (!trend) {
    logger.error("Nenhuma trend encontrada.");
    return 0;
  }

  const estado = carregarEstado(stateFile);
  if (jaPublicado(trend, estado)) {
    logger.info(`Trend '${trend.title}' já publicada nas últimas ${JANELA_DEDUPE_HORAS}h. Nada a fazer.`);
    return 0;
  }

  // Extração da fonte: tenta todas as URLs do RSS e usa o texto mais completo
  let fonte = "Conteúdo indisponível na URL de origem.";
  for (const url of new Set([trend.news_url, ...(trend.news_urls || [])].filter(Boolean))) {
    try {
      const resp = await fetchImpl(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15_000),
      });
      const texto = extrairTexto(await resp.text());
      if (texto.length > fonte.length) fonte = texto;
      if (fonte.length >= 1500) break;
    } catch (e) {
      logger.warn(`Falha ao ler ${url}: ${e.message}`);
    }
  }

  if (fonte.length < MIN_FONTE) {
    logger.error(
      `Fonte com pouco conteúdo (${fonte.length} chars); matéria não publicada ` +
        "para evitar texto genérico. Trend registrada para não repetir.",
    );
    registrarPost(estado, trend, stateFile);
    return 0;
  }

  const [titulo, corpo] = await generator.generate(trend, fonte);
  const conteudo = montarHtml(trend, corpo);
  logger.info(`Matéria gerada: ${titulo}`);

  try {
    logger.info(`Sending email to ${email}...`);
    await enviar(email, titulo, conteudo);
    logger.info("Email sent successfully.");
  } catch (e) {
    logger.error(`Erro ao enviar e-mail: ${e.message}`);
    return 1;
  }

  registrarPost(estado, trend, stateFile);
  return 0;
}

if (process.argv[1]?.endsWith("post_news.js")) {
  main(process.argv.slice(2))
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((e) => {
      console.error(`ERRO: ${e.message}`);
      process.exitCode = 1;
    });
}
