# API

Interactive OpenAPI (Swagger UI): **`/api/docs`** (backend `:3000`, or through the frontend host). Authenticate with `POST /api/auth/login`, then press *Authorize* and paste the `accessToken`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me` · `POST /auth/change-password` |
| Users | `GET/POST /users` · `GET/PATCH /users/:id` · `GET /roles` · `GET /permissions` · `GET /departments` |
| Lookups | `GET/POST/PATCH /categories` · `/locations` · `GET/PUT /settings` |
| Assets | `GET/POST /assets` · `GET/PATCH/DELETE(archive) /assets/:id` · `GET /assets/by-tag/:tag` · `/:id/history` · `/:id/qr` · `POST /:id/move` · `/:id/status` · `/:id/documents` |
| Loans | `GET/POST /loans` · `GET /loans/:id` · `POST /:id/decision` · `/:id/issue` · `/:id/return` · `/:id/cancel` · `POST /loans/inspect/:assetId` · `POST /loans/jobs/overdue` |
| Bookings | `GET/POST /bookings` · `GET/PATCH /bookings/:id` · `POST /bookings/check` · `GET /bookings/slots?date=` · `/calendar?from&to` · `/hours` · `POST /:id/decision` · `/:id/cancel` · `GET /reservations` |
| Maintenance | `GET/POST /maintenance` · `GET /maintenance/:id` · `POST /:id/advance` · `/:id/verify` |
| Damage / lost | `GET/POST /damage` · `PATCH /damage/:id` · `GET/POST /lost` · `PATCH /lost/:id` |
| Stocktakes | `GET/POST /stocktakes` · `GET /:id` · `POST /:id/check` · `/:id/complete` |
| Reports | `GET /reports` · `GET /reports/:type?format=json|csv|xlsx|pdf&from&to` |
| Notifications | `GET /notifications` · `/unread-count` · `PATCH /:id/read` · `/read-all` |
| Dashboard | `GET /dashboard` · `GET /dashboard/me` |
| Audit | `GET /audit` · `GET /audit/verify` |
| Health | `GET /health` |
