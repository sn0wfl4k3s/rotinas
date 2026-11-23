/** Chamada OpenAI-compatível com retry em 429/5xx e timeout explícito. */
const ESPERAR = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ESPERA_BASE_MS = 2_000;
const ESPERA_MAX_MS = 30_000;
const JITTER_MAX_MS = 1_000;

// Picos de demanda do Gemini free devolvem 503 por alguns segundos.
// Cresce 2s, 4s, 8s, 16s, 30s (teto) e espalha as chamadas com jitter.
function esperaDaTentativa(i) {
  return Math.min(ESPERA_BASE_MS * 2 ** (i - 1), ESPERA_MAX_MS)
    + Math.floor(Math.random() * JITTER_MAX_MS);
}

export async function chamarLLM(conteudo, {
  temperature = 0.7,
  fetchImpl = globalThis.fetch,
  sleep = ESPERAR,
  timeoutMs = 60_000,
  tentativas = 6,
} = {}) {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY não definida");
  const base = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gemini-3.1-flash-lite";

  let ultimoErro;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const resp = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer" + " " + key,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: conteudo }],
          temperature,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if ((resp.status === 429 || resp.status >= 500) && i < tentativas) {
        ultimoErro = new Error(`LLM HTTP ${resp.status}`);
        await sleep(esperaDaTentativa(i));
        continue;
      }
      if (!resp.ok) {
        // 4xx e erro de configuracao: repetir nao ajuda e so atrasa o aviso.
        const erro = new Error(`LLM HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
        erro.transitorio = false;
        throw erro;
      }
      const dados = await resp.json();
      return dados.choices[0].message.content;
    } catch (e) {
      ultimoErro = e;
      // Resposta invalida tambem nao melhora com retry.
      if (e?.transitorio === false || e instanceof SyntaxError || i === tentativas) throw e;
      await sleep(esperaDaTentativa(i));
    }
  }
  throw ultimoErro;
}
