import type { CSSProperties } from "react";
import { Callout } from "@/components/ui/Callout";
import { FAQ_ITEMS } from "../faq";
import { EntryPathGrid } from "./EntryPathGrid";
import { FaqList } from "./FaqList";
import { Hero } from "./Hero";
import { JourneyRibbon } from "./JourneyRibbon";
import { Section } from "./Section";
import styles from "./LandingPage.module.css";

const PREREQUISITES = [
  {
    title: "A shared project record",
    detail:
      "One agreed structure for sites, stages and decisions that every workspace reads from.",
  },
  {
    title: "An accepted service contract",
    detail:
      "A stable API, so the interface can show real information instead of describing it.",
  },
  {
    title: "Sign-in and permissions",
    detail:
      "Identity, plus access rules enforced by the service rather than hidden in the interface.",
  },
  {
    title: "A hosted environment",
    detail:
      "Somewhere to run the application, with history for anything that changes a project.",
  },
  {
    title: "Screening rules and data",
    detail:
      "Agreed checks and trusted sources before any site can be assessed.",
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
        id="participate"
        eyebrow="Participation"
        title="Three ways to take part"
        description="Community solar only works when everyone involved can see the same project from their own point of view. Pick the one that matches what you have."
      >
        <EntryPathGrid />
      </Section>

      <Section
        id="journey"
        eyebrow="Delivery journey"
        title="A shared journey, from an offered site to steady operations"
        description="Every project moves through the same sequence, so a site owner, an operator and a financier can all describe progress the same way."
        tone="sunken"
        footnote="These stage names are the shared vocabulary this software is designed around. No project is moving through them on this site."
      >
        <JourneyRibbon />
      </Section>

      <Section
        id="prerequisites"
        eyebrow="What comes next"
        title="What has to land before previews become workspaces"
        description="The interface is deliberately ahead of the platform. These are the pieces it is waiting on."
      >
        <ul className={styles.prerequisites} role="list" style={columns}>
          {PREREQUISITES.map((item) => (
            <li className={styles.prerequisite} key={item.title}>
              <h3 className={styles.prerequisiteTitle}>{item.title}</h3>
              <p className={styles.prerequisiteDetail}>{item.detail}</p>
            </li>
          ))}
        </ul>

        <Callout tone="caution" title="What this build does not do">
          <ul className={styles.plainList} role="list">
            <li>No accounts, sign-in or stored submissions</li>
            <li>No project records, documents or device connections</li>
            <li>No generation, savings or financial figures</li>
          </ul>
        </Callout>
      </Section>

      <Section
        id="faq"
        eyebrow="Questions"
        title="Common questions"
        description="Short answers about what this site is today, and what it is not."
        tone="sunken"
      >
        <FaqList items={FAQ_ITEMS} />
      </Section>
    </>
  );
}
