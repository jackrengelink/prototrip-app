# Putting ProtoTrip online

ProtoTrip is one small Node.js server that serves both the API and the web app. It needs:

- **HTTPS** – phones only install the app, work offline and receive notifications over HTTPS. All options below give you that.
- **Somewhere to keep the data** – either a folder on a persistent disk (`DATA_DIR`) or a PostgreSQL database (`DATABASE_URL`). A trip is tiny (well under 1 MB), so the smallest/free tiers are plenty.
- **An admin password** – set `ADMIN_PASSWORD`.

After deploying, open the site, sign in with the admin password and go to **Manage**. The participant and organizer codes are shown there (and in the server log on first start).

---

## Option 1 – Render + Neon (free)

Render's free web services don't keep files between restarts, so the data goes into a free PostgreSQL database at Neon.

1. **Database:** create a free project at [neon.tech](https://neon.tech) (region: Frankfurt or Amsterdam). Copy the connection string; it looks like
   `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
2. **Web service:** at [render.com](https://render.com) choose *New → Web Service*, connect this GitHub repository and use:
   - Runtime: **Node**
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Instance type: **Free**
   - Environment variables:
     - `NODE_ENV` = `production`
     - `ADMIN_PASSWORD` = a long password only you know
     - `DATABASE_URL` = the Neon connection string
     - `PUBLIC_URL` = `https://<your-service>.onrender.com` (add after the first deploy)
3. Deploy. Visit the URL and sign in with your admin password.

Free Render services fall asleep after ~15 minutes without visitors; the first visit after that takes about 30 seconds. During the trip people use the app constantly, so that's rarely noticeable – and the app shows the cached schedule instantly while it wakes up.

> **Prefer files on a disk?** The included [`render.yaml`](../render.yaml) Blueprint creates a paid *Starter* instance with a 1 GB disk at `/var/data`. Leave `DATABASE_URL` empty in that case.

> **Supabase instead of Neon?** Use its connection string the same way. If you get a certificate error, also set `PGSSL_REJECT_UNAUTHORIZED=false`.

## Option 2 – Fly.io (Docker, Amsterdam region)

Uses the included [`Dockerfile`](../Dockerfile) and [`fly.toml`](../fly.toml). Install [flyctl](https://fly.io/docs/flyctl/install/), then from the repository folder:

```bash
fly launch --no-deploy --copy-config --name prototrip-<something-unique>
```

```bash
fly volumes create prototrip_data --size 1 --region ams
```

```bash
fly secrets set ADMIN_PASSWORD='choose-a-long-password' PUBLIC_URL='https://prototrip-<something-unique>.fly.dev'
```

```bash
fly deploy
```

Data lives on the volume at `/data` (including automatic backups in `/data/backups`). The machine stops when idle and starts on the next request.

## Option 3 – Your own server with Docker

On any Linux server with Docker:

```bash
echo "ADMIN_PASSWORD=choose-a-long-password" > .env
```

```bash
echo "PUBLIC_URL=https://trip.example.org" >> .env
```

```bash
docker compose up -d --build
```

The app listens on port 3000; data is kept in the `prototrip-data` Docker volume. Put a reverse proxy with HTTPS in front, for example [Caddy](https://caddyserver.com) with this `Caddyfile`:

```
trip.example.org {
  reverse_proxy localhost:3000
}
```

## Option 4 – Plain Node.js

```bash
npm ci
```

```bash
npm run build
```

```bash
NODE_ENV=production ADMIN_PASSWORD='choose-a-long-password' DATA_DIR=/var/lib/prototrip npm start
```

Run it under systemd/pm2 and put an HTTPS proxy in front (see option 3).

---

## Updating

Deploy the new version the same way (push to GitHub for Render, `fly deploy`, or `docker compose up -d --build`). Data is kept. Open apps notice the new version and show a *Reload* banner.

## Backups

- The server keeps up to 40 snapshots: one every 6 hours when something changed, plus one before every import, reset or restore. Restore them under **Manage → Backup & export**.
- For extra safety, download a full backup (**Download full backup (JSON)**) before the trip and keep it somewhere else. It can be restored on any ProtoTrip installation with **Restore from a backup file**.

## Forgot the admin password?

- If you set `ADMIN_PASSWORD` in the environment: just change it there and restart.
- Otherwise stop the app, run `node dist/server/cli.js reset-admin-password new-password-here` in the app folder (with Docker: `docker compose run --rm prototrip node dist/server/cli.js reset-admin-password new-password-here`), and start the app again. When using PostgreSQL, run it with the same `DATABASE_URL`.

## Checking it works

- `https://<your-app>/api/health` should return `{"ok":true,...}`.
- On a phone: open the site, sign in, then *Me → Install the app* and *Me → Notifications*. Under **Manage → Notifications** you can send a test to all organizer devices.
