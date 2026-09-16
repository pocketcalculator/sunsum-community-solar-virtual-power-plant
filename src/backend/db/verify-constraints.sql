-- Adversarial checks against a real server. Each case asserts that the database
-- REJECTS something the application must never be able to store, or ACCEPTS
-- something it must always be able to store. A constraint that exists but never
-- fires protects nothing.
--
-- This file fails loudly. The first version printed `FAIL` as ordinary query
-- output and psql still exited 0, which meant a broken constraint looked
-- exactly like a healthy one and the README's claim that the schema had been
-- verified rested on somebody reading the log carefully. Every result is now
-- recorded in a table and the final block raises, so the exit status carries
-- the answer.
--
-- **It leaves nothing behind.** The whole file runs in one transaction that
-- always ends in `ROLLBACK` — the probes insert deliberately malformed rows and
-- a valid graph to hang them off, and none of it survives. That is what makes
-- it safe to run repeatedly against the seeded development database rather than
-- only against a scratch one, and it is why the scaffolding below can be
-- created unconditionally.
--
-- If a probe fails, the raise aborts the transaction, which rolls it back too;
-- the failing labels are printed before the raise.

\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE probe_results (
  id serial PRIMARY KEY,
  ok boolean NOT NULL,
  label text NOT NULL,
  detail text
);

-- Assert the database rejects `stmt`. Runs in a subtransaction so that a
-- rejection does not poison the session.
CREATE FUNCTION expect_reject(stmt text, label text) RETURNS text AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    INSERT INTO probe_results (ok, label, detail) VALUES (false, label, 'accepted, should have been rejected');
    RETURN 'FAIL  <- accepted, should have been rejected: ' || label;
  EXCEPTION WHEN others THEN
    INSERT INTO probe_results (ok, label) VALUES (true, label);
    RETURN 'pass  rejected: ' || label;
  END;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION expect_accept(stmt text, label text) RETURNS text AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    INSERT INTO probe_results (ok, label) VALUES (true, label);
    RETURN 'pass  accepted: ' || label;
  EXCEPTION WHEN others THEN
    INSERT INTO probe_results (ok, label, detail) VALUES (false, label, SQLERRM);
    RETURN 'FAIL  <- rejected, should have been accepted: ' || label || ' :: ' || SQLERRM;
  END;
END $$ LANGUAGE plpgsql;

-- Assert a boolean the probes cannot express as a statement.
CREATE FUNCTION expect_true(condition boolean, label text) RETURNS text AS $$
BEGIN
  IF condition IS TRUE THEN
    INSERT INTO probe_results (ok, label) VALUES (true, label);
    RETURN 'pass  ' || label;
  END IF;
  INSERT INTO probe_results (ok, label, detail) VALUES (false, label, 'condition was ' || coalesce(condition::text, 'null'));
  RETURN 'FAIL  <- ' || label;
END $$ LANGUAGE plpgsql;

-- Minimal valid graph to hang the negative cases off.
INSERT INTO users (id, name, email, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'owner@example.org', 'site_owner'),
  ('00000000-0000-0000-0000-0000000000a2', 'Investor User', 'inv@example.org', 'investor');
INSERT INTO sites (id, owner_user_id, address_raw, site_type, ownership_status, submission_status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '1 Test St', 'rooftop', 'confirmed', 'accepted'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', '2 Test St', 'land', 'confirmed', 'accepted');
INSERT INTO projects (id, site_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Test Project'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'Other Project');
INSERT INTO investors (id, user_id, organization_name, investor_type, capital_type) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2', 'Test Fund', 'impact_investor', 'grant');

\echo ''
\echo '--- enum CHECK constraints ---'
SELECT expect_reject(
  $q$INSERT INTO users (name, email, role) VALUES ('X','x1@example.org','admin')$q$,
  'users.role = admin (not in ROLES)');
SELECT expect_reject(
  $q$UPDATE projects SET stage = 'permanent' WHERE name = 'Test Project'$q$,
  'projects.stage = permanent (a FUNDING stage, not a project stage)');
SELECT expect_accept(
  $q$INSERT INTO funding_needs (project_id, need_type, stage, description, amount_requested)
     VALUES ('00000000-0000-0000-0000-0000000000c1','feasibility_study','permanent','d',1000)$q$,
  'funding_needs.stage = permanent (IS a funding stage)');
SELECT expect_accept(
  $q$UPDATE sites SET submission_status = 'screening' WHERE id = '00000000-0000-0000-0000-0000000000b2'$q$,
  'sites.submission_status = screening (the value the rest of the codebase uses)');
SELECT expect_reject(
  $q$UPDATE sites SET submission_status = 'in_review' WHERE id = '00000000-0000-0000-0000-0000000000b2'$q$,
  'sites.submission_status = in_review (the value this schema used to have, and nothing else does)');

\echo ''
\echo '--- sites: a draft may be incomplete, a submission may not ---'
SELECT expect_accept(
  $q$INSERT INTO sites (id, owner_user_id, submission_status)
     VALUES ('00000000-0000-0000-0000-0000000000b9','00000000-0000-0000-0000-0000000000a1','draft')$q$,
  'draft site with no address, type or ownership status (save and come back later)');
SELECT expect_reject(
  $q$UPDATE sites SET submission_status = 'submitted' WHERE id = '00000000-0000-0000-0000-0000000000b9'$q$,
  'submitting that same incomplete draft');
SELECT expect_accept(
  $q$UPDATE sites SET address_raw = '9 Test St', site_type = 'rooftop', ownership_status = 'confirmed',
                     submission_status = 'submitted'
     WHERE id = '00000000-0000-0000-0000-0000000000b9'$q$,
  'submitting it once it is complete');

\echo ''
\echo '--- case-insensitive email uniqueness ---'
SELECT expect_reject(
  $q$INSERT INTO users (name, email, role) VALUES ('Dup','OWNER@Example.ORG','operator')$q$,
  'users.email differing only in case');

\echo ''
\echo '--- documents: exactly one parent, and fail-closed disclosure ---'
SELECT expect_reject(
  $q$INSERT INTO documents (blob_path, original_filename, content_type, size_bytes, doc_type, uploaded_by_user_id)
     VALUES ('p','f','application/pdf',1,'bill','00000000-0000-0000-0000-0000000000a1')$q$,
  'document with NEITHER site nor project (an unreachable orphan)');
SELECT expect_reject(
  $q$INSERT INTO documents (site_id, project_id, blob_path, original_filename, content_type, size_bytes, doc_type, uploaded_by_user_id)
     VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','p','f','application/pdf',1,'bill','00000000-0000-0000-0000-0000000000a1')$q$,
  'document with BOTH a site and a project');
SELECT expect_accept(
  $q$INSERT INTO documents (id, site_id, blob_path, original_filename, content_type, size_bytes, doc_type, uploaded_by_user_id)
     VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','p','f','application/pdf',1,'bill','00000000-0000-0000-0000-0000000000a1')$q$,
  'document with exactly one parent');
SELECT expect_true(
  (SELECT disclosure_class = 'owner_private' FROM documents WHERE id = '00000000-0000-0000-0000-0000000000e1'),
  'a document uploaded without a disclosure_class defaults to owner_private, not investor-visible');
SELECT expect_reject(
  $q$UPDATE documents SET disclosure_class = 'public' WHERE id = '00000000-0000-0000-0000-0000000000e1'$q$,
  'documents.disclosure_class = public (not an enumerated class)');

\echo ''
\echo '--- assessments: an override must carry a reason and an author ---'
SELECT expect_reject(
  $q$INSERT INTO assessments (site_id, ruleset_version, inputs_used, viability_status, is_override)
     VALUES ('00000000-0000-0000-0000-0000000000b1','v1','{}','potentially_viable',true)$q$,
  'is_override = true with no reason and no author');
SELECT expect_reject(
  $q$INSERT INTO assessments (site_id, ruleset_version, inputs_used, viability_status,
                              estimated_system_size_kw_low, estimated_system_size_kw_high)
     VALUES ('00000000-0000-0000-0000-0000000000b1','v1','{}','potentially_viable',-100,-1)$q$,
  'a system of negative kilowatts (ordering alone would have let -100 <= -1 through)');

\echo ''
\echo '--- assessments and activity are append-only, not merely described as such ---'
SELECT expect_accept(
  $q$INSERT INTO assessments (id, site_id, ruleset_version, inputs_used, viability_status)
     VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','v1','{}','potentially_viable')$q$,
  'writing an assessment');
SELECT expect_reject(
  $q$UPDATE assessments SET viability_status = 'not_currently_eligible' WHERE id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'EDITING an assessment after the fact');
SELECT expect_reject(
  $q$DELETE FROM assessments WHERE id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'DELETING an assessment');
SELECT expect_accept(
  $q$INSERT INTO activity (id, project_id, actor_user_id, action)
     VALUES ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','stage_changed')$q$,
  'writing an activity entry');
SELECT expect_reject(
  $q$UPDATE activity SET action = 'something_else' WHERE id = '00000000-0000-0000-0000-0000000000f2'$q$,
  'REWRITING the audit trail');
SELECT expect_reject(
  $q$DELETE FROM activity WHERE id = '00000000-0000-0000-0000-0000000000f2'$q$,
  'ERASING an audit entry');

\echo ''
\echo '--- investor_engagements: one LIVE engagement, and re-engagement after a decline ---'
SELECT expect_accept(
  $q$INSERT INTO investor_engagements (id, investor_id, project_id, funding_need_id)
     VALUES ('00000000-0000-0000-0000-00000000ee01','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1', NULL)$q$,
  'first whole-project engagement (funding_need_id NULL)');
SELECT expect_reject(
  $q$INSERT INTO investor_engagements (investor_id, project_id, funding_need_id)
     VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1', NULL)$q$,
  'DUPLICATE live whole-project engagement -- default PostgreSQL NULL handling would allow this');
SELECT expect_reject(
  $q$UPDATE investor_engagements SET state = 'declined' WHERE id = '00000000-0000-0000-0000-00000000ee01'$q$,
  'state = declined with no decline_reason');
SELECT expect_accept(
  $q$UPDATE investor_engagements SET state = 'declined', decline_reason = 'out of mandate'
     WHERE id = '00000000-0000-0000-0000-00000000ee01'$q$,
  'declining with a reason');
SELECT expect_accept(
  $q$INSERT INTO investor_engagements (investor_id, project_id, funding_need_id)
     VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1', NULL)$q$,
  'RE-engaging after a decline -- an unconditional unique constraint forbade this');
SELECT expect_reject(
  $q$INSERT INTO investor_engagements (investor_id, project_id, funding_need_id, state, committed_amount)
     VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000f0','interested',1)$q$,
  'engagement whose funding need does not exist');
SELECT expect_reject(
  $q$INSERT INTO investor_engagements (investor_id, project_id, funding_need_id)
     SELECT '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c2', id
       FROM funding_needs WHERE project_id = '00000000-0000-0000-0000-0000000000c1' LIMIT 1$q$,
  'engagement on project C2 pointing at a funding need that belongs to project C1');
SELECT expect_reject(
  $q$UPDATE investor_engagements SET committed_amount = -1 WHERE state <> 'declined'$q$,
  'a negative commitment');

\echo ''
\echo '--- numeric and jsonb sanity ---'
SELECT expect_accept(
  $q$INSERT INTO funding_needs (project_id, need_type, stage, description)
     VALUES ('00000000-0000-0000-0000-0000000000c1','feasibility_study','pre_development','raised before it is priced')$q$,
  'funding need with no amount yet (the accept workflow creates exactly this)');
SELECT expect_reject(
  $q$INSERT INTO funding_needs (project_id, need_type, stage, description, amount_requested)
     VALUES ('00000000-0000-0000-0000-0000000000c1','site_visit','development','d',-5)$q$,
  'negative amount_requested');
SELECT expect_reject(
  $q$UPDATE sites SET latitude = 91 WHERE address_raw = '1 Test St'$q$,
  'latitude out of range');
SELECT expect_reject(
  $q$UPDATE investors SET ticket_size_min = 900, ticket_size_max = 100 WHERE organization_name = 'Test Fund'$q$,
  'ticket_size_min greater than ticket_size_max');
SELECT expect_reject(
  $q$UPDATE investors SET ticket_size_min = -1 WHERE organization_name = 'Test Fund'$q$,
  'a negative ticket size');
SELECT expect_reject(
  $q$UPDATE investors SET geographies = '{"not":"an array"}' WHERE organization_name = 'Test Fund'$q$,
  'geographies set to a jsonb object instead of an array');
SELECT expect_reject(
  $q$UPDATE investors SET funding_stage_focus = '["not_a_stage"]' WHERE organization_name = 'Test Fund'$q$,
  'a mandate for a funding stage that does not exist (nothing could ever match it)');
SELECT expect_accept(
  $q$UPDATE investors SET funding_stage_focus = '["development","permanent"]' WHERE organization_name = 'Test Fund'$q$,
  'a mandate for real funding stages, including permanent');

\echo ''
\echo '--- defaults that must hold even when the caller forgets ---'
SELECT expect_true(
  (SELECT visible_to_investors = false FROM projects WHERE name = 'Test Project'),
  'projects.visible_to_investors defaults to false, so an unpublished project is invisible');
SELECT expect_true(
  (SELECT bool_and(is_binding = false) FROM investor_engagements),
  'investor_engagements.is_binding defaults to false, so a commitment is non-binding unless stated');

\echo ''
\echo '--- money must not be floating point ---'
SELECT expect_true(
  (SELECT data_type = 'numeric' FROM information_schema.columns
    WHERE table_name = 'funding_needs' AND column_name = 'amount_requested'),
  'funding_needs.amount_requested is numeric, not a float');

\echo ''
\echo '--- timestamps must be timezone-aware ---'
SELECT expect_true(
  (SELECT count(*) = 0 FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'),
  'every timestamp column is timestamptz');

\echo ''
\echo '--- result ---'
SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
FROM probe_results;

SELECT label, detail FROM probe_results WHERE NOT ok ORDER BY id;

-- The point of the rewrite. Anything less and psql exits 0 on a broken schema.
DO $$
DECLARE
  failures int;
  summary text;
BEGIN
  SELECT count(*), string_agg(label, E'\n  - ' ORDER BY id)
    INTO failures, summary
    FROM probe_results WHERE NOT ok;
  IF failures > 0 THEN
    RAISE EXCEPTION E'% constraint probe(s) failed:\n  - %', failures, summary;
  END IF;
  RAISE NOTICE 'All % constraint probes passed.', (SELECT count(*) FROM probe_results);
END $$;

-- Undo everything: the scaffolding, the valid graph, and every row the probes
-- managed to insert. A verifier that dirties the database it verifies can only
-- be run once.
ROLLBACK;
