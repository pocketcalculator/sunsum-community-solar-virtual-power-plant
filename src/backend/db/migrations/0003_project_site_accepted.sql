-- Every project sits on an accepted site.
--
-- `seed.sql` asserts this, and the accept workflow establishes it atomically --
-- `core/projects/workflows.ts` sets the site to `accepted` and inserts the
-- project inside one transaction, and a site that has already been decided
-- cannot be decided again. Review pointed out that none of that is a database
-- guarantee: the invariant lived in the workflow, so anything that wrote a
-- project by another route could pair a visible project with a screening or
-- rejected site, and `GET /portfolio` filters only on `visible_to_investors`.
--
-- The obvious-looking fix -- adding `sites.submission_status = 'accepted'` to
-- the portfolio join -- was rejected. It would make a broken row invisible
-- rather than impossible, which is the harder bug to find, and it would make
-- the PostgreSQL store return fewer projects than the in-memory store, whose
-- `listProjects` has no such filter. The two must stay indistinguishable.
--
-- A CHECK cannot read another table, so this is a trigger, following
-- `0001_append_only_guards.sql`, and hand-written for the same reason: it is
-- separate from 0000 because `drizzle-kit generate` rewrites 0000 from
-- `schema.ts`.
--
-- The invariant has two sides and both are guarded. Blocking only the first
-- would leave it merely difficult to violate rather than impossible:
--
--   1. a project may not point at a site that is not accepted
--   2. a site carrying a project may not leave `accepted`
--
-- DELETE needs no guard. `projects.site_id` is `ON DELETE restrict`, so the
-- database refuses to remove a site while a project references it at all --
-- a project cannot be stranded because its site cannot go.
--
-- The first trigger fires AFTER INSERT and is not deferrable, which makes the
-- workflow's ordering load-bearing: `acceptSubmission` updates the site before
-- inserting the project, and a future change that reverses those two lines will
-- fail loudly here rather than pass quietly. That is the intended reading.

CREATE OR REPLACE FUNCTION assert_project_site_accepted() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  site_status text;
BEGIN
  SELECT submission_status INTO site_status FROM sites WHERE id = NEW.site_id;

  IF site_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION
      'project % references site % with submission_status %, not accepted',
      NEW.id, NEW.site_id, COALESCE(site_status, 'NULL')
      USING ERRCODE = 'restrict_violation',
            HINT = 'Accept the submission first. A project exists only for an accepted site.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER projects_site_accepted
AFTER INSERT OR UPDATE OF site_id ON projects
FOR EACH ROW EXECUTE FUNCTION assert_project_site_accepted();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_site_keeps_project_accepted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submission_status = 'accepted'
     AND NEW.submission_status IS DISTINCT FROM 'accepted'
     AND EXISTS (SELECT 1 FROM projects WHERE site_id = NEW.id)
  THEN
    RAISE EXCEPTION
      'site % carries a project and cannot move from accepted to %',
      NEW.id, NEW.submission_status
      USING ERRCODE = 'restrict_violation',
            HINT = 'A project exists only for an accepted site. Remove the project first.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sites_keep_project_accepted
BEFORE UPDATE OF submission_status ON sites
FOR EACH ROW EXECUTE FUNCTION assert_site_keeps_project_accepted();
