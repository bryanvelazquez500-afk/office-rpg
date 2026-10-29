"use client";

import { EMAILS, TASKS, emailArrival } from "./gaap";
import { formatMinutes, minuteOfDay, type WorkdayView } from "./OfficeLunchAndTools";

// The sidebar's checklist for the current workday: the routine of a staff
// accountant's day plus every assignment due today. Assignments come straight
// from the inbox (onboarding work, the day's routine work, anything a promotion
// unlocked), and ones still open from earlier days are carried over.

export interface DayLog {
  helped: number; // coworkers helped today
  lunch: "pending" | "done" | "skipped" | "late";
}

export const HELP_GOAL = 3;

type State = "done" | "open" | "missed" | "later";

const MARK: Record<State, string> = { done: "☑", open: "☐", missed: "☒", later: "◷" };
const COLOR: Record<State, string> = {
  done: "text-[#9fd36b]",
  open: "text-[#d6dbe6]",
  missed: "text-[#e2553f]",
  later: "text-[#6b7287]",
};

export function DailyChecklist({
  clock,
  workday,
  unlockedAt,
  signedOff,
  log,
  todayPoints,
  target,
}: {
  clock: number;
  workday: WorkdayView;
  unlockedAt: number[];
  signedOff: ReadonlySet<string>;
  log: DayLog;
  todayPoints: number;
  target: number;
}) {
  const dayStart = workday.day * 24 * 60;
  const dayEnd = dayStart + 24 * 60;
  const assignments = EMAILS.flatMap((e) => {
    const at = e.taskId ? emailArrival(e, unlockedAt) : null;
    return at === null ? [] : [{ taskId: e.taskId!, at }];
  });
  const today = assignments.filter((a) => a.at >= dayStart && a.at < dayEnd).sort((a, b) => a.at - b.at);
  const carried = assignments.filter((a) => a.at < dayStart && !signedOff.has(a.taskId));

  const items: { key: string; state: State; text: string }[] = [
    { key: "in", state: "done", text: "Clock in at 9:00 AM" },
    ...carried.map((a) => ({ key: a.taskId, state: "open" as State, text: `${TASKS[a.taskId].title} (from earlier)` })),
    ...today.map((a) =>
      a.at > clock
        ? { key: a.taskId, state: "later" as State, text: `New assignment at ${formatMinutes(minuteOfDay(a.at))}` }
        : {
            key: a.taskId,
            state: (signedOff.has(a.taskId) ? "done" : "open") as State,
            text: TASKS[a.taskId].title,
          },
    ),
    {
      key: "lunch",
      state: log.lunch === "done" ? "done" : log.lunch === "pending" ? "open" : "missed",
      text:
        log.lunch === "skipped"
          ? "Lunch: skipped"
          : log.lunch === "late"
            ? "Lunch: back late"
            : "Lunch at 12:00, back by 1:00",
    },
    {
      key: "help",
      state: log.helped >= HELP_GOAL ? "done" : "open",
      text: `Help coworkers with questions (${Math.min(log.helped, HELP_GOAL)}/${HELP_GOAL})`,
    },
    {
      key: "bar",
      state: todayPoints >= target ? "done" : "open",
      text: `Fill your performance bar (${Math.min(todayPoints, target)}/${target})`,
    },
    { key: "out", state: "open", text: `Clock out at ${formatMinutes(workday.season.clockOut)}` },
  ];
  const assignmentsLeft = [...carried, ...today].filter((a) => a.at <= clock && !signedOff.has(a.taskId)).length;

  return (
    <div className="text-[10px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold uppercase tracking-wider text-[#f2c14e]">Today&apos;s checklist</span>
        <span className="text-[#9aa4b8]">{assignmentsLeft ? `${assignmentsLeft} to do` : "all caught up"}</span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li key={item.key} className={`flex gap-1.5 ${COLOR[item.state]}`}>
            <span aria-hidden>{MARK[item.state]}</span>
            <span className={item.state === "done" ? "line-through decoration-1 opacity-80" : ""}>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
