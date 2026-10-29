"use client";

// One saved character per browser, kept in localStorage. The game autosaves while
// you play, the title screen offers Continue or Delete character, and a new
// character can only start once the old one is deleted.

import type { Career } from "./CareerProgression";
import type { ChatTurn } from "./CoworkerChat";
import type { DayLog } from "./DailyChecklist";
import type { Stats } from "./OfficeLunchAndTools";
import type { SavedPlan } from "./studyPlan";
import type { WorkstationSave } from "./OfficeWorkstation";

const KEY = "office-rpg:save";
const VERSION = 1;
const CHANGED = "office-rpg:save-changed"; // lets the title screen notice saves and deletes

export interface EngineSave {
  clock: number; // office minutes since midnight of day 1
  day: number; // 0-based workday
  firstDay: string; // the real date of day 1, YYYY-MM-DD
  career: Career;
  plan: SavedPlan;
  stats: Stats;
  dayLog: DayLog;
  lunchDone: boolean; // today's lunch break already happened
  dailySlots?: number[]; // routine assignments each day received (added after version 1 shipped)
}

export interface SaveData {
  version: number;
  playerName: string;
  savedAt: number; // real time, ms
  engine: EngineSave;
  workstation: WorkstationSave | null;
  chats: Record<string, ChatTurn[]>;
}

function parse(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    return data?.version === VERSION && typeof data.playerName === "string" && data.engine ? data : null;
  } catch {
    return null;
  }
}

/** Raw saved text (for useSyncExternalStore, which needs a stable snapshot). */
export function readSaveRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked (e.g. some private windows): play without saving
  }
}

export const loadSave = () => parse(readSaveRaw());
export const parseSave = parse;

export function writeSave(data: Omit<SaveData, "version" | "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: VERSION, savedAt: Date.now() }));
    window.dispatchEvent(new Event(CHANGED));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to delete if storage is unavailable
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Subscribe to save changes from this tab (and other tabs, via the storage event). */
export function subscribeSave(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export const toIsoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function fromIsoDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
