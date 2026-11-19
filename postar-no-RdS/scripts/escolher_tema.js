#!/usr/bin/env node
/**
 * Escolhe uma curiosidade bíblica nova via LLM e evita os temas recentes.
 *
 *   node escolher_tema.js                   -> imprime o tema (stdout)
 *   node escolher_tema.js --registrar "T"   -> grava T no histórico
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chamarLLM } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STATE_FILE = path.join(__dirname, "..", "state", "temas.json");
export const MAX_HISTORICO = 30;
export const MAX_TENTATIVAS = 3;

export function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function jaUsado(tema, historico) {
  const alvo = normalizar(tema);
  return historico.some((t) => normalizar(t) === alvo);
}

export function registrar(historico, tema) {
  return [...historico, tema].slice(-MAX_HISTORICO);
}

export function extrairTema(bruto) {
  const texto = String(bruto || "").replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
  const tema = String(JSON.parse(texto).tema || "").trim();
  if (!tema || tema.length > 100) throw new Error("tema vazio ou longo demais");
  if (/[\r\n]/.test(tema)) throw new Error("tema com quebra de linha");
  return tema;
}

export function carregar(file = STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")).temas || [];
  } catch {
    return [];
  }
}

export function salvar(temas, file = STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ temas }, null, 2));
}

export function montarPrompt(historico) {
  const evitar = historico.slice(-MAX_HISTORICO).map((t) => `- ${t}`).join("\n") || "(nenhum)";
  return `Você escolhe um assunto para um YouTube Short em português do Brasil, para um canal cristão.
Escolha UMA curiosidade real, verificável e pouco comentada sobre a Bíblia: personagens, contexto histórico, geografia, costumes, idiomas originais ou detalhes do texto.
Use tom reverente e edificante. Sem sensacionalismo, sem "revelações bombásticas", sem polêmica denominacional e sem ataque a outras religiões. Quando houver divergência entre estudiosos, prefira o consenso histórico.
Não repita nenhum destes temas já publicados:
${evitar}

Responda APENAS com JSON válido, sem markdown: {"tema": "..."}
O tema é um assunto curto, de até 80 caracteres, sem quebra de linha. Ex.: "O que o nome Isaque significa em hebraico".`;
}

async function pedirTema(historico) {
  const bruto = await chamarLLM(montarPrompt(historico), { temperature: 1.0 });
  return extrairTema(bruto);
}

async function main(argv) {
  if (argv[0] === "--registrar") {
    if (!argv[1]) throw new Error("--registrar exige o tema");
    salvar(registrar(carregar(), argv[1]));
    return;
  }
  const historico = carregar();
  for (let i = 1; i <= MAX_TENTATIVAS; i++) {
    const tema = await pedirTema(historico);
    if (!jaUsado(tema, historico)) {
      console.log(tema);
      return;
    }
    console.error(`[tema] repetido ("${tema}"), tentando de novo (${i}/${MAX_TENTATIVAS}).`);
  }
  throw new Error("LLM repetiu temas recentes em todas as tentativas");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(3);
  });
}
