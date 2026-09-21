/**
 * The Need, Opportunity and Impact pages.
 *
 * The prose is the copy supplied by the team, kept as data rather than JSX so
 * that a wording change is an edit to a string and never to a component. Only
 * transcription artefacts have been tidied; nothing has been added, and no
 * figure, target or claim appears here that was not in the supplied text.
 *
 * `audio` is `null` on every page and is meant to be. Each page is intended to
 * carry a short music clip, but the clips discussed are commercial recordings
 * that this repository has no licence for and no asset file. The player is
 * built and renders nothing until a cleared file is configured, so adding one
 * is a content change rather than a code change.
 */

export interface ContextPagePoint {
  readonly title: string;
  readonly detail: string;
}

export interface ContextPageSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly points: readonly ContextPagePoint[];
}

export interface ContextPageAudio {
  /** Path to a licensed audio file served by this application. */
  readonly src: string;
  readonly title: string;
  /** Attribution shown beside the player. Required, never blank. */
  readonly credit: string;
}

export interface ContextPageContent {
  readonly id: ContextPageId;
  readonly href: string;
  readonly navLabel: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly ContextPageSection[];
  readonly audio: ContextPageAudio | null;
}

export type ContextPageId = "need" | "opportunity" | "impact";

const NEED: ContextPageContent = {
  id: "need",
  href: "/need",
  navLabel: "The Need",
  eyebrow: "The need",
  title: "Where the power for data centres comes from",
  summary:
    "Demand for electricity is growing and cannot pause. Where that electricity comes from is one of the most important questions of this decade.",
  sections: [
    {
      heading: "Two hard realities",
      paragraphs: [
        "Data centres run on electricity, and they run on a lot of it. They are the engines behind everything from cloud storage to AI, and that demand cannot pause. The constant, heavy need for power is only growing, which makes where the electricity comes from one of the most important questions of this decade.",
        "Right now, much of it still comes from fossil fuels. That collides with two hard realities.",
      ],
      points: [
        {
          title: "Climate",
          detail:
            "Getting off fossil fuels is no longer an option. It is the direction the entire energy system has to move.",
        },
        {
          title: "Supply",
          detail:
            "Fossil fuels are limited, both in what the planet can absorb and in what the ground can supply. Leaning on them to power an ever-expanding fleet of data centres is a path that runs out.",
        },
      ],
    },
    {
      heading: "The human side",
      paragraphs: [
        "There is also a human side that often gets left out. Data centres land in communities and draw on the same grids, land and resources those communities depend on. That creates real tension: neighbourhoods are asked to host infrastructure without sharing in its benefits.",
      ],
      points: [],
    },
    {
      heading: "The ideal, and the gap",
      paragraphs: [
        "The ideal is clear, even if it is ambitious: data centres powered entirely by solar and other renewable sources, for AI companies and the data centre industry as a whole. That is not only good for the climate. It is their direct interest — a stable, sustainable, community-supported power supply for infrastructure they cannot run without.",
        "But there is only a limited supply of solar online today. To close that gap, communities need to be positioned to generate solar for their own needs first, and then contribute the surplus to power data centres, building towards the goal of 100% solar.",
        "That path does more than clean up the grid. It accelerates a just transition to a clean energy economy, one where the communities generating the power share in its value. Getting more solar online at that scale will not happen through business as usual. It takes the approach Sunsum Solar is putting forward: one that brings new solar capacity online while keeping communities as owners and partners rather than bystanders.",
      ],
      points: [],
    },
  ],
  audio: null,
};

const OPPORTUNITY: ContextPageContent = {
  id: "opportunity",
  href: "/opportunity",
  navLabel: "The Opportunity",
  eyebrow: "The opportunity",
  title: "One approach that works for climate, communities and companies",
  summary:
    "Turning community land and rooftops into operating solar projects, aggregated into a virtual power plant the community owns.",
  sections: [
    {
      heading: "A different model",
      paragraphs: [
        "There is a way to meet this moment that works for the climate, for communities, and for the companies driving the demand. Sunsum Solar turns community land and rooftops into operating solar projects, and aggregates them into a virtual power plant that sells energy and renewable energy credits. A shared platform sits underneath it all as the system of record and the workspace for everyone involved.",
        "What makes the model different is ownership. The goal is to lower energy costs in communities by turning underused rooftops and land into revenue-producing solar projects, and to keep ownership and the returns in the community through a cooperative structure. Rather than letting an outside operator take the asset, the way it usually goes, this is infrastructure that lets people in low-income communities generate their own energy and sell it.",
        "Most sustainability conversations stop at the environmental piece. This one puts the economic piece front and centre, so communities can own it and bounce back.",
      ],
      points: [],
    },
    {
      heading: "Feed three birds with one seed",
      paragraphs: [
        "Building a community-owned solar virtual power plant accomplishes several things at once, with a single move.",
      ],
      points: [
        {
          title: "Communities generate their own energy",
          detail:
            "Underused land and rooftops become productive solar capacity, adding clean energy to the grid that would not otherwise exist.",
        },
        {
          title: "That new solar feeds the data centre energy base",
          detail:
            "The surplus communities generate can contribute directly to powering data centres, steadily raising solar's share towards the goal of 100%.",
        },
        {
          title: "It accelerates the shift to a community economy",
          detail:
            "Ownership and returns stay local, so the build-out moves wealth and control into communities instead of out of them.",
        },
        {
          title: "It repairs the relationship with data centres",
          detail:
            "Neighbourhoods go from hosting infrastructure they get nothing from to being partners and suppliers in it, which is a better position for companies too.",
        },
        {
          title: "It makes communities more resilient",
          detail:
            "Local generation means communities are less exposed when the wider grid strains or fails.",
        },
        {
          title: "It helps get us off fossil fuels",
          detail:
            "Every project brought online through this model is clean capacity replacing dirty fuel, which is how climate change is fought in practice rather than in theory.",
        },
      ],
    },
    {
      heading: "In short",
      paragraphs: [
        "That is the opportunity: one approach that brings more solar online, keeps the value in the community, strengthens the energy supply data centres depend on, and moves us off fossil fuels — all at the same time.",
      ],
      points: [],
    },
  ],
  audio: null,
};

const IMPACT: ContextPageContent = {
  id: "impact",
  href: "/impact",
  navLabel: "The Impact",
  eyebrow: "The impact",
  title: "What changes when communities own the power",
  summary:
    "The outcomes reach beyond cleaner electricity, and show up in three places at once: in people's lives, in the economy, and in the environment.",
  sections: [
    {
      heading: "Three places at once",
      paragraphs: [
        "If communities generate their own solar and feed it into the power that runs data centres, the outcomes reach beyond cleaner electricity. The impact shows up in three places at once.",
      ],
      points: [],
    },
    {
      heading: "For people",
      paragraphs: [
        "Families and neighbourhoods that have long been asked to host infrastructure without sharing in its benefits finally get a stake. They generate their own energy, they see lower energy costs, and they gain real energy resilience, so a strained or failing grid does not leave them in the dark.",
        "The relationship between communities and the data centre industry shifts from tension to partnership, with residents as owners and suppliers rather than bystanders. Ownership stays local, which means the people doing the work and hosting the projects are the ones who benefit from them.",
      ],
      points: [],
    },
    {
      heading: "For the economy",
      paragraphs: [
        "Underused land and rooftops become revenue-generating assets. Because the cooperative structure keeps ownership and returns in the community, that revenue circulates locally instead of flowing out to an outside operator. This accelerates the shift to a community economy, one where wealth is built and held by the people who generate the power.",
        "For the AI companies, corporations and cities on the other side of the question, it means a stable, sustainable, community-supported power supply for infrastructure they cannot run without — which protects their bottom line too. It is a shared-value model, where everyone at the table comes out ahead.",
      ],
      points: [],
    },
    {
      heading: "For the environment",
      paragraphs: [
        "Every project brought online is new energy capacity that replaces fossil fuel. Scaled across many communities, that steadily raises solar's share of the energy mix towards the goal of 100%, and directly helps get us off fossil fuels in the effort to combat climate change.",
        "This is sustainability with the economic piece built in: not clean energy at the community's expense, but clean energy the community owns.",
      ],
      points: [],
    },
    {
      heading: "Put together",
      paragraphs: [
        "Put together, the impact is a single reinforcing outcome — healthier communities, a stronger and fairer local economy, and a real dent in the climate problem, all from the same approach.",
      ],
      points: [],
    },
  ],
  audio: null,
};

export const CONTEXT_PAGES: readonly ContextPageContent[] = [
  NEED,
  OPPORTUNITY,
  IMPACT,
];

export function contextPage(id: ContextPageId): ContextPageContent {
  const page = CONTEXT_PAGES.find((candidate) => candidate.id === id);
  /**
   * `CONTEXT_PAGES` is a closed list and `ContextPageId` is its key type, so
   * this cannot be reached through the type system. It throws rather than
   * returning a placeholder because a missing page is a build-time mistake,
   * not something a visitor should discover as empty prose.
   */
  if (page === undefined) throw new Error(`Unknown context page: ${id}`);
  return page;
}
