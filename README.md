# rotinas

Automações pessoais rodando em GitHub Actions.

| Rotina | Workflow |
|---|---|
| `postar-no-blog` | `.github/workflows/postar-no-blog.yml` (código em `postar-no-blog/`) |
| `postar-no-shorts` | `.github/workflows/postar-no-shorts.yml` (4x/dia, código em `postar-no-shorts/`) |
| `postar-no-shorts-biblia` | `.github/workflows/postar-no-shorts-biblia.yml` (2x/dia, código em `postar-no-shorts/`) |

## postar-no-blog

Google Trends BR → maior tendência → reescrita via LLM → envio por e-mail. Roda 1 vez ao dia.

Rodar localmente:

```bash
cp .env.example .env
set -a && source .env && set +a
bun install --cwd postar-no-blog
bun postar-no-blog/scripts/post_news.js --email "$BLOG_EMAIL"
```

O estado de dedupe (`state/`) fica em `actions/cache`.

## postar-no-shorts

Pipeline: tema via LLM → MoneyPrinterTurbo → YouTube Short. 4x/dia (21, 03, 09, 15 BRT).

## postar-no-shorts-biblia

Mesmo pipeline, voltado a curiosidades pouco comentadas da Bíblia, personagens e contexto bíblico. 2x/dia (00, 12 BRT) para somar 6 uploads/dia e respeitar a quota do YouTube.

Reaproveita `postar-no-shorts/` com `SHORTS_PROFILE=biblia`. Perfis em `postar-no-shorts/perfis/` (`geral` = padrão, sem mudança de comportamento). Cada perfil tem prompt de tema, prompt de metadados e histórico próprio (`postar-no-shorts/state/<perfil>/temas.json`; `geral` continua em `state/temas.json`). Cache do Actions com prefixo `youtube-state-<perfil>-`.

Secrets do canal bíblico: `YOUTUBE_CLIENT_SECRET_BIBLIA` e `YOUTUBE_TOKEN_BIBLIA`. Credenciais em `postar-no-shorts/credentials/biblia/` via `YOUTUBE_CREDENTIALS_DIR`. `LLM_API_KEY`, `PEXELS_API_KEY` e as vars `LLM_BASE_URL`/`LLM_MODEL` são compartilhadas.
