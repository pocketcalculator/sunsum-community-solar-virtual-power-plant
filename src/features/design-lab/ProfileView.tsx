"use client";

import { useEffect, useRef, useState } from "react";
import { INTENT_PROMPT_LIST, isIntentOptionId, suggestedUserTypes } from "@/domain/intents";
import { USER_TYPES } from "@/domain/userTypes";
import { CAPITAL_TYPES, INVESTOR_TYPES, defaultProfile, formatNumber, type DemoProfile, type Mandate } from "./model";
import { useLab } from "./store";
import { DemoLearning } from "./DemoLearning";
import { Button, Card, Field, Icon, Pill } from "./ui";
import s from "./Lab.module.css";
import c from "./ProfileView.module.css";

const STEPS = ["About you", "Your intentions", "Preferences", "Review"] as const;
const OWNER_GOALS = [
  "Explore solar potential",
  "Reduce site energy costs",
  "Support community ownership",
  "Discuss an existing installation",
];

const OWNERSHIP_PREFERENCES: { id: DemoProfile["coOwnership"]; label: string; hint: string }[] = [
  { id: "undecided", label: "Not decided", hint: "Keep the conversation open; no agreement is selected." },
  { id: "single", label: "Single-owner option", hint: "Explore a project with one owner, without choosing legal terms." },
  { id: "co_owned", label: "Co-owned project", hint: "Ownership shared by multiple parties. This does not imply a cooperative." },
  { id: "cooperative", label: "Cooperative option", hint: "Explore a separately organized, member-governed model. No membership is created." },
];

function journey(intents: readonly string[]) {
  const suggestions = suggestedUserTypes(intents.filter(isIntentOptionId));
  const types = USER_TYPES.filter((type) => suggestions.includes(type.id));
  return {
    owner: types.some((type) => type.group === "sites" || type.group === "community") || intents.includes("i-have-project"),
    investor: types.some((type) => type.group === "finance"),
    purchaser: suggestions.includes("purchaser") || intents.includes("i-am-utility"),
  };
}

export function hasOwnerIntent(intents: readonly string[]) {
  return journey(intents).owner;
}

export function profileIsLearningOnly(intents: readonly string[]) {
  const applicable = journey(intents);
  return !applicable.owner && !applicable.investor;
}

export function ownershipPreferenceLabel(value: DemoProfile["coOwnership"]) {
  return OWNERSHIP_PREFERENCES.find((option) => option.id === value)?.label ?? "Not decided";
}

export function OwnerGoalsField({ value, onChange }: { value: readonly string[]; onChange: (goals: string[]) => void }) {
  const options = [...new Set([...OWNER_GOALS, ...value])];
  return <fieldset className={c.fieldset}>
    <legend>What would you like this site to do?</legend>
    <p className={c.hint}>Optional goals for the operator conversation, not a final project type or a promised outcome.</p>
    <div className={c.choices}>
      {options.map((goal) => <label key={goal} className={`${c.choice} ${value.includes(goal) ? c.chosen : ""}`}>
        <input type="checkbox" checked={value.includes(goal)} onChange={(event) => onChange(event.target.checked ? [...value, goal] : value.filter((entry) => entry !== goal))} />
        <span>{goal}</span>
      </label>)}
    </div>
  </fieldset>;
}

function errorsFor(profile: DemoProfile, step: number): string[] {
  if (step === 0) return [
    profile.name.trim() ? "" : "Enter a fictional display name.",
    profile.participant === "organization" && !profile.organization.trim() ? "Enter a fictional organization name, or choose Individual." : "",
  ].filter(Boolean);
  if (step === 1) return [
    profile.intents.some(isIntentOptionId) ? "" : "Choose at least one intention.",
    profile.intents.every(isIntentOptionId) ? "" : "Remove unavailable saved intentions before saving a completed profile.",
  ].filter(Boolean);
  if (step === 2 && profile.purchaseMwhPerYear !== null &&
    (!Number.isFinite(profile.purchaseMwhPerYear) || profile.purchaseMwhPerYear < 0)) {
    return ["Annual energy purchase must be a finite, non-negative number in MWh/year, or left blank."];
  }
  return [];
}

interface ProfileViewProps {
  onDone: (profile: DemoProfile) => void;
  onCancel?: () => void;
  initialSessionDraft?: ProfileSessionDraft | null;
  onSessionDraftChange?: (draft: ProfileSessionDraft | null) => void;
}

export interface ProfileSessionDraft {
  profile: DemoProfile;
  step: number;
  attempted: number[];
  consent: boolean;
  investorEdits: Partial<Pick<Mandate, "investorType" | "capitalType">>;
}

export function ProfileView({ onDone, onCancel, initialSessionDraft, onSessionDraftChange }: ProfileViewProps) {
  const { state, ready } = useLab();
  if (!ready) return <p role="status">Restoring your fictional browser profile...</p>;
  return <ProfileForm initialProfile={state.profile ?? defaultProfile()} onDone={onDone} {...(onCancel ? { onCancel } : {})}
    {...(initialSessionDraft ? { initialSessionDraft } : {})} {...(onSessionDraftChange ? { onSessionDraftChange } : {})} />;
}

function ProfileForm({ initialProfile, onDone, onCancel, initialSessionDraft, onSessionDraftChange }: ProfileViewProps & { initialProfile: DemoProfile }) {
  const { state, dispatch, notice, notify } = useLab();
  const [profile, setProfile] = useState<DemoProfile>(() => ({ ...(initialSessionDraft?.profile ?? initialProfile) }));
  const [step, setStep] = useState(() => initialSessionDraft?.step ?? (initialProfile.completed ? 3 : 0));
  const [attempted, setAttempted] = useState<Set<number>>(() => new Set(initialSessionDraft?.attempted ?? []));
  const [consent, setConsent] = useState(() => initialSessionDraft?.consent ?? false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [investorEdits, setInvestorEdits] = useState<Partial<Pick<Mandate, "investorType" | "capitalType">>>(() => initialSessionDraft?.investorEdits ?? {});
  const [restored] = useState(Boolean(initialSessionDraft));
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const applicable = journey(profile.intents);
  const errors = attempted.has(step) ? errorsFor(profile, step) : [];
  const intentOptions = INTENT_PROMPT_LIST.flatMap((prompt) => prompt.options);
  useEffect(() => {
    if (restored) heading.current?.focus();
  }, [restored]);
  useEffect(() => {
    if (!saved) onSessionDraftChange?.({ profile, step, attempted: [...attempted], consent, investorEdits });
  }, [onSessionDraftChange, saved, profile, step, attempted, consent, investorEdits]);

  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);

  const edit = <K extends keyof DemoProfile>(field: K, value: DemoProfile[K]) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setSaveError(null);
  };
  const goTo = (next: number) => {
    setSaveError(null);
    setStep(next);
  };
  const next = () => {
    if (errorsFor(profile, step).length) {
      setAttempted((current) => new Set(current).add(step));
      heading.current?.focus();
      return;
    }
    goTo(Math.min(STEPS.length - 1, step + 1));
  };
  const save = (completed: boolean) => {
    if (!consent) {
      setSaveError("Agree to local storage before saving. No profile has been saved.");
      return;
    }
    const invalidStep = [0, 1, 2].find((index) => (completed || index === 2) && errorsFor(profile, index).length > 0);
    if (invalidStep !== undefined) {
      setAttempted((current) => new Set(current).add(invalidStep));
      setStep(invalidStep);
      heading.current?.focus();
      return;
    }
    const nextProfile: DemoProfile = { ...profile, name: profile.name.trim(), organization: profile.organization.trim(), completed };
    const ok = dispatch({ type: "profile", profile: nextProfile }, completed
      ? "Fictional profile saved in this browser. No account or workspace permissions were created."
      : "Profile draft saved in this browser. Finish the review before starting a Sunroom intake.");
    if (!ok) {
      setSaveError("The profile could not be saved. Review your details and try again.");
      return;
    }
    if (Object.keys(investorEdits).length > 0) {
      const mandate = { ...state.mandate, ...investorEdits };
      mandate.completed = mandate.completed && Boolean(mandate.investorType && mandate.capitalType);
      const mandateSaved = dispatch({ type: "mandate", mandate },
        "Fictional profile and investment preferences saved in this browser. No sign-in, role grant, or financial action occurred.");
      if (!mandateSaved) {
        setSaveError("The profile was updated, but the investment preferences were not saved. Try saving those preferences again.");
        return;
      }
      setInvestorEdits({});
    }
    setProfile(nextProfile);
    setSaved(true);
    setSaveError(null);
    onSessionDraftChange?.(null);
    if (completed) onDone(nextProfile);
  };

  return <form className={c.profile} noValidate onSubmit={(event) => { event.preventDefault(); if (step === 3) save(true); else next(); }}>
    <div className={c.heading}>
      <div><p className={s.eyebrow}>Fictional browser profile</p><h1>A profile you can revisit</h1><p>Describe your intentions, then choose what to save locally.</p></div>
      <Button variant="secondary" disabled={!consent} onClick={() => save(false)}>Save draft</Button>
    </div>

    <div className={c.boundary}>
      <Icon name="lock" size={20} />
      <div><strong>Sign-in is not connected.</strong><p>Use fictional details only. This does not create an account, send an email, collect a password, or grant an owner, operator, or investor role. The original public join flow remains separate.</p></div>
    </div>
    <details className={c.learning}>
      <summary>Optional learning (keeps this draft)</summary>
      <p>Your current answers, step and selections stay in memory while you learn. They are not saved to browser storage unless you explicitly agree and save.</p>
      <DemoLearning />
    </details>

    <ol className={c.steps} aria-label="Profile progress">
      {STEPS.map((label, index) => <li key={label}>
        <button type="button" className={`${c.step} ${step === index ? c.activeStep : ""}`} aria-label={`Step ${index + 1}: ${label}`} aria-current={step === index ? "step" : undefined} onClick={() => goTo(index)}>
          <span>{index + 1}</span><strong>{label}</strong>
        </button>
      </li>)}
    </ol>

    <Card>
      <div className={c.panel}>
        <div><p className={s.eyebrow}>Step {step + 1} of {STEPS.length}</p><h2 ref={heading} tabIndex={-1} className={c.stepTitle}>{STEPS[step]}</h2></div>

        {step === 0 && <>
          <Field label="Fictional display name" hint="A demo name, not a verified identity.">
            <input autoComplete="off" value={profile.name} onChange={(event) => edit("name", event.target.value)} aria-invalid={attempted.has(0) && !profile.name.trim()} />
          </Field>
          <fieldset className={c.fieldset}>
            <legend>Who are you representing?</legend>
            <div className={c.choices}>
              {(["individual", "organization"] as const).map((participant) => <label className={`${c.choice} ${profile.participant === participant ? c.chosen : ""}`} key={participant}>
                <input type="radio" name="profile-participant" checked={profile.participant === participant} onChange={() => edit("participant", participant)} />
                <span>{participant === "individual" ? "Individual" : "Organization"}</span>
              </label>)}
            </div>
          </fieldset>
          {profile.participant === "organization"
            ? <Field label="Fictional organization name" hint="Self-described representation only; authority and membership are not verified.">
                <input autoComplete="off" value={profile.organization} onChange={(event) => edit("organization", event.target.value)} aria-invalid={attempted.has(0) && !profile.organization.trim()} />
              </Field>
            : <p className={c.hint}>An individual does not need organization financial records. {profile.organization ? "Your previous organization name is retained but is not applied to this individual profile." : "No organization details are required."}</p>}
        </>}

        {step === 1 && <>
          <p className={c.hint}>Choose all that fit. Intentions can suggest questions; they never grant permissions or select a workspace for you.</p>
          {INTENT_PROMPT_LIST.map((prompt) => <fieldset className={c.fieldset} key={prompt.id}>
            <legend>{prompt.stem}</legend>
            <p className={c.hint}>{prompt.question}</p>
            <div className={c.intentChoices}>
              {prompt.options.map((option) => <label key={option.id} className={`${c.choice} ${profile.intents.includes(option.id) ? c.chosen : ""}`}>
                <input type="checkbox" checked={profile.intents.includes(option.id)} onChange={(event) => edit("intents", event.target.checked ? [...profile.intents, option.id] : profile.intents.filter((id) => id !== option.id))} />
                <span>{option.label}</span>
              </label>)}
            </div>
          </fieldset>)}
          {profile.intents.filter((id) => !isIntentOptionId(id)).map((id) => <div className={c.retained} key={id}>
            <span>Unavailable saved intention: {id}</span><Button variant="ghost" onClick={() => edit("intents", profile.intents.filter((entry) => entry !== id))}>Remove unavailable choice</Button>
          </div>)}
        </>}

        {step === 2 && <>
          {applicable.owner ? <>
            <OwnerGoalsField value={profile.ownerGoals} onChange={(goals) => edit("ownerGoals", goals)} />
            <fieldset className={c.fieldset}>
              <legend>Ownership conversation (optional)</legend>
              <p className={c.hint}>Co-ownership and cooperative ownership are different. These preferences do not form an entity, select a lease, reserve capital, or execute an agreement.</p>
              <div className={c.choices}>{OWNERSHIP_PREFERENCES.map((option) => <label className={`${c.choice} ${profile.coOwnership === option.id ? c.chosen : ""}`} key={option.id}>
                <input type="radio" name="profile-ownership" checked={profile.coOwnership === option.id} onChange={() => edit("coOwnership", option.id)} />
                <span><strong>{option.label}</strong><small>{option.hint}</small></span>
              </label>)}</div>
            </fieldset>
          </> : <p className={c.hint}>Site goals and ownership preferences are not active for these intentions. Previous answers are retained for a later visit, not applied to a new site.</p>}

          {applicable.investor && <fieldset className={c.fieldset}>
            <legend>Funding preferences (optional)</legend>
            <p className={c.hint}>Investor type and capital type are separate from your intentions and workspace permissions. These update the existing fictional Investment mandate; they do not create interest or a commitment.</p>
            <div className={c.grid}>
              <Field label="Investor type">
                <select value={investorEdits.investorType ?? state.mandate.investorType} onChange={(event) => {
                  const value = event.target.value;
                  if (value && !INVESTOR_TYPES.some(([id]) => id === value)) { notify("Choose an available investor type."); return; }
                  setInvestorEdits((current) => ({ ...current, investorType: value }));
                  setSaved(false);
                }}>
                  <option value="">Not specified</option>
                  {INVESTOR_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </Field>
              <Field label="Capital type">
                <select value={investorEdits.capitalType ?? state.mandate.capitalType} onChange={(event) => {
                  const value = event.target.value;
                  if (value && !CAPITAL_TYPES.some(([id]) => id === value)) { notify("Choose an available capital type."); return; }
                  setInvestorEdits((current) => ({ ...current, capitalType: value }));
                  setSaved(false);
                }}>
                  <option value="">Not specified</option>
                  {CAPITAL_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </Field>
            </div>
            <p className={c.hint}>Funding limits and impact preferences remain in Investment mandate. This profile does not set currency amounts.</p>
          </fieldset>}

          {applicable.purchaser
            ? <Field label="Annual energy purchase (MWh/year)" hint="Optional energy quantity, not dollars, a financing limit, a REC allocation, or a binding purchase. Leave blank if unknown.">
                <input type="number" inputMode="decimal" min={0} step="any" value={profile.purchaseMwhPerYear ?? ""} onChange={(event) => edit("purchaseMwhPerYear", event.target.value === "" ? null : Number(event.target.value))} aria-invalid={errorsFor(profile, 2).length > 0} />
              </Field>
            : profile.purchaseMwhPerYear !== null && <div className={c.retained}>
                <p>Your earlier energy-purchase preference is retained but inactive: {formatNumber(profile.purchaseMwhPerYear, 2)} MWh/year.</p>
                <Button variant="ghost" onClick={() => edit("purchaseMwhPerYear", null)}>Clear inactive purchase preference</Button>
              </div>}
          {!applicable.investor && <p className={c.hint}>Any existing funding preferences stay in Investment mandate. Changing intentions does not erase them or grant investor access.</p>}
          <p className={c.hint}>No income, tax documents, bank statements, or actual utility records are collected here.</p>
        </>}

        {step === 3 && <>
          <dl className={c.review}>
            <div><dt>Fictional participant</dt><dd>{profile.name || "Not entered"}</dd><dd>{profile.participant === "organization" ? profile.organization || "Organization name needed" : "Individual"}</dd></div>
            <div><dt>Intentions</dt><dd>{profile.intents.map((id) => intentOptions.find((option) => option.id === id)?.label ?? `Unavailable: ${id}`).join("; ") || "None selected"}</dd></div>
            <div><dt>Site goals</dt><dd>{applicable.owner ? profile.ownerGoals.join("; ") || "Not specified" : "Not active; previous answers retained"}</dd></div>
            <div><dt>Ownership preference</dt><dd>{applicable.owner ? ownershipPreferenceLabel(profile.coOwnership) : "Not active"}</dd></div>
            <div><dt>Annual energy purchase</dt><dd>{applicable.purchaser ? profile.purchaseMwhPerYear === null ? "Not specified" : `${formatNumber(profile.purchaseMwhPerYear, 2)} MWh/year` : "Not active; previous answer retained"}</dd></div>
            <div><dt>Sign-in and permissions</dt><dd>Not connected. No account or role grants.</dd></div>
            {applicable.investor && <div><dt>Funding preferences</dt><dd>{INVESTOR_TYPES.find(([id]) => id === (investorEdits.investorType ?? state.mandate.investorType))?.[1] ?? "Investor type not specified"}</dd><dd>{CAPITAL_TYPES.find(([id]) => id === (investorEdits.capitalType ?? state.mandate.capitalType))?.[1] ?? "Capital type not specified"}</dd></div>}
          </dl>
          <div className={c.corrections}><Button variant="ghost" onClick={() => goTo(0)}>Edit participant</Button><Button variant="ghost" onClick={() => goTo(1)}>Edit intentions</Button><Button variant="ghost" onClick={() => goTo(2)}>Edit preferences</Button></div>
          <p className={c.hint}>Saving a profile does not update existing sites. New owner intakes may carry forward applicable goals, which you can correct for each site.</p>
          {profileIsLearningOnly(profile.intents) && <p className={c.hint}>After saving this fictional profile, continue to learning and help. Research, workforce and other interests do not create a fourth workspace or grant an operator role.</p>}
          <Pill>Fictional, nonbinding preferences</Pill>
        </>}

        {(errors.length > 0 || saveError) && <div className={c.errors} role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}{saveError && <p>{saveError}</p>}
        </div>}

        <label className={c.consent}>
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span><strong>I agree to save fictional profile preferences in this browser.</strong><small>Nothing is sent to an account service. Anyone using this browser can access the preview. Clearing browser data or resetting the demo removes it; a storage failure is reported rather than treated as a durable save.</small></span>
        </label>
        {saved && notice && <p className={c.saved} role="status">{notice}</p>}

        <div className={c.actions}>
          <div>{step > 0 ? <Button variant="ghost" onClick={() => goTo(step - 1)}>Back</Button> : onCancel ? <Button variant="ghost" onClick={onCancel}>Leave without saving</Button> : null}</div>
          <Button type="submit" variant="primary" disabled={step === 3 && !consent} icon={step === 3 ? "check" : "arrow"}>{step === 3 ? "Save profile" : "Continue"}</Button>
        </div>
      </div>
    </Card>
  </form>;
}
