-- Adversarial checks against a real server. Each case asserts that the database
-- REJECTS something the application must never be able to store. A constraint
-- that exists but never fires protects nothing.

CREATE FUNCTION expect_reject(stmt text, label text) RETURNS text AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    RETURN 'FAIL  <- accepted, should have been rejected: ' || label;
  EXCEPTION WHEN others THEN
    RETURN 'pass  rejected: ' || label;
  END;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION expect_accept(stmt text, label text) RETURNS text AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    RETURN 'pass  accepted: ' || label;
  EXCEPTION WHEN others THEN
    RETURN 'FAIL  <- rejected, should have been accepted: ' || label || ' :: ' || SQLERRM;
  END;
END $$ LANGUAGE plpgsql;

-- Minimal valid graph to hang the negative cases off.
INSERT INTO users (id, name, email, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'owner@example.org', 'site_owner'),
  ('00000000-0000-0000-0000-0000000000a2', 'Investor User', 'inv@example.org', 'investor');
INSERT INTO sites (id, owner_user_id, address_raw, site_type, ownership_status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '1 Test St', 'rooftop', 'confirmed');
INSERT INTO projects (id, site_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Test Project');
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

\echo ''
\echo '--- case-insensitive email uniqueness ---'
SELECT expect_reject(
  $q$INSERT INTO users (name, email, role) VALUES ('Dup','OWNER@Example.ORG','operator')$q$,
  'users.email differing only in case');

\echo ''
\echo '--- documents: exactly one parent ---'
SELECT expect_reject(
  $q$INSERT INTO documents (blob_path, original_filename, content_type, size_bytes, doc_type, uploaded_by_user_id)
     VALUES ('p','f','application/pdf',1,'bill','00000000-0000-0000-0000-0000000000a1')$q$,
  'document with NEITHER site nor project (an unreachable orphan)');
SELECT expect_reject(
  $q$INSERT INTO documents (site_id, project_id, blob_path, original_filename, content_type, size_bytes, doc_type, uploaded_by_user_id)
     VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','p','f','application/pdf',1,'bill','00000000-0000-0000-0000-0000000000a1')$q$,
  'document with BOTH a site and a project');
SELECT expect_accept(
  $q$INSERT INTO documents (site_id, blob_path, original_filename, content_type, size_bytes, doc_type, uploaded_by_user_id)
     VALUES ('00000000-0000-0000-0000-0000000000b1','p','f','application/pdf',1,'bill','00000000-0000-0000-0000-0000000000a1')$q$,
  'document with exactly one parent');

\echo ''
\echo '--- assessments: an override must carry a reason and an author ---'
SELECT expect_reject(
  $q$INSERT INTO assessments (site_id, ruleset_version, inputs_used, viability_status, is_override)
     VALUES ('00000000-0000-0000-0000-0000000000b1','v1','{}','potentially_viable',true)$q$,
  'is_override = true with no reason and no author');

\echo ''
\echo '--- investor_engagements: NULLS NOT DISTINCT (the ADR case) ---'
SELECT expect_accept(
  $q$INSERT INTO investor_engagements (investor_id, project_id, funding_need_id)
     VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1', NULL)$q$,
  'first whole-project engagement (funding_need_id NULL)');
SELECT expect_reject(
  $q$INSERT INTO investor_engagements (investor_id, project_id, funding_need_id)
     VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1', NULL)$q$,
  'DUPLICATE whole-project engagement -- default PostgreSQL NULL handling would allow this');
SELECT expect_reject(
  $q$UPDATE investor_engagements SET state = 'declined' WHERE decline_reason IS NULL$q$,
  'state = declined with no decline_reason');

\echo ''
\echo '--- numeric sanity ---'
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
  $q$UPDATE investors SET geographies = '{"not":"an array"}' WHERE organization_name = 'Test Fund'$q$,
  'geographies set to a jsonb object instead of an array');

\echo ''
\echo '--- defaults that must hold even when the caller forgets ---'
SELECT CASE WHEN visible_to_investors = false
            THEN 'pass  projects.visible_to_investors defaults to false'
            ELSE 'FAIL  <- project defaulted to VISIBLE' END
FROM projects WHERE name = 'Test Project';
SELECT CASE WHEN is_binding = false
            THEN 'pass  investor_engagements.is_binding defaults to false'
            ELSE 'FAIL  <- commitment defaulted to BINDING' END
FROM investor_engagements LIMIT 1;

\echo ''
\echo '--- money must not be floating point ---'
SELECT CASE WHEN data_type = 'numeric'
            THEN 'pass  funding_needs.amount_requested is ' || data_type
            ELSE 'FAIL  <- money stored as ' || data_type END
FROM information_schema.columns
WHERE table_name = 'funding_needs' AND column_name = 'amount_requested';

\echo ''
\echo '--- timestamps must be timezone-aware ---'
SELECT CASE WHEN count(*) = 0
            THEN 'pass  every timestamp column is timestamptz'
            ELSE 'FAIL  <- ' || count(*) || ' naive timestamp column(s): ' || string_agg(table_name || '.' || column_name, ', ') END
FROM information_schema.columns
WHERE table_schema = 'public' AND data_type = 'timestamp without time zone';
