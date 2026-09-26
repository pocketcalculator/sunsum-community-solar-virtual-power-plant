import { copyWorkspaceQuery, type WorkspaceQuery } from "@/domain/workspace-filters";
import { INITIAL_COLLECTION, type CollectionState } from "./presentation";

interface CollectionReturnState {
  readonly collection: CollectionState;
  readonly query: WorkspaceQuery;
}

export class CollectionHistory {
  private readonly prefix = Array.from(crypto.getRandomValues(new Uint32Array(4)),
    (value) => value.toString(16).padStart(8, "0")).join("");
  private sequence = 0;
  private readonly entries = new Map<string, CollectionReturnState>();
  private readonly listeners = new Set<() => void>();
  private collection: CollectionState = { ...INITIAL_COLLECTION };

  readonly getSnapshot = () => this.collection;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setCollection(collection: CollectionState): void {
    this.collection = { ...collection };
    for (const listener of this.listeners) listener();
  }

  remember(query: WorkspaceQuery, existingKey?: string): string {
    const key = existingKey && this.entries.has(existingKey) ? existingKey : `${this.prefix}:${++this.sequence}`;
    this.entries.set(key, { collection: { ...this.collection }, query: copyWorkspaceQuery(query) });
    if (this.entries.size > 64) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return key;
  }

  restore(key: string | undefined): CollectionReturnState | null {
    const entry = key === undefined ? undefined : this.entries.get(key);
    if (!entry) return null;
    this.setCollection(entry.collection);
    return { collection: { ...entry.collection }, query: copyWorkspaceQuery(entry.query) };
  }
}
