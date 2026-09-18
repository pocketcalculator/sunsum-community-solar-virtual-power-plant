-- An investor profile carries its own `updated_at`.
--
-- The table was created with `created_at` alone, so the PostgreSQL store had
-- nowhere to read `updated_at` from and answered it with `created_at`. That
-- went unnoticed while `POST /investors/me` replied with the object it had
-- just built in memory. Once the handler started re-reading the stored row --
-- to stop two concurrent first-time posts from returning an id that never
-- landed -- the substitution surfaced: editing a profile reported the original
-- creation time, and the two stores stopped being indistinguishable.
--
-- `DEFAULT now()` backfills existing rows with the migration time rather than
-- their true last write, which is unknowable. That is deliberate: it is a
-- timestamp no later than the read, and it stops being an approximation the
-- first time the row is written again.

ALTER TABLE "investors" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;