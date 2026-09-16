import { unlocksTierOne } from "../engagements";
import type { Viewer } from "../identity";
import { toProjectPayload } from "../projects";
import { failure, ok, type Result } from "../shared";
import { toAssessmentPayload, toSitePayload } from "../sites";
import { demoBackendStore, type BackendStore } from "../store";

const SHARED_DEAL_ROOM_ACTIONS = new Set([
  "submission_accepted",
  "project_stage_changed",
  "project_visibility_changed",
]);

export async function getOwnerSites(
  viewer: Viewer,
  store: BackendStore = demoBackendStore,
): Promise<Result<readonly Record<string, unknown>[]>> {
  if (viewer.role !== "site_owner") {
    return failure(
      "forbidden_role",
      "Only a site owner can read the owner dashboard.",
    );
  }

  const sites = (await store.listSites()).filter(
    (site) => site.ownerUserId === viewer.userId,
  );
  return ok(
    await Promise.all(
      sites.map(async (site) => {
        const assessments = await store.listAssessments(site.id);
        const assessment = assessments.at(-1);
        const project = await store.getProjectBySite(site.id);
        const activities = await store.listSiteActivity(site.id);
        const documents = await store.listDocuments(site.id, project?.id ?? null);
        const acknowledgements =
          project === null ? [] : await store.listAcknowledgements(project.id);
        const contact =
          project?.assignedOperatorUserId == null
            ? null
            : await store.getUser(project.assignedOperatorUserId);

        return {
          site: toSitePayload(site),
          ...(assessment === undefined
            ? {}
            : { assessment: toAssessmentPayload(assessment) }),
          ...(project === null ? {} : { project: toProjectPayload(project) }),
          stage: project?.stage ?? site.submissionStatus,
          next_action: project?.nextAction ?? null,
          documents: documents.map((document) => ({
            id: document.id,
            site_id: document.siteId,
            project_id: document.projectId,
            original_filename: document.originalFilename,
            content_type: document.contentType,
            size_bytes: document.sizeBytes,
            doc_type: document.docType,
            uploaded_by_user_id: document.uploadedByUserId,
            created_at: document.createdAt,
          })),
          acknowledgements: acknowledgements.map((acknowledgement) => ({
            id: acknowledgement.id,
            project_id: acknowledgement.projectId,
            user_id: acknowledgement.userId,
            agreement_key: acknowledgement.agreementKey,
            typed_name: acknowledgement.typedName,
            acknowledged_at: acknowledgement.acknowledgedAt,
          })),
          outstanding: activities
            .filter((item) => item.action === "submission_info_requested")
            .map((item) => ({
              id: item.id,
              source: "request_info",
              site_id: item.siteId,
              project_id: item.projectId,
              message: item.note ?? "",
              created_at: item.createdAt,
            })),
          ...(contact === null
            ? {}
            : {
                contact: {
                  id: contact.id,
                  name: contact.name,
                  email: contact.email,
                  role: contact.role,
                  created_at: contact.createdAt,
                },
              }),
        };
      }),
    ),
  );
}

export async function getDealRoom(
  viewer: Viewer,
  projectId: string,
  store: BackendStore = demoBackendStore,
): Promise<Result<Record<string, unknown>>> {
  if (viewer.role !== "investor") {
    return failure("forbidden_role", "Only an investor can read a deal room.");
  }
  if (viewer.investor.onboardingCompletedAt === null) {
    return failure(
      "forbidden_tier",
      "Complete investor onboarding to read a deal room.",
    );
  }

  const project = await store.getProject(projectId);
  if (project === null || !project.visibleToInvestors) {
    return failure("not_found", "Project not found.");
  }

  const engagements = (await store.listEngagements(projectId)).filter(
    (item) => item.investorUserId === viewer.userId,
  );
  const currentEngagement = engagements.at(-1);
  if (
    currentEngagement === undefined ||
    !unlocksTierOne(currentEngagement.state)
  ) {
    return failure(
      "forbidden_tier",
      "An active engagement is required for this deal room.",
    );
  }

  const site = await store.getSite(project.siteId);
  if (site === null) return failure("not_found", "Project not found.");
  const assessments = await store.listAssessments(site.id);
  const investorAssessments = assessments.map(toInvestorAssessmentPayload);
  const activity = await store.listActivity(project.id);
  const documents = (await store.listDocuments(site.id, project.id)).filter(
    (document) => document.disclosureClass === "investor_tier_1",
  );

  return ok({
    project: toProjectPayload(project),
    site: {
      id: site.id,
      locality: project.locality.trim() || "Location withheld",
      site_type: site.siteType,
      ownership_status: site.ownershipStatus,
      approximate_area_sqm: site.approximateAreaSqm,
      electricity_usage_kwh_annual: site.electricityUsageKwhAnnual,
      has_existing_solar: site.hasExistingSolar,
    },
    assessment: investorAssessments.at(-1) ?? null,
    assessment_history: investorAssessments,
    timeline: activity
      .filter(
        (item) =>
          SHARED_DEAL_ROOM_ACTIONS.has(item.action) ||
          (item.action === "investor_interest_expressed" &&
            item.actorUserId === viewer.userId),
      )
      .map((item) => ({
        id: item.id,
        action: item.action,
        from_value: item.fromValue,
        to_value: item.toValue,
        created_at: item.createdAt,
      })),
    documents: documents.map((document) => ({
      id: document.id,
      original_filename: document.originalFilename,
      content_type: document.contentType,
      size_bytes: document.sizeBytes,
      doc_type: document.docType,
      created_at: document.createdAt,
    })),
  });
}

function toInvestorAssessmentPayload(
  assessment: Parameters<typeof toAssessmentPayload>[0],
): Record<string, unknown> {
  const payload = toAssessmentPayload(assessment);
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) =>
        ![
          "inputs_used",
          "override_reason",
          "overridden_by_user_id",
        ].includes(key),
    ),
  );
}
