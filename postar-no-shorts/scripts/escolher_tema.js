#!/usr/bin/env node
/**
 * Escolhe uma curiosidade nova via LLM e evita os temas recentes.
 *
 *   node escolher_tema.js                   -> imprime o tema (stdout)
 *   node escolher_tema.js --registrar "T"   -> grava T no histórico
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  return `Você escolhe um assunto para um YouTube Short em português do Brasil.
Escolha UMA curiosidade real, verificável e pouco conhecida sobre ciência, natureza, corpo humano ou história.
Não repita nenhum destes temas já publicados:
${evitar}

Responda APENAS com JSON válido, sem markdown: {"tema": "..."}
O tema é um assunto curto, de até 80 caracteres. Ex.: "Por que o sangue do polvo é azul".`;
}

async function pedirTema(historico) {
  const base = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY não definida");
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gemini-3.1-flash-lite",
      messages: [{ role: "user", content: montarPrompt(historico) }],
      temperature: 1.0,
    }),
  });
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const dados = await r.json();
  return extrairTema(dados.choices[0].message.content);
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
