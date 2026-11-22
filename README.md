# rotinas

Automações pessoais rodando em GitHub Actions.

| Rotina | Workflow |
|---|---|
| `postar-no-blog` | `.github/workflows/postar-no-blog.yml` (código em `postar-no-blog/`) |
| `postar-no-R43` | `.github/workflows/postar-no-R43.yml` (4x/dia, código em `postar-no-R43/`) |
| `postar-no-RdS` | `.github/workflows/postar-no-RdS.yml` (4x/dia, 23/05/11/17 BRT, código em `postar-no-RdS/`) |

Opcional: secret `GH_ADMIN_TOKEN` (PAT com escopo `repo`) permite aos workflows regravar `YOUTUBE_TOKEN`/`YOUTUBE_TOKEN_RDS` quando o OAuth renova o token. Sem ele, o upload funciona, mas a renovação não volta para o GitHub.

Quota: R43 (4x) + RdS (4x) = 8 uploads/dia. Projeto GCP/OAuth compartilhado tem ~6/dia; use projeto/OAuth separado para RdS ou reduza a frequência. Para separar: criar novo projeto GCP, ativar YouTube Data API v3, criar OAuth client Desktop, gerar token com `postar-no-RdS/scripts/autenticar.js` escolhendo Refúgio do Senhor e gravar `YOUTUBE_CLIENT_SECRET_RDS` + `YOUTUBE_TOKEN_RDS`. O workflow prefere `YOUTUBE_CLIENT_SECRET_RDS` quando existe; sem ele usa o compartilhado e avisa no log.

