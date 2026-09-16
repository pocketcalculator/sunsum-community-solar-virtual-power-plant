-- Empties every table so `seed.sql` can rebuild the demo from nothing.
--
-- The seed upserts, which makes it additive rather than a reset: a row deleted
-- from the seed file, or typed in by hand during a demo, survives every re-run.
-- Review called that out, and this file is the missing half. Run it first when
-- you need the database to contain exactly what the seed describes.
--
-- TRUNCATE rather than DELETE, for two reasons. It is not fooled by foreign
-- keys once CASCADE is given, and the append-only triggers on `assessments` and
-- `activity` are row-level, so they fire for DELETE but not for TRUNCATE.
-- Blocking edits to the audit trail is the guarantee those triggers make;
-- making the tables impossible to rebuild is not.
--
-- This destroys data. It is a development and demo tool, and `db:reset` refuses
-- to run against anything that does not look local.

TRUNCATE TABLE
  acknowledgements,
  activity,
  assessments,
  diligence_requests,
  documents,
  funding_needs,
  investor_engagements,
  investors,
  projects,
  sites,
  users
RESTART IDENTITY CASCADE;
