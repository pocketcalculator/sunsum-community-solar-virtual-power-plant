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
      "No. This is the public foundation of the interface: the home page and the create-profile flow. It sets the structure, language and design the rest of the product will be built on. The three workspaces themselves are not built yet.",
  },
  {
    id: "real-data",
    question: "Does anything here connect to real projects?",
    answer:
      "No. Nothing on this site reads or writes project records, and every example is written to illustrate the design rather than to report a real site.",
  },
  {
    id: "profile",
    question: "What happens if I create a profile?",
    answer:
      "You work through the questions and see your answers collected at the end. Nothing is saved or sent: there is no identity or profile service connected yet, so no account is created and reloading the page clears what you entered.",
  },
  {
    id: "register",
    question: "Can I register a site or sign in today?",
    answer:
      "Not yet. Site intake and sign-in need an agreed data contract and identity setup first. You can walk through creating a profile in the meantime, but it does not sign you in.",
  },
  {
    id: "audience",
    question: "Who is Sunsum for?",
    answer:
      "Three groups: people who can offer a site, the operators who run community projects, and the financiers who fund them. Each gets a workspace shaped around what they actually need to do.",
  },
  {
    id: "built",
    question: "How is this page built?",
    answer:
      "It is server-rendered with Next.js and React and uses native browser controls, including this list of questions, so reading the page does not depend on client-side JavaScript. It is designed for keyboard use, strong contrast and reduced motion, and has not yet been through a formal accessibility audit.",
  },
];
