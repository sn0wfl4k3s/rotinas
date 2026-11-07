# rotinas

Automações pessoais rodando em GitHub Actions.

| Rotina | Workflow |
|---|---|
| `postar-noticia-no-blog` | `.github/workflows/postar-noticia-no-blog.yml` |
| `youtube-shorts` | `.github/workflows/youtube-shorts.yml` (4x/dia, código em `youtube-shorts/`) |

## postar-noticia-no-blog

Google Trends BR → maior tendência → reescrita via LLM → envio por e-mail. Roda de hora em hora.

Rodar localmente:

```bash
cp .env.example .env
set -a && source .env && set +a
python3 scripts/post_news.py --email "$BLOG_EMAIL"
```

O estado de dedupe (`state/`) fica em `actions/cache`.
