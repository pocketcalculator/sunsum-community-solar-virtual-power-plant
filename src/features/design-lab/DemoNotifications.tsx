"use client";

import { roleSites, type Role } from "./model";
import { compareRecordedTimes, timestampLabel } from "./demoPresentation";
import { useLab } from "./store";
import { Button, Empty, Modal } from "./ui";
import s from "./Lab.module.css";

export function DemoNotifications({ role, onClose, onOpen }: { role: Role; onClose: () => void; onOpen: (id: string) => void }) {
  const { state } = useLab();
  const notices = role === "site-owner" ? roleSites(state, role).flatMap((site) => site.activity
    .filter((event) => event.kind === "owner_interest" && event.scope === "owner")
    .map((event) => ({ id: event.id, at: event.at, siteId: site.id, name: site.name })))
    .sort((a, b) => compareRecordedTimes(a.at, b.at) || a.id.localeCompare(b.id)) : [];
  return <Modal title="Notifications" onClose={onClose}>
    <div className={s.stack}>
      <p className={s.callout}>Historical fictional notices, not an inbox or a task list. Unread count is not supplied. Opening this panel does not mark anything read.</p>
      {role !== "site-owner" ? <Empty title="Notification feed not modeled">
        This demo does not invent investor or operator notification rules. Use Activity log for permitted recorded events, or Action center for work.
      </Empty> : notices.length ? <ol className={s.notificationList} aria-label="Recorded owner notices">
        {notices.map((notice) => <li key={notice.id}>
          <strong>New nonbinding project interest</strong>
          <p>An investor expressed interest in {notice.name}. No commitment or funding occurred. This historical notice does not assert current interest.</p>
          <time dateTime={notice.at || undefined} title={notice.at || undefined}>{timestampLabel(notice.at)}</time>
          <Button data-project-open={notice.siteId} onClick={() => { onClose(); onOpen(notice.siteId); }}>Open {notice.name}</Button>
        </li>)}
      </ol> : <Empty title="No recorded owner notices">No new-interest notice is recorded in this saved scenario. This is not an unread count or confirmation of an external delivery.</Empty>}
      <p className={s.muted}>Source: this browser&apos;s synthetic owner-interest transitions. No investor identity, contact, amount or external message is included.</p>
    </div>
  </Modal>;
}
