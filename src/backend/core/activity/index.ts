export interface ActivityRecord {
  id: string;
  siteId: string | null;
  projectId: string | null;
  actorUserId: string;
  action: string;
  note: string | null;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}
