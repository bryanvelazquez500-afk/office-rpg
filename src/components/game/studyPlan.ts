// Progressive CPA practice: coworkers' questions get harder as the player gets
// them right, and missed questions come back as retests.
//
// - Each section (FAR, AUD, REG) has its own level, starting at 1 (Basics).
// - LEVEL_UP_STREAK correct answers in a row at the current level move the section
//   up a level. A miss resets that section's streak.
// - A missed question returns as a retest after RETEST_GAP other questions,
//   and keeps coming back until it's answered correctly.
// - Sections take turns, so all three keep moving.

import { ACTIVE_TOPICS, INQUIRIES, LEVEL_NAMES, type Inquiry, type InquiryTopic } from "./OfficeLunchAndTools";

export { LEVEL_NAMES };
export const MAX_LEVEL = LEVEL_NAMES.length;
export const LEVEL_UP_STREAK = 3;
export const RETEST_GAP = 2;

export interface SectionProgress {
  level: number; // 1..MAX_LEVEL
  streak: number; // correct in a row at the current level
  right: number;
  total: number;
}

export interface StudyPlan {
  sections: Record<InquiryTopic, SectionProgress>;
  answered: Set<string>; // answered at least once
  retests: { id: string; wait: number }[]; // missed questions, `wait` = questions until due
  turn: number; // which section asks next
}

export interface StudyPick {
  inquiry: Inquiry;
  retest: boolean;
}

export function newStudyPlan(): StudyPlan {
  const blank = (): SectionProgress => ({ level: 1, streak: 0, right: 0, total: 0 });
  return {
    sections: { FAR: blank(), AUD: blank(), REG: blank(), BAR: blank(), ISC: blank() },
    answered: new Set(),
    retests: [],
    turn: 0,
  };
}

const byId = (id: string) => INQUIRIES.find((q) => q.id === id);
const random = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * The next question to bring to the player: a due retest first, otherwise the next
 * section's question at the player's level there. `canAsk` says whether a coworker who
 * asks that question is free to walk over right now.
 */
export function nextQuestion(plan: StudyPlan, canAsk: (q: Inquiry) => boolean): StudyPick | null {
  const due = plan.retests
    .filter((r) => r.wait <= 0)
    .map((r) => byId(r.id))
    .find((q): q is Inquiry => !!q && ACTIVE_TOPICS.includes(q.topic) && canAsk(q));
  if (due) return { inquiry: due, retest: true };

  for (let i = 0; i < ACTIVE_TOPICS.length; i++) {
    const topic = ACTIVE_TOPICS[(plan.turn + i) % ACTIVE_TOPICS.length];
    const { level } = plan.sections[topic];
    const inSection = INQUIRIES.filter(
      (q) => q.topic === topic && canAsk(q) && !plan.retests.some((r) => r.id === q.id),
    );
    const fresh = inSection.filter((q) => !plan.answered.has(q.id));
    // Prefer new questions at the current level, then easier ones not yet seen, then
    // harder ones; once a section is exhausted, revisit questions already answered.
    const pool = [
      fresh.filter((q) => q.level === level),
      fresh.filter((q) => q.level < level),
      fresh.filter((q) => q.level > level),
      inSection.filter((q) => q.level <= level),
    ].find((p) => p.length);
    if (pool) {
      plan.turn = (plan.turn + i + 1) % ACTIVE_TOPICS.length;
      return { inquiry: random(pool), retest: false };
    }
  }
  return null;
}

/** Records an answer. Returns the section's new level if this answer moved it up. */
export function recordAnswer(plan: StudyPlan, inquiry: Inquiry, correct: boolean): number | null {
  const section = plan.sections[inquiry.topic];
  section.total++;
  plan.answered.add(inquiry.id);
  for (const r of plan.retests) r.wait--;
  plan.retests = plan.retests.filter((r) => r.id !== inquiry.id);

  if (!correct) {
    section.streak = 0;
    plan.retests.push({ id: inquiry.id, wait: RETEST_GAP });
    return null;
  }
  section.right++;
  if (inquiry.level < section.level) return null; // easier questions don't count toward leveling up
  section.streak++;
  if (section.streak >= LEVEL_UP_STREAK && section.level < MAX_LEVEL) {
    section.level++;
    section.streak = 0;
    return section.level;
  }
  return null;
}

/** A plain copy for React state (the plan itself lives in the game engine). */
export function studyView(plan: StudyPlan) {
  return {
    sections: ACTIVE_TOPICS.map((topic) => ({ topic, ...plan.sections[topic] })),
    retests: plan.retests.length,
    answeredIds: [...plan.answered],
  };
}

export type StudyView = ReturnType<typeof studyView>;

/** The plan in a form that can be saved (sets become lists). */
export type SavedPlan = Omit<StudyPlan, "answered"> & { answered: string[] };

export const savePlan = (plan: StudyPlan): SavedPlan => ({
  sections: structuredClone(plan.sections),
  answered: [...plan.answered],
  retests: plan.retests.map((r) => ({ ...r })),
  turn: plan.turn,
});

export function restorePlan(saved: SavedPlan): StudyPlan {
  const plan = newStudyPlan();
  return {
    // Keep any section added since the save was made at its starting values.
    sections: { ...plan.sections, ...saved.sections },
    answered: new Set(saved.answered),
    retests: saved.retests.filter((r) => INQUIRIES.some((q) => q.id === r.id)),
    turn: saved.turn,
  };
}
