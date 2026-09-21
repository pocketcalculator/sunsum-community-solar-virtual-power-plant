import type { CSSProperties } from "react";
import { ActionLink } from "@/components/ui/ActionLink";
import { Callout } from "@/components/ui/Callout";
import { PublicLearning } from "@/features/community-context";
import { FAQ_ITEMS } from "../faq";
import { EntryPathGrid } from "./EntryPathGrid";
import { FaqList } from "./FaqList";
import { Hero } from "./Hero";
import { JourneyRibbon } from "./JourneyRibbon";
import { Section } from "./Section";
import styles from "./LandingPage.module.css";

const PREREQUISITES = [
  {
    title: "An approved connection",
    detail:
      "The connected workspace can read only admitted services. When a connection is unavailable, it says so rather than filling the gap with fictional records.",
  },
  {
    title: "Legitimate access",
    detail:
      "An established session and service permissions determine access. Choosing a public participation path does not sign you in or grant a role.",
  },
  {
    title: "Read-only boundaries",
    detail:
      "Available information is shown with its context and limitations. This release does not save workflow changes, submit projects or control equipment.",
  },
] as const;

const columns: CSSProperties & { "--prerequisite-count": number } = {
  "--prerequisite-count": PREREQUISITES.length,
};

export function LandingPage() {
  return (
    <>
      <Hero />

      <Section
        id="about"
        eyebrow="About SunSum"
        title="Community needs come first"
        description="SunSum explores a community-first solar approach: local needs before surplus, shared participation and coordinated project information."
      >
        <p className={styles.about}>
          The proposal connects three questions: why more community solar is
          needed, how a cooperative approach could work, and what it could mean
          for people, the economy and the environment. These are aims to explore,
          not promises of ownership, savings or operating results.
        </p>
        <div className={styles.storyLinks}>
          <ActionLink href="/need" variant="secondary">Read the need</ActionLink>
          <ActionLink href="/opportunity" variant="secondary">Read the opportunity</ActionLink>
          <ActionLink href="/impact" variant="secondary">Read the impact</ActionLink>
        </div>
        <PublicLearning />
      </Section>

      <Section
        id="participate"
        eyebrow="Participation"
        title="Three ways to take part"
        description="Try a fictional profile from one of these starting points. Your initial choice stays editable and never grants access."
      >
        <EntryPathGrid />
      </Section>

      <Section
        id="journey"
        eyebrow="Delivery journey"
        title="From an offered site to ongoing operations"
        description="Shared stage names help site owners, operators and investors discuss a project's progress without confusing an assessment with approval."
        tone="sunken"
        footnote="These stage names are the shared vocabulary this software is designed around. No project is moving through them on this site."
      >
        <JourneyRibbon />
      </Section>

      <Section
        id="prerequisites"
        eyebrow="Beyond this introduction"
        title="An authorized workspace is a separate step"
        description="Connected workspace reads require authorized access. A separately labeled synthetic demo uses fictional scenarios, not proof of a live connection."
      >
        <ul className={styles.prerequisites} role="list" style={columns}>
          {PREREQUISITES.map((item) => (
            <li className={styles.prerequisite} key={item.title}>
              <h3 className={styles.prerequisiteTitle}>{item.title}</h3>
              <p className={styles.prerequisiteDetail}>{item.detail}</p>
            </li>
          ))}
        </ul>

        <Callout tone="caution" title="This public preview has clear limits">
          <ul className={styles.plainList} role="list">
            <li>No accounts, verification codes or stored submissions</li>
            <li>No project records are requested by these public pages</li>
            <li>No device control, guaranteed savings or financial commitments</li>
          </ul>
        </Callout>
        <div className={styles.storyLinks}>
          <ActionLink href="/app" variant="secondary">Open workspace</ActionLink>
        </div>
      </Section>

      <Section
        id="faq"
        eyebrow="Questions"
        title="Common questions"
        description="What you can explore here, what remains conditional, and where this preview stops."
        tone="sunken"
      >
        <FaqList items={FAQ_ITEMS} />
      </Section>
    </>
  );
}
