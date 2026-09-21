export type PublicStoryTopic = "need" | "opportunity" | "impact";

interface StorySection {
  readonly heading: string;
  readonly body: string;
}

interface PublicStory {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly sectionHeading?: string;
  readonly sections: readonly StorySection[];
  readonly orderedSections?: boolean;
  readonly closing?: string;
  readonly next: PublicStoryTopic;
}

export const STORY_LINKS = [
  { topic: "need", href: "/need", label: "The Need" },
  { topic: "opportunity", href: "/opportunity", label: "The Opportunity" },
  { topic: "impact", href: "/impact", label: "The Impact" },
] as const;

export const PUBLIC_STORIES: Readonly<Record<PublicStoryTopic, PublicStory>> = {
  need: {
    title: "The Need Page",
    paragraphs: [
      "Data centers run on electricity, and they run on a lot of it. They are the engines behind everything from cloud storage to AI. As demand for these services grows, where that electricity comes from becomes an increasingly important question.",
      "Fossil fuels still form part of the electricity mix. That collides with two hard realities. The first is climate: reducing reliance on fossil fuels is part of the transition to a cleaner energy system. The second is that fossil fuels are finite, with limits both to what the ground can supply and to the emissions the planet can absorb.",
      "There is also a human side that often gets left out. Data centers draw on the same grids, land and resources that communities depend on. That can create tension when neighborhoods are asked to host infrastructure without sharing in its benefits.",
      "The ideal is clear, even if it is ambitious: data centers powered entirely by solar and other renewable sources. For the companies that rely on this infrastructure, a sustainable, community-supported power supply is an ambition, not a supply this website has secured.",
      "To bring more solar online, the proposed path is to position communities to generate solar for their own needs first, and then contribute the surplus to powering data centers, where project design and agreements allow. That path aims to do more than clean up the grid. It could accelerate a just transition to a clean economy, one where the communities generating the power share in its value.",
      "SunSum Solar is putting forward one approach to that challenge: bring new solar capacity online while working toward communities participating as owners and partners rather than bystanders. Ownership and partnerships would depend on the people, project structures and agreements involved.",
    ],
    sections: [],
    next: "opportunity",
  },
  opportunity: {
    title: "The Opportunity",
    paragraphs: [
      "There is a proposed way to meet this moment that aims to work for the climate, for communities, and for the companies driving the demand. It starts with a different answer to a simple question: who owns the solar?",
      "SunSum Solar proposes turning community land and rooftops into operating solar projects, then coordinating them as a virtual power plant. Energy and renewable energy certificates (RECs, sometimes called credits) could be sold under the applicable arrangements; they are distinct things. A shared platform is intended to serve as the system of record and workspace. The design aims to lower energy costs and keep ownership and returns in the community through a cooperative structure, subject to project viability and agreed terms.",
      "That ownership choice is the opportunity. The aim is to let people in low-income communities participate in generating and selling energy, so more economic value can stay where the power is made. Participation, ownership and any returns would depend on each project's agreements; using this website does not establish those rights.",
    ],
    sectionHeading: "How the approach works",
    orderedSections: true,
    sections: [
      {
        heading: "Underused assets become solar projects",
        body: "Community rooftops and land could be assessed and, where suitable and approved, developed into operating solar capacity.",
      },
      {
        heading: "Individual projects aggregate into a virtual power plant",
        body: "On their own, scattered sites are small. Coordinated together, they could participate in energy and REC arrangements at a larger scale. The sites remain separate physical projects; coordination does not itself establish market access or a single physical power plant.",
      },
      {
        heading: "A cooperative structure holds the ownership",
        body: "The proposed cooperative structure would let a community hold ownership collectively and route eligible returns locally. Its ownership, participation and distribution terms would need to be agreed; they are not created by this preview.",
      },
      {
        heading: "The platform coordinates everyone",
        body: "The platform is intended to serve as a system of record and shared workspace for residents, developers and buyers. Each participant would see the information they are permitted to access, rather than every record being visible to everyone.",
      },
    ],
    closing:
      "The reason this matters is leverage. The approach aims to connect more solar, community wealth, cleaner supply for data centers and a transition away from fossil fuels, rather than treating them as separate goals. The next page, the impact, explores those potential outcomes.",
    next: "impact",
  },
  impact: {
    title: "The Impact",
    paragraphs: [
      "If communities generate their own solar and contribute to the electricity supply that runs data centers, the potential payoff reaches beyond cleaner electricity. The intended outcomes land in three places at once.",
    ],
    sections: [
      {
        heading: "For people",
        body: "Households that have been asked to host energy infrastructure without sharing in its benefit could gain a stake. Lower energy costs and local ownership are goals, not guaranteed results. The ambition is to shift the relationship between communities and the data center industry from tension toward partnership, with residents participating as owners and suppliers where agreed project terms make that possible.",
      },
      {
        heading: "For the economy",
        body: "Where projects produce distributable returns and agreements keep them local, those returns could circulate inside the community and help build local wealth. AI companies, corporations and cities could also pursue a more sustainable, community-supported supply. Shared value is the aim; neither a stable supply nor a financial benefit for every participant is assured.",
      },
      {
        heading: "For the environment",
        body: "Projects brought online could add renewable capacity and help reduce reliance on finite fossil fuels. Scaled across communities, they could raise solar's share of the energy mix while supporting local economic participation. The environmental outcome depends on what is built and how the energy system uses it; this is not a report of achieved displacement or measured emissions reductions.",
      },
    ],
    closing:
      "Taken together, the intended impact is one reinforcing result: healthier communities, a stronger and fairer local economy, and progress on the climate problem, all from the same approach.",
    next: "need",
  },
};
