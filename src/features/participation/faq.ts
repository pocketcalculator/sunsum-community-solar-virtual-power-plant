export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

/** Answers describe only what this build actually does today. */
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: "finished",
    question: "Is this the finished product?",
    answer:
      "No. These public pages explain a proposed community-energy approach and offer a fictional profile preview. The connected workspace is read-only and depends on authorized access; a separately labeled synthetic demo uses fictional scenarios. A proposal, an implemented screen and an operating project are different things.",
  },
  {
    id: "real-data",
    question: "Does anything here connect to real projects?",
    answer:
      "These public pages do not request project records. The connected read-only workspace reports its own connection and access status, including when a service is out of reach. Public diagrams, profile examples and separately labeled synthetic scenarios are not real project data.",
  },
  {
    id: "profile",
    question: "What happens in the profile preview?",
    answer:
      "Use fictional details to work through the questions and see your answers at the end. Nothing is saved or sent, no account or code is created, and reloading or leaving clears the draft. Optional learning opens without clearing your unfinished answers.",
  },
  {
    id: "register",
    question: "Can I register a site or sign in today?",
    answer:
      "Not through this public preview. It does not request credentials, register a site or create a session. The read-only workspace requires an established, authorized access path; choosing a participation type here cannot provide one.",
  },
  {
    id: "audience",
    question: "Who is Sunsum for?",
    answer:
      "Site owners, project operators and investors can explore their participation contexts. Researchers, workforce participants and people learning more can use the same education and help without being assigned another workspace or enrolled in a service.",
  },
  {
    id: "built",
    question: "How is this page built?",
    answer:
      "It uses React and native browser controls, including these expandable questions and the optional learning. The design supports keyboard use, reflow and reduced motion. Learning is written guidance, not a staffed conversation or an automated outreach service.",
  },
];
