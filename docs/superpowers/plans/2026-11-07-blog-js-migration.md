# Migração do blog de Python para JS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reimplementar a rotina do blog em Node 22, com o mesmo comportamento e os 23 testes do Python portados (43 no fim), e remover o Python do repo.

**Architecture:** Port linha a linha. `blogger-poster/scripts/post_news.js` mantém a estrutura do original: funções puras de estado/dedupe, `TrendFetcher`, `ContentGenerator`, `main`. `enviar_email.js` troca `smtplib` por `nodemailer`. Dependências externas entram por injeção (`fetchImpl`, `sleep`, `sendEmail`, `stateFile`) para permitir teste sem rede e sem espera real.

**Tech Stack:** Node 22, `node:test`, `node:assert/strict`, `fast-xml-parser`, `nodemailer`.

**Spec:** `docs/superpowers/specs/2026-11-07-blog-js-migration-design.md`

## Global Constraints

- Node 22. Testes: `npm test` roda `node --test test/rotinas.test.js` (mesma forma do `youtube-shorts`).
- Env: `EMAIL_USER`, `APP_PASSWORD`, `LLM_API_KEY`, `LLM_BASE_URL` (default `https://api.openai.com/v1`), `LLM_MODEL` (default `gpt-4o-mini`), `--email` obrigatório.
- `state/last_post.json` continua na raiz do repo. Resolver via `fileURLToPath(import.meta.url)`, não via `process.cwd()`.
- Formato do state: `{"posts":[{titulo, urls, quando}]}`. Aceitar também o formato antigo (um objeto só).
- Janela de dedupe: 12h. Fonte mínima: 300 chars. Texto da fonte limitado a 6000 chars.
- Nenhum secret, e-mail real ou caminho pessoal no código ou nos testes.
- Não mexer em `youtube-shorts/`.

## Review Focus

1. RSS com um único `<item>` (não array) ou sem prefixo `ht:` — o parser tem que aceitar os dois.
2. `approx_traffic` como `"+1,000,000"` — virar `1000000`, nunca `NaN`.
3. State sem timezone ou corrompido — não pode derrubar a execução.
4. Texto extraído com `&nbsp;`/`&amp;` — tem que virar espaço/caractere, sem markup.
5. LLM devolvendo JSON dentro de cerca markdown — `parse` limpa antes de `JSON.parse`.
6. Assunto do e-mail com acento — `nodemailer` cuida do encoding, o teste confere que o assunto chega intacto.

---

### Task 1: Base do pacote

**Files:**
- Create: `blogger-poster/package.json`

**Interfaces:**
- Produces: `npm test` em `blogger-poster/`; `fast-xml-parser` e `nodemailer` instalados; `package-lock.json` versionado.

- [x] **Step 1: Criar `blogger-poster/package.json`**

```json
{
  "name": "blogger-poster",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test test/rotinas.test.js" },
  "dependencies": { "fast-xml-parser": "^5.12.0", "nodemailer": "^10.3.1" }
}
```

- [x] **Step 2: Instalar e conferir**

Run: `cd blogger-poster && npm install && npm ls --depth=0`
Expected: lista as duas dependências, sem erro.

- [x] **Step 3: Adicionar ao `.gitignore`** (o lock fica versionado; `node_modules` não)

```
blogger-poster/node_modules/
blogger-poster/state/
```

---

### Task 2: Estado, dedupe, extração de texto

**Files:**
- Create: `blogger-poster/scripts/post_news.js`
- Test: `blogger-poster/test/rotinas.test.js`

**Interfaces:**
- Produces: `STATE_PATH`, `JANELA_DEDUPE_HORAS=12`, `MIN_FONTE=300`, `normalizar(t)`, `quandoDe(post)`, `carregarEstado(file=STATE_PATH)`, `salvarEstado(posts, file=STATE_PATH)`, `jaPublicado(trend, posts)`, `registrarPost(posts, trend, file=STATE_PATH)`, `extrairTexto(html, limite=6000)`.

- [x] **Step 1: Escrever os testes que falham**

Nove casos de dedupe/html + dois de texto. Asserções exatas:

- `jaPublicado({"title":"A"}, [post("A"), post("B")])` → `true`
- `jaPublicado({"title":"A"}, [post("A", 13)])` → `false` (janela 12h)
- `jaPublicado({title:"operario x sport recife"}, [post("Operário x Sport Recife")])` → `true`
- `post` com `quando` sem timezone (formato sem `Z`) → `true`, sem exceção
- `carregarEstado(file)` lendo `{"titulo":"A","quando":"..."}` → `[{titulo:"A",...}]`
- trend `{title:"ec vitória x fluminense", news_urls:["https://a.example/jogo"]}` contra post com mesma URL → `true`
- `registrarPost([post("velha", 20)], trend, file)` → arquivo com `posts` = `[{titulo:"nova", urls:["https://a.example/nova"]}]`
- `ContentGenerator.montarHtml({title:'Tema "especial" <b>', image_url:"https://x.example/a.jpg?q=1&r=2"}, "<p>corpo</p>")` → contém `&quot;`, `&amp;r=2`, `&lt;b&gt;`, `<p>corpo</p>`
- `montarHtml({title:"T", image_url:null}, "<p>x</p>")` → `"<p>x</p>"`
- `extrairTexto` remove `<script>`/`<style>`/tags e resolve `&nbsp;` → contém "Manchete", "Primeiro parágrafo.", não contém "<", "var x", "color:red"
- `extrairTexto("a".repeat(500), 100).length` → `100`

Cada teste usa `mkdtempSync` para o arquivo de state. `now` é sempre `new Date()`; `post(titulo, horasAtras)` devolve `{titulo, urls: [], quando: new Date(Date.now()-h*3600e3).toISOString()}`.

- [x] **Step 2: Rodar e ver falhar**

Run: `cd blogger-poster && npm test`
Expected: `Cannot find module .../post_news.js`

- [x] **Step 3: Implementar**

- `normalizar`: `String(t??"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().split(/\s+/).filter(Boolean).join(" ")`.
- `quandoDe`: `new Date(post.quando)`; `isNaN(getTime())` → `null`. Data sem timezone é interpretada como local, igual ao Python.
- `carregarEstado`: `JSON.parse(readFileSync)`, aceita `{posts:[...]}` ou objeto com `titulo` (formato antigo). Qualquer erro → `[]`.
- `salvarEstado`: `mkdirSync(dirname,{recursive:true})` + `writeFileSync` com `JSON.stringify({posts},null,2)`.
- `jaPublicado`: janela 12h; compara `normalizar(titulo)` e interseção de URLs (`trend.news_url` + `news_urls` vs `post.urls`).
- `registrarPost`: poda o que saiu da janela, adiciona `{titulo, urls, quando: new Date().toISOString()}`, salva. Erro de escrita só loga.
- `extrairTexto`: remove `<(script|style|head)...>` com regex `[\s\S]`, remove tags, resolve `&nbsp;`/`&amp;`/`&lt;`/`&gt;`/`&quot;`/`&#39;`, colapsa espaços, corta em `limite`.

- [x] **Step 4: Rodar e ver passar**

Run: `cd blogger-poster && npm test`
Expected: 11 testes passando.

---

### Task 3: Parser do Google Trends

**Files:**
- Modify: `blogger-poster/scripts/post_news.js`
- Test: `blogger-poster/test/rotinas.test.js`

**Interfaces:**
- Produces: `class TrendFetcher { constructor(rssUrl, {fetchImpl, sleep}={}); static parseXml(xml); async fetchTopTrend(retries=3) }`. Item: `{title, traffic, news_url, news_urls, image_url}`.

- [x] **Step 1: Teste com fixture**

XML de exemplo com 2 itens, `ht:approx_traffic` = `"+1,000,000"` e `"+500"`, e um `<item>` **sem** array (caso único em outro teste). Asserções:
- `TrendFetcher.parseXml(xml)` devolve 2 itens
- o escolhido por `max(traffic)` é o de `traffic: 1000000`
- `news_urls` tem as URLs dos `ht:news_item`, `image_url` vem de `ht:news_item_picture`
- fixture com **um** item só → `parseXml` devolve array de 1, sem exceção
- XML inválido → `parseXml` lança; `fetchTopTrend` devolve `null` após 3 tentativas

- [x] **Step 2: Rodar e ver falhar**

Run: `cd blogger-poster && npm test`
Expected: `TrendFetcher is not exported`

- [x] **Step 3: Implementar**

`new XMLParser({ ignoreAttributes:false, removeNSPrefix:true, trimValues:true })`; itens em `rss.channel.item`, normalizados com `[].concat(...)`. `traffic = parseInt(String(v).replace(/[+,]/g,""),10) || 0`. `fetchTopTrend` repete 3 vezes com `await sleep(2000)`; erro de rede/parse só loga; sem itens → `null`.

- [x] **Step 4: Rodar e ver passar**

Run: `cd blogger-poster && npm test`
Expected: 16 testes passando.

---

### Task 4: Reescrita via LLM

**Files:**
- Modify: `blogger-poster/scripts/post_news.js`
- Test: `blogger-poster/test/rotinas.test.js`

**Interfaces:**
- Produces: `class ContentGenerator { constructor({fetchImpl, sleep}={}); async generate(trend, source); static parse(bruto, trend); static montarHtml(trend, corpo) }`. `generate` devolve `[titulo, html]`.

- [x] **Step 1: Testes de retry e parse**

- 429 nas 3 tentativas → `rejects` com mensagem contendo `429`
- 429 e depois 200 → resolve `["T","<p>x</p>"]`, `fetch` chamado 2x
- erro de rede e depois 200 → resolve, 2 chamadas
- erro de rede em todas → `rejects`
- sem `LLM_API_KEY` → `rejects` antes de qualquer fetch
- `parse('```json\n{"titulo":"T","html":"<p>x</p>"}\n```')` → `["T","<p>x</p>"]`
- `parse("texto solto")` → fallback `[trend.title, "<p>texto solto</p>"]`

O `fetch` falso devolve `new Response(corpo, {status})`. `sleep` injetado é `() => {}`.

- [x] **Step 2: Rodar e ver falhar** — `npm test` → 7 falhas.

- [x] **Step 3: Implementar**

3 tentativas; erro de rede na 3ª → `throw new Error("LLM inacessível após 3 tentativas: ...")`; `status === 429 || status >= 500` com tentativa < 3 → espera e repete; na saída, 429 → erro com `resp.text()` cortado em 300; `!resp.ok` → erro com status; sucesso → `data.choices[0].message.content` → `parse`. Prompt: copiar o texto do `post_news.py` sem alterar uma palavra.

- [x] **Step 4: Rodar e ver passar** — testes da etapa.

---

### Task 5: Envio de e-mail

**Files:**
- Create: `blogger-poster/scripts/enviar_email.js`
- Test: `blogger-poster/test/rotinas.test.js`

**Interfaces:**
- Produces: `SMTP_HOST="smtp.gmail.com"`, `SMTP_PORT=587`, `opcoesTransporte()`, `async sendEmail(to, subject, html, {transport}={})`. Erro sem credencial: `EMAIL_USER e APP_PASSWORD são obrigatórios`.

- [x] **Step 1: Testes**

- `opcoesTransporte()` com env preenchida → `{host:"smtp.gmail.com", port:587, secure:false, requireTLS:true, auth:{user,pass}}`
- `sendEmail` com transporte falso → `sendMail` recebe `{from, to, subject, html}` com os valores passados, assunto com acento intacto
- sem `EMAIL_USER`/`APP_PASSWORD` → `rejects` com mensagem citando `EMAIL_USER`
- CLI sem credencial: `spawnSync(process.execPath, ["scripts/enviar_email.js","a@b","s","<p>x</p>"])` → exit != 0, stderr contém `EMAIL_USER`, nunca a senha

- [x] **Step 2: Rodar e ver falhar**

- [x] **Step 3: Implementar**

`nodemailer.createTransport(opcoesTransporte())`, `await transport.sendMail({from:user,to,subject,html})`. CLI: `argv` com 3 posicionais, senão `console.error("uso: ...")` + `process.exit(2)`; erro de envio → `console.error(e.message)` + `process.exit(1)` (nunca imprime senha).

- [x] **Step 4: Rodar e ver passar** — 27 testes.

---

### Task 6: `main` e CLI

**Files:**
- Modify: `blogger-poster/scripts/post_news.js`
- Test: `blogger-poster/test/rotinas.test.js`

**Interfaces:**
- Produces: `async main(argv, {fetcher, generator, fetchImpl, sendEmail, stateFile, log}={})` → código de saída `0|1`. Sem `deps`, usa os padrões reais.

- [x] **Step 1: Testes de integração**

- `main(["--email","destino@blogger.com"], {fetcher, fetchImpl, sendEmail, stateFile})` com fonte de 400×"palavra " → `sendEmail` chamado 1x com `(destino, "Título gerado", "<p>materia</p>")`; state gravado com o título da trend
- fonte curta (<300 chars) nas duas URLs → `generator.generate` não chamado, `sendEmail` não chamado, state registra "Tema em alta"
- trend já publicada → `sendEmail` não chamado, retorno `0`
- falha de `sendEmail` → retorno `1` e `log.error` com a mensagem do erro
- `main([])` sem `--email` → retorno `1` e `log.error` citando `--email`

- [x] **Step 2: Rodar e ver falhar** — 5 falhas.

- [x] **Step 3: Implementar**

Fluxo idêntico ao Python: busca trend → dedupe → tenta cada URL (`User-Agent: Mozilla/5.0`, timeout 15s), fica com o texto mais longo, para quando `>=1500` → fonte `<300` registra e sai `0` → `generate` → `montarHtml` → `sendEmail` (erro → log + `1`) → `registrarPost` → `0`. CLI no fim do arquivo: `main(process.argv.slice(2)).then(c => { process.exitCode = c; })`.

- [x] **Step 4: Rodar e ver passar** — 32 testes.

---

### Task 7: Trocar o workflow e apagar o Python

**Files:**
- Modify: `.github/workflows/postar-noticia-no-blog.yml`
- Modify: `README.md`
- Delete: `scripts/*.py`, `tests/`, `requirements.txt`

- [x] **Step 1: Workflow**

Trocar `actions/setup-python` por `actions/setup-node@v4` (`node-version: "22"`), `pip install -r requirements.txt` por `npm ci --prefix blogger-poster`, e o passo final por `node blogger-poster/scripts/post_news.js --email "$BLOG_EMAIL"`. Cache de `state/` não muda.

- [x] **Step 2: README** — comando local passa a `node blogger-poster/scripts/post_news.js --email "$BLOG_EMAIL"`; citar `npm ci --prefix blogger-poster`.

- [x] **Step 3: Apagar os arquivos Python** com `git rm`.

- [x] **Step 4: Verificar**

Run: `cd blogger-poster && npm test` → 32/32.
Run: `grep -rn "python\|\.py" .github/workflows/ README.md` → nada.
Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/postar-noticia-no-blog.yml'))"` → sem erro.

- [x] **Step 5: Validação real (manual, antes do push)**

Run: `set -a; . ./.env; set +a; node blogger-poster/scripts/post_news.js --email "$EMAIL_USER"`
Expected: log de matéria gerada, e-mail chega no Gmail pessoal com imagem centralizada. Nada publicado no Blogger.

---

## Self-Review

- **Cobertura da spec:** metas (paridade, 23 testes portados, workflow intacto) → Tasks 2-7. Libs e layout → Task 1. `state/` via `__dirname` → Global Constraints + Task 2. Risco do parser → Task 3. Validação com Gmail → Task 7 Step 5.
- **Tipos:** os nomes de `main`/`generate`/`parse`/`montarHtml` batem entre Tasks 2-6.
- **Desvio consciente dos testes Python:** `test_post_news_email` e `test_enviar_email` afirmavam detalhes de `subprocess`. Em JS afirmam o efeito (`sendEmail` chamado com os 3 argumentos). Mesmo número de testes, mesma cobertura de comportamento.

## Ledger de execução

- **Setup:** sem worktree. A migração depende da mudança não commitada (o move das pastas); um worktree a partir do HEAD perderia isso. Custo se errado: nenhum, o histórico do git guarda tudo.
- **Task 2:** `montarHtml` foi implementado na Task 2, não na 4. Os testes da Task 2 já precisavam dele e é função pura. Custo se errado: nenhum.
- **Task 2:** teste extra "estado corrompido vira lista vazia" (Review Focus 3). Por isso 12 testes na task, 33 no total em vez dos 32 previstos.
- **Task 6:** a asserção do teste de integração mudou para conferir `<p>materia</p>` **e** o `<img>` — a trend de teste tem `image_url`, então o HTML leva a imagem. Erro era do teste, não do código.
- **Task 7:** `state/` entrou no `.gitignore` da raiz. Não estava lá; a execução local deixava `state/last_post.json` como arquivo não rastreado.
- **Pós-review:** `ContentGenerator.parse` agora exige `titulo` e `html` como strings não vazias; JSON válido e incompleto cai no fallback (sem isso, publicaria post sem corpo). `extrairTexto` decodifica entidades numéricas e a tabela nomeada pt-BR, no lugar das 6 originais. 36 testes.
- **Review independente:** 0 Critical, 1 Important (teste "fonte mais completa" usava uma URL só, cobrindo o loop por acidente), 8 Minor. O Important foi corrigido: teste com 3 URLs prova que a mais longa é usada e que o `break` em 1500 evita a terceira. Provado por mutação: com `>` trocado por `<`, o teste falha. 37 testes.
- **Minor 3 e 4 corrigidos:** `opcoesTransporte` devolve `connectionTimeout`/`socketTimeout` de 30s (paridade com `smtplib(timeout=30)`), e `lerArgEmail` aceita `--email=valor` como o `argparse`. 38 testes.
- **Minor 5 e 8 corrigidos:** removido `ContentGenerator.montarHtml`, que era código morto (o `main` chama a função do módulo). Teste novo cobre `quando` ausente ou inválido no dedupe. 39 testes.
- **Segunda review (no PR):** 0 Critical, 1 Important (nenhum teste usava o formato de `quando` que o cache do Python gravou, `+00:00` com microssegundos), 9 Minor. Corrigidos: teste desse formato, `Array.isArray` em `post.urls` (cache corrompido não derruba a rotina), escape de `'`, retry de parse XML inválido, contagem de chamadas no teste de 429, teste de "nenhuma trend", docs e `.gitignore` acertados. 43 testes.

