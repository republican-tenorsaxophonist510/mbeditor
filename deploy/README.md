# Production Deploy Operations — mbeditor.mbluostudio.com

Reference material for operating the MBEditor production deployment that runs on
the Tencent Cloud Lightweight server `129.204.250.203` behind
`https://mbeditor.mbluostudio.com/`.

## Layout

- `/opt/mbeditor/docker-compose.prod.yml` — pulls prebuilt images from GHCR
- `/opt/mbeditor/.env` — placeholder file, reserved for future runtime config
- `/etc/nginx/sites-available/mbeditor` — vhost (audit copy: `deploy/nginx/mbeditor.conf`)
- `/etc/letsencrypt/live/mbeditor.mbluostudio.com/` — certbot-managed cert, auto-renewed by `certbot.timer`

## Images

Published to GHCR by `.github/workflows/deploy.yml` on every push to `main`:

- `ghcr.io/aaaaanson/mbeditor-frontend:sha-<12char>` + `:latest`
- `ghcr.io/aaaaanson/mbeditor-backend:sha-<12char>`  + `:latest`

## Rollback — one-liner

Pin both services to a previous SHA and restart. The `MBEDITOR_TAG` env var
flows into `docker-compose.prod.yml` via `${MBEDITOR_TAG:-latest}`.

```bash
ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 \
  "cd /opt/mbeditor && MBEDITOR_TAG=sha-<PREVIOUS_SHA> \
   docker compose -f docker-compose.prod.yml pull && \
   MBEDITOR_TAG=sha-<PREVIOUS_SHA> \
   docker compose -f docker-compose.prod.yml up -d"
```

Replace `<PREVIOUS_SHA>` with a 12-char short SHA. Use `ghcr.io/aaaaanson/mbeditor-*:sha-<PREVIOUS_SHA>` as your verification that the tag exists on GHCR.

## Finding previous SHAs

On the server (fastest — already-pulled layers are cached):

```bash
ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 \
  "docker images --filter=reference='ghcr.io/aaaaanson/mbeditor-*' \
   --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}'"
```

From dev machine via GHCR API (needs a PAT with `read:packages`):

```bash
gh api "users/AAAAAnson/packages/container/mbeditor-frontend/versions" \
  | jq -r '.[].metadata.container.tags[]' | grep '^sha-' | head
```

Or inspect the commit that produced a given tag:

```bash
git log --oneline --all | head   # short SHAs -> matches sha-<short>
```

## Forward-only deploys

Pushing to `main` rebuilds and tags `sha-<new>` + `latest`, and the deploy job
pulls both on the server. There is no manual step after push; the `Public smoke
test` curl step validates `https://mbeditor.mbluostudio.com/` and
`/api/v1/version` before the workflow reports green.

## Verification checklist

```bash
curl -fsS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://mbeditor.mbluostudio.com/           # 200 0
curl -fsS https://mbeditor.mbluostudio.com/api/v1/version                                                    # {"code":0,...}
ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 \
  "docker ps --filter name=mbeditor- --format '{{.Names}} {{.Status}}'"   # both Up (healthy)
ssh -i /d/Web/mbeditor_deploy ubuntu@129.204.250.203 \
  "docker inspect mbeditor-frontend --format '{{.Config.Image}}'"         # sha-$(git rev-parse --short=12 origin/main)
```

## SSH keys

- `D:/Web/mbeditor_deploy` — dedicated ed25519 deploy key, installed on the server's `authorized_keys` and mirrored in GitHub Secrets as `DEPLOY_SSH_KEY`. Revoke by deleting the `mbeditor-gha-deploy` line in `~ubuntu/.ssh/authorized_keys`.
- `D:/Web/windows.pem` — admin key (Tencent Cloud default), not stored in GitHub. Use for emergency access only.
