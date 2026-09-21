import type { DemoDocument, Role, Site } from "./model";
import { visibleActivity } from "./model";
import { actorLabel, timestampLabel } from "./demoPresentation";
import s from "./OwnerViews.module.css";

export function DocumentHistory({ document, site, role }: { document: DemoDocument; site: Site; role: Role }) {
  const events = visibleActivity(site, role).filter((event) => event.kind === "document" && event.documentId === document.id);
  const added = events.find((event) => event.title === "Document placeholder added");
  const reviewed = events.find((event) => event.title === "Metadata review recorded");
  return <details className={s.fileHistory}>
    <summary>File history: {document.name}</summary>
    <p>Source: this saved browser metadata version. Original timestamps are preserved. Roles are fictional, not verified people.</p>
    <ol>
      <li><strong>Metadata recorded</strong><span>{actorLabel(added?.actor)}</span><time dateTime={document.createdAt || undefined} title={document.createdAt || undefined}>{timestampLabel(document.createdAt)}</time></li>
      {document.review === "reviewed" && <li><strong>Metadata review recorded</strong><span>{actorLabel(reviewed?.actor)}</span><time dateTime={document.reviewedAt || undefined} title={document.reviewedAt || undefined}>{timestampLabel(document.reviewedAt)}</time></li>}
    </ol>
    {!added && <p>The legacy metadata entry does not identify its actor. A project event with a similar filename is not proof of who added this version.</p>}
    <p>Opening this history records no read, review, acknowledgement or task completion.</p>
  </details>;
}
