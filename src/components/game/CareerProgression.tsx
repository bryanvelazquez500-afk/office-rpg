"use client";

import { useEffect, useRef } from "react";
import { NPCS } from "./characters";
import { Portrait } from "./OfficeLunchAndTools";

// Career ladder: each shift, performance points (assignments signed off,
// coworkers helped, lunch on time) fill that day's bar. A shift that ends with the
// bar full counts toward promotion; DAYS_TO_PROMOTE full shifts earn the next rank,
// which unlocks the next tier of assignments (gaap.ts Task.tier === rank index + 1).

export interface Rank {
  title: string;
  dailyTarget: number; // points that fill the bar for one shift
  responsibilities: string[];
}

export const RANKS: Rank[] = [
  {
    title: "Staff Accountant I",
    dailyTarget: 80,
    responsibilities: ["Year-end adjusting entries: depreciation, accruals, deferrals"],
  },
  {
    title: "Staff Accountant II",
    dailyTarget: 100,
    responsibilities: [
      "Estimates & valuation: credit-loss allowances (CECL), inventory write-downs",
      "Spreadsheet-driven workpapers",
    ],
  },
  {
    title: "Senior Associate",
    dailyTarget: 120,
    responsibilities: [
      "Multi-line entries: bond interest under the effective interest method",
      "Payroll accruals with withholdings",
    ],
  },
  {
    title: "Supervisor",
    dailyTarget: 150,
    responsibilities: [
      "Consolidations: multi-step elimination entries for a subsidiary (ASC 810)",
      "Access to the consolidation worksheet in LedgerLite",
    ],
  },
  {
    title: "Manager",
    dailyTarget: 150,
    responsibilities: ["Engagement leadership: you sign off on the team's work", "A window seat. Eventually."],
  },
];

export const DAYS_TO_PROMOTE = 5;

export interface Career {
  points: number; // lifetime total
  today: number; // points earned this shift
  fullShifts: number; // shifts ended with a full bar at the current rank
  rank: number;
  /** Office minute each rank (and its task tier) was reached, indexed by rank. */
  unlockedAt: number[];
}

export const initialCareer = (): Career => ({ points: 0, today: 0, fullShifts: 0, rank: 0, unlockedAt: [0] });

/** Adds (or removes) performance points for the current shift. The bar never drops below empty. */
export function applyPoints(career: Career, delta: number): Career {
  return { ...career, points: Math.max(0, career.points + delta), today: Math.max(0, career.today + delta) };
}

/**
 * Closes out a shift at clock-out: a full bar counts toward promotion, and
 * DAYS_TO_PROMOTE full shifts earn the next rank (its assignments unlock at `nowMinutes`).
 */
export function endShift(career: Career, nowMinutes: number) {
  const full = career.today >= RANKS[career.rank].dailyTarget;
  let rank = career.rank;
  let fullShifts = career.fullShifts + (full ? 1 : 0);
  const unlockedAt = [...career.unlockedAt];
  if (fullShifts >= DAYS_TO_PROMOTE && rank + 1 < RANKS.length) {
    rank++;
    fullShifts = 0;
    unlockedAt[rank] = nowMinutes;
  }
  return {
    career: { ...career, today: 0, rank, fullShifts, unlockedAt },
    full,
    promotedTo: rank > career.rank ? rank : null,
  };
}

export function rankProgress(career: Career) {
  const target = RANKS[career.rank].dailyTarget;
  return { fraction: Math.min(1, career.today / target), target, next: RANKS[career.rank + 1] ?? null };
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
/** Compact rank + today's bar, for the workstation taskbar. */
export function PerformanceBar({ career }: { career: Career }) {
  const { fraction, target, next } = rankProgress(career);
  const shifts = next
    ? `${career.fullShifts}/${DAYS_TO_PROMOTE} full shifts toward ${next.title}`
    : "Top of the ladder";
  return (
    <span className="flex items-center gap-1.5" title={`Today ${career.today}/${target} pts · ${shifts}`}>
      <span className="font-bold">{RANKS[career.rank].title}</span>
      <span className="relative h-2 w-16 overflow-hidden border border-[#0b0d14] bg-[#d6d1c3]" aria-hidden>
        <span className="absolute inset-y-0 left-0 bg-[#3d8b4a]" style={{ width: `${fraction * 100}%` }} />
      </span>
    </span>
  );
}

/** Today's performance points against the shift's target. */
export function TodayBar({ career }: { career: Career }) {
  const { fraction, target } = rankProgress(career);
  return (
    <div className="text-[10px] text-[#d6dbe6]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold uppercase tracking-wider text-[#9fd36b]">Today&apos;s performance</span>
        <span className="text-[#9aa4b8]">
          {career.today}/{target} pts
        </span>
      </div>
      <div
        className="mt-1 h-2.5 w-full overflow-hidden border border-[#0b0d14] bg-[#2a2d45]"
        role="progressbar"
        aria-label="Today's performance"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div
          className="h-full bg-gradient-to-r from-[#3d8b4a] to-[#9fd36b] transition-[width] duration-500"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <div className="mt-1 text-[#9aa4b8]">
        {fraction >= 1 ? "Bar full! Keep it up until clock-out." : "Fill the bar by clock-out."}
      </div>
    </div>
  );
}

/** Full-bar shifts toward the next promotion. */
export function PromotionTrack({ career }: { career: Career }) {
  const next = RANKS[career.rank + 1];
  return (
    <div className="text-[10px] text-[#d6dbe6]">
      <div className="font-bold uppercase tracking-wider text-[#e8d28a]">Next promotion</div>
      {next ? (
        <>
          <div className="mt-1 flex gap-1" aria-hidden>
            {Array.from({ length: DAYS_TO_PROMOTE }, (_, i) => (
              <span
                key={i}
                className={`h-2.5 flex-1 border border-[#0b0d14] ${i < career.fullShifts ? "bg-[#c9a227]" : "bg-[#2a2d45]"}`}
              />
            ))}
          </div>
          <div className="mt-1 text-[#9aa4b8]">
            {career.fullShifts}/{DAYS_TO_PROMOTE} full-bar shifts toward{" "}
            <span className="text-[#d6dbe6]">{next.title}</span>
          </div>
        </>
      ) : (
        <div className="mt-1 text-[#9aa4b8]">Top of the ladder.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promotion ceremony
// ---------------------------------------------------------------------------
export function PromotionCeremony({
  rank,
  playerName,
  onAccept,
}: {
  rank: number;
  playerName: string;
  onAccept: () => void;
}) {
  const partner = NPCS.find((n) => n.id === "eleanor")!;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const r = RANKS[rank];

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#0b0d14]/70 p-4 font-mono">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-title"
        className="w-full max-w-md rounded border-4 border-[#0b0d14] bg-[#f4efe4] text-[#1b1b22] shadow-[8px_8px_0_#0b0d14]"
      >
        <div className="border-b-4 border-[#c9a227] bg-[#2a2d45] px-5 py-4 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#9aa4b8]">Hartwell &amp; Finch LLP · Memo</div>
          <h2 id="promotion-title" className="mt-1 text-lg font-bold tracking-wider text-[#e8d28a]">
            ★ Promotion ★
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-[12px] leading-relaxed">
          <div className="flex items-start gap-3">
            <Portrait palette={partner.palette} size={44} />
            <p>
              &ldquo;Congratulations, {playerName}. Your work has been excellent. Effective immediately, you&apos;re
              promoted to <strong>{r.title}</strong>.&rdquo;
              <span className="mt-1 block text-[10px] text-[#6b6458]">
                — {partner.name}, {partner.role}
              </span>
            </p>
          </div>
          <div className="border-2 border-[#0b0d14] bg-white p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#6b6458]">
              New responsibilities unlocked
            </div>
            <ul className="list-disc space-y-1 pl-4 text-[11px]">
              {r.responsibilities.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <button
            ref={buttonRef}
            type="button"
            onClick={onAccept}
            className="w-full border-2 border-[#0b0d14] bg-[#c9a227] py-2.5 text-[12px] font-bold uppercase tracking-wider shadow-[3px_3px_0_#0b0d14]"
          >
            Accept promotion ▶
          </button>
        </div>
      </div>
    </div>
  );
}
