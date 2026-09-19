// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildExport,
  csvField,
  exportFilename,
  isExportFormat,
  toCsv,
  DOCUMENT_CSV_COLUMNS,
  PROJECT_CSV_COLUMNS,
  type ExportBundle,
} from "@/backend/core/export";
import type { InvestorProfile, Viewer } from "@/backend/core/identity";
import { createMemoryBackendStore } from "@/backend/core/store";
import { handleGetExport, parseExportFormat } from "@/backend/handlers/export";

/** The seeded demo identities, which `seedDemoProjects` builds the fixtures around. */
const OWNER_USER_ID = "7a1f4e58-6b2c-4d91-8e30-1c5a7b9d2f40";
const OPERATOR_USER_ID = "2c8d6f10-9a34-4b57-a1e2-6f0c3d8b5a71";
const INVESTOR_USER_ID = "91e3b7c4-2d65-4a08-bf19-7c5e0a6d3b82";

const onboardedInvestor: InvestorProfile = {
  id: "4d7a2c91-8e56-43bf-9a10-5c6d2f7b8e34",
  organizationName: "Southeast Community Solar Fund",
  fundingStageFocus: [],
  geographies: [],
  onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
};

const owner: Viewer = { role: "site_owner", userId: OWNER_USER_ID };
const operator: Viewer = { role: "operator", userId: OPERATOR_USER_ID };
const investor: Viewer = {
  role: "investor",
  userId: INVESTOR_USER_ID,
  investor: onboardedInvestor,
};

const FIXED_NOW = new Date("2026-09-18T20:30:00.000Z");

function seeded() {
  return createMemoryBackendStore({ seedDemoProjects: true });
}

async function bundleFor(viewer: Viewer): Promise<ExportBundle> {
  const result = await buildExport(viewer, seeded(), FIXED_NOW);
  if (!result.ok) throw new Error(`expected an export, got ${result.failure.code}`);
  return result.value;
}

describe("the export bundle", () => {
  it("stamps the caller and the clock rather than inventing them", async () => {
    const bundle = await bundleFor(owner);

    expect(bundle.generated_at).toBe("2026-09-18T20:30:00.000Z");
    expect(bundle.role).toBe("site_owner");
    expect(bundle.user_id).toBe(OWNER_USER_ID);
  });

  it("gives a site owner their own sites", async () => {
    const bundle = await bundleFor(owner);

    expect(bundle.projects.length).toBeGreaterThan(0);
    expect(bundle.project_count).toBe(bundle.projects.length);
    for (const row of bundle.projects) {
      expect(row.site_id).not.toBeNull();
    }
  });

  /**
   * The property that matters most. `getOwnerSites` filters by owner, and the
   * export must not have re-queried around it.
   */
  it("gives a different owner nothing that belongs to the first", async () => {
    const stranger: Viewer = {
      role: "site_owner",
      userId: "00000000-0000-4000-8000-000000000000",
    };

    const mine = await bundleFor(owner);
    const theirs = await bundleFor(stranger);

    expect(mine.projects.length).toBeGreaterThan(0);
    expect(theirs.projects).toHaveLength(0);
    expect(theirs.documents).toHaveLength(0);
  });

  it("gives an investor the published portfolio, without site addresses", async () => {
    const bundle = await bundleFor(investor);

    expect(bundle.role).toBe("investor");
    expect(bundle.projects.length).toBeGreaterThan(0);
    for (const row of bundle.projects) {
      expect(row.project_id).not.toBeNull();
      /* A portfolio item carries a locality, never the street address. */
      expect(row.address).toBeNull();
      expect(row.site_id).toBeNull();
    }
  });

  it("refuses an investor who has not finished onboarding", async () => {
    const pending: Viewer = {
      role: "investor",
      userId: INVESTOR_USER_ID,
      investor: { ...onboardedInvestor, onboardingCompletedAt: null },
    };

    const result = await buildExport(pending, seeded(), FIXED_NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("forbidden_tier");
  });

  /**
   * The tier gate, proved in both directions. Asserting only the locked case
   * would pass just as well against an export that never read a deal room.
   *
   * Uses a second investor rather than the seeded one. The fixture now ships an
   * engagement so the demo has an open deal room, which means the seeded
   * investor starts unlocked and cannot show the "before". Running both
   * directions on an investor who owns no seeded rows also proves the gate is
   * per-investor rather than a global flag — a stronger claim than the original
   * had, and the one that actually matters when two investors share a project.
   */
  it("withholds deal-room documents until an engagement unlocks them", async () => {
    const store = seeded();
    const stranger: Viewer = {
      role: "investor",
      userId: "91e3b7c4-2d65-4a08-bf19-7c5e0a6d3b99",
      investor: { ...onboardedInvestor, id: "4d7a2c91-8e56-43bf-9a10-5c6d2f7b8e99" },
    };

    const locked = await buildExport(stranger, store, FIXED_NOW);
    if (!locked.ok) throw new Error(locked.failure.code);
    expect(locked.value.projects.length).toBeGreaterThan(0);
    expect(locked.value.documents).toHaveLength(0);

    for (const row of locked.value.projects) {
      if (row.project_id === null) continue;
      await store.addEngagement({
        id: `engagement-${row.project_id}`,
        investorId: stranger.investor.id,
        investorUserId: stranger.userId,
        projectId: row.project_id,
        fundingNeedId: null,
        state: "interested",
        stateChangedAt: FIXED_NOW.toISOString(),
        committedAmount: null,
        commitmentInstrument: null,
        isBinding: false,
        declineReason: null,
        createdAt: FIXED_NOW.toISOString(),
      });
    }

    const unlocked = await buildExport(stranger, store, FIXED_NOW);
    if (!unlocked.ok) throw new Error(unlocked.failure.code);
    expect(unlocked.value.documents.length).toBeGreaterThan(0);
  });

  /**
   * The fixture's own engagement, asserted rather than assumed. The seeded
   * investor must open a deal room without doing anything first, because that
   * is what the demo shows.
   */
  it("gives the seeded investor a deal room straight away", async () => {
    const bundle = await bundleFor(investor);

    expect(bundle.documents.length).toBeGreaterThan(0);
  });

  /**
   * An investor has no endpoint that serves document bytes —
   * `resolveSiteDocument` admits only the owner and the operator — so the
   * manifest must not offer a link that would answer 403.
   */
  it("offers an investor no download link it cannot honour", async () => {
    const store = seeded();
    const first = await buildExport(investor, store, FIXED_NOW);
    if (!first.ok) throw new Error(first.failure.code);

    for (const row of first.value.projects) {
      if (row.project_id === null) continue;
      await store.addEngagement({
        id: `engagement-${row.project_id}`,
        investorId: onboardedInvestor.id,
        investorUserId: INVESTOR_USER_ID,
        projectId: row.project_id,
        fundingNeedId: null,
        state: "interested",
        stateChangedAt: FIXED_NOW.toISOString(),
        committedAmount: null,
        commitmentInstrument: null,
        isBinding: false,
        declineReason: null,
        createdAt: FIXED_NOW.toISOString(),
      });
    }

    const bundle = await buildExport(investor, store, FIXED_NOW);
    if (!bundle.ok) throw new Error(bundle.failure.code);

    expect(bundle.value.documents.length).toBeGreaterThan(0);
    for (const document of bundle.value.documents) {
      expect(document.content_url).toBeNull();
    }
  });

  it("gives an operator the pipeline", async () => {
    const bundle = await bundleFor(operator);

    expect(bundle.role).toBe("operator");
    expect(bundle.projects.length).toBeGreaterThan(0);
    for (const row of bundle.projects) {
      expect(row.journey_stage_id).not.toBeNull();
    }
  });

  it("counts documents after de-duplication, not before", async () => {
    const bundle = await bundleFor(owner);
    const ids = bundle.documents.map((document) => document.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(bundle.document_count).toBe(bundle.documents.length);
  });

  /**
   * Documents are a manifest. If this ever starts carrying bytes, the export
   * becomes unavailable whenever object storage is, which is the failure mode
   * the manifest exists to avoid.
   */
  it("links to document content rather than embedding it", async () => {
    const bundle = await bundleFor(owner);

    for (const document of bundle.documents) {
      expect(document).not.toHaveProperty("content");
      if (document.site_id !== null) {
        expect(document.content_url).toBe(
          `/api/sites/${document.site_id}/documents/${document.id}/content`,
        );
      }
    }
  });
});

describe("CSV rendering", () => {
  it("quotes every field, so a comma in an address cannot add a column", () => {
    expect(csvField("148 Auburn Ave NE, Atlanta, GA")).toBe(
      '"148 Auburn Ave NE, Atlanta, GA"',
    );
  });

  it("doubles embedded quotes", () => {
    expect(csvField('the "big" roof')).toBe('"the ""big"" roof"');
  });

  it("writes an empty field for null rather than the word null", () => {
    expect(csvField(null)).toBe('""');
    expect(csvField(undefined)).toBe('""');
  });

  it("keeps a newline inside its quoted field", () => {
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("emits both tables with their headers", async () => {
    const csv = toCsv(await bundleFor(owner));

    expect(csv).toContain("# projects");
    expect(csv).toContain("# documents");
    expect(csv).toContain(PROJECT_CSV_COLUMNS.map(csvField).join(","));
    expect(csv).toContain(DOCUMENT_CSV_COLUMNS.map(csvField).join(","));
  });

  it("uses RFC 4180 line endings", async () => {
    const csv = toCsv(await bundleFor(owner));

    expect(csv.endsWith("\r\n")).toBe(true);
    /* No bare LF outside the \r\n pairs. */
    expect(csv.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("carries one CSV row per project", async () => {
    const bundle = await bundleFor(owner);
    const csv = toCsv(bundle);
    const header = PROJECT_CSV_COLUMNS.map(csvField).join(",");
    const lines = csv.split("\r\n");
    const start = lines.indexOf(header);
    const rows = lines.slice(start + 1, start + 1 + bundle.projects.length);

    expect(start).toBeGreaterThan(-1);
    expect(rows).toHaveLength(bundle.projects.length);
    for (const row of rows) {
      expect(row.startsWith('"')).toBe(true);
    }
  });
});

describe("the download filename", () => {
  it("is dated and role-scoped", async () => {
    const bundle = await bundleFor(owner);

    expect(exportFilename(bundle, "json")).toBe(
      "sunsum-export-site-owner-2026-09-18.json",
    );
    expect(exportFilename(bundle, "csv")).toBe(
      "sunsum-export-site-owner-2026-09-18.csv",
    );
  });

  it("carries no underscore that would need escaping downstream", async () => {
    const bundle = await bundleFor(owner);

    expect(exportFilename(bundle, "json")).not.toContain("_");
  });
});

describe("the requested format", () => {
  it("defaults to JSON when none is asked for", () => {
    const result = parseExportFormat("https://example.test/api/export");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("json");
  });

  it("accepts csv, case-insensitively", () => {
    const result = parseExportFormat("https://example.test/api/export?format=CSV");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("csv");
  });

  /**
   * Refused rather than defaulted: a caller that asked for a spreadsheet format
   * we cannot produce should hear so, not receive JSON named `.xlsx`.
   */
  it("refuses a format it cannot produce", () => {
    const result = parseExportFormat("https://example.test/api/export?format=xlsx");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("invalid_query");
      expect(result.failure.details?.field).toBe("format");
    }
  });

  it("recognises exactly the two formats it advertises", () => {
    expect(isExportFormat("json")).toBe(true);
    expect(isExportFormat("csv")).toBe(true);
    expect(isExportFormat("xml")).toBe(false);
  });
});

describe("the export response", () => {
  it("arrives as a JSON attachment by default", async () => {
    const response = await handleGetExport(owner, "json", seeded(), FIXED_NOW);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''sunsum-export-site-owner-2026-09-18.json",
    );
    expect(JSON.parse(await response.text()).role).toBe("site_owner");
  });

  it("arrives as a CSV attachment when asked", async () => {
    const response = await handleGetExport(owner, "csv", seeded(), FIXED_NOW);

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain(
      "sunsum-export-site-owner-2026-09-18.csv",
    );
    expect(await response.text()).toContain("# projects");
  });

  /**
   * The same headers the document download sets. An export is scoped to one
   * caller, so a shared cache must not be able to hand it to another.
   */
  it("is never cached and never sniffed", async () => {
    const response = await handleGetExport(owner, "json", seeded(), FIXED_NOW);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("maps a refusal onto its status rather than returning an empty file", async () => {
    const pending: Viewer = {
      role: "investor",
      userId: INVESTOR_USER_ID,
      investor: { ...onboardedInvestor, onboardingCompletedAt: null },
    };

    const response = await handleGetExport(pending, "json", seeded(), FIXED_NOW);

    expect(response.status).toBe(403);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(JSON.parse(await response.text()).code).toBe("forbidden_tier");
  });
});
