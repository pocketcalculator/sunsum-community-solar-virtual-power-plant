import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getPipelineRoute } from "@/backend";
import {
  OperatorPipeline,
  SAMPLE_PIPELINE,
  toPipelineView,
  type PipelineDataSource,
  type PipelineView,
} from "@/features/operator-pipeline";

export const metadata: Metadata = {
  title: "Submission pipeline",
  description:
    "Sites and projects moving through the Sunsum delivery journey, with their status, viability and next stage.",
};

/**
 * The session lives in a cookie, so this page is per-request by definition and
 * must never be prerendered into a static shell shared between operators.
 */
export const dynamic = "force-dynamic";

interface PipelineRead {
  readonly view: PipelineView;
  readonly dataSource: PipelineDataSource;
}

const SAMPLE: PipelineRead = {
  view: SAMPLE_PIPELINE,
  dataSource: "sample",
};

/**
 * Reads the pipeline through the same handler the HTTP route exports.
 *
 * The same pattern as the site owner and investor workspaces: call the handler
 * directly so there is one authorization path — `getPipelineRoute` still runs
 * `requireRole("operator")` on the request built here — and no server-to-self
 * network round trip needing a base URL that differs per environment.
 *
 * Any failure falls back to the illustrative sample rather than erroring, since
 * this page is also the demo artefact. An empty board is not a failure: an
 * operator with nothing in the pipeline should see that it is empty.
 */
async function readPipeline(cookieHeader: string): Promise<PipelineRead> {
  if (cookieHeader.length === 0) return SAMPLE;

  try {
    const response = await getPipelineRoute(
      new Request("http://internal/api/pipeline", {
        headers: { cookie: cookieHeader },
      }),
    );
    if (!response.ok) return SAMPLE;

    const view = toPipelineView(await response.json());
    return view === null ? SAMPLE : { view, dataSource: "live" };
  } catch {
    return SAMPLE;
  }
}

export default async function OperatorPipelinePage() {
  const cookieHeader = (await cookies()).toString();
  const { view, dataSource } = await readPipeline(cookieHeader);

  return <OperatorPipeline dataSource={dataSource} initialView={view} />;
}
