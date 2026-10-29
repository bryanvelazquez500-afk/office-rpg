"use client";

import { useEffect, useState } from "react";
import type { NpcProfile, SpritePalette } from "./characters";
import { sfx } from "./sound";

type Tile = [number, number];

// ---------------------------------------------------------------------------
// Office clock: you clock in at 9:00 AM and one office minute passes every two
// real seconds, so there's time to work each assignment properly. The lunch
// hour runs faster so the break isn't a wait. The clock value counts office
// minutes since midnight of day 1, so it keeps rising from one workday to the next.
// ---------------------------------------------------------------------------
const MINUTES_PER_DAY = 24 * 60;
export const CLOCK_IN = 9 * 60;
export const OFFICE_MINUTES_PER_SECOND = 0.5;

export const minuteOfDay = (clock: number) => Math.floor(clock) % MINUTES_PER_DAY;
export const dayNumber = (clock: number) => Math.floor(clock / MINUTES_PER_DAY);
/** Clock value for clocking in on the given workday (0 = first day). */
export const clockInAt = (day: number) => day * MINUTES_PER_DAY + CLOCK_IN;

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const formatClock = (clock: number) => formatMinutes(minuteOfDay(clock));

// ---------------------------------------------------------------------------
// Work calendar: day 1 is the player's real-life date (or the next Monday on a
// weekend); each workday after that skips weekends. Clock-out follows the
// public accounting (assurance) season for that date.
// ---------------------------------------------------------------------------
export interface Season {
  name: string;
  clockOut: number; // minute of day
  note: string;
}

export function firstWorkday(today: Date) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function workdayDate(first: Date, day: number) {
  const d = new Date(first);
  for (let left = day; left > 0; ) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

export function seasonFor(date: Date): Season {
  const md = (date.getMonth() + 1) * 100 + date.getDate(); // e.g. Apr 15 -> 415
  if (md <= 131) return { name: "Busy season kickoff", clockOut: 18 * 60 + 30, note: "Year-end audit fieldwork ramps up." };
  if (md <= 315) return { name: "Peak busy season", clockOut: 20 * 60, note: "Calendar year-end audits in full swing." };
  if (md <= 415) return { name: "Busy season close-out", clockOut: 19 * 60, note: "Wrapping audits before the April 15 deadline." };
  if (md <= 531) return { name: "Post-busy season", clockOut: 17 * 60, note: "Catching up, training and comp time." };
  if (md <= 831) {
    const friday = date.getDay() === 5;
    return {
      name: "Summer slow season",
      clockOut: friday ? 13 * 60 : 17 * 60,
      note: friday ? "Summer Friday: half day." : "Lighter workload; interim reviews.",
    };
  }
  if (md <= 1015) return { name: "Extension season", clockOut: 18 * 60, note: "Sept 15 / Oct 15 extensions and interim audit work." };
  if (md <= 1130) return { name: "Fall planning season", clockOut: 17 * 60 + 30, note: "Audit planning and interim testing." };
  return { name: "Year-end planning", clockOut: 17 * 60 + 30, note: "Prepping clients for year-end close." };
}

export interface WorkdayView {
  day: number; // 0-based
  date: Date;
  season: Season;
}

// ---------------------------------------------------------------------------
// Coworker help requests
// ---------------------------------------------------------------------------
/** CPA exam sections: coworkers' questions double as a study session. */
export type InquiryTopic = "FAR" | "AUD" | "REG" | "BAR" | "ISC";

export const TOPIC_NAMES: Record<InquiryTopic, string> = {
  FAR: "Financial Accounting & Reporting",
  AUD: "Auditing & Attestation",
  REG: "Taxation & Regulation",
  BAR: "Business Analysis & Reporting",
  ISC: "Information Systems & Controls",
};

/**
 * Sections coworkers currently ask about: the three core sections everyone takes.
 * BAR and ISC (disciplines) are paused; add them back here to include their questions.
 */
export const ACTIVE_TOPICS: InquiryTopic[] = ["FAR", "AUD", "REG"];

/** Question difficulty, by Inquiry.level (1-3). */
export const LEVEL_NAMES = ["Basics", "Working knowledge", "Exam-ready"] as const;

/** "a FAR question", "an AUD question" */
export const withArticle = (topic: InquiryTopic) => `${/^[AEIO]/.test(topic) ? "an" : "a"} ${topic}`;

export interface Inquiry {
  id: string;
  topic: InquiryTopic;
  level: 1 | 2 | 3; // see LEVEL_NAMES; studyPlan.ts decides when each level comes up
  askers: string[]; // NPC ids that can bring this question to the player's desk
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
}

export const INQUIRIES: Inquiry[] = [
  {
    id: "deposit-in-transit",
    topic: "AUD",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "The client's Dec 31 bank rec has a $4,200 deposit in transit. What's our best evidence that it's legit?",
    choices: [
      "Ask the controller to confirm it verbally",
      "Trace it to the January cutoff bank statement",
      "Recalculate the ending book balance",
    ],
    answer: 1,
    explanation:
      "The cutoff statement comes straight from the bank and shows the deposit clearing in early January, which is independent evidence of timing and amount.",
  },
  {
    id: "ar-existence",
    topic: "AUD",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "I need to test accounts receivable for existence. Which procedure should I lead with?",
    choices: [
      "Send positive confirmations to customers",
      "Trace shipping documents into the sales journal",
      "Recompute the allowance for doubtful accounts",
    ],
    answer: 0,
    explanation:
      "Confirmations test whether the recorded balances really exist. Tracing from shipping docs into the journal goes the other direction and tests completeness.",
  },
  {
    id: "unrecorded-liabilities",
    topic: "AUD",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "Quick one: a search for unrecorded liabilities mainly addresses which assertion?",
    choices: ["Existence", "Valuation", "Completeness"],
    answer: 2,
    explanation:
      "We look at January disbursements and unpaid invoices to find liabilities that should have been recorded at year-end. That's completeness.",
  },
  {
    id: "count-tags",
    topic: "AUD",
    level: 1,
    askers: ["marcus"],
    prompt: "Pre-numbered inventory count tags #1041–1045 are missing from the count sheets. Why do I care?",
    choices: [
      "Tags are only for convenience, so it doesn't matter",
      "Without tag control, items could be left out or fake counts added",
      "It only affects the gross margin calculation",
    ],
    answer: 1,
    explanation:
      "Accounting for every tag number is the control over the count. Missing tags mean inventory could be understated, or overstated with fictitious tags.",
  },
  {
    id: "trivial-misstatement",
    topic: "AUD",
    level: 2,
    askers: ["gwen", "marcus"],
    prompt: "Overall materiality is $50,000 and we found a $3,000 known misstatement. What do we do with it?",
    choices: [
      "Ignore it because it's below materiality",
      "Issue a qualified opinion",
      "Accumulate it on the summary of uncorrected misstatements",
    ],
    answer: 2,
    explanation:
      "Anything above the clearly-trivial threshold (usually ~3–5% of materiality) gets accumulated. Individually small items can add up to something material.",
  },
  {
    id: "meals",
    topic: "REG",
    level: 1,
    askers: ["dana"],
    prompt: "Client took a customer to a $120 business lunch this year. How much can they deduct?",
    choices: ["$0", "$60", "$120"],
    answer: 1,
    explanation:
      "Business meals are generally 50% deductible. The temporary 100% deduction for restaurant meals expired after 2022.",
  },
  {
    id: "1065-due-date",
    topic: "REG",
    level: 1,
    askers: ["dana"],
    prompt: "When is a calendar-year partnership's Form 1065 due, without an extension?",
    choices: ["March 15", "April 15", "October 15"],
    answer: 0,
    explanation:
      "Partnership returns are due by the 15th day of the 3rd month after year-end, so March 15. Partners need their K-1s before filing their own returns.",
  },
  {
    id: "holding-period",
    topic: "REG",
    level: 1,
    askers: ["dana"],
    prompt: "Client sold stock held for 11 months at a gain. How is it taxed?",
    choices: [
      "Long-term capital gain at preferential rates",
      "Short-term capital gain at ordinary income rates",
      "It's tax-free if reinvested within 60 days",
    ],
    answer: 1,
    explanation:
      "Long-term treatment needs a holding period of more than one year. At 11 months it's short-term and taxed at ordinary rates.",
  },
  {
    id: "section-179",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "Can a Section 179 deduction create a business loss for the year?",
    choices: [
      "Yes, there's no limit",
      "No, it's limited to business taxable income and the excess carries forward",
      "No, and any excess is lost permanently",
    ],
    answer: 1,
    explanation:
      "Section 179 is capped at taxable income from active trades or businesses. Any disallowed amount carries forward to future years. (Bonus depreciation can create a loss.)",
  },
  {
    id: "gift-card",
    topic: "REG",
    level: 2,
    askers: ["sofia", "dana"],
    prompt: "We gave an employee a $500 gift card as a holiday bonus. Do we run it through payroll as wages?",
    choices: [
      "No, holiday gifts are always de minimis",
      "Only if it's over $1,000",
      "Yes, cash equivalents like gift cards are taxable wages",
    ],
    answer: 2,
    explanation:
      "Gift cards are cash equivalents and never qualify as a de minimis fringe benefit, whatever the amount. They're subject to withholding and payroll taxes.",
  },
  // ---- FAR: Financial Accounting & Reporting ----------------------------------
  {
    id: "far-606-steps",
    topic: "FAR",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "ASC 606 has five steps for recognizing revenue. Which one is step 4?",
    choices: [
      "Determine the transaction price",
      "Allocate the transaction price to the performance obligations",
      "Identify the performance obligations in the contract",
      "Recognize revenue when (or as) each obligation is satisfied",
    ],
    answer: 1,
    explanation:
      "The order is: 1) identify the contract, 2) identify the performance obligations, 3) determine the transaction price, 4) allocate it to the obligations (by relative standalone selling price), 5) recognize revenue as each is satisfied.",
  },
  {
    id: "far-842-finance",
    topic: "FAR",
    level: 3,
    askers: ["marcus", "gwen"],
    prompt: "Under ASC 842, which of these does NOT make a lessee classify a lease as a finance lease?",
    choices: [
      "Ownership transfers to the lessee at the end of the term",
      "The lessee is reasonably certain to exercise a purchase option",
      "The term is a major part of the asset's remaining economic life",
      "The lessee's incremental borrowing rate exceeds the rate implicit in the lease",
    ],
    answer: 3,
    explanation:
      "The five finance-lease tests: ownership transfer, a purchase option reasonably certain to be exercised, a major part of economic life, PV of payments substantially all of fair value, or a specialized asset with no alternative use. The discount rate isn't a test.",
  },
  {
    id: "far-lcnrv",
    topic: "FAR",
    level: 2,
    askers: ["marcus"],
    prompt: "The client uses FIFO. How is ending inventory measured at year-end?",
    choices: [
      "Lower of cost or market (replacement cost with a ceiling and floor)",
      "Lower of cost and net realizable value",
      "Fair value",
      "Net realizable value less a normal profit margin",
    ],
    answer: 1,
    explanation:
      "Inventory under FIFO or average cost uses lower of cost and NRV (ASU 2015-11). The older lower of cost or market test still applies only to LIFO and the retail inventory method.",
  },
  {
    id: "far-bond-premium",
    topic: "FAR",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "Bonds were issued at a premium. Using the effective interest method, what happens to interest expense each period?",
    choices: ["It increases", "It decreases", "It stays constant", "It equals the cash interest paid"],
    answer: 1,
    explanation:
      "Interest expense is carrying value × market rate. Premium amortization pulls the carrying value down toward face each period, so the expense shrinks over the bond's life.",
  },
  {
    id: "far-loss-contingency",
    topic: "FAR",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "When must a loss contingency be accrued under U.S. GAAP?",
    choices: [
      "When it's reasonably possible and can be estimated",
      "When it's probable and can be reasonably estimated",
      "Whenever a lawsuit has been filed",
      "When it's probable, even if no amount can be estimated",
    ],
    answer: 1,
    explanation:
      "Accrue when a loss is probable AND reasonably estimable. If only a range is known with no best estimate, accrue the low end. Reasonably possible losses are disclosed, not accrued; remote ones are generally ignored.",
  },
  {
    id: "far-dtl",
    topic: "FAR",
    level: 2,
    askers: ["marcus", "dana"],
    prompt: "The client depreciates equipment faster for tax than for books. What does that create?",
    choices: ["A deferred tax asset", "A deferred tax liability", "A permanent difference", "A valuation allowance"],
    answer: 1,
    explanation:
      "Taking deductions on the tax return before the books means more taxable income later when the difference reverses. That's a taxable temporary difference, which creates a deferred tax liability.",
  },
  {
    id: "far-goodwill",
    topic: "FAR",
    level: 3,
    askers: ["gwen"],
    prompt: "How is goodwill impairment measured under current U.S. GAAP (ASU 2017-04)?",
    choices: [
      "Compare goodwill's implied fair value to its carrying amount",
      "The amount a reporting unit's carrying amount exceeds its fair value, capped at the goodwill balance",
      "Undiscounted cash flows compared to carrying amount",
      "Goodwill is amortized over 40 years instead of tested",
    ],
    answer: 1,
    explanation:
      "ASU 2017-04 removed the old Step 2 (implied fair value). Impairment is simply the excess of the reporting unit's carrying amount over its fair value, limited to the goodwill allocated to that unit.",
  },
  {
    id: "far-equity-dividends",
    topic: "FAR",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "The client owns 30% of an investee and has significant influence. The investee pays a dividend. What's the entry effect?",
    choices: [
      "Dividend income on the income statement",
      "It reduces the investment account",
      "It increases the investment account",
      "No entry; dividends are ignored",
    ],
    answer: 1,
    explanation:
      "Under the equity method, the investor's share of investee income increases the investment and dividends received decrease it. The dividend is a return of the investment, not income.",
  },
  {
    id: "far-estimate-change",
    topic: "FAR",
    level: 2,
    askers: ["marcus"],
    prompt: "Management extends a machine's useful life from 5 to 8 years. How is that accounted for?",
    choices: [
      "Restate prior years' financial statements",
      "Adjust opening retained earnings for the cumulative effect",
      "Prospectively: spread the remaining book value over the remaining life",
      "Disclose it only, with no change in depreciation",
    ],
    answer: 2,
    explanation:
      "A change in estimate is applied prospectively, in the current and future periods. Restating prior periods is for error corrections (and most changes in accounting principle are retrospective).",
  },
  {
    id: "far-subsequent-event",
    topic: "FAR",
    level: 3,
    askers: ["marcus", "gwen"],
    prompt: "A lawsuit over a November accident settles in February for more than the client accrued. The Dec 31 statements aren't issued yet. What now?",
    choices: [
      "Adjust the Dec 31 financial statements to the settlement amount",
      "Disclose it in the notes only",
      "Record it next year when paid",
      "Nothing; it happened after year-end",
    ],
    answer: 0,
    explanation:
      "The condition (the accident) existed at the balance sheet date, so this is a recognized (Type I) subsequent event: adjust the statements. Events whose conditions arose after year-end, like a February fire, are disclosed only.",
  },
  {
    id: "far-cash-flow-interest",
    topic: "FAR",
    level: 2,
    askers: ["gwen"],
    prompt: "Under U.S. GAAP, where does interest paid go on the statement of cash flows?",
    choices: ["Operating activities", "Investing activities", "Financing activities", "A choice of operating or financing"],
    answer: 0,
    explanation:
      "U.S. GAAP classifies interest paid (and interest and dividends received) as operating. Dividends paid are financing. IFRS is the one that allows a choice.",
  },
  {
    id: "far-modified-accrual",
    topic: "FAR",
    level: 3,
    askers: ["gwen", "sofia"],
    prompt: "In a city's governmental funds (modified accrual), when are revenues recognized?",
    choices: [
      "When cash is received",
      "When earned, regardless of collection",
      "When measurable and available to pay current-period liabilities",
      "When the budget is adopted",
    ],
    answer: 2,
    explanation:
      "Governmental funds use the current financial resources focus: revenue is recognized when it's measurable and available (collected soon enough to pay current liabilities, often within 60 days for property taxes).",
  },
  {
    id: "far-nfp-restricted",
    topic: "FAR",
    level: 3,
    askers: ["sofia", "gwen"],
    prompt: "A not-for-profit gets an unconditional $50,000 pledge restricted to building a new wing. How is it reported when promised?",
    choices: [
      "Deferred revenue until the wing is built",
      "Contribution revenue that increases net assets with donor restrictions",
      "Contribution revenue that increases net assets without donor restrictions",
      "Nothing until the cash arrives",
    ],
    answer: 1,
    explanation:
      "Unconditional promises to give are recognized when made. A donor-imposed purpose restriction puts it in net assets with donor restrictions, released when the money is spent on the wing.",
  },
  {
    id: "far-antidilutive",
    topic: "FAR",
    level: 3,
    askers: ["gwen", "marcus"],
    prompt: "Including the client's convertible bonds in diluted EPS would raise EPS. What do we do?",
    choices: [
      "Include them anyway; all convertibles are included",
      "Exclude them because they're antidilutive",
      "Include them in basic EPS instead",
      "Disclose them as a separate EPS figure",
    ],
    answer: 1,
    explanation:
      "Diluted EPS shows the worst case, so securities that would increase EPS (or decrease a loss per share) are antidilutive and left out.",
  },
  // ---- AUD: Auditing & Attestation --------------------------------------------
  {
    id: "aud-adverse",
    topic: "AUD",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "The client won't fix a misstatement that's material and pervasive. Which opinion do we issue?",
    choices: ["Qualified", "Adverse", "Disclaimer", "Unmodified with an emphasis-of-matter paragraph"],
    answer: 1,
    explanation:
      "Material and pervasive misstatement → adverse. Material but not pervasive → qualified. When we can't get enough evidence (a scope limitation), pervasive → disclaimer.",
  },
  {
    id: "aud-disclaimer",
    topic: "AUD",
    level: 2,
    askers: ["marcus"],
    prompt: "We couldn't get sufficient appropriate evidence, and the possible effects are material and pervasive. Which opinion?",
    choices: ["Adverse", "Qualified", "Disclaimer of opinion", "Unmodified"],
    answer: 2,
    explanation:
      "A scope limitation with possible effects that are material and pervasive leads to a disclaimer. If material but not pervasive, it's a qualified opinion.",
  },
  {
    id: "aud-independence",
    topic: "AUD",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "Which of these impairs independence on an audit client?",
    choices: [
      "An immaterial indirect interest through a diversified mutual fund",
      "A direct financial interest in the client, even if immaterial",
      "A checking account at the client bank that's fully insured",
      "Attending the client's holiday party",
    ],
    answer: 1,
    explanation:
      "Any direct financial interest in an attest client impairs independence, no matter how small. Indirect interests only impair it if they're material.",
  },
  {
    id: "aud-risk-model",
    topic: "AUD",
    level: 2,
    askers: ["marcus"],
    prompt: "We assessed the risk of material misstatement for inventory as high. What does that do to detection risk?",
    choices: [
      "Acceptable detection risk goes down, so we do more substantive testing",
      "Acceptable detection risk goes up, so we do less testing",
      "Detection risk is unaffected",
      "We can rely on controls instead",
    ],
    answer: 0,
    explanation:
      "Audit risk = RMM × detection risk. To hold audit risk low when RMM is high, detection risk must be lower: more, better-timed, or more persuasive substantive procedures.",
  },
  {
    id: "aud-going-concern",
    topic: "AUD",
    level: 3,
    askers: ["marcus", "gwen"],
    prompt: "Under U.S. GAAP, management evaluates substantial doubt about going concern over what period?",
    choices: [
      "Six months after the balance sheet date",
      "One year after the balance sheet date",
      "One year after the financial statements are issued (or available to be issued)",
      "The remaining life of its debt",
    ],
    answer: 2,
    explanation:
      "ASC 205-40 looks forward one year from the date the financial statements are issued (or available to be issued), not from year-end.",
  },
  {
    id: "aud-tolerable-rate",
    topic: "AUD",
    level: 3,
    askers: ["marcus"],
    prompt: "In attribute sampling for a controls test, we raise the tolerable deviation rate. What happens to the sample size?",
    choices: ["It increases", "It decreases", "It doesn't change", "It doubles"],
    answer: 1,
    explanation:
      "Tolerable rate and sample size move in opposite directions: accepting more deviations means we need less evidence. Higher expected deviation rate or lower allowable risk of overreliance would increase the sample.",
  },
  {
    id: "aud-rep-letter",
    topic: "AUD",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "What date should management's representation letter carry?",
    choices: [
      "The balance sheet date",
      "The date of the auditor's report",
      "The date fieldwork started",
      "The date the financial statements are filed",
    ],
    answer: 1,
    explanation:
      "The representation letter is dated as of the auditor's report date, so management's representations cover everything up to the point we sign.",
  },
  {
    id: "aud-cams",
    topic: "AUD",
    level: 3,
    askers: ["gwen", "marcus"],
    prompt: "Critical audit matters (CAMs) must be communicated in the auditor's report under which standards?",
    choices: [
      "AICPA standards for private companies",
      "PCAOB standards for most public company audits",
      "Government Auditing Standards (Yellow Book)",
      "Every audit report, whatever the standards",
    ],
    answer: 1,
    explanation:
      "PCAOB AS 3101 requires CAMs for most public company audits (with exceptions such as emerging growth companies). Under AICPA standards, key audit matters are reported only if we're engaged to.",
  },
  {
    id: "aud-soc1",
    topic: "AUD",
    level: 3,
    askers: ["theo", "gwen"],
    prompt: "Our client outsources payroll processing. Which report best helps us evaluate the provider's controls over financial reporting?",
    choices: ["SOC 1 Type 2", "SOC 2 Type 1", "SOC 3", "A penetration test summary"],
    answer: 0,
    explanation:
      "SOC 1 covers controls relevant to user entities' internal control over financial reporting. Type 2 also tests operating effectiveness over a period. SOC 2 and 3 cover the trust services criteria (security, availability, etc.).",
  },
  {
    id: "aud-segregation",
    topic: "AUD",
    level: 1,
    askers: ["theo", "marcus"],
    prompt: "Which pair of duties should be kept apart to prevent someone from hiding a theft?",
    choices: [
      "Opening mail and stamping checks 'for deposit only'",
      "Handling cash receipts and recording them in the ledger",
      "Preparing and reviewing their own expense report",
      "Backing up files and restoring files",
    ],
    answer: 1,
    explanation:
      "Separate authorization, custody, and recordkeeping. One person holding cash and recording it could take the money and cover it up in the books.",
  },
  // ---- REG: Taxation & Regulation ---------------------------------------------
  {
    id: "reg-1031",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "Since the 2017 tax act, which exchanges can qualify for Section 1031 like-kind treatment?",
    choices: [
      "Any business property, including equipment and vehicles",
      "Only real property held for business or investment",
      "Only stocks and bonds",
      "Only a personal residence",
    ],
    answer: 1,
    explanation:
      "The TCJA limited §1031 to real property held for productive use in a business or for investment. Personal property swaps are now taxable.",
  },
  {
    id: "reg-statute",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "What's the general statute of limitations for the IRS to assess more tax on a filed return?",
    choices: [
      "3 years from the later of the due date or filing date",
      "6 years, always",
      "7 years",
      "There's no limit",
    ],
    answer: 0,
    explanation:
      "Generally 3 years. It's 6 years if gross income was understated by more than 25%, and unlimited for fraud or if no return was filed.",
  },
  {
    id: "reg-s-corp",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "A client wants to elect S corporation status. Which of these would make it ineligible?",
    choices: [
      "It has 80 shareholders",
      "It has two classes of common stock with different distribution rights",
      "Its shareholders are all U.S. citizens",
      "Voting and nonvoting common stock with identical distribution rights",
    ],
    answer: 1,
    explanation:
      "An S corp can have up to 100 shareholders and only one class of stock. Differences in voting rights alone are allowed; different distribution or liquidation rights are not.",
  },
  {
    id: "reg-outside-basis",
    topic: "REG",
    level: 3,
    askers: ["dana"],
    prompt: "A partner's share of partnership liabilities goes up. What happens to their outside basis?",
    choices: ["It increases", "It decreases", "Nothing; liabilities don't affect basis", "It becomes a capital gain"],
    answer: 0,
    explanation:
      "An increase in a partner's share of liabilities is treated as a cash contribution, so outside basis goes up. A decrease is treated as a distribution and lowers it.",
  },
  {
    id: "reg-capital-loss",
    topic: "REG",
    level: 1,
    askers: ["dana"],
    prompt: "An individual (filing jointly) has a $10,000 net capital loss. How much offsets ordinary income this year?",
    choices: ["$0", "$3,000, with the rest carried forward", "$10,000", "$3,000, with the rest lost"],
    answer: 1,
    explanation:
      "Individuals can deduct up to $3,000 of net capital loss against ordinary income ($1,500 if married filing separately). The rest carries forward indefinitely.",
  },
  {
    id: "reg-apparent-authority",
    topic: "REG",
    level: 2,
    askers: ["sofia", "dana"],
    prompt: "We fired a purchasing agent but never told our vendors. The agent then signs a contract with a longtime vendor. Are we bound?",
    choices: [
      "No, the agent had no actual authority",
      "Yes, through apparent authority, until the vendor gets notice",
      "Only if the contract is under $500",
      "Only if we later ratify it in writing",
    ],
    answer: 1,
    explanation:
      "Third parties who dealt with the agent can rely on apparent authority until they receive notice of termination. Actual notice is needed for vendors who dealt with the agent before.",
  },
  {
    id: "reg-firm-offer",
    topic: "REG",
    level: 3,
    askers: ["sofia", "dana"],
    prompt: "A merchant gives a signed, written offer to sell goods, promising to keep it open. Is it irrevocable without consideration?",
    choices: [
      "No, offers can always be revoked without consideration",
      "Yes, for the stated time, but no longer than 3 months",
      "Yes, forever",
      "Only if notarized",
    ],
    answer: 1,
    explanation:
      "Under UCC 2-205, a merchant's signed written firm offer can't be revoked for the time stated (or a reasonable time if none), up to three months, even without consideration.",
  },
  {
    id: "reg-circular-230",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "Under Circular 230, what must a practitioner do on learning that a client didn't comply with the tax law?",
    choices: [
      "Report the client to the IRS immediately",
      "Promptly tell the client about the noncompliance and its consequences",
      "Amend the return without telling the client",
      "Nothing, unless asked",
    ],
    answer: 1,
    explanation:
      "Circular 230 §10.21 requires promptly advising the client of the noncompliance, error, or omission and its consequences. Practitioners aren't required to report the client to the IRS.",
  },
  // ---- FAR, level 1: everyday bookkeeping ---------------------------------------
  {
    id: "far-l1-accrued-wages",
    topic: "FAR",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "It's Dec 31. The last week of December's payroll won't be paid until Jan 3. What do we record today?",
    choices: [
      "Nothing until it's paid",
      "Dr Wages Expense / Cr Wages Payable",
      "Dr Wages Payable / Cr Cash",
      "Dr Prepaid Wages / Cr Cash",
    ],
    answer: 1,
    explanation:
      "The employees earned the wages in December, so the expense belongs in December. Accrue it now as a liability; the January payment then clears Wages Payable.",
  },
  {
    id: "far-l1-unearned",
    topic: "FAR",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "A client collected $12,000 in December for a service contract that covers all of next year. How is it reported at Dec 31?",
    choices: ["Revenue", "Unearned revenue, a liability", "Accounts receivable", "Equity"],
    answer: 1,
    explanation:
      "Cash came in before the work was done, so the client owes the service. It's a liability (unearned or deferred revenue) until it's earned month by month next year.",
  },
  {
    id: "far-l1-prepaid",
    topic: "FAR",
    level: 1,
    askers: ["marcus"],
    prompt: "The client paid $6,000 on July 1 for a 12-month insurance policy. How much insurance expense belongs in this calendar year?",
    choices: ["$6,000", "$3,000", "$500", "$0"],
    answer: 1,
    explanation:
      "Six of the twelve months (July–December) fall in this year: $6,000 × 6/12 = $3,000 of expense. The other $3,000 stays on the balance sheet as prepaid insurance.",
  },
  {
    id: "far-l1-contra",
    topic: "FAR",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "Where does Accumulated Depreciation show up on the balance sheet?",
    choices: [
      "As a liability",
      "As a contra-asset that reduces property, plant and equipment",
      "In stockholders' equity",
      "It only appears on the income statement",
    ],
    answer: 1,
    explanation:
      "It's a contra-asset with a credit balance, shown against the asset's cost to give net book value. Depreciation Expense is the income statement account.",
  },
  {
    id: "far-l1-balance-sheet",
    topic: "FAR",
    level: 1,
    askers: ["gwen", "marcus"],
    prompt: "Which financial statement shows a company's financial position at a single point in time?",
    choices: ["Income statement", "Balance sheet", "Statement of cash flows", "Statement of changes in equity"],
    answer: 1,
    explanation:
      "The balance sheet is a snapshot as of one date: assets, liabilities and equity. The other statements cover a period of time.",
  },
  {
    id: "far-l1-retained-earnings",
    topic: "FAR",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "Net income increases retained earnings. What decreases them?",
    choices: ["Issuing new stock", "Net losses and dividends declared", "Paying off a loan", "Buying equipment"],
    answer: 1,
    explanation:
      "Retained earnings = beginning balance + net income − net losses − dividends declared. Issuing stock affects contributed capital, and loan payments and asset purchases don't touch equity.",
  },
  {
    id: "far-l1-cogs",
    topic: "FAR",
    level: 1,
    askers: ["marcus"],
    prompt: "Beginning inventory $20,000, purchases $80,000, ending inventory $25,000. What's cost of goods sold?",
    choices: ["$75,000", "$85,000", "$100,000", "$55,000"],
    answer: 0,
    explanation:
      "Goods available for sale = $20,000 + $80,000 = $100,000. Subtract what's left on hand: $100,000 − $25,000 = $75,000 of cost of goods sold.",
  },
  {
    id: "far-l1-current-ratio",
    topic: "FAR",
    level: 1,
    askers: ["gwen"],
    prompt: "Current assets are $150,000 and current liabilities are $100,000. What's the current ratio?",
    choices: ["0.67", "1.5", "2.5", "$50,000"],
    answer: 1,
    explanation:
      "Current ratio = current assets ÷ current liabilities = 150,000 ÷ 100,000 = 1.5. The $50,000 difference is working capital, a different measure.",
  },
  // ---- FAR, levels 2–3 ----------------------------------------------------------
  {
    id: "far-l2-fifo-rising",
    topic: "FAR",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "Prices rose all year. Compared with LIFO, what does FIFO do to the client's numbers?",
    choices: [
      "Lower ending inventory and higher cost of goods sold",
      "Higher ending inventory and lower cost of goods sold",
      "No difference",
      "Higher cost of goods sold and higher net income",
    ],
    answer: 1,
    explanation:
      "FIFO sends the oldest (cheaper) costs to cost of goods sold and leaves the newest (pricier) costs in ending inventory. With rising prices that means lower COGS, higher income and higher inventory.",
  },
  {
    id: "far-l2-ddb",
    topic: "FAR",
    level: 2,
    askers: ["marcus"],
    prompt: "Equipment cost $10,000, has a 5-year life and $1,000 salvage value. What's year-1 depreciation under double-declining balance?",
    choices: ["$1,800", "$2,000", "$4,000", "$3,600"],
    answer: 2,
    explanation:
      "The DDB rate is 2 ÷ 5 = 40%, applied to beginning book value: $10,000 × 40% = $4,000. Salvage is ignored until book value would drop below it. ($1,800 is straight-line.)",
  },
  {
    id: "far-l2-write-off",
    topic: "FAR",
    level: 2,
    askers: ["marcus", "gwen"],
    prompt: "Under the allowance method, a $2,000 customer balance is written off. What happens to net accounts receivable?",
    choices: ["It drops $2,000", "It rises $2,000", "It doesn't change", "It drops by the bad debt expense"],
    answer: 2,
    explanation:
      "The write-off is Dr Allowance / Cr Accounts Receivable. Both sides of the net figure fall by $2,000, so net receivables and expense are unchanged; the expense was already recorded through the allowance.",
  },
  {
    id: "far-l3-afs",
    topic: "FAR",
    level: 3,
    askers: ["gwen"],
    prompt: "The client's debt securities are classified as available-for-sale. Where do unrealized holding gains go?",
    choices: ["Net income", "Other comprehensive income", "They aren't recorded", "Directly to retained earnings"],
    answer: 1,
    explanation:
      "Available-for-sale debt securities are carried at fair value with unrealized gains and losses in other comprehensive income (ASC 320). Trading securities run through net income; held-to-maturity stays at amortized cost.",
  },
  {
    id: "far-l3-treasury",
    topic: "FAR",
    level: 3,
    askers: ["gwen", "marcus"],
    prompt: "Under the cost method, treasury stock bought at $30 a share is reissued at $35. Where does the extra $5 a share go?",
    choices: [
      "A gain on the income statement",
      "Additional paid-in capital from treasury stock",
      "Retained earnings",
      "Common stock",
    ],
    answer: 1,
    explanation:
      "A company never records gains or losses on its own stock. The excess goes to paid-in capital from treasury stock; a shortfall would reduce that account first, then retained earnings.",
  },
  // ---- AUD, level 1: working on an audit team ----------------------------------
  {
    id: "aud-l1-pbc",
    topic: "AUD",
    level: 1,
    askers: ["marcus"],
    prompt: "The client just uploaded everything on our PBC list. What does PBC stand for?",
    choices: ["Prepared by client", "Pending before closing", "Partner before clearance", "Paid by check"],
    answer: 0,
    explanation:
      "Prepared by client: the schedules and documents we ask the client to pull together, like reconciliations, invoices and contracts. A good PBC list sent early keeps fieldwork on schedule.",
  },
  {
    id: "aud-l1-foot",
    topic: "AUD",
    level: 1,
    askers: ["marcus"],
    prompt: "Marcus asks you to foot this schedule. What does he want?",
    choices: [
      "Add the column down to check its total",
      "Trace each amount to an invoice",
      "Compare it to last year",
      "Recalculate depreciation",
    ],
    answer: 0,
    explanation:
      "Footing is adding a column vertically to confirm its total; cross-footing adds across rows. Then you mark it with a tick mark and note what you did.",
  },
  {
    id: "aud-l1-vouch",
    topic: "AUD",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "To test that recorded sales really happened (occurrence), which direction do we test?",
    choices: [
      "Vouch from the sales journal back to shipping documents",
      "Trace from shipping documents forward to the sales journal",
      "Confirm the cash balance with the bank",
      "Recompute sales tax",
    ],
    answer: 0,
    explanation:
      "Starting from what's recorded and going back to support (vouching) tests occurrence or existence. Starting from source documents and going forward (tracing) tests completeness.",
  },
  {
    id: "aud-l1-review-notes",
    topic: "AUD",
    level: 1,
    askers: ["marcus", "gwen"],
    prompt: "Your senior left review notes on your workpaper. What's the right move?",
    choices: [
      "Delete them once you've read them",
      "Address each one, document your response, and clear it with the reviewer",
      "Only fix the big ones",
      "Forward them to the client to answer",
    ],
    answer: 1,
    explanation:
      "Every review note needs a documented response in the workpaper, then the reviewer clears it. Open notes hold up sign-off, and the trail shows how issues were resolved.",
  },
  // ---- AUD, levels 2–3 ----------------------------------------------------------
  {
    id: "aud-l2-negative-confirms",
    topic: "AUD",
    level: 2,
    askers: ["marcus"],
    prompt: "When can we use negative confirmations as our only confirmation procedure?",
    choices: [
      "When RMM is low, there are many small similar balances, few exceptions are expected, and recipients will read them",
      "For any large balance",
      "When internal controls are weak",
      "Never; only positive confirmations count",
    ],
    answer: 0,
    explanation:
      "Negative confirmations only ask the customer to reply if something's wrong, so silence is weak evidence. AU-C 505 limits them to low-risk, high-volume, low-exception populations where recipients are expected to pay attention.",
  },
  {
    id: "aud-l2-inventory-count",
    topic: "AUD",
    level: 2,
    askers: ["marcus"],
    prompt: "Why do we attend the client's year-end physical inventory count?",
    choices: [
      "To count all the inventory ourselves",
      "To observe their count procedures and make test counts, mainly for existence",
      "To set the inventory's value",
      "It's optional and mostly a courtesy",
    ],
    answer: 1,
    explanation:
      "When inventory is material, attending the count is required if practicable. We observe how the client counts, test-count items both ways (floor to sheet and sheet to floor), and note cutoff information.",
  },
  {
    id: "aud-l2-engagement-letter",
    topic: "AUD",
    level: 2,
    askers: ["gwen", "marcus"],
    prompt: "Which document sets out the agreed terms of the audit: objectives, responsibilities, the reporting framework and fees?",
    choices: ["Engagement letter", "Management representation letter", "Management letter", "Comfort letter"],
    answer: 0,
    explanation:
      "The engagement letter documents the terms before the work starts, including management's responsibilities. The representation letter comes at the end; a management letter shares improvement suggestions.",
  },
  {
    id: "aud-l3-going-concern-report",
    topic: "AUD",
    level: 3,
    askers: ["gwen", "marcus"],
    prompt: "There's substantial doubt about a private client's ability to continue as a going concern, and it's properly disclosed. How does our report change under AICPA standards?",
    choices: [
      "An adverse opinion",
      "A qualified opinion",
      "An unmodified opinion with a separate going concern section",
      "We must disclaim an opinion",
    ],
    answer: 2,
    explanation:
      "If the disclosure is adequate, the opinion stays unmodified, and a separate section titled about substantial doubt points readers to the note. Inadequate disclosure would be a misstatement, leading to a qualified or adverse opinion.",
  },
  // ---- REG, level 1: everyday tax and payroll ------------------------------------
  {
    id: "reg-l1-1099",
    topic: "REG",
    level: 1,
    askers: ["sofia", "dana"],
    prompt: "We paid an independent contractor this year. Which form reports what we paid them?",
    choices: ["Form W-2", "Form 1099-NEC", "Form W-4", "Form 941"],
    answer: 1,
    explanation:
      "Nonemployee compensation goes on Form 1099-NEC. Employees get a W-2; the W-4 is their withholding form, and Form 941 is the employer's quarterly payroll tax return.",
  },
  {
    id: "reg-l1-fica",
    topic: "REG",
    level: 1,
    askers: ["sofia", "dana"],
    prompt: "Who pays Social Security and Medicare (FICA) taxes on an employee's wages?",
    choices: [
      "Only the employee",
      "Only the employer",
      "Both: the employee through withholding and the employer with a matching share",
      "Neither; it's optional",
    ],
    answer: 2,
    explanation:
      "FICA is split: we withhold the employee's share from their pay and the employer pays a matching share. Self-employed people pay both halves as self-employment tax.",
  },
  {
    id: "reg-l1-agi",
    topic: "REG",
    level: 1,
    askers: ["dana"],
    prompt: "Which of these is deducted in arriving at AGI (above the line)?",
    choices: [
      "Home mortgage interest",
      "Medical expenses",
      "Deductible traditional IRA contributions",
      "State income taxes",
    ],
    answer: 2,
    explanation:
      "Deductible traditional IRA contributions reduce AGI directly. Mortgage interest, medical expenses and state taxes are itemized deductions, taken after AGI.",
  },
  {
    id: "reg-l1-stock-gain",
    topic: "REG",
    level: 1,
    askers: ["dana"],
    prompt: "A client bought stock for $5,000 and sold it two years later for $8,000. What's the gain?",
    choices: ["$3,000 long-term capital gain", "$3,000 short-term capital gain", "$8,000 long-term capital gain", "$3,000 ordinary income"],
    answer: 0,
    explanation:
      "Gain = amount realized − basis = $8,000 − $5,000 = $3,000. Held more than a year, so it's long-term and gets preferential rates.",
  },
  // ---- REG, levels 2–3 ----------------------------------------------------------
  {
    id: "reg-l2-se-tax",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "A sole proprietor has net earnings from self-employment. Which tax applies on top of income tax?",
    choices: [
      "Self-employment tax, covering both halves of Social Security and Medicare",
      "Federal unemployment tax (FUTA)",
      "Corporate income tax",
      "No other tax",
    ],
    answer: 0,
    explanation:
      "With no employer to pay a match, the self-employed pay both halves of FICA as self-employment tax. Half of it is deductible in arriving at AGI.",
  },
  {
    id: "reg-l2-gift",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "A client gives each of three children a cash gift within the annual gift tax exclusion. Does anyone file a gift tax return?",
    choices: [
      "Generally no; gifts within the annual exclusion don't require Form 709",
      "Each child files one",
      "The client must file Form 709 for every gift",
      "The IRS files it for them",
    ],
    answer: 0,
    explanation:
      "Gifts of present interests within the annual exclusion (an amount indexed each year) generally need no return. The donor, not the recipient, files Form 709 when gifts exceed it or when spouses elect gift-splitting.",
  },
  {
    id: "reg-l2-double-tax",
    topic: "REG",
    level: 2,
    askers: ["dana"],
    prompt: "A C corporation pays dividends out of its after-tax profits. How is that income taxed overall?",
    choices: [
      "Only once, at the corporate level",
      "Twice: corporate tax on profits, then shareholder tax on dividends",
      "Only at the shareholder level",
      "Not at all",
    ],
    answer: 1,
    explanation:
      "That's the double taxation of C corporations. Pass-through entities like partnerships and S corporations are generally taxed only once, at the owner level.",
  },
  {
    id: "reg-l3-passive",
    topic: "REG",
    level: 3,
    askers: ["dana"],
    prompt: "A client has a loss from a passive activity and no passive income this year. What happens to the loss?",
    choices: [
      "It's fully deductible against wages",
      "It's generally suspended and carried forward until there's passive income or the activity is sold",
      "It's lost permanently",
      "It becomes a capital loss",
    ],
    answer: 1,
    explanation:
      "Passive losses can only offset passive income; the excess is suspended and released when there's passive income or a fully taxable disposition. Rental real estate with active participation has a limited exception that phases out with income.",
  },
  {
    id: "reg-l3-ucc1",
    topic: "REG",
    level: 3,
    askers: ["sofia", "dana"],
    prompt: "A lender wants priority over other creditors in a borrower's equipment. How is that security interest usually perfected?",
    choices: [
      "Attachment alone is enough",
      "By filing a financing statement (UCC-1)",
      "By notarizing the loan agreement",
      "By telling the borrower in writing",
    ],
    answer: 1,
    explanation:
      "A security interest attaches when value is given, the debtor has rights in the collateral and there's a security agreement. Perfection, usually by filing a UCC-1, is what gives priority against other creditors.",
  },
  // ---- BAR: Business Analysis & Reporting --------------------------------------
  {
    id: "bar-break-even",
    topic: "BAR",
    level: 1,
    askers: ["gwen"],
    prompt: "The client's contribution margin ratio is 40% and fixed costs are $200,000. What's break-even sales?",
    choices: ["$80,000", "$333,333", "$500,000", "$800,000"],
    answer: 2,
    explanation: "Break-even sales = fixed costs ÷ contribution margin ratio = $200,000 ÷ 0.40 = $500,000.",
  },
  {
    id: "bar-npv-irr",
    topic: "BAR",
    level: 2,
    askers: ["gwen"],
    prompt: "A project's NPV at the client's 10% hurdle rate is positive. What does that tell us about its IRR?",
    choices: ["IRR is below 10%", "IRR equals 10%", "IRR is above 10%", "Nothing; they're unrelated"],
    answer: 2,
    explanation:
      "IRR is the rate where NPV is zero. If NPV is still positive at 10%, it takes a higher rate to bring it to zero, so IRR is above 10%.",
  },
  // ---- ISC: Information Systems & Controls -------------------------------------
  {
    id: "isc-least-privilege",
    topic: "ISC",
    level: 1,
    askers: ["theo"],
    prompt: "A new staff accountant only needs read access to the AP subledger. Which principle says not to give them more?",
    choices: ["Defense in depth", "Least privilege", "Single sign-on", "Data minimization"],
    answer: 1,
    explanation:
      "Least privilege grants only the access needed for the job. It limits damage from mistakes, misuse, or a compromised account.",
  },
  {
    id: "isc-change-mgmt",
    topic: "ISC",
    level: 2,
    askers: ["theo"],
    prompt: "A developer can push code changes straight into the production ERP. Which control area is weak?",
    choices: ["Change management", "Physical security", "Backup and recovery", "Input validation"],
    answer: 0,
    explanation:
      "Change management requires changes to be authorized, tested, and moved to production by someone other than the developer. Direct developer access to production bypasses all of that.",
  },
];

/** Who walks over with questions (each brings their own specialty, see Inquiry.askers). */
export const REQUESTERS = ["marcus", "dana", "gwen", "sofia", "theo"];

export const FIRST_REQUEST_DELAY = 20; // seconds after the intro ends
export const REQUEST_INTERVAL: [number, number] = [40, 70];
export const REQUEST_PATIENCE = 60; // seconds a coworker waits at the desk
export const REQUEST_APPROACH_TIMEOUT = 20; // give up if they can't reach the desk

/** Free tiles beside the player's cubicle where a coworker can stand. */
export const DESK_VISITOR_TILES: Tile[] = [
  [6, 10],
  [7, 9],
  [7, 10],
  [5, 10],
];

export const REPUTATION = {
  correct: 10,
  attempted: 2,
  ignored: -5,
  lunchOnTime: 10,
  lunchSkipped: -8,
  lunchLate: -10,
};

// ---------------------------------------------------------------------------
// Lunch break
// ---------------------------------------------------------------------------
export const LUNCH_START = 12 * 60; // minute of day
export const LUNCH_OFFICE_MINUTES = 60; // the clock covers a full lunch hour...
export const LUNCH_DURATION = 30; // ...in this many real seconds
export const RETURN_GRACE = 10; // seconds to get back to the desk once the break ends
export const LUNCH_GOERS = ["marcus", "dana", "priya", "theo"];

// ---------------------------------------------------------------------------
// Engine → UI view models
// ---------------------------------------------------------------------------
export interface RequestView {
  npcId: string;
  phase: "approaching" | "waiting" | "helping";
  inquiry: Inquiry;
  retest: boolean; // a question the player missed before
  timeLeft: number;
  canHelp: boolean;
}

export interface LunchView {
  phase: "break" | "return";
  timeLeft: number;
  visitedBreakroom: boolean;
}

export interface Stats {
  helped: number;
  missed: number;
}

export interface Toast {
  id: number;
  tone: "good" | "bad" | "info";
  text: string;
}

// ---------------------------------------------------------------------------
// Shared UI tools
// ---------------------------------------------------------------------------
export const INK = "#1b1b22";

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const [r, g, b] = [mix(n >> 16), mix((n >> 8) & 255), mix(n & 255)];
  return `rgb(${r},${g},${b})`;
}

export function Portrait({ palette, size }: { palette: SpritePalette; size: number }) {
  // A tiny pixel bust built from the same palette as the in-world sprite.
  return (
    <div
      className="relative shrink-0 overflow-hidden border-2 border-[#0b0d14]"
      style={{ width: size, height: size, background: shade(palette.shirt, 0.55) }}
      aria-hidden
    >
      <div
        className="absolute"
        style={{ left: "25%", top: "18%", width: "50%", height: "45%", background: palette.skin }}
      />
      <div
        className="absolute"
        style={{ left: "25%", top: "12%", width: "50%", height: "16%", background: palette.hair }}
      />
      <div className="absolute" style={{ left: "35%", top: "38%", width: "8%", height: "8%", background: INK }} />
      <div className="absolute" style={{ left: "57%", top: "38%", width: "8%", height: "8%", background: INK }} />
      <div
        className="absolute"
        style={{ left: "12%", top: "66%", width: "76%", height: "40%", background: palette.shirt }}
      />
      {palette.accent && (
        <div
          className="absolute"
          style={{ left: "46%", top: "66%", width: "8%", height: "30%", background: palette.accent }}
        />
      )}
    </div>
  );
}

const PANEL = "rounded border-2 border-[#0b0d14] bg-[#0e1018]/90 text-[11px] leading-tight";

/** The office clock and today's date, season and clock-out time, for the top bar. */
export function OfficeStatus({ clock, workday }: { clock: number; workday: WorkdayView | null }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-label="Office time" className="whitespace-nowrap text-[18px] font-bold leading-none text-white">
        🕘 {formatClock(clock)}
      </span>
      {workday && (
        <div className="leading-tight">
          <div className="text-[#d6dbe6]">
            {workday.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <div className="text-[10px] text-[#9aa4b8]">
            <span className="text-[#e8d28a] underline decoration-dotted underline-offset-2" title={workday.season.note}>
              {workday.season.name}
            </span>{" "}
            · out at {formatMinutes(workday.season.clockOut)}
          </div>
        </div>
      )}
    </div>
  );
}

export function LunchBanner({ view }: { view: LunchView }) {
  const seconds = Math.ceil(view.timeLeft);
  const onBreak = view.phase === "break";
  const message = onBreak
    ? view.visitedBreakroom
      ? "Enjoy your lunch! Head back to your desk when the break ends."
      : "Lunch break! Head to the breakroom."
    : "Break's over! Get back to your desk.";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded border-2 px-3 py-1.5 text-center text-[11px] shadow-[3px_3px_0_#0b0d14] ${
        onBreak ? "border-[#0b0d14] bg-[#e0a33a] text-[#1b1b22]" : "border-[#0b0d14] bg-[#b33a3a] text-white"
      }`}
    >
      <div className="font-bold uppercase tracking-wider">
        {onBreak ? "🥪 Lunch break" : "⏰ Back to work"} · {seconds}s
      </div>
      <div className="text-[10px]">{message}</div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-black/25">
        <div
          className="h-full bg-white/80 transition-[width] duration-300"
          style={{ width: `${(view.timeLeft / (onBreak ? LUNCH_DURATION : RETURN_GRACE)) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function RequestCard({
  view,
  requester,
  onHelp,
}: {
  view: RequestView;
  requester: NpcProfile;
  onHelp: () => void;
}) {
  const first = requester.name.split(" ")[0];
  const text =
    view.phase === "approaching"
      ? `${first} is heading to your desk with ${withArticle(view.inquiry.topic)} question.`
      : view.canHelp
        ? `${first} has ${withArticle(view.inquiry.topic)} question for you.`
        : `${first} is waiting at your desk (${Math.ceil(view.timeLeft)}s).`;
  return (
    <div className={`${PANEL} flex w-56 items-center gap-2 border-[#c9a227] px-2.5 py-2 text-[#e6e8ef]`}>
      <Portrait palette={requester.palette} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#e8d28a]">
          {view.retest ? "🔁 Retest · " : ""}
          {view.inquiry.topic} · L{view.inquiry.level} {LEVEL_NAMES[view.inquiry.level - 1]}
        </div>
        <div className="text-[10px] leading-snug text-[#c4c9d6]">{text}</div>
        {view.phase === "waiting" && view.canHelp && (
          <button
            onClick={onHelp}
            className="mt-1 rounded-sm border border-[#0b0d14] bg-[#c9a227] px-2 py-0.5 text-[10px] font-bold text-[#1b1b22]"
          >
            Help (E)
          </button>
        )}
      </div>
    </div>
  );
}

export function InquiryModal({
  requester,
  inquiry,
  retest,
  onResolve,
}: {
  requester: NpcProfile;
  inquiry: Inquiry;
  retest: boolean;
  onResolve: (correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === inquiry.answer;

  useEffect(() => {
    if (picked !== null) (picked === inquiry.answer ? sfx.correct : sfx.wrong)();
  }, [picked, inquiry.answer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= inquiry.choices.length) setPicked(n - 1);
      else if (answered && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onResolve(correct);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, correct, inquiry, onResolve]);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#0b0d14]/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inquiry-title"
        className="w-full max-w-md rounded border-4 border-[#0b0d14] bg-[#f4efe4] text-[#1b1b22] shadow-[6px_6px_0_#0b0d14]"
      >
        <div
          className="flex items-center gap-3 border-b-4 bg-[#2a2d45] px-4 py-3"
          style={{ borderBottomColor: requester.palette.shirt }}
        >
          <Portrait palette={requester.palette} size={40} />
          <div className="min-w-0 text-[#f4efe4]">
            <div id="inquiry-title" className="text-[13px] font-bold">
              {requester.name}
            </div>
            <div className="text-[10px] text-[#e8d28a]">
              {retest ? "🔁 Retest · " : ""}
              {inquiry.topic}: {TOPIC_NAMES[inquiry.topic]} · L{inquiry.level} {LEVEL_NAMES[inquiry.level - 1]}
            </div>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-[12px] leading-relaxed">&ldquo;{inquiry.prompt}&rdquo;</p>
          <div className="space-y-2">
            {inquiry.choices.map((choice, i) => {
              const state = !answered
                ? "border-[#0b0d14] bg-white hover:bg-[#fff6d8]"
                : i === inquiry.answer
                  ? "border-[#2f7a3a] bg-[#d9f2d0]"
                  : i === picked
                    ? "border-[#b33a3a] bg-[#f7d6d0]"
                    : "border-[#a39a88] bg-white/60 text-[#6b6458]";
              return (
                <button
                  key={choice}
                  type="button"
                  disabled={answered}
                  onClick={() => setPicked(i)}
                  className={`flex w-full items-start gap-2 border-2 px-3 py-2 text-left text-[11px] leading-snug ${state}`}
                >
                  <span className="font-bold">{i + 1}.</span>
                  <span>{choice}</span>
                </button>
              );
            })}
          </div>
          {answered && (
            <div className="space-y-3">
              <p className={`text-[11px] leading-relaxed ${correct ? "text-[#2f6b35]" : "text-[#9a2f2f]"}`}>
                <strong>{correct ? "Exactly right." : "Not quite."}</strong> {inquiry.explanation}
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => onResolve(correct)}
                className="w-full border-2 border-[#0b0d14] bg-[#c9a227] py-2 text-[12px] font-bold uppercase tracking-wider shadow-[3px_3px_0_#0b0d14]"
              >
                Back to work ▶
              </button>
            </div>
          )}
          {!answered && (
            <p className="text-[10px] text-[#6b6458]">Press 1–{inquiry.choices.length} or click an answer.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ToastStack({ toasts, raised = false }: { toasts: Toast[]; raised?: boolean }) {
  const tones = {
    good: "border-[#2f7a3a] bg-[#d9f2d0] text-[#1f4a25]",
    bad: "border-[#b33a3a] bg-[#f7d6d0] text-[#6b1f1f]",
    info: "border-[#0b0d14] bg-[#f4efe4] text-[#1b1b22]",
  };
  return (
    <div
      className={`pointer-events-none absolute right-4 z-30 flex w-64 flex-col items-end gap-1.5 ${raised ? "bottom-12" : "bottom-4"}`}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded border-2 px-3 py-1.5 text-[11px] shadow-[3px_3px_0_#0b0d14] ${tones[t.tone]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
