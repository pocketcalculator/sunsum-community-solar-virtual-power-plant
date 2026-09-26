import styles from "./CommunityContext.module.css";

interface VppEducationProps {
  headingLevel?: 2 | 3;
}

const RELATIONSHIPS = [
  {
    name: "Energy",
    direction: "Solar sites, the connected grid, and electricity users",
    explanation:
      "Solar projects generate electricity. Grid connections and operating agreements govern where it can flow. A virtual power plant coordinates eligible sites; it is not one physical plant, and this page does not dispatch devices.",
    boundary:
      "Grid-tied solar alone is not backup power. Outage operation would require suitable equipment, design and approvals.",
  },
  {
    name: "Renewable energy certificates (RECs)",
    direction: "Verified generation attributes, their holders, and their claims",
    explanation:
      "A REC represents renewable generation attributes, not the physical electricity itself or guaranteed delivery to a particular buyer. Energy and RECs can follow different arrangements.",
    boundary:
      "Issuance, ownership, transfer and retirement depend on the applicable tracking system and agreements. The same attribute must not be claimed twice.",
  },
  {
    name: "Capital",
    direction: "Funders, project costs, and any agreed distributions",
    explanation:
      "Capital can fund development and equipment. Costs, ownership and any distributions depend on the project's terms and results.",
    boundary:
      "An expression of interest is not funding. Exploring this website creates no financial commitment, ownership right or promised return.",
  },
  {
    name: "Information and data",
    direction: "Permitted sources and participants, with scoped access",
    explanation:
      "Site details, assessments, documents and operating information help people coordinate. Their source, age and permitted audience matter; sharing a workspace does not mean everyone can see every record.",
    boundary:
      "Access to information is different from ownership or permission to change a project. This learning page requests no project data.",
  },
  {
    name: "Responsibilities",
    direction: "Site owners, operators, funders, and relevant service parties",
    explanation:
      "People need to agree who maintains equipment, obtains approvals, protects information and makes decisions. Grid and service parties also have responsibilities under the applicable arrangements.",
    boundary:
      "A role label is not authority. This diagram does not assign legal duties, approve a project or authorize energy control.",
  },
] as const;

export function VppEducation({ headingLevel = 2 }: VppEducationProps = {}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <section className={styles.education} aria-label="Virtual power plant learning">
      <Heading className={styles.sectionTitle}>
        How a virtual power plant fits together
      </Heading>
      <p>
        A virtual power plant, or VPP, coordinates separate energy resources.
        Understanding it means separating what moves, who can claim it, and who
        is responsible. These are proposed relationships, not operating results.
      </p>

      <figure className={styles.relationships}>
        <figcaption className={styles.diagramCaption}>
          Five relationships, not one flow
        </figcaption>
        <dl className={styles.relationshipList}>
          {RELATIONSHIPS.map((relationship) => (
            <div className={styles.relationship} key={relationship.name}>
              <dt>{relationship.name}</dt>
              <dd>
                <p className={styles.direction}>{relationship.direction}</p>
                <p>{relationship.explanation}</p>
                <p className={styles.boundary}>{relationship.boundary}</p>
              </dd>
            </div>
          ))}
        </dl>
      </figure>
    </section>
  );
}
