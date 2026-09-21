"use client";

import { useRef, useState } from "react";
import { VppEducation } from "@/features/community-context";
import { Button, Card } from "./ui";
import g from "./Guidance.module.css";

const LESSONS = [
  { title: "Start with the place", body: "A site owner describes a rooftop or parcel, their goals and what they know. Evidence requests depend on that site. There is no universal organization-document or twelve-month bill requirement in this preview." },
  { title: "Keep decisions separate", body: "Screening is preliminary information. A human reviews it, explicitly starts a project, advances stages when example prerequisites are reviewed, and separately chooses publication. None of these actions moves money." },
  { title: "Share with a purpose", body: "Published summaries do not expose exact addresses, owner contacts or private bills to investors. Nonbinding interest opens only permitted preview diligence. A minimal historical owner notice is separate from private investor activity." },
  { title: "Read numbers honestly", body: "Capacity is in kW and annual energy in kWh or MWh. Owner benefit, project payback and investor return are different questions. These are synthetic examples, not verified impact, prices or forecasts." },
] as const;

export function DemoLearning() {
  const [step, setStep] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const revisit = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lesson = LESSONS[step]!;
  const skip = () => {
    setSkipped(true);
    requestAnimationFrame(() => revisit.current?.focus());
  };
  return <div className={g.learning}>
    <VppEducation />
    <Card title="Optional workflow orientation">
      <p>This explains how to use the fictional workspace, not how energy or RECs move. Skip it or return at any time; no profile answer is saved by learning.</p>
      {skipped ? <button ref={revisit} className={g.revisit} type="button" onClick={() => {
        setSkipped(false); requestAnimationFrame(() => heading.current?.focus());
      }}>Revisit orientation</button> : <>
        <p className={g.scope} aria-live="polite">Step {step + 1} of {LESSONS.length}</p>
        <h3 ref={heading} tabIndex={-1}>{lesson.title}</h3><p>{lesson.body}</p>
        <div className={g.helpActions}>
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>Previous lesson</Button>
          {step < LESSONS.length - 1 ? <Button onClick={() => setStep(step + 1)}>Next lesson</Button> : <Button onClick={skip}>Finish orientation</Button>}
          <Button variant="ghost" onClick={skip}>Skip orientation</Button>
        </div>
      </>}
    </Card>
    <Card title="Human help, not automated outreach">
      <p>Researchers, workforce participants and people exploring the idea can learn without receiving a new workspace or role. A fictional profile creates no account or authority.</p>
      <p>Human adoption support means a person helping you understand the process, access needs and next handoff. The scripted help panel cannot do that person&apos;s work or contact a project manager.</p>
      <p>Site-submission technical coordination and later viability follow-up are separate human responsibilities, not automatic consequences of completing a profile.</p>
      <p>No verified support address is configured in this preview. Use an already established project-team channel; no email, message or automated outreach is sent.</p>
    </Card>
  </div>;
}
