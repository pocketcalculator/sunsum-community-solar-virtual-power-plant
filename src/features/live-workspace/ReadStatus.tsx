import type { ReactNode } from "react";
import type { WorkspaceSourceMode } from "@/domain/live-configuration";
import { serviceErrorCode, type ReadError } from "@/features/live-read";
import styles from "./Workspace.module.css";

const errorTitles: Record<ReadError["kind"], string> = {
  "out-of-reach": "This connection is out of reach right now",
  unauthenticated: "Your existing service sign-in is needed",
  denied: "This information is outside your current access",
  missing: "This record or original file is unavailable",
  invalid: "This request cannot use the accepted service contract",
  malformed: "The service response could not be understood",
  network: "The service could not be reached",
  timeout: "The service request took too long",
  canceled: "This request was canceled",
  stale: "Your service context changed",
  "too-large": "This response exceeds the accepted read limits",
  unavailable: "This service is out of reach right now",
};

export function ServiceErrorCode({ value }: { value: string | null }) {
  const code = serviceErrorCode(value);
  return code === null ? null : <p className={styles.muted}>Service code: <code>{code}</code></p>;
}

export function ReadFailure({ error, label, sourceMode = "connected" }: {
  error: ReadError; label?: string; sourceMode?: WorkspaceSourceMode;
}) {
  return (
    <section className={styles.warning} role="status" aria-label={label ?? "Read status"}>
      <strong>{errorTitles[error.kind]}</strong>
      <p>{error.message}</p>
      <ServiceErrorCode value={error.code} />
      {error.kind === "unauthenticated" && <p>
        {sourceMode === "server-demo"
          ? "Choose a seeded role using the explicit server-demo control. Its records and identity are fictional."
          : "Use the existing owner-approved sign-in, then refresh. No demo account is created here."}
      </p>}
      {error.kind === "denied" && <p>
        Refresh after the service owner confirms access. Changing a role label does not grant permission.
      </p>}
    </section>
  );
}

export function SectionHeading({ eyebrow, title, children }: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return <div className={styles.heading}><div>
    <p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1>
    {children && <p>{children}</p>}
  </div></div>;
}

export function WriteBoundary({ action }: { action: string }) {
  return <p className={styles.muted}>
    <strong>{action}</strong> is not implemented in this connected frontend.
    The existing service workflow remains unchanged.
  </p>;
}

export function StoredTime({ value }: { value: string | null }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span>Time not supplied</span>;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return <time dateTime={value}>{value} (time not supplied)</time>;
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return <span>{value} (timezone not supplied)</span>;
  return <time dateTime={value}>{new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "medium", timeZone: "UTC",
  }).format(new Date(value))} UTC</time>;
}

export function ReadFacts({ items }: {
  items: readonly { label: string; value: ReactNode }[];
}) {
  return <dl className={styles.details}>
    {items.map((item) => <div key={item.label} className={styles.fact}>
      <dt>{item.label}</dt><dd>{item.value ?? "Not supplied"}</dd>
    </div>)}
  </dl>;
}
