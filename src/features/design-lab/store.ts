"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createSeed, reduceLab, type Action, type LabState } from "./model";

export const STORAGE_KEY = "sunsum-design-lab-v2";
export const LEGACY_STORAGE_KEY = "sunsum-design-lab-v1";
interface Snapshot { state: LabState; notice: string | null; ready: boolean }
const initial: Snapshot = { state: createSeed(), notice: null, ready: false };
let snapshot = initial;
const listeners = new Set<() => void>();
let initialized = false;
let storageNeedsReset = false;

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function validRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value));
}

function isLabState(value: unknown): value is LabState {
  if (!validRecord(value) || value.version !== 1 || !Array.isArray(value.sites) ||
    !Array.isArray(value.engagements) || !validRecord(value.mandate)) return false;
  const strings = ["id", "name", "locality", "address", "contactName", "contactEmail", "assignee", "nextAction", "targetDate"];
  const sitesValid = value.sites.every((site: unknown) => validRecord(site) &&
    strings.every((key) => typeof site[key] === "string") &&
    (site.targetDate === "" || validDate(site.targetDate)) &&
    ["GA", "TN", "unknown"].includes(String(site.region)) &&
    ["rooftop", "land"].includes(String(site.type)) &&
    ["confirmed", "pending", "unverified"].includes(String(site.ownership)) &&
    ["draft", "submitted", "screening", "info_requested", "accepted", "rejected"].includes(String(site.status)) &&
    (site.stage === null || ["submitted", "screening", "pre-development", "development", "construction", "commissioning", "operations"].includes(String(site.stage))) &&
    ["area", "usage"].every((key) => site[key] === null || (typeof site[key] === "number" && Number.isFinite(site[key]))) &&
    ["visible", "existingSolar", "consent"].every((key) => typeof site[key] === "boolean") &&
    Array.isArray(site.assessments) && site.assessments.every((assessment: unknown) => validRecord(assessment) &&
      ["id", "version", "createdAt"].every((key) => typeof assessment[key] === "string") &&
      validDate(assessment.createdAt) &&
      ["potentially_viable", "more_information_required", "not_currently_eligible"].includes(String(assessment.result)) &&
      ["capacity", "generation"].every((key) => assessment[key] === null || (Array.isArray(assessment[key]) && assessment[key].length === 2 && assessment[key].every((number: unknown) => typeof number === "number" && Number.isFinite(number)))) &&
      ["factors", "flags"].every((key) => Array.isArray(assessment[key]) && assessment[key].every((text: unknown) => typeof text === "string"))) &&
    Array.isArray(site.documents) && site.documents.every((doc: unknown) => validRecord(doc) &&
      ["id", "name", "createdAt"].every((key) => typeof doc[key] === "string") &&
      validDate(doc.createdAt) &&
      typeof doc.size === "number" && Number.isFinite(doc.size) &&
      ["site_summary", "ownership", "electricity_bill", "photo", "technical"].includes(String(doc.kind)) &&
      ["owner_private", "investor_tier_1"].includes(String(doc.disclosure))) &&
    Array.isArray(site.activity) && site.activity.every((event: unknown) => validRecord(event) &&
      ["id", "at", "title", "detail"].every((key) => typeof event[key] === "string") &&
      validDate(event.at) &&
      ["site-owner", "operator", "investor"].includes(String(event.actor)) &&
      ["submission", "stage", "decision", "interest", "owner_interest", "task", "note", "document", "acknowledgement", "override", "visibility", "assignment"].includes(String(event.kind)) &&
      (event.documentId === undefined || typeof event.documentId === "string") &&
      ["shared", "owner", "operator", "investor"].includes(String(event.scope))) &&
    Array.isArray(site.outstanding) && site.outstanding.every((item: unknown) => typeof item === "string") &&
    (site.acknowledgement === null || (validRecord(site.acknowledgement) && typeof site.acknowledgement.name === "string" && validDate(site.acknowledgement.at))) &&
    Array.isArray(site.fundingNeeds) && site.fundingNeeds.every((need: unknown) => validRecord(need) &&
      typeof need.id === "string" && typeof need.title === "string" &&
      (need.amount === null || (typeof need.amount === "number" && Number.isSafeInteger(need.amount))) &&
      ["open", "delivered"].includes(String(need.status))) &&
    (site.mapPosition === null || (Array.isArray(site.mapPosition) && site.mapPosition.length === 2 && site.mapPosition.every((n: unknown) => typeof n === "number" && Number.isFinite(n)))));
  const mandate = value.mandate;
  const mandateValid = ["organization", "investorType", "capitalType"].every((key) => typeof mandate[key] === "string") &&
    ["stages", "geographies", "objectives", "impact", "criteria"].every((key) => Array.isArray(mandate[key]) && mandate[key].every((v: unknown) => typeof v === "string")) &&
    ["minimum", "maximum"].every((key) => mandate[key] === null || (typeof mandate[key] === "number" && Number.isSafeInteger(mandate[key]))) &&
    typeof mandate.completed === "boolean";
  const engagementsValid = value.engagements.every((entry: unknown) => validRecord(entry) &&
    ["id", "siteId", "at"].every((key) => typeof entry[key] === "string") &&
    validDate(entry.at) &&
    ["interested", "withdrawn"].includes(String(entry.state)) &&
    (entry.fundingNeedId === null || typeof entry.fundingNeedId === "string"));
  return sitesValid && mandateValid && engagementsValid && validWorkflow(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

function validWorkflow(value: Record<string, unknown>) {
  const profile = value.profile;
  if (profile !== undefined && (!validRecord(profile) ||
    !["name", "organization"].every((key) => typeof profile[key] === "string") ||
    !["individual", "organization"].includes(String(profile.participant)) ||
    !["single", "co_owned", "cooperative", "undecided"].includes(String(profile.coOwnership)) ||
    !stringArray(profile.intents) || !stringArray(profile.ownerGoals) ||
    typeof profile.completed !== "boolean" ||
    !(profile.purchaseMwhPerYear === null || (typeof profile.purchaseMwhPerYear === "number" && Number.isFinite(profile.purchaseMwhPerYear) && profile.purchaseMwhPerYear >= 0)))) return false;
  if (value.drafts !== undefined && (!Array.isArray(value.drafts) || !value.drafts.every((draft: unknown) =>
    validRecord(draft) && ["id", "siteId", "title", "content", "templateVersion", "sourceRevision", "createdAt", "updatedAt"].every((key) => typeof draft[key] === "string") &&
    validDate(draft.createdAt) && validDate(draft.updatedAt) &&
    ["project_brief", "assessment_report"].includes(String(draft.kind)) &&
    ["draft", "reviewed"].includes(String(draft.review)) &&
    ["site-owner", "operator", "investor"].includes(String(draft.authorRole)) &&
    (draft.reviewedAt === null || validDate(draft.reviewedAt)) &&
    (draft.reviewerRole === undefined || draft.reviewerRole === null || ["site-owner", "operator", "investor"].includes(String(draft.reviewerRole))) &&
    Array.isArray(draft.sourceFields) && draft.sourceFields.every((field: unknown) =>
      validRecord(field) && ["key", "label", "value"].every((key) => typeof field[key] === "string") &&
      (field.sourceValue === undefined || typeof field.sourceValue === "string"))))) return false;
  return Array.isArray(value.sites) && value.sites.every((site: unknown) => {
    if (!validRecord(site)) return false;
    if (site.ownerVisible !== undefined && typeof site.ownerVisible !== "boolean") return false;
    if (site.reviewRequired !== undefined && typeof site.reviewRequired !== "boolean") return false;
    if (site.ownerGoals !== undefined && !stringArray(site.ownerGoals)) return false;
    if (site.assessmentError !== undefined && site.assessmentError !== null && typeof site.assessmentError !== "string") return false;
    if (["revision", "evidenceRevision"].some((key) => site[key] !== undefined && (typeof site[key] !== "number" || !Number.isSafeInteger(site[key]) || site[key] < 0))) return false;
    if (site.tasks !== undefined && (!Array.isArray(site.tasks) || !site.tasks.every((task: unknown) =>
      validRecord(task) && ["id", "title", "note"].every((key) => typeof task[key] === "string") &&
      ["evidence", "review"].includes(String(task.kind)) && ["requested", "provided", "reviewed"].includes(String(task.status)) &&
      (task.requiredForStage === null || ["submitted", "screening", "pre-development", "development", "construction", "commissioning", "operations"].includes(String(task.requiredForStage))) &&
      (task.documentKind === null || ["site_summary", "ownership", "electricity_bill", "photo", "technical"].includes(String(task.documentKind)))))) return false;
    if (site.decisions !== undefined && (!Array.isArray(site.decisions) || !site.decisions.every((decision: unknown) =>
      validRecord(decision) && ["accept", "reject", "request_info"].includes(String(decision.decision)) &&
      typeof decision.note === "string" && validDate(decision.at) &&
      (decision.assessmentId === null || typeof decision.assessmentId === "string") &&
      typeof decision.evidenceRevision === "number" && Number.isSafeInteger(decision.evidenceRevision) && decision.evidenceRevision >= 0))) return false;
    if (site.notes !== undefined && (!Array.isArray(site.notes) || !site.notes.every((note: unknown) =>
      validRecord(note) && ["id", "text", "createdAt", "updatedAt"].every((key) => typeof note[key] === "string") &&
      validDate(note.createdAt) && validDate(note.updatedAt) &&
      Array.isArray(note.previous) && note.previous.every((entry: unknown) => validRecord(entry) && typeof entry.text === "string" && validDate(entry.at))))) return false;
    return Array.isArray(site.documents) && site.documents.every((doc: unknown) => validRecord(doc) &&
      (doc.version === undefined || (typeof doc.version === "number" && Number.isSafeInteger(doc.version) && doc.version > 0)) &&
      (doc.review === undefined || doc.review === "unreviewed" || doc.review === "reviewed") &&
      (doc.reviewedAt === undefined || validDate(doc.reviewedAt)) &&
      ["reviewedAt", "replacesId", "taskId"].every((key) => doc[key] === undefined || typeof doc[key] === "string"));
  });
}

export function parseStoredState(raw: string): LabState | null {
  const value: unknown = JSON.parse(raw);
  if (validRecord(value) && value.schemaVersion === 2) {
    return value.mode === "synthetic" && isLabState(value.state) ? value.state : null;
  }
  return isLabState(value) ? value : null;
}

function readStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const legacy = raw === null ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
  const selected = raw ?? legacy;
  return { state: selected === null ? null : parseStoredState(selected), exists: selected !== null, migrate: raw === null && legacy !== null };
}

export function serializePreview(state: LabState) {
  return JSON.stringify({ schemaVersion: 2, mode: "synthetic", state });
}

function knownStorageError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof DOMException &&
    ["SecurityError", "QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(error.name));
}

function initialize() {
  if (initialized) return;
  initialized = true;
  try {
    const stored = readStorage();
    storageNeedsReset = stored.exists && !stored.state;
    snapshot = {
      state: stored.state ?? initial.state, ready: true,
      notice: storageNeedsReset ? "Saved demo data could not be restored. Examples are shown in memory; reset explicitly to replace the invalid save." : null,
    };
    if (stored.migrate && stored.state) {
      try {
        localStorage.setItem(STORAGE_KEY, serializePreview(stored.state));
      } catch (error) {
        if (!knownStorageError(error)) throw error;
        snapshot = { ...snapshot, notice: "Your previous demo was restored, but the new save could not be written. The original save is retained." };
      }
    }
  } catch (error) {
    if (!knownStorageError(error)) throw error;
    storageNeedsReset = true;
    snapshot = { ...initial, ready: true, notice: "Browser storage is unavailable or damaged. This demo will work in memory, but changes may not survive a refresh." };
  }
  emit();
}

export function dispatch(action: Action, message?: string) {
  const state = reduceLab(snapshot.state, action);
  if (state === snapshot.state) {
    notify("That action is not available for this project's current state. Review the required details and try again.");
    return false;
  }
  let notice = message ?? "Demo updated in this browser.";
  try {
    if (storageNeedsReset && action.type !== "reset") {
      notice = "Updated in memory only. Your unreadable save is untouched; use Reset demo to start a new saved scenario.";
    } else {
      if (storageNeedsReset) {
        const old = localStorage.getItem(STORAGE_KEY);
        if (old !== null) localStorage.setItem(`${STORAGE_KEY}-recovery-${Date.now()}`, old);
      }
      localStorage.setItem(STORAGE_KEY, serializePreview(state));
      storageNeedsReset = false;
    }
  } catch (error) {
    if (!knownStorageError(error)) throw error;
    notice = "Updated in memory only. Browser storage is unavailable; changes will not survive a refresh.";
  }
  snapshot = { ...snapshot, state, notice };
  emit();
  return true;
}

export function notify(notice: string) {
  snapshot = { ...snapshot, notice };
  emit();
}

export function dismissNotice() {
  snapshot = { ...snapshot, notice: null };
  emit();
}

export function useLab() {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => initial);
  useEffect(() => {
    initialize();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      initialized = false;
      initialize();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { ...current, dispatch, notify, dismissNotice };
}
