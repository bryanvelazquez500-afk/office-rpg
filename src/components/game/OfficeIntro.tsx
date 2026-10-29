"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import IsometricOfficeRPG from "./IsometricOfficeRPG";
import { RANKS } from "./CareerProgression";
import { FIRM_NAME, PLAYER_NAME_MAX, validatePlayerName } from "./characters";
import { formatMinutes, minuteOfDay, workdayDate } from "./OfficeLunchAndTools";
import { deleteSave, fromIsoDay, parseSave, readSaveRaw, subscribeSave, type SaveData } from "./saveGame";
import { unlockAudio } from "./sound";

/**
 * Entry point for the game. With a saved character it offers Continue or Delete
 * character; otherwise it collects a name on a "visitor sign-in" screen and hands
 * off to the office, which opens with the onboarding cutscene.
 */
export default function OfficeIntro() {
  const raw = useSyncExternalStore(subscribeSave, readSaveRaw, () => null);
  const save = useMemo(() => parseSave(raw), [raw]);
  const [playing, setPlaying] = useState<{ name: string; save: SaveData | null } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (playing) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-2 sm:p-6">
        <IsometricOfficeRPG
          key={playing.name}
          playerName={playing.name}
          save={playing.save}
          onQuit={() => setPlaying(null)}
        />
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validatePlayerName(draft);
    if (problem) return setError(problem);
    unlockAudio(); // clocking in is the first click, so sound is ready from the start
    setPlaying({ name: draft.trim().replace(/\s+/g, " "), save: null });
  };

  if (save) {
    const { engine } = save;
    const date = workdayDate(fromIsoDay(engine.firstDay), engine.day);
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-4 font-mono">
        <div className="w-full max-w-md rounded border-4 border-[#0b0d14] bg-[#f4efe4] text-[#1b1b22] shadow-[8px_8px_0_#0b0d14]">
          <div className="border-b-4 border-[#0b0d14] bg-[#2a2d45] px-5 py-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#9aa4b8]">Welcome back to</div>
            <h1 className="mt-1 text-lg font-bold tracking-wider text-[#e8d28a] sm:text-xl">{FIRM_NAME}</h1>
          </div>
          <div className="space-y-4 px-5 py-6">
            <div className="flex items-center gap-3 rounded border-2 border-[#0b0d14] bg-white px-3 py-3 text-[11px]">
              <span className="grid h-10 w-10 shrink-0 place-items-center border-2 border-[#0b0d14] bg-[#4a7fc1] text-[13px] font-bold text-white">
                ID
              </span>
              <div className="min-w-0 leading-snug">
                <div className="truncate text-[14px] font-bold">{save.playerName}</div>
                <div className="text-[#4a4438]">{RANKS[engine.career.rank]?.title} · Assurance</div>
                <div className="text-[#6b6458]">
                  Day {engine.day + 1} ·{" "}
                  {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                  {formatMinutes(minuteOfDay(engine.clock))}
                </div>
              </div>
            </div>

            {confirmDelete ? (
              <div
                role="alertdialog"
                aria-labelledby="delete-title"
                className="space-y-3 border-2 border-[#b33a3a] bg-[#fbe3df] p-3"
              >
                <p id="delete-title" className="text-[12px] font-bold text-[#7a1f1f]">
                  Delete {save.playerName}?
                </p>
                <p className="text-[11px] text-[#4a4438]">
                  Every day of progress, your rank, your CPA study levels and all of your work will be erased. This
                  can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      deleteSave();
                      setConfirmDelete(false);
                    }}
                    className="flex-1 border-2 border-[#0b0d14] bg-[#b33a3a] py-2 text-[11px] font-bold uppercase tracking-wider text-white"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 border-2 border-[#0b0d14] bg-white py-2 text-[11px] font-bold uppercase tracking-wider"
                  >
                    Keep playing
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    unlockAudio();
                    setPlaying({ name: save.playerName, save });
                  }}
                  className="w-full border-2 border-[#0b0d14] bg-[#c9a227] py-2.5 text-[13px] font-bold uppercase tracking-wider text-[#1b1b22] shadow-[3px_3px_0_#0b0d14] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Continue ▶
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full border-2 border-[#0b0d14] bg-white py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#7a1f1f] hover:bg-[#fbe3df]"
                >
                  Delete character
                </button>
                <p className="text-center text-[10px] text-[#6b6458]">
                  Saved {new Date(save.savedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} ·
                  the game saves automatically as you play
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-4 font-mono">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded border-4 border-[#0b0d14] bg-[#f4efe4] text-[#1b1b22] shadow-[8px_8px_0_#0b0d14]"
      >
        <div className="border-b-4 border-[#0b0d14] bg-[#2a2d45] px-5 py-4 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#9aa4b8]">First day at</div>
          <h1 className="mt-1 text-lg font-bold tracking-wider text-[#e8d28a] sm:text-xl">{FIRM_NAME}</h1>
        </div>

        <div className="space-y-4 px-5 py-6">
          <div className="flex items-center gap-3 rounded border-2 border-dashed border-[#a39a88] bg-white/60 px-3 py-2 text-[11px] text-[#4a4438]">
            <span className="grid h-8 w-8 shrink-0 place-items-center border-2 border-[#0b0d14] bg-[#4a7fc1] text-[13px] font-bold text-white">
              ID
            </span>
            Reception needs a name for your new hire badge.
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider">Your name</span>
            <input
              autoFocus
              value={draft}
              maxLength={PLAYER_NAME_MAX + 5}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Alex Morgan"
              aria-invalid={!!error}
              aria-describedby={error ? "name-error" : undefined}
              className="w-full rounded-none border-2 border-[#0b0d14] bg-white px-3 py-2 text-[15px] outline-none focus:shadow-[3px_3px_0_#c9a227]"
            />
          </label>
          {error && (
            <p id="name-error" className="text-[11px] font-bold text-[#b33a3a]">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full border-2 border-[#0b0d14] bg-[#c9a227] py-2.5 text-[13px] font-bold uppercase tracking-wider text-[#1b1b22] shadow-[3px_3px_0_#0b0d14] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Clock in ▶
          </button>
        </div>
      </form>
    </div>
  );
}
