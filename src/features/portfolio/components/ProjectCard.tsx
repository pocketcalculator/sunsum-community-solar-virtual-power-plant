import { Badge } from "@/components/ui/Badge";
import {
  formatFundingNeeds,
  formatRange,
  formatVocabulary,
  type PortfolioProjectView,
} from "../model/view";
import styles from "./ProjectCard.module.css";

interface ProjectCardProps {
  project: PortfolioProjectView;
}

/** The only viability the service treats as a positive signal. */
const PROMISING = "potentially_viable";

/**
 * One project at disclosure tier 0.
 *
 * Reads as a summary rather than a record: a name, where it roughly is, how
 * far along it is, and how big it might be. There is no link to a detail view
 * because there is no tier that would let this investor open one yet.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  const facts = [
    {
      term: "Site type",
      detail: formatVocabulary(project.siteType),
    },
    {
      term: "Project type",
      detail:
        project.projectType === null
          ? "Not yet classified"
          : formatVocabulary(project.projectType),
    },
    {
      term: "Estimated system size",
      detail: formatRange(
        project.systemSizeKwLow,
        project.systemSizeKwHigh,
        "kW",
      ),
    },
    {
      term: "Estimated annual generation",
      detail: formatRange(
        project.annualGenerationKwhLow,
        project.annualGenerationKwhHigh,
        "kWh",
      ),
    },
  ] as const;

  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.name}>{project.name}</h3>
        <p className={styles.locality}>{project.locality}</p>
      </div>

      <div className={styles.tags}>
        <Badge tone="neutral">{formatVocabulary(project.stage)}</Badge>
        <Badge tone={project.viability === PROMISING ? "accent" : "neutral"}>
          {formatVocabulary(project.viability)}
        </Badge>
      </div>

      <dl className={styles.facts}>
        {facts.map((fact) => (
          <div className={styles.fact} key={fact.term}>
            <dt className={styles.term}>{fact.term}</dt>
            <dd className={styles.detail}>{fact.detail}</dd>
          </div>
        ))}
      </dl>

      <p className={styles.funding}>
        {formatFundingNeeds(project.openFundingNeeds)}
      </p>
    </li>
  );
}
