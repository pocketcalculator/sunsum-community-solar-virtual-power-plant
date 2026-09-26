// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONNECTION_REGISTRY, WS2_CONTRACT_REVISION } from "@/domain/connections";
import { CONNECTION_REGISTRY as liveRegistry, LIVE_READ_LIMITS } from "@/features/live-read";

describe("neutral canonical connection metadata", () => {
  it("exposes exactly the ten stable canonical families without runtime success claims", () => {
    expect(CONNECTION_REGISTRY.map((entry) => entry.id)).toEqual([
      "SUNSUM-CONNECTION:WS2-IDENTITY",
      "SUNSUM-CONNECTION:WS2-OWNER",
      "SUNSUM-CONNECTION:WS2-OPERATOR",
      "SUNSUM-CONNECTION:WS2-INVESTOR",
      "SUNSUM-CONNECTION:WS2-DOCUMENTS-EXPORT",
      "SUNSUM-CONNECTION:WS4-ASSESSMENT-READ",
      "SUNSUM-CONNECTION:WS2-TO-WS4-SCREENING",
      "SUNSUM-CONNECTION:MAPS-LOCATION",
      "SUNSUM-CONNECTION:AI-IMAGE-EVIDENCE",
      "SUNSUM-CONNECTION:FINANCE-GIS-EXTERNAL-DATA",
    ]);
    expect(liveRegistry).toBe(CONNECTION_REGISTRY);
    expect(WS2_CONTRACT_REVISION).toBe("73695a052a6324434b36bebbdd0c834b455471b7");
    expect(Object.isFrozen(CONNECTION_REGISTRY)).toBe(true);
    for (const entry of CONNECTION_REGISTRY) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.acceptedOperations)).toBe(true);
      for (const key of ["label", "owner", "auth", "disclosure", "freshness", "pagination", "statusReason", "demoCounterpart", "nextHandoff"] as const) {
        expect(entry[key].length).toBeGreaterThan(0);
      }
      expect(entry).not.toHaveProperty("connected");
    }
  });

  it("does not admit requested WS4, screening, map, AI or finance/GIS seams", () => {
    for (const entry of CONNECTION_REGISTRY.slice(5)) {
      expect(entry.status).toBe("OUT_OF_REACH_RIGHT_NOW");
      expect(entry.acceptedOperations).toEqual([]);
      expect(entry.statusReason).toContain("This release has no admitted network read");
      expect(entry.statusReason).toContain("Existing services are out of reach right now from this release");
      expect(entry.statusReason).not.toMatch(/not.*implemented|unimplemented|not built/i);
    }
    for (const entry of CONNECTION_REGISTRY.slice(0, 5)) {
      expect(entry.status).toBe("READ_ADMISSION_REQUIRED");
      expect(entry.acceptedOperations.every((operation) => operation.startsWith("GET /api/"))).toBe(true);
    }
    const operations = CONNECTION_REGISTRY.flatMap((entry) => entry.acceptedOperations);
    expect(operations).not.toContain("GET /api/projects/{projectId}");
    expect(operations.some((entry) => /notifications|utility|auth\/|calculate|screening/.test(entry))).toBe(false);
  });

  it("keeps the domain registry import-free and the live module isolated from fixtures and services", () => {
    const registry = readFileSync(join(process.cwd(), "src", "domain", "connections.ts"), "utf8");
    expect(registry).not.toMatch(/^\s*import\s/m);
    const directory = join(process.cwd(), "src", "features", "live-read");
    const source = readdirSync(directory).filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(directory, name), "utf8")).join("\n");
    expect(source).not.toMatch(/from\s+["'][^"']*(?:backend|design-lab|services|fixtures)/);
    expect(source).not.toMatch(/process\.env|localStorage|sessionStorage|document\.cookie|createObjectURL/);
    expect(source).not.toMatch(/method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
    expect(source).toContain('import type { LiveReadConfiguration } from "@/domain/live-configuration"');
  });

  it("pins the agreed timeout, byte and item ceilings", () => {
    expect(LIVE_READ_LIMITS).toMatchObject({
      defaultTimeoutMs: 10_000, maxTimeoutMs: 30_000,
      jsonBytes: 2_097_152, downloadBytes: 10_485_760, maxItems: 5_000,
    });
  });
});
