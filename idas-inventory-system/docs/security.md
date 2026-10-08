# Security

| Area | Implementation |
|---|---|
| Passwords | bcrypt (cost 12); policy ≥10 chars with upper/lower/digit; change-password revokes all sessions |
| Brute force | 5 failed logins ⇒ 15-minute lock; `/auth/login` limited to 10 req/min/IP; global rate limit |
| Tokens | 15-min JWT access token (memory only); rotating refresh token in httpOnly cookie, hashed at rest, reuse detection |
| Authorisation | `@RequirePermissions` on every route, checked by a global guard; default is authenticated-only; row-level checks for own records |
| Validation | class-validator DTOs with `whitelist` + `forbidNonWhitelisted`; Zod on the client |
| Injection | Prisma parameterised queries; the few raw queries use tagged templates; CSV export neutralises `= + - @` formulas |
| Uploads | MIME whitelist (JPG/PNG/WEBP/PDF), 5 MB, random stored name, served only to authenticated users with `nosniff` |
| HTTP | Helmet headers, CORS allow-list (`CORS_ORIGINS`), nginx security headers, same-origin API behind the SPA |
| Secrets | only in environment variables; `.env` is git-ignored; the app refuses to start without `JWT_SECRET` (≥32 chars) |
| Audit | every important action logged with user, module, record, old/new values, IP and user agent; append-only + hash chain |
| Errors | uniform JSON errors; internals are logged, not returned |

**Before going live:** change all demo passwords (or delete the demo users), set `COOKIE_SECURE=true` behind HTTPS, set a strong `POSTGRES_PASSWORD`, set `SWAGGER_ENABLED=false` if the docs should not be public, back up the database and the uploads volume, and keep dependencies updated (`npm audit`, Dependabot).
