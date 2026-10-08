# Testing

| Layer | Tool | Where | What it proves |
|---|---|---|---|
| Unit (backend) | Jest | `backend/src/**/*.spec.ts` | permission matrix invariants, availability/double-booking engine, maintenance state machine and verification gate, audit hash-chain tamper detection, CSV formula-injection protection |
| API integration | Jest + Supertest + **real PostgreSQL** | `backend/test/app.e2e-spec.ts` | 401/403 enforcement, booking flow with notifications, double-booking prevention (API and raw DB constraint), loan lifecycle, overdue detection, failed inspection → maintenance → verification gate, asset history old/new values, audit log + immutability, reports export, QR, stocktake |
| Unit (frontend) | Vitest + Testing Library | `frontend/src/**/*.test.ts(x)` | validation schemas, time-zone helpers, shared components |
| Browser E2E | Playwright | `tests/e2e` | lecturer → dean → lecturer booking flow incl. blocked double booking; equipment request → issue → return → inspection; student cannot reach staff pages |

```bash
npm --prefix backend test                  # unit tests (no database needed)
npm --prefix frontend test                 # frontend unit tests
# API tests need a migrated + seeded TEST database:
export DATABASE_URL=postgresql://…/idas_test
npm --prefix backend run prisma:deploy && npm --prefix backend run prisma:seed
npm --prefix backend run test:e2e
# Browser tests need backend :3000 + frontend :5173 running:
cd tests && npm install && npx playwright install chromium && npx playwright test
```
CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR.
Note: the audit table is append-only by design, so API tests never clean it; use a throw-away database.
