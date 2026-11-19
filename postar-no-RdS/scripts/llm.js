/** Chamada OpenAI-compatível com retry em 429/5xx e timeout explícito. */
const ESPERAR = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function chamarLLM(conteudo, {
  temperature = 0.7,
  fetchImpl = globalThis.fetch,
  sleep = ESPERAR,
  timeoutMs = 60_000,
  tentativas = 3,
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
        await sleep(1500 * 2 ** (i - 1) + Math.floor(Math.random() * 400));
        continue;
      }
      if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      const dados = await resp.json();
      return dados.choices[0].message.content;
    } catch (e) {
      ultimoErro = e;
      if (i === tentativas) throw e;
      await sleep(1500 * 2 ** (i - 1) + Math.floor(Math.random() * 400));
    }
  }
  throw ultimoErro;
}
