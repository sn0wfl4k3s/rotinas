# rotinas

Automações pessoais rodando em GitHub Actions.

| Rotina | Workflow |
|---|---|
| `postar-no-blog` | `.github/workflows/postar-no-blog.yml` (código em `postar-no-blog/`) |
| `postar-no-shorts` | `.github/workflows/postar-no-shorts.yml` (4x/dia, código em `postar-no-shorts/`) |

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
