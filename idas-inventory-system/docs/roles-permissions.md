# Roles & permissions

Permissions are defined once in `backend/src/common/permissions.ts`, enforced on every API call by `PermissionsGuard`, mirrored into the `Role`/`Permission` tables by the seed script (for display), and used by the UI only to hide navigation. Changing the matrix is a code change (reviewed and unit-tested), not a runtime toggle — a deliberate decision, see design-decisions.md.

| Permission | Admin | Lab Staff / Technician | Lecturer | Dean / Registrar | Student | University Staff | Trainee |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `dashboard:view` — View management dashboard | ● | ● |  | ● |  |  |  |
| `user:read` — View users | ● |  |  |  |  |  |  |
| `user:write` — Create/update/deactivate users | ● |  |  |  |  |  |  |
| `role:read` — View roles and permissions | ● |  |  |  |  |  |  |
| `asset:read` — Search and view assets | ● | ● | ● | ● | ● | ● | ● |
| `asset:write` — Create/update assets | ● | ● |  |  |  |  |  |
| `asset:move` — Move assets between locations | ● | ● |  |  |  |  |  |
| `lookup:write` — Manage categories and locations | ● | ● |  |  |  |  |  |
| `loan:request` — Submit equipment requests | ● |  | ● |  | ● | ● | ● |
| `loan:read-all` — View all loans | ● | ● |  |  |  |  |  |
| `loan:manage` — Approve, issue, receive and inspect loans | ● | ● |  |  |  |  |  |
| `booking:request` — Submit lab booking requests | ● |  | ● |  |  |  |  |
| `booking:read-all` — View all bookings/calendar | ● | ● | ● | ● |  |  |  |
| `booking:decide` — Approve or reject lab bookings | ● |  |  | ● |  |  |  |
| `maintenance:read` — View maintenance | ● | ● |  |  |  |  |  |
| `maintenance:report` — Report faults | ● | ● | ● |  |  |  |  |
| `maintenance:manage` — Run repair workflow | ● | ● |  |  |  |  |  |
| `maintenance:verify` — Verify repairs | ● | ● |  |  |  |  |  |
| `damage:report` — Report damage | ● | ● | ● |  | ● | ● | ● |
| `damage:manage` — Manage damage/lost reports | ● | ● |  |  |  |  |  |
| `stocktake:manage` — Run stocktakes | ● | ● |  |  |  |  |  |
| `report:view` — View and export reports | ● | ● |  | ● |  |  |  |
| `audit:read` — View audit log | ● |  |  |  |  |  |  |
| `settings:manage` — Manage system settings | ● |  |  |  |  |  |  |


Row-level rules on top of the matrix: borrowers only see their own requests/loans/bookings; only the booking's lecturer can modify it; a user cannot deactivate or re-role their own account.
