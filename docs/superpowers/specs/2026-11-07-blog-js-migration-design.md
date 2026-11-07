# Migração do blog de Python para JS

Data: 2026-11-07
Status: aguardando aprovação

## Intenção

Uma linguagem só no repo. `youtube-shorts` já é JS; `blogger-poster` é Python. O objetivo é
remover Python do CI e do repo, sem mudar o que a rotina faz.

## Metas

- Paridade de comportamento: Trends BR → escolha da fonte → reescrita via LLM → HTML → SMTP Gmail.
- Os 23 testes do Python portados, verdes em Node 22 (`node:test`) — 43 no fim, somando os casos de borda.
- Workflow continua horário, mesmo cache de dedupe, mesmos secrets e variables.

## Não-metas

- Não mudar prompt, tom, tamanho do texto, HTML ou destinatário.
- Não mudar o formato do `state/last_post.json` (dedupe atual continua válido).
- Não mexer no `youtube-shorts`.

## Abordagens consideradas

- **A. Port linha a linha, mesma estrutura de arquivo e mesmas funções.** Menor chance de
  mudança de comportamento. Escolhida.
- **B. Reescrever do zero com outra arquitetura.** Mais liberdade, mas cada decisão nova é
  um risco num pipeline que publica de verdade. Descartada.
- **C. Manter Python e chamar de um wrapper JS.** Não remove Python de nada. Descartada.
- **D. Rodar Python e JS em paralelo para comparar.** Descartada: o `state/` é compartilhado,
  as duas rotinas competiriam pelo mesmo dedupe e o próprio teste criaria duplicata.

## Decisões (minhas, sujeitas a veto)

- `fast-xml-parser` para o RSS do Trends. Node não tem parser XML nativo e o feed usa namespace.
- `nodemailer` para SMTP Gmail 587 com STARTTLS. Node não fala SMTP nativo.
- Layout igual ao `youtube-shorts/`: `package.json`, `scripts/`, `test/`.
- `state/` resolvido a partir de `__dirname`, não do cwd. Caminho final idêntico
  (`<repo>/state/last_post.json`), então o cache do Actions não muda e o dedupe não zera.
- Env intactas: `EMAIL_USER`, `APP_PASSWORD`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`,
  `BLOG_EMAIL`.

## Arquivos

```
blogger-poster/
├── package.json          fast-xml-parser, nodemailer
├── scripts/
│   ├── post_news.js      port de post_news.py (370 linhas)
│   └── enviar_email.js   port de enviar_email.py
└── test/                 1 arquivo, 43 testes
```

Removidos: `scripts/*.py`, `tests/`, `requirements.txt` (na raiz, antes do move para `blogger-poster/`).

## Riscos

- **Parser do RSS** é o ponto frágil. Vai ter teste com um XML de exemplo, com namespace igual ao real.
- **Publica de verdade.** A validação final é um envio local com `--email` no Gmail pessoal,
  não no endereço do Blogger. Isso exercita Trends, LLM, HTML e SMTP sem publicar.
- **Dependabot** passa a olhar `blogger-poster/package-lock.json` também.

## Validação

1. 43 testes verdes em Node.
2. Rodada local real, destinatário Gmail pessoal, conferir o HTML recebido.
3. Push. Observar a primeira execução agendada no Actions.
