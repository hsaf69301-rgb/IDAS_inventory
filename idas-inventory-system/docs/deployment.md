# Deployment

## Single server with Docker Compose
```bash
cp .env.example .env              # fill in strong secrets (openssl rand -hex 48 / -hex 24)
docker compose up -d --build      # db + backend (runs migrations on start) + frontend
docker compose run --rm backend npx prisma db seed   # OPTIONAL: demo data (never in real production)
```
Open `http://<server>:8080`. Put a TLS-terminating reverse proxy (Caddy/nginx/Traefik) in front, then set `COOKIE_SECURE=true`, `FRONTEND_URL` and `CORS_ORIGINS` to the HTTPS origin.

First real administrator without demo data: seed once, sign in as `admin@idas.pdn.ac.lk`, create your own admin user, then deactivate the demo accounts (Users page).

## Backups
```bash
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > idas-$(date +%F).sql.gz
docker run --rm -v idas-inventory-system_idas_uploads:/u -v "$PWD":/b alpine tar czf /b/uploads-$(date +%F).tgz -C /u .
```

## Upgrades
`git pull && docker compose up -d --build` — the backend applies pending migrations on start (`prisma migrate deploy`).
