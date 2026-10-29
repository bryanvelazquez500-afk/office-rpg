// Coworker chat answers, all built into the game (no AI service, nothing to pay
// for). A coworker answers from:
//   - the GAAP hint library (gaap.ts HINTS)
//   - the assignments in the player's inbox (a nudge, then the full entry)
//   - quiz questions they've already been asked (for review, never ahead of time)
//   - a set of everyday questions about the exam, the firm and audit basics
// Typed questions are matched to the closest answer by keywords.

import { NPCS, type NpcProfile } from "./characters";
import { HINTS, TASKS } from "./gaap";
import { INQUIRIES } from "./OfficeLunchAndTools";

export interface ChatAnswer {
  id: string;
  question: string; // shown on the suggestion buttons
  answer: string;
  keywords: string;
  experts: string[]; // coworker ids who know this best; empty = anyone
}

/** What each coworker is known for, used for "ask Dana" style referrals. */
const SPECIALTY: Record<string, string> = {
  eleanor: "firm leadership and audit opinions",
  priya: "anything about the office itself",
  marcus: "audit fieldwork and financial accounting",
  dana: "tax",
  gwen: "advisory work and business analysis",
  theo: "IT systems and controls",
  sofia: "HR, payroll and benefits",
};

const EVERYDAY: ChatAnswer[] = [
  {
    id: "cpa-structure",
    question: "How is the CPA exam set up?",
    answer:
      "Since 2024 everyone takes three core sections, FAR, AUD and REG, plus one discipline you choose: BAR, ISC or TCP. Each section is four hours and you need a 75 on each. Your state board sets how long you have to pass the rest after your first pass; many now allow 30 months.",
    keywords: "cpa exam sections structure discipline core pass score 75 bar isc tcp far aud reg window",
    experts: [],
  },
  {
    id: "cpa-study",
    question: "Any tips for studying for the CPA exam?",
    answer:
      "Book your exam date first so the plan is real, then study in steady daily blocks with a review course. Do lots of multiple-choice and simulations, and redo every question you miss until you can explain why the right answer is right. FAR is the biggest section, so plenty of people take it first while coursework is fresh.",
    keywords: "study tips cpa exam prepare review course plan schedule far first pass",
    experts: [],
  },
  {
    id: "busy-season",
    question: "What's busy season like?",
    answer:
      "For audit it's roughly January through mid-April, when all the calendar year-end clients need their audits done. Expect long days and some Saturdays. Summer is calmer, and fall is planning and interim testing.",
    keywords: "busy season hours overtime january april schedule long days",
    experts: [],
  },
  {
    id: "materiality",
    question: "What is materiality?",
    answer:
      "A misstatement is material if it could reasonably change the decisions of someone relying on the financial statements. We set overall materiality, often a percentage of a benchmark like pre-tax income or revenue, and a lower performance materiality to leave a cushion for errors we don't catch.",
    keywords: "materiality material misstatement benchmark performance threshold",
    experts: ["marcus", "gwen", "eleanor"],
  },
  {
    id: "tick-marks",
    question: "What are tick marks?",
    answer:
      "Small symbols next to numbers in a workpaper that show what you did: traced to the invoice, footed, agreed to the bank statement. Every tick mark needs a legend so the reviewer knows what it means.",
    keywords: "tick marks workpaper legend symbols footed traced agreed documentation",
    experts: ["marcus"],
  },
  {
    id: "three-way-match",
    question: "What's a three-way match?",
    answer:
      "Before a vendor gets paid, compare the purchase order (what was ordered), the receiving report (what arrived) and the vendor invoice (what was billed). If quantities and prices agree across all three, the payment is supported. It's a key control over purchases and accounts payable.",
    keywords: "three way match purchase order receiving report invoice vendor payable control",
    experts: ["marcus"],
  },
  {
    id: "assertions",
    question: "What are the financial statement assertions?",
    answer:
      "For account balances: existence, rights and obligations, completeness, and accuracy, valuation and allocation. For transactions: occurrence, completeness, accuracy, cutoff and classification. There are presentation and disclosure assertions too. Every audit procedure is aimed at specific assertions.",
    keywords: "assertions existence completeness occurrence cutoff valuation rights obligations classification audit",
    experts: ["marcus", "gwen"],
  },
  {
    id: "accrual-cash",
    question: "What's the difference between accrual and cash basis?",
    answer:
      "Cash basis records revenue when cash comes in and expenses when cash goes out. Accrual basis records revenue when it's earned and expenses when they're incurred, whenever the cash moves. GAAP requires accrual, which is why we make adjusting entries at period-end.",
    keywords: "accrual cash basis difference revenue expense earned incurred adjusting entries gaap",
    experts: [],
  },
  {
    id: "trial-balance",
    question: "What does a trial balance tell me?",
    answer:
      "It lists every account's ending balance and checks that total debits equal total credits. Balanced doesn't mean correct, though: posting to the wrong account or skipping an entry still balances. It's the starting point for adjusting entries and the financial statements.",
    keywords: "trial balance debits credits equal balanced accounts",
    experts: [],
  },
  {
    id: "bank-rec",
    question: "How do I do a bank reconciliation?",
    answer:
      "Work both sides. Adjust the bank balance for deposits in transit and outstanding checks. Adjust the book balance for what the bank knows that you don't yet: service fees, NSF checks, interest, collections. The two adjusted balances should match, and only the book-side items need journal entries.",
    keywords: "bank reconciliation rec deposits transit outstanding checks nsf service fee book balance",
    experts: ["marcus"],
  },
  {
    id: "tax-due-dates",
    question: "When are business tax returns due?",
    answer:
      "For calendar-year filers, partnerships (Form 1065) and S corporations (Form 1120-S) are due March 15. C corporations (Form 1120) and individuals (Form 1040) are due April 15. An extension generally gives six more months to file, but not to pay.",
    keywords: "tax return due date deadline 1065 1120 1120s 1040 partnership corporation extension march april",
    experts: ["dana"],
  },
  {
    id: "debits-credits",
    question: "How do I remember debits and credits?",
    answer:
      "Debits go on the left and credits on the right. Assets and expenses increase with a debit; liabilities, equity and revenue increase with a credit. Every entry's debits must equal its credits.",
    keywords: "debit credit remember left right increase decrease normal balance",
    experts: [],
  },
  {
    id: "journal-entry",
    question: "How do I write a journal entry?",
    answer:
      "Figure out which accounts changed and in which direction, then list the debits first and the credits indented below, with amounts that balance. Add a short description so a reviewer knows why. Ask yourself: what did we get, and what did we give up?",
    keywords: "journal entry write record post debit credit accounts",
    experts: [],
  },
  {
    id: "first-year",
    question: "Any advice for my first year?",
    answer:
      "Ask questions early, and bring your best guess with them. Keep notes on how each client does things. Check your own work before handing it in, and when you finish something, ask what's next. People remember the staff who make their review easy.",
    keywords: "advice first year new hire tips succeed career staff",
    experts: [],
  },
];

const STOP = new Set(
  "a an the is are was were be been to of in on for and or but with about how what why when where who which do does did can could should would i me my we our you your it its this that these those there their them they at by from as so if any some just like get got have has had help explain tell know mean means".split(
    " ",
  ),
);

/** Lowercase words with simple plural/verb endings trimmed, minus filler words. */
function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, "") || w);
}

const firstName = (id: string) => NPCS.find((n) => n.id === id)?.name.split(" ")[0] ?? "someone";

function hintAnswers(): ChatAnswer[] {
  return Object.values(HINTS).map((h) => ({
    id: `hint-${h.id}`,
    question: `Can you explain ${h.title.toLowerCase()}?`,
    answer: [h.rule, h.formula.length ? `The key formula: ${h.formula[0]}.` : "", h.notes?.[0] ?? "", `(${h.source})`]
      .filter(Boolean)
      .join(" "),
    keywords: `${h.id.replaceAll("-", " ")} ${h.title} ${h.rule} ${h.formula.join(" ")}`,
    experts: [],
  }));
}

function taskAnswers(taskIds: string[]): ChatAnswer[] {
  return taskIds.flatMap((id) => {
    const task = TASKS[id];
    if (!task) return [];
    const concepts = task.hints.map((h) => HINTS[h]?.title.toLowerCase()).filter(Boolean);
    const figures =
      task.evidence.length > 1
        ? `${task.evidence.slice(0, -1).join(", ")} and ${task.evidence.at(-1)}`
        : task.evidence[0];
    const entry = task.steps
      .map((step) => {
        const lines = Object.entries(step.expected).map(([account, amount]) =>
          amount >= 0
            ? `Dr ${account} $${amount.toLocaleString("en-US")}`
            : `Cr ${account} $${(-amount).toLocaleString("en-US")}`,
        );
        return `${step.label}: ${lines.join(", ")}`;
      })
      .join(". ");
    const keywords = `${task.title} ${task.keyLabel} ${concepts.join(" ")} assignment task stuck`;
    return [
      {
        id: `task-${id}-start`,
        question: `Where do I start on "${task.title}"?`,
        answer: `Start with ${concepts.join(" and ")}. The figures to tick in the email are ${figures}. Work out the ${task.keyLabel.toLowerCase()} on the calculator first, then post the entry in LedgerLite. If you're still stuck, ask me to walk you through it.`,
        keywords,
        experts: [],
      },
      {
        id: `task-${id}-walkthrough`,
        question: `Walk me through "${task.title}"`,
        answer: `Sure. The ${task.keyLabel.toLowerCase()} comes to $${task.keyAmount.toLocaleString("en-US")}. ${entry}. Debits equal credits, so you're ready to post it and staple your calculator tape.`,
        keywords: `${keywords} walk through answer entry solution amount`,
        experts: [],
      },
    ];
  });
}

function quizAnswers(askedIds: string[]): ChatAnswer[] {
  return INQUIRIES.filter((q) => askedIds.includes(q.id)).map((q) => ({
    id: `quiz-${q.id}`,
    question: `About that ${q.topic} question: ${q.prompt}`,
    answer: `The answer was "${q.choices[q.answer]}". ${q.explanation}`,
    keywords: `${q.topic} ${q.prompt} ${q.choices.join(" ")} ${q.explanation}`,
    experts: q.askers,
  }));
}

function personalAnswers(npc: NpcProfile): ChatAnswer[] {
  const first = npc.name.split(" ")[0];
  const directory = NPCS.filter((n) => n.id !== npc.id)
    .map((n) => `${n.name.split(" ")[0]} for ${SPECIALTY[n.id] ?? n.department}`)
    .join("; ");
  return [
    {
      id: "about-you",
      question: `What do you do here, ${first}?`,
      answer: `I'm the ${npc.role} in ${npc.department}. ${npc.bio} ${npc.greeting}`,
      keywords: "yourself role job title background department",
      experts: [],
    },
    {
      id: "who-to-ask",
      question: "Who should I ask about what?",
      answer: `Come to me for ${SPECIALTY[npc.id] ?? npc.department}. Otherwise: ${directory}.`,
      keywords: "who ask whom specialty handles coworker team people",
      experts: [],
    },
  ];
}

export interface ChatKnowledge {
  all: ChatAnswer[];
  /** A few questions worth offering as buttons, most useful first. */
  suggestions: ChatAnswer[];
}

export function knowledgeFor(npc: NpcProfile, taskIds: string[], askedIds: string[]): ChatKnowledge {
  const tasks = taskAnswers(taskIds);
  const quiz = quizAnswers(askedIds);
  const all = [...personalAnswers(npc), ...tasks, ...quiz, ...EVERYDAY, ...hintAnswers()];
  const mine = all.filter((a) => a.experts.includes(npc.id));
  const suggestions = [
    ...tasks.filter((a) => a.id.endsWith("-start")).slice(-2),
    ...mine.slice(0, 2),
    ...EVERYDAY.slice(0, 2),
    all[0],
  ];
  return { all, suggestions: [...new Map(suggestions.map((a) => [a.id, a])).values()].slice(0, 5) };
}

/**
 * Best answer for a typed question, or null if nothing matches. Rare words count for
 * more than common ones, so "CECL" outweighs "work" or "account".
 */
export function findAnswer(question: string, knowledge: ChatKnowledge): ChatAnswer | null {
  const asked = new Set(words(question));
  if (!asked.size) return null;
  const vocabs = knowledge.all.map((a) => new Set(words(`${a.question} ${a.keywords}`)));
  const weight = (w: string) => Math.log(1 + knowledge.all.length / vocabs.filter((v) => v.has(w)).length);
  let best: ChatAnswer | null = null;
  let bestScore = 0;
  knowledge.all.forEach((a, i) => {
    let score = 0;
    for (const w of asked) if (vocabs[i].has(w)) score += weight(w);
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  });
  return best;
}

/** The answer as this coworker says it, with a referral when it's someone else's specialty. */
export function voiceAnswer(npc: NpcProfile, a: ChatAnswer): string {
  if (!a.experts.length || a.experts.includes(npc.id)) return a.answer;
  return `That's more ${firstName(a.experts[0])}'s area, but here's what I know. ${a.answer}`;
}
