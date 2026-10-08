# Major workflows

## Lab booking (Lecturer → Dean/Registrar)
```mermaid
sequenceDiagram
  actor L as Lecturer
  participant API
  participant DB
  actor D as Dean/Registrar
  L->>API: POST /bookings/check (live availability)
  L->>API: POST /bookings
  API->>DB: validate hours/day/past, run availability engine
  alt time conflict or shortage
    API-->>L: 409 + conflicts, BOOKING_CONFLICT notification
  else free
    API->>DB: booking = PENDING (+ approval history)
    API-->>D: notification BOOKING_REQUESTED
  end
  D->>API: GET /bookings/:id (request + live analysis)
  D->>API: POST /bookings/:id/decision
  API->>DB: BEGIN; advisory lock; re-check; reserve concrete assets; APPROVED; COMMIT
  API-->>L: notification APPROVED / REJECTED(reason)
```
Checks: lab open day and hours, same-day, not in the past, overlapping **approved** booking (hard conflict), usable computers (not damaged / in repair / lost / on overlapping loan), requested equipment by category (minus loans and reservations), open maintenance reported as the cause of shortages. Approval re-runs everything inside a transaction and the DB exclusion constraint is the last line of defence. Modifying an approved booking returns it to PENDING.

## Equipment loan
`PENDING → APPROVED → ISSUED → RETURNED` (or `REJECTED` / `CANCELLED`), then inspection:
* request: assets must be usable and not already promised (other loans or approved reservations) for the period;
* approve/reject (reason mandatory) by lab staff; re-checks conflicts;
* issue: every asset flips `AVAILABLE → BORROWED` with a conditional update (two staff cannot issue the same asset); condition-before-issue, accessories and issuer recorded;
* return: condition-after, missing accessories, receiver recorded; assets → `UNDER_INSPECTION`;
* inspection: pass → `AVAILABLE`; fail → maintenance job opened and asset stays unavailable;
* overdue job (every 10 min and on demand): `ISSUED` loans past due flag assets `OVERDUE`, notify borrower and staff; due-in-24h reminders.

## Maintenance & repair
`REPORTED → DIAGNOSING → ASSIGNED → UNDER_REPAIR → REPAIRED → AWAITING_VERIFICATION → VERIFIED → CLOSED`
* Steps cannot be skipped; `VERIFIED` can only be reached through the verification endpoint (test performed, result, verifier, time, notes).
* Failed verification returns the job to `UNDER_REPAIR`; the asset never becomes `AVAILABLE` until a verification passes.
* `POST /assets/:id/status` with `AVAILABLE` on an asset with an unfinished repair is rejected (HTTP 409).

## Damage / lost
Damage report → asset condition/status updated (not while on loan); MAJOR/CRITICAL auto-opens maintenance. Missing/lost report → asset `MISSING`/`LOST`, staff notified; recovery → asset goes to inspection first. Nothing is deleted.

## Stocktake
Start (scope = location subtree or everything) → each asset marked Verified / Not Found / Wrong Location / Damaged / Needs Inspection (scan tag + Enter = Verified) → Complete: Not Found ⇒ missing report + status MISSING; Damaged ⇒ DAMAGED; Needs Inspection ⇒ UNDER_INSPECTION. PDF/Excel report.
