"use client";

import { investorVisible, latestAssessment, type Role, type Site } from "./model";
import { Card, Empty, Pill } from "./ui";
import f from "./FinancialSummary.module.css";

const financialMeasures = [
  { label: "Project costs", unit: "USD", detail: "Capital and operating cost inputs have not been supplied." },
  { label: "Owner benefit", unit: "USD; payment period not defined", detail: "Owner-directed cash benefit, not an investor return or a utility credit." },
  { label: "Project payback", unit: "Years", detail: "No approved cash-flow model or break-even definition is available." },
  { label: "Investor return", unit: "USD; investment horizon not defined", detail: "No capital structure or return calculation. The comparison's individual allocation is not an investor return." },
  { label: "Utility bill savings", unit: "USD/year", detail: "Avoided utility cost requires a bill baseline and tariff; neither is modeled here." },
] as const;

const actualMeasures = [
  { label: "Actual generation", unit: "MWh/year" },
  { label: "Owner payments", unit: "USD" },
  { label: "Avoided emissions", unit: "tCO2e/year" },
  { label: "Households served", unit: "Household count" },
] as const;

export function FinancialSummary({ site, role }: { site: Site; role: Role }) {
  if ((role === "investor" && !investorVisible(site)) || (role === "site-owner" && site.ownerVisible === false)) {
    return <Empty title="Project financial context unavailable" icon="lock">
      This project is outside the current preview role. No financial or project details are shown.
    </Empty>;
  }
  const assessment = latestAssessment(site);
  return <section className={f.summary} aria-label="Selected project financial summary">
    <Card title="A clear financial starting point" eyebrow="Selected project / illustrative preview"
      action={<Pill tone="warning">Not calculated</Pill>}>
      <p className={f.scope}><strong>{site.name}</strong> &middot; one fictional project, not a portfolio total or investment holding.</p>
      <dl className={f.measures}>{financialMeasures.map((measure) => <div key={measure.label}>
        <dt>{measure.label}</dt><dd><strong>Not calculated</strong><p>{measure.unit}</p><small>{measure.detail}</small></dd>
      </div>)}</dl>
      <div className={f.provenance}>
        <p><strong>Source:</strong> current synthetic project record. No site-specific financial model is configured.</p>
        <p><strong>Screening source, not a finance model:</strong> {assessment
          ? `${assessment.version}; snapshot ${assessment.createdAt} (UTC).`
          : "No assessment or source snapshot available."}</p>
        <p>No tariff, PPA price, tax-credit eligibility, discount rate or payback assumptions have been applied.
          The ten original comparison fixtures are a separate illustration and are not mapped onto this project.</p>
      </div>
    </Card>
    <Card title="Actual outcomes remain unmeasured" eyebrow="No telemetry, payments or impact dataset">
      <dl className={f.actuals}>{actualMeasures.map((measure) => <div key={measure.label}>
        <dt>{measure.label}<small>{measure.unit}</small></dt><dd>Unmeasured</dd>
      </div>)}</dl>
      <p className={f.provenance}>Reporting period and dataset vintage: not supplied. No carbon factor, household conversion or
        program-eligibility rule is applied. Acceptance, publication, an agreement preference or investor interest never creates actual results.</p>
    </Card>
  </section>;
}
