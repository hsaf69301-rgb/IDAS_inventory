#!/usr/bin/env bash
# Runs once after the Codespace / dev container is created.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  # generate real random secrets – nothing secret is stored in the repository
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 48)|" backend/.env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 48)|" backend/.env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://idas@db:5432/idas?schema=public|" backend/.env
  echo "Created backend/.env with freshly generated secrets"
fi

npm --prefix backend install --no-audit --no-fund
npm --prefix frontend install --no-audit --no-fund
(cd backend && npx prisma generate && npx prisma migrate deploy && npm run prisma:seed)
(cd backend && npx playwright --version >/dev/null 2>&1 || true)

cat <<MSG

✔ Ready. Start the app in two terminals:
    npm run dev:backend     # API  → http://localhost:3000  (Swagger: /api/docs)
    npm run dev:frontend    # Web  → http://localhost:5173
  Demo login: admin@idas.pdn.ac.lk / Idas@2026Demo   (see README for all accounts)
MSG
