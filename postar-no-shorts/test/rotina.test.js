import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizar, jaUsado, registrar, extrairTema, carregar, salvar, MAX_HISTORICO,
} from "../scripts/escolher_tema.js";
import { montarMetadados } from "../scripts/gen_metadata.js";
import { montarConfig } from "../scripts/mpt_config.js";

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
  '# custom_position = 70.0',
  'gemini_api_key = ""',
  'gemini_model_name = ""',
].join("\n");

test("montarConfig troca provedor e chaves sem tocar no resto", () => {
  const texto = montarConfig(EXEMPLO, { llmKey: "K1", llmModel: "gemini-3.5-flash", pexelsKey: "P1" });
  assert.match(texto, /^llm_provider = "gemini"$/m);
  assert.match(texto, /^gemini_api_key = "K1"$/m);
  assert.match(texto, /^gemini_model_name = "gemini-3.5-flash"$/m);
  assert.match(texto, /^subtitle_position = "custom"$/m);
  assert.match(texto, /^custom_position = 70(\.0)?$/m);
  assert.match(texto, /^pexels_api_keys = \["P1"\]$/m);
});

test("montarConfig falha sem chave, em vez de gerar config vazio", () => {
  assert.throws(() => montarConfig(EXEMPLO, { llmKey: "", pexelsKey: "P1" }));
});

test("montarConfig falha se o exemplo mudou e a chave sumiu", () => {
  assert.throws(() => montarConfig('llm_provider = "x"', { llmKey: "K", pexelsKey: "P" }));
});
