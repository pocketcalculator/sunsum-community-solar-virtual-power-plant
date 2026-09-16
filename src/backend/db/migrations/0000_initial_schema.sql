CREATE TABLE "acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"agreement_key" text NOT NULL,
	"typed_name" text NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	CONSTRAINT "acknowledgements_unique" UNIQUE("project_id","user_id","agreement_key")
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"project_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_single_parent_check" CHECK (("activity"."site_id" IS NOT NULL)::int + ("activity"."project_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"ruleset_version" text NOT NULL,
	"inputs_used" jsonb NOT NULL,
	"estimated_system_size_kw_low" numeric(12, 2),
	"estimated_system_size_kw_high" numeric(12, 2),
	"estimated_annual_generation_kwh_low" numeric(14, 2),
	"estimated_annual_generation_kwh_high" numeric(14, 2),
	"preliminary_project_type" text,
	"viability_status" text NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_information" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"overridden_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_viability_status_check" CHECK ("assessments"."viability_status" IN ('potentially_viable', 'more_information_required', 'not_currently_eligible')),
	CONSTRAINT "assessments_override_reason_check" CHECK ("assessments"."is_override" = false OR ("assessments"."override_reason" IS NOT NULL AND "assessments"."overridden_by_user_id" IS NOT NULL)),
	CONSTRAINT "assessments_size_range_check" CHECK (("assessments"."estimated_system_size_kw_low" IS NULL OR "assessments"."estimated_system_size_kw_low" >= 0) AND ("assessments"."estimated_system_size_kw_high" IS NULL OR "assessments"."estimated_system_size_kw_high" >= 0) AND ("assessments"."estimated_system_size_kw_low" IS NULL OR "assessments"."estimated_system_size_kw_high" IS NULL OR "assessments"."estimated_system_size_kw_low" <= "assessments"."estimated_system_size_kw_high")),
	CONSTRAINT "assessments_generation_range_check" CHECK (("assessments"."estimated_annual_generation_kwh_low" IS NULL OR "assessments"."estimated_annual_generation_kwh_low" >= 0) AND ("assessments"."estimated_annual_generation_kwh_high" IS NULL OR "assessments"."estimated_annual_generation_kwh_high" >= 0) AND ("assessments"."estimated_annual_generation_kwh_low" IS NULL OR "assessments"."estimated_annual_generation_kwh_high" IS NULL OR "assessments"."estimated_annual_generation_kwh_low" <= "assessments"."estimated_annual_generation_kwh_high")),
	CONSTRAINT "assessments_flags_is_array" CHECK (jsonb_typeof("assessments"."flags") = 'array'),
	CONSTRAINT "assessments_missing_information_is_array" CHECK (jsonb_typeof("assessments"."missing_information") = 'array')
);
--> statement-breakpoint
CREATE TABLE "diligence_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"raised_by_user_id" uuid NOT NULL,
	"assigned_to_role" text NOT NULL,
	"item_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"due_date" timestamp with time zone,
	"resolved_document_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diligence_requests_assigned_to_role_check" CHECK ("diligence_requests"."assigned_to_role" IN ('operator', 'site_owner')),
	CONSTRAINT "diligence_requests_item_type_check" CHECK ("diligence_requests"."item_type" IN ('document', 'financial', 'technical', 'narrative', 'site_access')),
	CONSTRAINT "diligence_requests_status_check" CHECK ("diligence_requests"."status" IN ('open', 'in_progress', 'submitted', 'accepted', 'rejected', 'waived'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"project_id" uuid,
	"blob_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" numeric(20, 0) NOT NULL,
	"doc_type" text NOT NULL,
	"disclosure_class" text DEFAULT 'owner_private' NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_disclosure_class_check" CHECK ("documents"."disclosure_class" IN ('owner_private', 'investor_tier_1')),
	CONSTRAINT "documents_single_parent_check" CHECK (("documents"."site_id" IS NOT NULL)::int + ("documents"."project_id" IS NOT NULL)::int = 1),
	CONSTRAINT "documents_size_check" CHECK ("documents"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "funding_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"need_type" text NOT NULL,
	"stage" text NOT NULL,
	"description" text NOT NULL,
	"amount_requested" numeric(14, 2),
	"amount_committed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"deliverable_doc_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_needs_id_project_key" UNIQUE("id","project_id"),
	CONSTRAINT "funding_needs_need_type_check" CHECK ("funding_needs"."need_type" IN ('feasibility_study', 'engineering_assessment', 'site_visit', 'interconnection_study', 'environmental_review', 'reporting', 'construction', 'permanent_financing')),
	CONSTRAINT "funding_needs_stage_check" CHECK ("funding_needs"."stage" IN ('pre_development', 'development', 'construction', 'permanent')),
	CONSTRAINT "funding_needs_status_check" CHECK ("funding_needs"."status" IN ('open', 'partially_funded', 'funded', 'delivered', 'cancelled')),
	CONSTRAINT "funding_needs_amount_requested_check" CHECK ("funding_needs"."amount_requested" IS NULL OR "funding_needs"."amount_requested" > 0),
	CONSTRAINT "funding_needs_amount_committed_check" CHECK ("funding_needs"."amount_committed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "investor_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"funding_need_id" uuid,
	"state" text DEFAULT 'interested' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_amount" numeric(14, 2),
	"commitment_instrument" text,
	"is_binding" boolean DEFAULT false NOT NULL,
	"commitment_terms" jsonb,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_engagements_id_project_key" UNIQUE("id","project_id"),
	CONSTRAINT "investor_engagements_state_check" CHECK ("investor_engagements"."state" IN ('interested', 'committed', 'underwriting', 'approved', 'funded', 'declined', 'withdrawn')),
	CONSTRAINT "investor_engagements_committed_amount_check" CHECK ("investor_engagements"."committed_amount" IS NULL OR "investor_engagements"."committed_amount" >= 0),
	CONSTRAINT "investor_engagements_decline_reason_check" CHECK ("investor_engagements"."state" <> 'declined' OR "investor_engagements"."decline_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_name" text NOT NULL,
	"investor_type" text NOT NULL,
	"capital_type" text NOT NULL,
	"funding_stage_focus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ticket_size_min" numeric(14, 2),
	"ticket_size_max" numeric(14, 2),
	"geographies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"investment_objectives" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"impact_priorities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deal_room_profile" text,
	"visible_portfolio_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investors_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "investors_investor_type_check" CHECK ("investors"."investor_type" IN ('philanthropy', 'impact_investor', 'nmtc', 'cdfi_cde', 'energy_equity_fund', 'corporate', 'special_community_endowment')),
	CONSTRAINT "investors_capital_type_check" CHECK ("investors"."capital_type" IN ('grant', 'recoverable_grant', 'concessionary_debt', 'senior_debt', 'tax_equity', 'sponsor_equity', 'corporate_offtake')),
	CONSTRAINT "investors_ticket_size_check" CHECK (("investors"."ticket_size_min" IS NULL OR "investors"."ticket_size_min" >= 0) AND ("investors"."ticket_size_max" IS NULL OR "investors"."ticket_size_max" >= 0) AND ("investors"."ticket_size_min" IS NULL OR "investors"."ticket_size_max" IS NULL OR "investors"."ticket_size_min" <= "investors"."ticket_size_max")),
	CONSTRAINT "investors_funding_stage_focus_is_array" CHECK (jsonb_typeof("investors"."funding_stage_focus") = 'array'),
	CONSTRAINT "investors_funding_stage_focus_values_check" CHECK ("investors"."funding_stage_focus" <@ '["pre_development","development","construction","permanent"]'::jsonb),
	CONSTRAINT "investors_geographies_is_array" CHECK (jsonb_typeof("investors"."geographies") = 'array')
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"assigned_operator_user_id" uuid,
	"stage" text DEFAULT 'pre_development' NOT NULL,
	"estimated_capacity_kw" numeric(12, 2),
	"next_action" text,
	"target_date" timestamp with time zone,
	"visible_to_investors" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_site_id_unique" UNIQUE("site_id"),
	CONSTRAINT "projects_stage_check" CHECK ("projects"."stage" IN ('pre_development', 'development', 'construction', 'commissioning', 'operations'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"address_raw" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"geocode_confidence" numeric(4, 3),
	"locality" text,
	"region" text,
	"site_type" text,
	"ownership_status" text,
	"approximate_area_sqm" numeric(12, 2),
	"electricity_usage_kwh_annual" numeric(14, 2),
	"electricity_bill_doc_id" uuid,
	"has_existing_solar" boolean,
	"consent_given_at" timestamp with time zone,
	"submission_status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_site_type_check" CHECK ("sites"."site_type" IS NULL OR "sites"."site_type" IN ('rooftop', 'land')),
	CONSTRAINT "sites_ownership_status_check" CHECK ("sites"."ownership_status" IS NULL OR "sites"."ownership_status" IN ('confirmed', 'pending', 'unverified')),
	CONSTRAINT "sites_submission_status_check" CHECK ("sites"."submission_status" IN ('draft', 'submitted', 'screening', 'info_requested', 'accepted', 'rejected')),
	CONSTRAINT "sites_complete_once_submitted_check" CHECK ("sites"."submission_status" = 'draft' OR ("sites"."address_raw" IS NOT NULL AND "sites"."site_type" IS NOT NULL AND "sites"."ownership_status" IS NOT NULL)),
	CONSTRAINT "sites_latitude_range_check" CHECK ("sites"."latitude" IS NULL OR ("sites"."latitude" BETWEEN -90 AND 90)),
	CONSTRAINT "sites_longitude_range_check" CHECK ("sites"."longitude" IS NULL OR ("sites"."longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('site_owner', 'operator', 'investor'))
);
--> statement-breakpoint
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_overridden_by_user_id_users_id_fk" FOREIGN KEY ("overridden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_requests" ADD CONSTRAINT "diligence_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_requests" ADD CONSTRAINT "diligence_requests_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_requests" ADD CONSTRAINT "diligence_requests_resolved_document_id_documents_id_fk" FOREIGN KEY ("resolved_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_requests" ADD CONSTRAINT "diligence_requests_engagement_fk" FOREIGN KEY ("engagement_id","project_id") REFERENCES "public"."investor_engagements"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_needs" ADD CONSTRAINT "funding_needs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_needs" ADD CONSTRAINT "funding_needs_deliverable_doc_id_documents_id_fk" FOREIGN KEY ("deliverable_doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_engagements" ADD CONSTRAINT "investor_engagements_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_engagements" ADD CONSTRAINT "investor_engagements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_engagements" ADD CONSTRAINT "investor_engagements_funding_need_fk" FOREIGN KEY ("project_id","funding_need_id") REFERENCES "public"."funding_needs"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_assigned_operator_user_id_users_id_fk" FOREIGN KEY ("assigned_operator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_electricity_bill_doc_id_documents_id_fk" FOREIGN KEY ("electricity_bill_doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_site_created_idx" ON "activity" USING btree ("site_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_project_created_idx" ON "activity" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "assessments_site_created_idx" ON "assessments" USING btree ("site_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "diligence_requests_engagement_idx" ON "diligence_requests" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "diligence_requests_status_idx" ON "diligence_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_site_idx" ON "documents" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "funding_needs_project_idx" ON "funding_needs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "funding_needs_status_stage_idx" ON "funding_needs" USING btree ("status","stage");--> statement-breakpoint
CREATE INDEX "investor_engagements_investor_idx" ON "investor_engagements" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_engagements_project_idx" ON "investor_engagements" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investor_engagements_live_unique" ON "investor_engagements" USING btree ("investor_id","project_id",coalesce("funding_need_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "investor_engagements"."state" IN ('interested', 'committed', 'underwriting', 'approved', 'funded');--> statement-breakpoint
CREATE INDEX "projects_stage_idx" ON "projects" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "projects_visible_stage_idx" ON "projects" USING btree ("visible_to_investors","stage");--> statement-breakpoint
CREATE INDEX "sites_owner_idx" ON "sites" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "sites_submission_status_idx" ON "sites" USING btree ("submission_status");--> statement-breakpoint
CREATE INDEX "sites_region_idx" ON "sites" USING btree ("region");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));