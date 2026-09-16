-- Append-only enforcement for the audit tables.
--
-- `assessments` and `activity` are documented as append-only: section 5.2 says
-- a re-run of screening writes a new assessment rather than editing the old
-- one, and an activity trail that can be rewritten is not a trail. Review
-- pointed out that nothing enforced either claim -- UPDATE and DELETE were
-- still permitted, so the guarantee lived only in a comment.
--
-- Written by hand because Drizzle's schema builder has no trigger construct.
-- It is a separate migration from 0000 for the same reason: `drizzle-kit
-- generate` rewrites 0000 from `schema.ts`, and anything hand-added there would
-- be lost the next time the schema changes.
--
-- Row-level triggers do not fire for TRUNCATE, which is deliberate: `reset.sql`
-- has to be able to clear these tables to rebuild the demo dataset. Blocking
-- day-to-day UPDATE and DELETE is the guarantee; making the tables
-- indestructible is not, and would leave no way to reseed.

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Insert a new row instead. Use TRUNCATE to rebuild from seed.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER assessments_append_only
BEFORE UPDATE OR DELETE ON assessments
FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER activity_append_only
BEFORE UPDATE OR DELETE ON activity
FOR EACH ROW EXECUTE FUNCTION reject_mutation();
