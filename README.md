# Cypher

Named after the X-Men's Doug Ramsey, whose power is instantly understanding and translating any language or code. This bot does the same job: it translates a casual Discord message into a structured GitHub issue. Tag it in Discord (or reply to a message with just a mention) and it files a GitHub issue from that text, with dedupe so the same message can't be filed twice.

## How it works

- `@Cypher <description>` — files an issue using the text after the mention.
- Reply to someone else's message with just `@Cypher` — files an issue using the replied-to message's content. Any extra text after the mention is added as additional context.
- Re-tagging a message that's already been filed replies with the existing issue link instead of creating a duplicate (tracked in `data/store.json`).

## 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token**, copy it → `DISCORD_TOKEN`.
3. Still on the **Bot** tab, under **Privileged Gateway Intents**, enable **Message Content Intent**. The bot cannot read message text without this.
4. **OAuth2 → URL Generator**: scopes `bot`; bot permissions `Read Messages/View Channels`, `Send Messages`, `Read Message History`, `Add Reactions`. Open the generated URL and invite the bot to your server.
5. Copy the application ID → `DISCORD_CLIENT_ID`.

## 2. Create the GitHub PAT

1. GitHub → **Settings → Developer settings → Fine-grained personal access tokens → Generate new token**.
2. Resource owner: your account/org. Repository access: **every** repo you plan to route a Discord channel to (see [§4](#4-map-discord-channels-to-repos)).
3. Permissions: **Issues → Read and write**. Nothing else.
4. Copy the token → `GITHUB_TOKEN`.

## 3. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Required | Notes |
|---|---|---|
| `DISCORD_TOKEN` | yes | bot token from step 1 |
| `DISCORD_CLIENT_ID` | no | only used if you add slash commands later |
| `ALLOWED_ROLE_IDS` | no | comma-separated role IDs; empty = anyone can use the bot |
| `GITHUB_TOKEN` | yes | fine-grained PAT from step 2 |
| `DEFAULT_LABELS` | no | comma-separated labels applied to issues from channels with no `labels` override in `channels.json` |
| `CHANNEL_MAP_PATH` | no | path to the channel→repo map (default `./channels.json`, set to `/app/config/channels.json` under Docker). The map itself must have at least one entry — the bot refuses to start otherwise. |
| `STORE_PATH` | no | dedupe file location (default `./data/store.json`, set to `/app/data/store.json` under Docker) |
| `COOLDOWN_SECONDS` | no | per-user cooldown between filed issues (default `10`) |

## 4. Map Discord channels to repos

There's no default/fallback repo — every channel the bot listens in must have an explicit entry in the channel map, or the bot refuses to start.

```bash
cp channels.json.example channels.json
```

```json
{
  "111111111111111111": { "owner": "ashujhaji", "repo": "cypher" },
  "222222222222222222": { "owner": "ashujhaji", "repo": "heimdall", "labels": ["from-discord", "heimdall"] }
}
```

- Keys are Discord **channel IDs** (enable Developer Mode in Discord settings, then right-click a channel → **Copy Channel ID**).
- `owner`/`repo` route that channel's issues to that repo; `labels` optionally overrides `DEFAULT_LABELS` just for that channel.
- A channel with no entry gets a reply saying it isn't wired up — the bot never guesses a repo.
- The one `GITHUB_TOKEN` is shared across every repo you route to — make sure the PAT from step 2 actually has access to all of them.
- The file is reloaded only on startup; restart the bot (`docker compose restart` or `npm start`) after editing it.

## 5. Run locally

```bash
npm install
npm start
```

## 6. Run with Docker (Windows, always-on)

Requires Docker Desktop.

```bash
docker compose up -d --build
```

This builds the image, starts the container with `restart: unless-stopped` (so it survives reboots and Docker Desktop restarts), and persists the dedupe store to `./data/store.json` on the host via a bind-mounted volume. If you're using a channel map, put it at `./config/channels.json` — compose mounts that directory read-only and points `CHANNEL_MAP_PATH` at it automatically.

Useful commands:

```bash
docker compose logs -f          # tail logs
docker compose up -d            # recreate the container after editing .env (restart does NOT reload it)
docker compose restart          # restart after editing channels.json only (no .env changes)
docker compose down             # stop and remove the container
```

The bot only makes outbound connections (Discord gateway, GitHub REST API) — no inbound ports are exposed or required.

## 7. Publish the image to Docker Hub via GitHub Actions

`.github/workflows/docker-publish.yml` builds and pushes the image on every push to `main` and on `v*.*.*` tags.

1. Push this repo to GitHub.
2. Create a [Docker Hub access token](https://app.docker.com/settings/personal-access-tokens) (read/write scope).
3. In the GitHub repo, add two Actions secrets (**Settings → Secrets and variables → Actions**):
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — the access token from step 2
4. Push to `main` (or run the workflow manually via **Actions → Build and Push Docker Image → Run workflow**). The image is published as `<DOCKERHUB_USERNAME>/cypher:latest` and tagged with the commit SHA.

To run the published image instead of building locally, point `docker-compose.yml`'s `image:` at `<DOCKERHUB_USERNAME>/cypher:latest` and drop the `build:` key, or run directly:

```bash
docker run -d --name cypher --restart unless-stopped \
  --env-file .env -e STORE_PATH=/app/data/store.json -e CHANNEL_MAP_PATH=/app/config/channels.json \
  -v "${PWD}/data:/app/data" -v "${PWD}/config:/app/config:ro" \
  <DOCKERHUB_USERNAME>/cypher:latest
```

## Notes

- The bot never auto-merges anything — it only files issues. Any downstream triage/fix automation reviews and opens PRs separately; a human still merges.
- Treat filed issue content as coming from whoever has access to tag the bot — use `ALLOWED_ROLE_IDS` to restrict who can trigger it if your server is public.
