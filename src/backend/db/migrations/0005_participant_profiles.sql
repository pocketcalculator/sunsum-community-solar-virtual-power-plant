-- A completed `/join` form, captured before any account exists.
--
-- Until now the sign-up form assembled a profile and discarded it: nothing in
-- the service accepted it, so every person who filled it in was lost. This is
-- the table that keeps them.
--
-- It is not `users`, and it is not a partial `users` row. Nobody is
-- authenticated when this is written, so every value is self-reported and
-- unverified. Putting an unverified email into the table the authorization
-- path reads is the failure this separation is here to prevent -- nothing in
-- this table grants access to anything.
--
-- Two constraints look wrong next to `users` and are deliberate:
--
-- The email index is NOT unique. Deduplicating on an unverified address would
-- let it decide which row is overwritten, so anyone could displace a
-- stranger's submission by typing their address. Repeat submissions are
-- separate rows for an operator to reconcile, which is recoverable; a silent
-- overwrite is not.
--
-- There is no password column, at any strength. The form validates a password
-- in component state and never transmits it, and the request parser rejects
-- unknown keys, so no credential has a path into this table. The chosen
-- sign-in method is recorded as an intention only.
--
-- `role_id` is nullable because null is a real answer, not a missing one: the
-- "still learning" user types map to no workspace, and recording that is
-- better than inventing one. It is derived from `user_type_id` by the service
-- rather than accepted from the caller, so a request cannot claim a workspace
-- its user type does not map to.
--
-- `user_type_id` is free text rather than a CHECK, following
-- `documents.doc_type`. That taxonomy belongs to the sign-up form and grows
-- whenever the charter names a new audience; pinning thirty values here would
-- turn every copy change into a migration, and an unrecognised value is better
-- stored than lost. The parser validates it against the shared domain list.

CREATE TABLE "participant_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"account_method" text NOT NULL,
	"representation" text NOT NULL,
	"organisation_name" text,
	"user_type_id" text NOT NULL,
	"role_id" text,
	"intent_option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consent_accepted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_profiles_account_method_check" CHECK ("participant_profiles"."account_method" IN ('microsoft', 'google', 'apple', 'email')),
	CONSTRAINT "participant_profiles_representation_check" CHECK ("participant_profiles"."representation" IN ('individual', 'organisation')),
	CONSTRAINT "participant_profiles_role_id_check" CHECK ("participant_profiles"."role_id" IS NULL OR "participant_profiles"."role_id" IN ('site-owner', 'operator', 'financier')),
	CONSTRAINT "participant_profiles_organisation_name_check" CHECK (("participant_profiles"."representation" = 'organisation' AND "participant_profiles"."organisation_name" IS NOT NULL AND btrim("participant_profiles"."organisation_name") <> '') OR ("participant_profiles"."representation" = 'individual' AND "participant_profiles"."organisation_name" IS NULL)),
	CONSTRAINT "participant_profiles_names_present_check" CHECK (btrim("participant_profiles"."full_name") <> '' AND btrim("participant_profiles"."email") <> ''),
	CONSTRAINT "participant_profiles_consent_check" CHECK ("participant_profiles"."consent_accepted"),
	CONSTRAINT "participant_profiles_intent_option_ids_is_array" CHECK (jsonb_typeof("participant_profiles"."intent_option_ids") = 'array')
);
--> statement-breakpoint
CREATE INDEX "participant_profiles_email_idx" ON "participant_profiles" USING btree (lower("email"));