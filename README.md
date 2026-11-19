# rotinas

Automações pessoais rodando em GitHub Actions.

| Rotina | Workflow |
|---|---|
| `postar-no-blog` | `.github/workflows/postar-no-blog.yml` (código em `postar-no-blog/`) |
| `postar-no-shorts` | `.github/workflows/postar-no-shorts.yml` (4x/dia, código em `postar-no-shorts/`) |
| `postar-no-RdS` | `.github/workflows/postar-no-RdS.yml` (2x/dia, código em `postar-no-RdS/`) |

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

## postar-no-RdS

Shorts sobre curiosidades pouco comentadas da Bíblia, personagens e contexto bíblico. Pasta própria: `postar-no-RdS/`, com scripts, estado (`postar-no-RdS/state/`) e credenciais (`postar-no-RdS/credentials/`) independentes. Roda 2x/dia (00, 12 BRT) para somar 6 uploads/dia com o canal geral.

Workflow: `.github/workflows/postar-no-RdS.yml`. Secrets do canal: `YOUTUBE_CLIENT_SECRET_RDS` e `YOUTUBE_TOKEN_RDS`. `LLM_API_KEY`, `PEXELS_API_KEY`, `LLM_BASE_URL` e `LLM_MODEL` são compartilhados.
