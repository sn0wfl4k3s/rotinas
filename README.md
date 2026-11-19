# rotinas

Automações pessoais rodando em GitHub Actions.

| Rotina | Workflow |
|---|---|
| `postar-no-blog` | `.github/workflows/postar-no-blog.yml` (código em `postar-no-blog/`) |
| `postar-no-R43` | `.github/workflows/postar-no-R43.yml` (4x/dia, código em `postar-no-R43/`) |
| `postar-no-RdS` | `.github/workflows/postar-no-RdS.yml` (2x/dia, código em `postar-no-RdS/`) |

## postar-no-R43

Shorts de curiosidades gerais para o canal Refúgio 43. Pasta `postar-no-R43/`, estado em `postar-no-R43/state/`, credenciais em `postar-no-R43/credentials/`. 4x/dia (21, 03, 09, 15 BRT). Cache do Actions: `youtube-state-r43-`. Secrets `YOUTUBE_CLIENT_SECRET` e `YOUTUBE_TOKEN` permanecem com os nomes antigos.
