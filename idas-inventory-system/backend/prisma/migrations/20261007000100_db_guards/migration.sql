-- Database-level safeguards that Prisma's schema language cannot express.
-- These are the last line of defence behind the application's own business rules.

-- 1) TAMPER-RESISTANT AUDIT LOG: rows can be inserted but never updated, deleted or truncated.
CREATE OR REPLACE FUNCTION idas_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% not permitted)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION idas_audit_immutable();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION idas_audit_immutable();

-- Asset change history is append-only as well (old/new values must never be overwritten).
CREATE TRIGGER asset_history_no_update_delete BEFORE UPDATE OR DELETE ON "AssetHistory"
  FOR EACH ROW EXECUTE FUNCTION idas_audit_immutable();

-- 2) DOUBLE-BOOKING PREVENTION: two APPROVED lab bookings can never overlap in time.
ALTER TABLE "LabBooking" ADD CONSTRAINT "labbooking_no_overlap"
  EXCLUDE USING gist (tsrange("startTime", "endTime") WITH &&) WHERE ("status" = 'APPROVED');

-- 3) CHECK CONSTRAINTS
ALTER TABLE "LabBooking"   ADD CONSTRAINT "labbooking_time_order"   CHECK ("endTime" > "startTime");
ALTER TABLE "LabBooking"   ADD CONSTRAINT "labbooking_students_pos" CHECK ("studentCount" > 0);
ALTER TABLE "LabBooking"   ADD CONSTRAINT "labbooking_computers_nn" CHECK ("computersNeeded" >= 0);
ALTER TABLE "LoanRequest"  ADD CONSTRAINT "loan_time_order"         CHECK ("dueAt" > "requiredFrom");
ALTER TABLE "LoanItem"     ADD CONSTRAINT "loanitem_qty_pos"        CHECK ("quantity" > 0);
ALTER TABLE "BookingResource" ADD CONSTRAINT "bookingres_qty_pos"   CHECK ("quantity" > 0);
ALTER TABLE "Asset"        ADD CONSTRAINT "asset_qty_pos"           CHECK ("quantity" >= 1);
ALTER TABLE "Acquisition"  ADD CONSTRAINT "acq_value_nn"            CHECK ("value" IS NULL OR "value" >= 0);
ALTER TABLE "Acquisition"  ADD CONSTRAINT "acq_warranty_order"      CHECK ("warrantyEnd" IS NULL OR "warrantyStart" IS NULL OR "warrantyEnd" >= "warrantyStart");
ALTER TABLE "Maintenance"  ADD CONSTRAINT "maint_cost_nn"           CHECK ("cost" IS NULL OR "cost" >= 0);
ALTER TABLE "DamageReport" ADD CONSTRAINT "damage_cost_nn"          CHECK ("estimatedCost" IS NULL OR "estimatedCost" >= 0);
-- A repair can only be marked verified when its test passed.
ALTER TABLE "Maintenance"  ADD CONSTRAINT "maint_verified_needs_pass"
  CHECK ("status" NOT IN ('VERIFIED') OR ("testPassed" IS TRUE AND "verifiedById" IS NOT NULL AND "verifiedAt" IS NOT NULL));

-- 4) Useful extra indexes
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
