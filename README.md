# rotinas

Automações pessoais rodando em GitHub Actions.

| Rotina | Workflow |
|---|---|
| `postar-no-blog` | `.github/workflows/postar-no-blog.yml` (código em `postar-no-blog/`) |
| `postar-no-R43` | `.github/workflows/postar-no-R43.yml` (4x/dia, código em `postar-no-R43/`) |
| `postar-no-RdS` | `.github/workflows/postar-no-RdS.yml` (4x/dia, 23/05/11/17 BRT, código em `postar-no-RdS/`) |

Opcional: secret `GH_ADMIN_TOKEN` (PAT com escopo `repo`) permite aos workflows regravar `YOUTUBE_TOKEN`/`YOUTUBE_TOKEN_RDS` quando o OAuth renova o token. Sem ele, o upload funciona, mas a renovação não volta para o GitHub.

Quota: R43 (4x) + RdS (4x) = 8 uploads/dia. Projeto GCP/OAuth compartilhado tem ~6/dia; use projeto/OAuth separado para RdS ou reduza a frequência.

## postar-no-R43

Shorts de curiosidades gerais para o canal Refúgio 43. Pasta `postar-no-R43/`, estado em `postar-no-R43/state/`, credenciais em `postar-no-R43/credentials/`. 4x/dia (21, 03, 09, 15 BRT). Cache do Actions: `youtube-state-r43-`. Secrets `YOUTUBE_CLIENT_SECRET` e `YOUTUBE_TOKEN` permanecem com os nomes antigos.
