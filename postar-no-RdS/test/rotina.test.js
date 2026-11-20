import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizar, jaUsado, registrar, extrairTema, carregar, salvar, montarPrompt, MAX_HISTORICO,
} from "../scripts/escolher_tema.js";
import { montarMetadados, montarPrompt as montarPromptMeta } from "../scripts/gen_metadata.js";
import { montarConfig } from "../scripts/mpt_config.js";
import { chamarLLM } from "../scripts/llm.js";
import { conferirCanal } from "../scripts/verificar_token.js";

test("normalizar ignora caixa, acento e espaços extras", () => {
  assert.equal(normalizar("  O Sangue  do Polvo é AZUL "), "o sangue do polvo e azul");
});

test("jaUsado acha o mesmo tema com outra grafia", () => {
  assert.equal(jaUsado("por que o sangue do polvo é azul", ["Por que o sangue do polvo é azul"]), true);
  assert.equal(jaUsado("Tardígrados no espaço", ["Por que o sangue do polvo é azul"]), false);
});

test("registrar mantém só os últimos MAX_HISTORICO temas", () => {
  const cheio = Array.from({ length: MAX_HISTORICO }, (_, i) => `t${i}`);
  const novo = registrar(cheio, "novo");
  assert.equal(novo.length, MAX_HISTORICO);
  assert.equal(novo.at(-1), "novo");
  assert.equal(novo.includes("t0"), false);
});

test("extrairTema aceita JSON com cercas markdown", () => {
  assert.equal(extrairTema('```json\n{"tema": "Tardígrados sobrevivem ao vácuo"}\n```'), "Tardígrados sobrevivem ao vácuo");
});

test("extrairTema recusa tema vazio", () => {
  assert.throws(() => extrairTema('{"tema": "  "}'));
});

test("extrairTema recusa quebra de linha, que quebraria o GITHUB_ENV", () => {
  assert.throws(() => extrairTema('{"tema": "linha um\\nlinha dois"}'));
});

test("carregar e salvar fazem ida e volta no arquivo de estado", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tema-"));
  const file = path.join(dir, "temas.json");
  assert.deepEqual(carregar(file), []);
  salvar(["a", "b"], file);
  assert.deepEqual(carregar(file), ["a", "b"]);
});

test("montarMetadados força #Shorts no título", () => {
  const meta = montarMetadados('{"title": "Sangue azul", "description": "d", "tags": ["x"]}', "polvo");
  assert.equal(meta.title, "Sangue azul #Shorts");
});

test("montarMetadados mantém título que já tem #Shorts", () => {
  const meta = montarMetadados('{"title": "Sangue azul #Shorts", "description": "d", "tags": []}', "polvo");
  assert.equal(meta.title, "Sangue azul #Shorts");
});

const EXEMPLO = [
  'llm_provider = "moonshot"',
  'pexels_api_keys = []',
  '# subtitle_position = "bottom"',
  '# custom_position = 80.0',
  '# font_size = 60',
  'gemini_api_key = ""',
  'gemini_model_name = ""',
].join("\n");

test("montarConfig troca provedor e chaves sem tocar no resto", () => {
  const texto = montarConfig(EXEMPLO, { llmKey: "K1", llmModel: "gemini-3.5-flash", pexelsKey: "P1" });
  assert.match(texto, /^llm_provider = "gemini"$/m);
  assert.match(texto, /^gemini_api_key = "K1"$/m);
  assert.match(texto, /^gemini_model_name = "gemini-3.5-flash"$/m);
  assert.match(texto, /^subtitle_position = "custom"$/m);
  assert.match(texto, /^custom_position = 80(\.0)?$/m);
  assert.match(texto, /^font_size = 44$/m);
  assert.match(texto, /^pexels_api_keys = \["P1"\]$/m);
});

test("montarConfig falha sem chave, em vez de gerar config vazio", () => {
  assert.throws(() => montarConfig(EXEMPLO, { llmKey: "", pexelsKey: "P1" }));
});

test("montarConfig falha se o exemplo mudou e a chave sumiu", () => {
  assert.throws(() => montarConfig('llm_provider = "x"', { llmKey: "K", pexelsKey: "P" }));
});

test("tema: prompt foca personagens, locais e eventos bíblicos", () => {
  const prompt = montarPrompt(["Tema antigo"]);
  assert.match(prompt, /personagem bíblico/);
  assert.match(prompt, /local bíblico/);
  assert.match(prompt, /evento bíblico/);
  assert.match(prompt, /reverente/);
  assert.match(prompt, /- Tema antigo/);
  assert.doesNotMatch(prompt, /O que o nome Isaque significa em hebraico/);
  assert.doesNotMatch(prompt, /sangue do polvo/);
});

test("metadados: prompt pede gancho para quem está passando", () => {
  const prompt = montarPromptMeta("Isaque", "Roteiro");
  assert.match(prompt, /canal cristão/);
  assert.match(prompt, /Tema: Isaque/);
  assert.match(prompt, /Roteiro: Roteiro/);
  assert.match(prompt, /gancho que prenda quem está passando/);
  assert.match(prompt, /revelação secreta/);
});

function comLLM(fn) {
  const antes = process.env;
  process.env = { ...antes, LLM_API_KEY: "k" };
  return Promise.resolve(fn()).finally(() => {
    process.env = antes;
  });
}

test("llm: 503 tenta de novo e envia timeout", async () => {
  await comLLM(async () => {
    let chamadas = 0;
    const conteudo = await chamarLLM("oi", {
      fetchImpl: async (_url, opts) => {
        chamadas += 1;
        assert.ok(opts.signal);
        if (chamadas === 1) return new Response("ocupado", { status: 503 });
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
      },
      sleep: async () => {},
    });
    assert.equal(conteudo, "ok");
    assert.equal(chamadas, 2);
  });
});

test("llm: sem chave falha antes da rede", async () => {
  const antes = process.env;
  process.env = { ...antes };
  delete process.env.LLM_API_KEY;
  try {
    await assert.rejects(() => chamarLLM("oi"), /LLM_API_KEY/);
  } finally {
    process.env = antes;
  }
});

test("token: confere canal esperado", () => {
  const canais = [
    { id: "UC1", snippet: { title: "Refúgio 43" } },
    { id: "UC2", snippet: { title: "Refúgio do Senhor" } },
  ];
  assert.equal(conferirCanal(canais, "Refúgio do Senhor").id, "UC2");
  assert.equal(conferirCanal(canais, "Inexistente"), null);
});

test("token: comparacao tolera caixa e acento", () => {
  const canais = [{ id: "UC2", snippet: { title: "REFUGIO DO SENHOR" } }];
  assert.equal(conferirCanal(canais, "Refúgio do Senhor").id, "UC2");
});
