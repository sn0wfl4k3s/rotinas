import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PERFIS_DIR = path.join(__dirname, "..", "perfis");
export const STATES_DIR = path.join(__dirname, "..", "state");

const NOME_VALIDO = /^[a-z0-9-]+$/;

function nomePerfil(nome) {
  const n = nome || process.env.SHORTS_PROFILE || "geral";
  if (!NOME_VALIDO.test(n)) throw new Error(`nome de perfil inválido: ${n}`);
  return n;
}

export function carregarPerfil(nome = process.env.SHORTS_PROFILE || "geral", dir = PERFIS_DIR) {
  const n = nomePerfil(nome);
  const arquivo = path.join(dir, `${n}.json`);
  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(arquivo, "utf-8"));
  } catch (err) {
    throw new Error(`perfil "${n}" não encontrado ou inválido: ${err.message}`);
  }
  if (typeof dados?.tema !== "string" || typeof dados?.metadados !== "string") {
    throw new Error(`perfil "${n}" sem tema/metadados válidos`);
  }
  return dados;
}

export function aplicar(template, vars) {
  const texto = String(template);
  const chaves = [...texto.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  for (const chave of chaves) {
    if (!(chave in vars)) throw new Error(`variável {{${chave}}} sem valor`);
  }
  const resultado = texto.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, chave) => String(vars[chave]));
  if (/\{\{[A-Z0-9_]+\}\}/.test(resultado)) throw new Error("placeholder não resolvido");
  return resultado;
}

export function montarPromptTema(perfil, historico = []) {
  const evitar = historico.map((t) => `- ${t}`).join("\n") || "(nenhum)";
  return aplicar(perfil.tema, { HISTORICO: evitar });
}

export function montarPromptMetadados(perfil, subject, script = "") {
  return aplicar(perfil.metadados, {
    TEMA: subject,
    ROTEIRO: script || "(não fornecido)",
  });
}

export function caminhoEstado(nome = process.env.SHORTS_PROFILE || "geral", dir = STATES_DIR) {
  const n = nomePerfil(nome);
  return n === "geral" ? path.join(dir, "temas.json") : path.join(dir, n, "temas.json");
}
