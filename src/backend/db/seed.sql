-- Demo data. Additive and idempotent: every statement upserts on a stable id.
--
-- This is **not** a reset. Review pointed out that `ON CONFLICT DO UPDATE`
-- never removes a row, so a record deleted from this file, or written by hand
-- during a demo, survives every re-run. Use `reset.sql` first when you need the
-- database to contain exactly what this file describes.
--
-- The five projects mirror `src/backend/core/projects/mock-store.ts` exactly, so
-- swapping `mockProjectStore` for a database-backed store does not change a
-- single response. Three Atlanta pilots are investor-visible (criterion S3), one
-- Atlanta site is deliberately unpublished, and one project sits in another
-- region so that the visibility and region filters have something to exclude.
--
-- The principal ids are PR #12's `demo-principals.ts` constants, so `/me/sites`
-- and the write paths resolve against rows that exist. They are load-bearing:
-- change one here and the other PR's demo silently returns nothing.
--
-- The addresses and people are invented. Nothing here is real customer data.
--
-- The assertions at the end are the point: running this file verifies the
-- charter's demo criteria rather than merely loading rows.

BEGIN;

-- ---------------------------------------------------------------------------
-- People
--
-- Ava, Jordan and Priya carry PR #12's demo ids. The other three site owners
-- exist so that owner-scoped reads have rows they must *not* return.
-- ---------------------------------------------------------------------------

INSERT INTO users (id, name, email, role) VALUES
  ('7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40', 'Ava Mitchell',    'ava.mitchell@example.org',    'site_owner'),
  ('11111111-1111-4111-8111-000000001002', 'Marcus Webb',     'marcus.webb@example.org',     'site_owner'),
  ('11111111-1111-4111-8111-000000001004', 'Ray Thompson',    'ray.thompson@example.org',    'site_owner'),
  ('11111111-1111-4111-8111-000000001005', 'Lena Brooks',     'lena.brooks@example.org',     'site_owner'),
  ('2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71', 'Jordan Ellis',    'jordan.ellis@example.org',    'operator'),
  ('91e3b7c4-2d65-4a08-bf19-7c5e0a6d3b82', 'Priya Raman',     'priya.raman@example.org',     'investor')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- Sites
--
-- Ava owns three of the six, so `/me/sites` has something to return and three
-- other owners' sites to leave out.
--
-- Site c06 is a draft with no address, type or ownership status. It is the case
-- that `NOT NULL` on those columns made unrepresentable, and it exists here so
-- that "save and come back later" is exercised by the demo data rather than
-- only by a constraint probe.
-- ---------------------------------------------------------------------------

INSERT INTO sites (id, owner_user_id, address_raw, latitude, longitude, locality, region,
                   site_type, ownership_status, submission_status, consent_given_at) VALUES
  ('8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01', '7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40',
   '148 Auburn Ave NE, Atlanta, GA 30303', 33.755400, -84.376600, 'Sweet Auburn, Atlanta', 'GA',
   'rooftop', 'confirmed', 'accepted', now()),
  ('8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c02', '11111111-1111-4111-8111-000000001002',
   '1075 Ralph David Abernathy Blvd SW, Atlanta, GA 30310', 33.735100, -84.422900, 'West End, Atlanta', 'GA',
   'land', 'confirmed', 'accepted', now()),
  ('8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c03', '7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40',
   '1000 McDaniel St SW, Atlanta, GA 30310', 33.731800, -84.400400, 'Mechanicsville, Atlanta', 'GA',
   'rooftop', 'confirmed', 'accepted', now()),
  ('8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c04', '11111111-1111-4111-8111-000000001004',
   '1701 Donald Lee Hollowell Pkwy NW, Atlanta, GA 30318', 33.771200, -84.464300, 'Grove Park, Atlanta', 'GA',
   'rooftop', 'confirmed', 'accepted', now()),
  ('8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c05', '11111111-1111-4111-8111-000000001005',
   '200 Riverfront Pkwy, Chattanooga, TN 37402', 35.055800, -85.311300, 'Riverfront, Chattanooga', 'TN',
   'land', 'confirmed', 'accepted', now()),
  ('8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c06', '7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40',
   NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, 'draft', NULL),
  -- Submitted but not yet accepted, so the operator queue is not empty and the
  -- `screening` value is exercised by real data.
  ('8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c07', '11111111-1111-4111-8111-000000001002',
   '675 Metropolitan Pkwy SW, Atlanta, GA 30310', 33.717900, -84.408800, 'Capitol View, Atlanta', 'GA',
   'rooftop', 'pending', 'screening', now())
ON CONFLICT (id) DO UPDATE
  SET address_raw = EXCLUDED.address_raw, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
      locality = EXCLUDED.locality, region = EXCLUDED.region, site_type = EXCLUDED.site_type,
      ownership_status = EXCLUDED.ownership_status, submission_status = EXCLUDED.submission_status,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Assessments
--
-- `ON CONFLICT DO NOTHING`, not `DO UPDATE`: the append-only trigger added in
-- migration 0001 rejects the UPDATE that an upsert would perform. That is the
-- trigger doing its job. Re-running this file leaves the original assessments
-- in place; `reset.sql` is what clears them.
-- ---------------------------------------------------------------------------

INSERT INTO assessments (id, site_id, ruleset_version, inputs_used, preliminary_project_type, viability_status,
                         estimated_system_size_kw_low, estimated_system_size_kw_high,
                         estimated_annual_generation_kwh_low, estimated_annual_generation_kwh_high) VALUES
  ('a55e5500-0000-4000-8000-000000000001', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01', 'v1', '{"source":"seed"}',
   'community_rooftop', 'potentially_viable',            180,  240,  243000,  324000),
  ('a55e5500-0000-4000-8000-000000000002', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c02', 'v1', '{"source":"seed"}',
   'solar_canopy',     'potentially_viable',            320,  410,  432000,  553500),
  ('a55e5500-0000-4000-8000-000000000003', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c03', 'v1', '{"source":"seed"}',
   'community_rooftop', 'more_information_required',      95,  130,  128250,  175500),
  ('a55e5500-0000-4000-8000-000000000004', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c04', 'v1', '{"source":"seed"}',
   'community_rooftop', 'potentially_viable',            500,  640,  675000,  864000),
  ('a55e5500-0000-4000-8000-000000000005', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c05', 'v1', '{"source":"seed"}',
   'ground_mount',     'potentially_viable',            700,  900,  945000, 1215000)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

INSERT INTO projects (id, site_id, name, assigned_operator_user_id, stage, estimated_capacity_kw, visible_to_investors) VALUES
  ('3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7101', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01',
   'Sweet Auburn rooftop array',    '2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71', 'pre_development', 210.0,  true),
  ('3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7102', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c02',
   'West End community canopy',     '2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71', 'development',     365.0,  true),
  ('3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7103', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c03',
   'Mechanicsville school roof',    '2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71', 'construction',    112.5,  true),
  -- Not published. The seed asserts below that it stays invisible.
  ('3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7104', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c04',
   'Grove Park warehouse roof',     '2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71', 'pre_development', 570.0,  false),
  ('3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7105', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c05',
   'Chattanooga riverfront field',  '2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71', 'operations',      800.0,  true)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, stage = EXCLUDED.stage,
      estimated_capacity_kw = EXCLUDED.estimated_capacity_kw,
      visible_to_investors = EXCLUDED.visible_to_investors,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Funding needs
--
-- The counts match `openFundingNeedsCount` in the mock store: 2, 1, 0, 3, 1.
-- They are rows rather than a stored number, so the count stays true as needs
-- are funded.
-- ---------------------------------------------------------------------------

INSERT INTO funding_needs (id, project_id, need_type, stage, description, amount_requested, status) VALUES
  ('fdfdfdfd-0000-4000-8000-000000000101', '3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7101',
   'feasibility_study',       'pre_development', 'Structural and shading feasibility study',  45000, 'open'),
  ('fdfdfdfd-0000-4000-8000-000000000102', '3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7101',
   'interconnection_study',   'pre_development', 'Utility interconnection application',       28000, 'open'),
  ('fdfdfdfd-0000-4000-8000-000000000201', '3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7102',
   'engineering_assessment',  'development',     'Canopy structural engineering package',    120000, 'open'),
  ('fdfdfdfd-0000-4000-8000-000000000401', '3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7104',
   'site_visit',              'pre_development', 'Roof condition site visit',                 12000, 'open'),
  ('fdfdfdfd-0000-4000-8000-000000000402', '3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7104',
   'environmental_review',    'pre_development', 'Phase I environmental review',              34000, 'open'),
  ('fdfdfdfd-0000-4000-8000-000000000403', '3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7104',
   'engineering_assessment',  'development',     'Preliminary engineering package',           95000, 'open'),
  ('fdfdfdfd-0000-4000-8000-000000000501', '3f1b9c64-0f0e-4a1b-9c3e-6b0d5a2e7105',
   'permanent_financing',     'permanent',       'Permanent capital for operating asset',    850000, 'open')
ON CONFLICT (id) DO UPDATE
  SET need_type = EXCLUDED.need_type, stage = EXCLUDED.stage, description = EXCLUDED.description,
      amount_requested = EXCLUDED.amount_requested, status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- Investor
--
-- Onboarded, so the portfolio guard in section 7.7 lets this viewer through.
-- The stage focus includes `permanent`, which is exactly the value that cannot
-- be expressed if funding stages and project stages are treated as one list.
-- ---------------------------------------------------------------------------

INSERT INTO investors (id, user_id, organization_name, investor_type, capital_type,
                       funding_stage_focus, ticket_size_min, ticket_size_max, geographies,
                       onboarding_completed_at) VALUES
  ('4d7a2c91-8e56-43bf-9a10-5c6d2f7b8e34', '91e3b7c4-2d65-4a08-bf19-7c5e0a6d3b82',
   'Southeast Community Solar Fund', 'impact_investor', 'concessionary_debt',
   '["pre_development","development","permanent"]', 25000, 1000000, '["GA","TN"]', now())
ON CONFLICT (id) DO UPDATE
  SET organization_name = EXCLUDED.organization_name, investor_type = EXCLUDED.investor_type,
      capital_type = EXCLUDED.capital_type, funding_stage_focus = EXCLUDED.funding_stage_focus,
      ticket_size_min = EXCLUDED.ticket_size_min, ticket_size_max = EXCLUDED.ticket_size_max,
      geographies = EXCLUDED.geographies, onboarding_completed_at = EXCLUDED.onboarding_completed_at;

-- ---------------------------------------------------------------------------
-- Documents
--
-- Two rows on the same site, and the difference between them is the whole point
-- of `disclosure_class`.
--
-- The electricity bill is inserted **without naming the column**, so it takes
-- the `owner_private` default. That is deliberate: the column exists because an
-- upload path that forgets to classify a document must produce something an
-- investor cannot see. The assertions below check that it did.
-- ---------------------------------------------------------------------------

-- `blob_path` is stored fully qualified as `{container}/{blob name}`, matching
-- formatBlobPath() in src/backend/core/documents/storage.ts. The container is
-- the one for the row's disclosure class, so a seeded row locates its own blob
-- the same way an uploaded one does. The owner id leading the blob name is the
-- site's `owner_user_id`, which is what groups every document belonging to one
-- owner under a single prefix.

INSERT INTO documents (id, site_id, blob_path, original_filename, content_type, size_bytes,
                       doc_type, uploaded_by_user_id) VALUES
  ('d0c00000-0000-4000-8000-000000000001', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01',
   'owner-private/owners/7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40/sites/8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01/electricity_bill/d0c00000-0000-4000-8000-000000000001/electricity-bill.pdf',
   'electricity-bill.pdf', 'application/pdf', 184320,
   'electricity_bill', '7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40')
ON CONFLICT (id) DO UPDATE
  SET blob_path = EXCLUDED.blob_path, original_filename = EXCLUDED.original_filename;

INSERT INTO documents (id, site_id, blob_path, original_filename, content_type, size_bytes,
                       doc_type, disclosure_class, uploaded_by_user_id) VALUES
  ('d0c00000-0000-4000-8000-000000000002', '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01',
   'investor-tier-1/owners/7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40/sites/8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c01/site_summary/d0c00000-0000-4000-8000-000000000002/site-summary.pdf',
   'site-summary.pdf', 'application/pdf', 96256,
   'site_summary', 'investor_tier_1', '2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71')
ON CONFLICT (id) DO UPDATE
  SET blob_path = EXCLUDED.blob_path, original_filename = EXCLUDED.original_filename,
      disclosure_class = EXCLUDED.disclosure_class;

-- ---------------------------------------------------------------------------
-- Assertions — the demo criteria, checked rather than assumed
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  visible_atlanta int;
  grove_park_visible bool;
  need_counts text;
  owned_by_ava int;
  draft_is_incomplete bool;
  bill_class text;
  project_before_accept int;
BEGIN
  SELECT count(*) INTO visible_atlanta
    FROM projects p JOIN sites s ON s.id = p.site_id
   WHERE p.visible_to_investors AND s.locality LIKE '%Atlanta%';
  IF visible_atlanta < 3 THEN
    RAISE EXCEPTION 'S3 unmet: % investor-visible Atlanta projects, need at least 3', visible_atlanta;
  END IF;
  RAISE NOTICE 'S3 ok: % investor-visible Atlanta pilot projects', visible_atlanta;

  SELECT visible_to_investors INTO grove_park_visible
    FROM projects WHERE name = 'Grove Park warehouse roof';
  IF grove_park_visible THEN
    RAISE EXCEPTION 'Unpublished project leaked: Grove Park is investor-visible';
  END IF;
  RAISE NOTICE 'Visibility ok: the unpublished Grove Park project stays hidden';

  -- `/me/sites` has to have rows to return, and rows to leave out.
  SELECT count(*) INTO owned_by_ava
    FROM sites WHERE owner_user_id = '7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40';
  IF owned_by_ava < 2 THEN
    RAISE EXCEPTION 'Demo site owner holds % sites; /me/sites needs more than one', owned_by_ava;
  END IF;
  IF owned_by_ava = (SELECT count(*) FROM sites) THEN
    RAISE EXCEPTION 'Demo site owner holds every site; owner scoping has nothing to exclude';
  END IF;
  RAISE NOTICE 'Ownership ok: demo owner holds % of % sites', owned_by_ava, (SELECT count(*) FROM sites);

  -- A draft really is allowed to be incomplete.
  SELECT address_raw IS NULL AND site_type IS NULL AND ownership_status IS NULL
    INTO draft_is_incomplete
    FROM sites WHERE id = '8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4c06';
  IF NOT draft_is_incomplete THEN
    RAISE EXCEPTION 'The draft site is complete; the save-and-return case is untested';
  END IF;
  RAISE NOTICE 'Draft ok: an unfinished site saves without an address, type or ownership status';

  -- An unclassified document must not be investor-visible.
  SELECT disclosure_class INTO bill_class
    FROM documents WHERE id = 'd0c00000-0000-4000-8000-000000000001';
  IF bill_class <> 'owner_private' THEN
    RAISE EXCEPTION 'Fail-closed broken: an unclassified document defaulted to %', bill_class;
  END IF;
  RAISE NOTICE 'Disclosure ok: an unclassified document defaults to owner_private';

  -- A project implies its site was accepted first.
  SELECT count(*) INTO project_before_accept
    FROM projects p JOIN sites s ON s.id = p.site_id
   WHERE s.submission_status <> 'accepted';
  IF project_before_accept > 0 THEN
    RAISE EXCEPTION 'Lifecycle broken: % project(s) sit on a site that was never accepted', project_before_accept;
  END IF;
  RAISE NOTICE 'Lifecycle ok: every project sits on an accepted site';

  SELECT string_agg(c::text, ',' ORDER BY n) INTO need_counts FROM (
    SELECT p.name AS n, count(f.id) FILTER (WHERE f.status = 'open') AS c
      FROM projects p LEFT JOIN funding_needs f ON f.project_id = p.id
     GROUP BY p.name
  ) x;
  RAISE NOTICE 'Open funding needs per project (alphabetical): %', need_counts;
END $$;

COMMIT;
