#!/usr/bin/env node
/**
 * Gera o config.toml do MoneyPrinterTurbo a partir do config.example.toml.
 * Usa Gemini direto (sem gateway local) e a chave do Pexels para o vídeo de fundo.
 *
 * Lê MPT_HOME, LLM_API_KEY, LLM_MODEL e PEXELS_API_KEY do ambiente.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function montarConfig(exemplo, { llmKey, llmModel, pexelsKey }) {
  if (!llmKey || !pexelsKey) throw new Error("LLM_API_KEY e PEXELS_API_KEY são obrigatórias");
  const valores = {
    llm_provider: '"gemini"',
    gemini_api_key: JSON.stringify(llmKey),
    gemini_model_name: JSON.stringify(llmModel || "gemini-3.1-flash-lite"),
    subtitle_position: '"two_thirds_bottom"',
    pexels_api_keys: JSON.stringify([pexelsKey]),
  };
  let texto = exemplo;
  for (const [chave, valor] of Object.entries(valores)) {
    const re = new RegExp(`^${chave} *=.*$`, "m");
    if (!re.test(texto)) throw new Error(`chave ausente no exemplo: ${chave}`);
    texto = texto.replace(re, `${chave} = ${valor}`);
  }
  return texto;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const home = process.env.MPT_HOME;
  if (!home) throw new Error("MPT_HOME não definida");
  const exemplo = fs.readFileSync(path.join(home, "config.example.toml"), "utf-8");
  const texto = montarConfig(exemplo, {
    llmKey: process.env.LLM_API_KEY,
    llmModel: process.env.LLM_MODEL,
    pexelsKey: process.env.PEXELS_API_KEY,
  });
  fs.writeFileSync(path.join(home, "config.toml"), texto);
  console.log("config.toml gerado");
}
