import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  jaPublicado,
  carregarEstado,
  registrarPost,
  extrairTexto,
  montarHtml,
  TrendFetcher,
  ContentGenerator,
  main,
} from "../scripts/post_news.js";
import { opcoesTransporte, sendEmail } from "../scripts/enviar_email.js";
function tmpArquivo(nome = "last_post.json") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-"));
  return path.join(dir, "state", nome);
}

function post(titulo, horasAtras = 0) {
  return {
    titulo,
    urls: [],
    quando: new Date(Date.now() - horasAtras * 3600_000).toISOString(),
  };
}

test("dedupe: A, B depois A é duplicado", () => {
  assert.equal(jaPublicado({ title: "A" }, [post("A"), post("B")]), true);
});

test("dedupe: fora da janela de 12h publica de novo", () => {
  assert.equal(jaPublicado({ title: "A" }, [post("A", 13)]), false);
});

test("dedupe: caixa e acento não diferenciam", () => {
  assert.equal(
    jaPublicado({ title: "operario x sport recife" }, [post("Operário x Sport Recife")]),
    true,
  );
});

test("dedupe: data sem timezone não derruba", () => {
  const semTz = { titulo: "A", quando: new Date().toISOString().replace("Z", "") };
  assert.equal(jaPublicado({ title: "A" }, [semTz]), true);
});

test("estado: lê o formato antigo de um post só", () => {
  const arquivo = tmpArquivo();
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const antigo = post("A");
  fs.writeFileSync(arquivo, JSON.stringify(antigo));
  assert.deepEqual(carregarEstado(arquivo), [antigo]);
});

test("estado: arquivo corrompido vira lista vazia", () => {
  const arquivo = tmpArquivo();
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, "{nao e json");
  assert.deepEqual(carregarEstado(arquivo), []);
});

test("dedupe: mesma URL com título diferente é duplicado", () => {
  const posts = [
    { titulo: "Vitória x Fluminense", urls: ["https://a.example/jogo"], quando: post("x").quando },
  ];
  const trend = { title: "ec vitória x fluminense", news_urls: ["https://a.example/jogo"] };
  assert.equal(jaPublicado(trend, posts), true);
});

test("dedupe: post sem data válida não bloqueia a trend", () => {
  assert.equal(jaPublicado({ title: "A" }, [{ titulo: "A", urls: [], quando: "lixo" }]), false);
  assert.equal(jaPublicado({ title: "A" }, [{ titulo: "A", urls: [] }]), false);
});

test("registrar: grava lista e poda antigos", () => {
  const arquivo = tmpArquivo();
  registrarPost([post("velha", 20)], { title: "nova", news_urls: ["https://a.example/nova"] }, arquivo);
  const gravado = JSON.parse(fs.readFileSync(arquivo, "utf-8")).posts;
  assert.deepEqual(gravado.map((p) => p.titulo), ["nova"]);
  assert.deepEqual(gravado[0].urls, ["https://a.example/nova"]);
});

test("html: escapa aspas do título e do src", () => {
  const html = montarHtml(
    { title: 'Tema "especial" <b>', image_url: "https://x.example/a.jpg?q=1&r=2" },
    "<p>corpo</p>",
  );
  assert.match(html, /&quot;/);
  assert.match(html, /&amp;r=2/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /<p>corpo<\/p>/);
});

test("html: sem imagem retorna só o corpo", () => {
  assert.equal(montarHtml({ title: "T", image_url: null }, "<p>x</p>"), "<p>x</p>");
});

test("texto: remove markup, script e style", () => {
  const html = `
    <html><head><style>.a{color:red}</style><script>var x=1;</script></head>
    <body><h1>Manchete</h1><p>Primeiro&nbsp;parágrafo.</p>
    <p>Segundo   parágrafo.</p></body></html>
  `;
  const texto = extrairTexto(html);
  assert.match(texto, /Manchete/);
  assert.match(texto, /Primeiro parágrafo\./);
  assert.doesNotMatch(texto, /</);
  assert.doesNotMatch(texto, /var x/);
  assert.doesNotMatch(texto, /color:red/);
});

test("texto: respeita o limite", () => {
  assert.equal(extrairTexto("a".repeat(500), 100).length, 100);
});

test("texto: resolve entidades nomeadas e numéricas", () => {
  assert.equal(
    extrairTexto("<p>caf&eacute; e &#8220;aspas&#8221; e &#x27; e &ndash;</p>"),
    "café e “aspas” e ' e –",
  );
});

const RSS = `<?xml version="1.0"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <item>
      <title>assunto pequeno</title>
      <ht:approx_traffic>+500</ht:approx_traffic>
      <ht:news_item>
        <ht:news_item_title>Noticia A</ht:news_item_title>
        <ht:news_item_url>https://a.example/a</ht:news_item_url>
        <ht:news_item_picture>https://a.example/a.jpg</ht:news_item_picture>
      </ht:news_item>
    </item>
    <item>
      <title>assunto grande</title>
      <ht:approx_traffic>+1,000,000</ht:approx_traffic>
      <ht:news_item>
        <ht:news_item_title>Noticia B</ht:news_item_title>
        <ht:news_item_url>https://b.example/b</ht:news_item_url>
        <ht:news_item_picture>https://b.example/b.jpg</ht:news_item_picture>
      </ht:news_item>
      <ht:news_item>
        <ht:news_item_url>https://b.example/c</ht:news_item_url>
      </ht:news_item>
    </item>
  </channel>
</rss>`;

test("trends: parseXml lê os dois itens e o tráfego com vírgula", () => {
  const itens = TrendFetcher.parseXml(RSS);
  assert.equal(itens.length, 2);
  assert.equal(itens[1].traffic, 1_000_000);
  assert.deepEqual(itens[1].news_urls, ["https://b.example/b", "https://b.example/c"]);
  assert.equal(itens[1].image_url, "https://b.example/b.jpg");
});

test("trends: escolhe o item de maior tráfego", async () => {
  const fetcher = new TrendFetcher("https://rss.example", {
    fetchImpl: async () => new Response(RSS, { status: 200 }),
  });
  const trend = await fetcher.fetchTopTrend();
  assert.equal(trend.title, "assunto grande");
});

test("trends: rss com um item só não quebra", () => {
  const umItem = RSS.replace(/<item>[\s\S]*?<\/item>\n    <item>[\s\S]*?<\/item>/, "<item><title>só um</title></item>");
  const itens = TrendFetcher.parseXml(umItem);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].title, "só um");
});

test("trends: XML inválido lança no parse", () => {
  assert.throws(() => TrendFetcher.parseXml("<rss><channel>"));
});

test("trends: falha de rede devolve null depois de 3 tentativas", async () => {
  let chamadas = 0;
  const fetcher = new TrendFetcher("https://rss.example", {
    fetchImpl: async () => {
      chamadas += 1;
      throw new TypeError("caiu");
    },
    sleep: async () => {},
  });
  assert.equal(await fetcher.fetchTopTrend(), null);
  assert.equal(chamadas, 3);
});

function comEnv(vars) {
  const antes = process.env;
  process.env = { ...vars };
  return () => {
    process.env = antes;
  };
}

function respostaJson(conteudo) {
  return new Response(JSON.stringify({ choices: [{ message: { content: conteudo } }] }), {
    status: 200,
  });
}

const TREND = { title: "Tema", image_url: null };

test("llm: 429 nas três tentativas vira erro com 429", async () => {
  const restaurar = comEnv({ LLM_API_KEY: "k" });
  try {
    const gen = new ContentGenerator({
      fetchImpl: async () => new Response("limite", { status: 429 }),
      sleep: async () => {},
    });
    await assert.rejects(() => gen.generate(TREND, "fonte"), /429/);
  } finally {
    restaurar();
  }
});

test("llm: 429 e depois sucesso tenta de novo", async () => {
  const restaurar = comEnv({ LLM_API_KEY: "k" });
  try {
    let chamadas = 0;
    const gen = new ContentGenerator({
      fetchImpl: async () => {
        chamadas += 1;
        return chamadas === 1
          ? new Response("limite", { status: 429 })
          : respostaJson('{"titulo": "T", "html": "<p>x</p>"}');
      },
      sleep: async () => {},
    });
    assert.deepEqual(await gen.generate(TREND, "fonte"), ["T", "<p>x</p>"]);
    assert.equal(chamadas, 2);
  } finally {
    restaurar();
  }
});

test("llm: erro de rede tenta de novo", async () => {
  const restaurar = comEnv({ LLM_API_KEY: "k" });
  try {
    let chamadas = 0;
    const gen = new ContentGenerator({
      fetchImpl: async () => {
        chamadas += 1;
        if (chamadas === 1) throw new TypeError("caiu");
        return respostaJson('{"titulo": "T", "html": "<p>x</p>"}');
      },
      sleep: async () => {},
    });
    assert.deepEqual(await gen.generate(TREND, "fonte"), ["T", "<p>x</p>"]);
    assert.equal(chamadas, 2);
  } finally {
    restaurar();
  }
});

test("llm: erro de rede em todas as tentativas vira erro", async () => {
  const restaurar = comEnv({ LLM_API_KEY: "k" });
  try {
    const gen = new ContentGenerator({
      fetchImpl: async () => {
        throw new TypeError("caiu");
      },
      sleep: async () => {},
    });
    await assert.rejects(() => gen.generate(TREND, "fonte"), /inacessível/);
  } finally {
    restaurar();
  }
});

test("llm: sem chave falha antes de chamar a rede", async () => {
  const restaurar = comEnv({});
  try {
    const gen = new ContentGenerator({
      fetchImpl: async () => {
        throw new Error("não deveria chamar");
      },
    });
    await assert.rejects(() => gen.generate(TREND, "fonte"), /LLM_API_KEY/);
  } finally {
    restaurar();
  }
});

test("llm: parse aceita JSON dentro de cerca markdown", () => {
  assert.deepEqual(
    ContentGenerator.parse('```json\n{"titulo": "T", "html": "<p>x</p>"}\n```', TREND),
    ["T", "<p>x</p>"],
  );
});

test("llm: parse fora do formato usa fallback", () => {
  assert.deepEqual(ContentGenerator.parse("texto solto", TREND), ["Tema", "<p>texto solto</p>"]);
});

test("llm: parse sem html cai no fallback", () => {
  assert.deepEqual(ContentGenerator.parse('{"titulo": "T"}', TREND), [
    "Tema",
    '<p>{"titulo": "T"}</p>',
  ]);
});

test("llm: parse com html nulo cai no fallback", () => {
  assert.deepEqual(ContentGenerator.parse('{"titulo": "T", "html": null}', TREND), [
    "Tema",
    '<p>{"titulo": "T", "html": null}</p>',
  ]);
});

test("email: opções do transporte apontam para o Gmail com STARTTLS", () => {
  const restaurar = comEnv({ EMAIL_USER: "remetente@gmail.com", APP_PASSWORD: "senha-app" });
  try {
    assert.deepEqual(opcoesTransporte(), {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 30_000,
      socketTimeout: 30_000,
      auth: { user: "remetente@gmail.com", pass: "senha-app" },
    });
  } finally {
    restaurar();
  }
});

test("email: envia HTML com remetente, destinatário e assunto acentuado", async () => {
  const restaurar = comEnv({ EMAIL_USER: "remetente@gmail.com", APP_PASSWORD: "senha-app" });
  try {
    let enviado;
    const transport = {
      sendMail: async (msg) => {
        enviado = msg;
      },
    };
    await sendEmail("destino@blogger.com", "Eleição e saúde", "<p>Corpo <b>HTML</b></p>", { transport });
    assert.deepEqual(enviado, {
      from: "remetente@gmail.com",
      to: "destino@blogger.com",
      subject: "Eleição e saúde",
      html: "<p>Corpo <b>HTML</b></p>",
    });
  } finally {
    restaurar();
  }
});

test("email: sem credencial falha sem citar a senha", async () => {
  const restaurar = comEnv({});
  try {
    await assert.rejects(() => sendEmail("d@b.com", "s", "<p>x</p>"), /EMAIL_USER/);
  } finally {
    restaurar();
  }
});

test("email: CLI sem credencial sai com erro e cita EMAIL_USER", () => {
  const env = { ...process.env };
  delete env.EMAIL_USER;
  delete env.APP_PASSWORD;
  const r = spawnSync(
    process.execPath,
    ["scripts/enviar_email.js", "destino@blogger.com", "Assunto", "<p>x</p>"],
    { cwd: path.join(import.meta.dirname, ".."), env, encoding: "utf-8" },
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /EMAIL_USER/);
});

function logEspiao() {
  const linhas = [];
  return {
    linhas,
    info: (m) => linhas.push(`info: ${m}`),
    warn: (m) => linhas.push(`warn: ${m}`),
    error: (m) => linhas.push(`error: ${m}`),
  };
}

const TREND_FONTE = {
  title: "Tema em alta",
  traffic: 100,
  news_url: "https://fonte.example/noticia",
  news_urls: ["https://fonte.example/noticia"],
  image_url: "https://fonte.example/foto.jpg",
};

function deps(fonteTexto) {
  return {
    fetcher: { fetchTopTrend: async () => TREND_FONTE },
    fetchImpl: async () => new Response(fonteTexto, { status: 200 }),
    generator: { generate: async () => ["Título gerado", "<p>materia</p>"] },
    stateFile: tmpArquivo(),
    log: logEspiao(),
  };
}

test("main: gera e envia com a fonte mais completa", async () => {
  const d = deps("<html><body>" + "palavra ".repeat(400) + "</body></html>");
  const enviados = [];
  d.sendEmail = async (...args) => enviados.push(args);
  const codigo = await main(["--email", "destino@blogger.com"], d);
  assert.equal(codigo, 0);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0][0], "destino@blogger.com");
  assert.equal(enviados[0][1], "Título gerado");
  assert.match(enviados[0][2], /<p>materia<\/p>/);
  assert.match(enviados[0][2], /<img src="https:\/\/fonte\.example\/foto\.jpg"/);
  const estado = JSON.parse(fs.readFileSync(d.stateFile, "utf-8")).posts;
  assert.deepEqual(estado.map((p) => p.titulo), ["Tema em alta"]);
});

test("main: usa a fonte mais completa entre as URLs do RSS", async () => {
  const curta = "https://fonte.example/curta";
  const longa = "https://fonte.example/longa";
  const naoVisitada = "https://fonte.example/terceira";
  const paginas = {
    [curta]: "<p>" + "curta ".repeat(50) + "</p>",
    [longa]: "<p>" + "longa ".repeat(300) + "</p>",
    [naoVisitada]: "<p>nunca</p>",
  };
  const visitadas = [];
  let recebeu;
  const d = deps("");
  d.fetcher = {
    fetchTopTrend: async () => ({ ...TREND_FONTE, news_url: curta, news_urls: [curta, longa, naoVisitada] }),
  };
  d.fetchImpl = async (url) => {
    visitadas.push(url);
    return new Response(paginas[url], { status: 200 });
  };
  d.generator.generate = async (_trend, fonte) => {
    recebeu = fonte;
    return ["Título gerado", "<p>materia</p>"];
  };
  d.sendEmail = async () => {};
  assert.equal(await main(["--email", "destino@blogger.com"], d), 0);
  assert.match(recebeu, /longa longa/);
  assert.doesNotMatch(recebeu, /curta curta/);
  // a terceira não é buscada: para ao passar de 1500 chars
  assert.deepEqual(visitadas, [curta, longa]);
});

test("main: fonte curta não publica e registra a trend", async () => {
  const d = deps("");
  let gerou = 0;
  d.generator.generate = async () => {
    gerou += 1;
    return ["x", "y"];
  };
  const enviados = [];
  d.sendEmail = async (...args) => enviados.push(args);
  const codigo = await main(["--email", "destino@blogger.com"], d);
  assert.equal(codigo, 0);
  assert.equal(gerou, 0);
  assert.equal(enviados.length, 0);
  const estado = JSON.parse(fs.readFileSync(d.stateFile, "utf-8")).posts;
  assert.deepEqual(estado.map((p) => p.titulo), ["Tema em alta"]);
});

test("main: trend já publicada não envia nada", async () => {
  const d = deps("palavra ".repeat(400));
  registrarPost([], TREND_FONTE, d.stateFile);
  const enviados = [];
  d.sendEmail = async (...args) => enviados.push(args);
  assert.equal(await main(["--email", "destino@blogger.com"], d), 0);
  assert.equal(enviados.length, 0);
});

test("main: falha de envio vira log e retorna 1", async () => {
  const d = deps("palavra ".repeat(400));
  d.sendEmail = async () => {
    throw new Error("EMAIL_USER e APP_PASSWORD são obrigatórios");
  };
  const codigo = await main(["--email", "destino@blogger.com"], d);
  assert.equal(codigo, 1);
  assert.match(d.log.linhas.join("\n"), /EMAIL_USER e APP_PASSWORD são obrigatórios/);
});

test("main: sem --email retorna 1 e explica", async () => {
  const d = deps("palavra ".repeat(400));
  assert.equal(await main([], d), 1);
  assert.match(d.log.linhas.join("\n"), /--email/);
});

test("main: aceita --email=valor, forma do argparse", async () => {
  const d = deps("palavra ".repeat(400));
  const enviados = [];
  d.sendEmail = async (...args) => enviados.push(args);
  assert.equal(await main(["--email=destino@blogger.com"], d), 0);
  assert.deepEqual(enviados.map((e) => e[0]), ["destino@blogger.com"]);
});
