# IDAS Inventory and Resource Management System

Inventory, lending, laboratory booking, maintenance and audit for the **IDAS Lab, Department of IT, Faculty of Arts, University of Peradeniya**.

React + TypeScript + Vite + Tailwind (frontend) · NestJS + Prisma (backend) · PostgreSQL · Docker · GitHub Actions · GitHub Codespaces.

> **Status – please read.** This code base was written in a sandbox **without internet access**, so `npm install`, the database migrations, and the test suites could **not be executed** there. What *was* verified: every TypeScript file parses, and the core logic (availability/double-booking engine, time-zone helpers) was executed against test cases. Expect to spend your first session in Codespaces fixing small compile/runtime issues. Section 15 lists exactly what to run and how to report problems.

---

## 1. Prerequisites
| Tool | Version |
|---|---|
| Node.js | 20 LTS or newer (22 works) |
| npm | 10+ |
| PostgreSQL | 16 (via Docker, or installed locally) |
| Docker Desktop (optional but recommended) | recent |
| Git | any |

## 2. Get the code onto GitHub
```bash
cd idas-inventory-system
git init -b main
git add .
git commit -m "Initial import: IDAS Inventory System"
# create an empty repo on github.com (no README), then:
git remote add origin https://github.com/<you>/idas-inventory-system.git
git push -u origin main
```

## 3. GitHub Codespaces (easiest)
1. On the repo page: **Code → Codespaces → Create codespace on main**.
2. Wait for the container to build. `.devcontainer/setup.sh` runs automatically: it creates `backend/.env` with **freshly generated secrets**, installs dependencies, applies migrations and loads the demo data.
3. Open two terminals:
   ```bash
   npm run dev:backend      # API → port 3000   (Swagger: /api/docs)
   npm run dev:frontend     # Web → port 5173   (Codespaces opens it for you)
   ```
4. Sign in with a demo account (section 17).

## 4. Repository structure
See [docs/architecture.md](docs/architecture.md). Short version: `backend/` (API, Prisma, tests), `frontend/` (SPA), `tests/` (Playwright), `docs/`, `.github/workflows/`, `.devcontainer/`, `docker-compose.yml`.

## 5. Environment variables
Two env files exist, both created from templates and both git-ignored:

| File | Used by | Template |
|---|---|---|
| `backend/.env` | running the API locally (`npm run dev:backend`) | `backend/.env.example` |
| `.env` (repo root) | `docker compose` | `.env.example` |

Key variables: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars), `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `API_URL`, `CORS_ORIGINS`, `COOKIE_SECURE`, `LAB_TIMEZONE`, `UPLOAD_DIR`, `SWAGGER_ENABLED`. Generate secrets with `openssl rand -hex 48`. **Never commit `.env`.**

## 6. PostgreSQL
**Docker (recommended):**
```bash
cp .env.example .env          # edit POSTGRES_PASSWORD, JWT_SECRET
docker compose up -d db
```
**Local install:** create a database and user, then put the connection string in `backend/.env`:
```sql
CREATE USER idas WITH PASSWORD '<strong-password>';
CREATE DATABASE idas OWNER idas;
```
`DATABASE_URL=postgresql://idas:<strong-password>@localhost:5432/idas?schema=public`
(URL-encode special characters in the password, or use a hex password.)

## 7. Docker – full stack
```bash
cp .env.example .env     # set POSTGRES_PASSWORD and JWT_SECRET to real random values
docker compose up -d --build
docker compose run --rm backend npx prisma db seed     # optional demo data
```
App: http://localhost:8080 · API docs: http://localhost:8080/api/docs

## 8. Prisma setup
```bash
cd backend
cp .env.example .env     # then edit DATABASE_URL and secrets
npm install
npx prisma generate
```

## 9. Database migration
```bash
npm run prisma:deploy        # applies prisma/migrations (tables + integrity guards)
```
Migrations: `…_init` (all tables) and `…_db_guards` (append-only audit triggers, no-double-booking exclusion constraint, CHECK constraints). For later schema changes use `npx prisma migrate dev --name <change>`.

## 10. Database seed (demo data)
```bash
npm run prisma:seed
```
Creates roles/permissions, 8 users, the location tree, 15 categories, ~60 assets (24 lab PCs, laptops, projectors, network gear…), loans (one overdue), booking requests (pending/approved/rejected), maintenance, damage, a missing item, notifications and audit entries. It refuses to run twice on a non-empty database.

## 11. Run the backend
```bash
cd backend && npm run start:dev          # http://localhost:3000/api  ·  docs at /api/docs
```
## 12. Run the frontend
```bash
cd frontend && npm install && npm run dev   # http://localhost:5173  (proxies /api → :3000)
```
From the repo root you can instead use `npm run setup`, `npm run dev:backend`, `npm run dev:frontend`.

## 13. Tests
```bash
npm --prefix backend test            # unit tests (no database)
npm --prefix frontend test           # frontend unit tests
npm --prefix backend run test:e2e    # API tests – needs a migrated + SEEDED throw-away database
cd tests && npm install && npx playwright install chromium && npx playwright test   # browser tests, needs the app running
npm run lint && npm run typecheck
```
Details: [docs/testing.md](docs/testing.md).

## 14. Build
```bash
npm --prefix backend run build && npm --prefix frontend run build
```

## 15. Your first run – what to do if something fails
Run these in order; the first failing command tells you what to fix:
```bash
npm run setup
cd backend && npx prisma generate && npm run typecheck && npm run lint
npm test && cd ../frontend && npm run typecheck && npm run lint && npm test
cd ../backend && npm run prisma:deploy && npm run prisma:seed && npm run test:e2e
```
Paste the *first* error message into a new chat (or give it to Copilot/Claude in the Codespace) — most fixes are one-liners. After a clean `npm install` **commit both `package-lock.json` files** so CI and Docker become reproducible.

## 16. Production deployment
See [docs/deployment.md](docs/deployment.md) (Docker Compose, TLS, backups, upgrades) and [docs/security.md](docs/security.md) (go-live checklist).

## 17. Demo accounts
Password for **all** demo accounts: `Idas@2026Demo` (override with `SEED_DEMO_PASSWORD` before seeding).

| Role | Email |
|---|---|
| Admin | admin@idas.pdn.ac.lk |
| Lab Staff / Technician | technician@idas.pdn.ac.lk |
| Lecturer | lecturer@idas.pdn.ac.lk (and lecturer2@…) |
| Dean / Registrar | dean@idas.pdn.ac.lk |
| Student | student@idas.pdn.ac.lk |
| University Staff | staff@idas.pdn.ac.lk |
| Trainee | trainee@idas.pdn.ac.lk |

> ⚠ **Demo credentials are for development only.** In any real deployment change these passwords or deactivate the accounts, and never seed a production database.

## 18. Troubleshooting
| Symptom | Fix |
|---|---|
| `Missing required environment variables` on start | create `backend/.env` from `backend/.env.example` |
| `JWT_SECRET must be at least 32 characters` | `openssl rand -hex 48` |
| `P1001 Can't reach database` | start Postgres (`docker compose up -d db`), check host/port in `DATABASE_URL` (`db` inside Docker/Codespaces, `localhost` outside) |
| `prisma migrate deploy` reports a failed/drifted migration | the initial SQL was script-generated. Reset the dev DB: `npx prisma migrate reset --force`. If it still fails: delete `prisma/migrations/*_init`, run `npx prisma migrate dev --name init`, then re-add the `*_db_guards` folder (rename it so it sorts after `init`) |
| Login works but pages show 401 loops | frontend must reach the API on the same origin: use `npm run dev` (Vite proxy) or the nginx container; set `VITE_API_PROXY` if the API is not on `localhost:3000` |
| Cookie not saved over HTTPS | set `COOKIE_SECURE=true` and serve both app and API under the same HTTPS origin |
| `audit … append-only` error while cleaning test data | by design – never delete audit rows; use a fresh database (`npm run db:reset` in `backend/`) |
| Seed says "already contains users" | `npm run db:reset` (wipes the database!) or `SEED_FORCE=true` |
| Port in use | change `PORT` (backend) or `--port` (Vite) |

## 19. Documentation
[Architecture](docs/architecture.md) · [Database & ER diagram](docs/database.md) · [Roles & permissions](docs/roles-permissions.md) · [Workflows](docs/workflows.md) · [API](docs/api.md) · [Security](docs/security.md) · [Testing](docs/testing.md) · [Deployment](docs/deployment.md) · [Design decisions](docs/design-decisions.md)

The academic documents (SRS, UML, test plan, user manual, report, slides…) are intentionally produced **after** this system has been run and tested, so they describe the system as actually built.

## 20. Scope notes
Implemented: all modules in the requirements. Optional/future (documented, not built): email delivery of notifications, S3 file storage, runtime permission editor, multi-room lab booking.

License: MIT
