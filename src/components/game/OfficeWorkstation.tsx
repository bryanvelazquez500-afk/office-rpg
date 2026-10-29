"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { NPCS } from "./characters";
import { PerformanceBar, type Career } from "./CareerProgression";
import {
  ACCOUNTS,
  BOOKS,
  EMAILS,
  HINTS,
  NORMAL_DEBIT,
  OPENING_BALANCES,
  SHEET_HINTS,
  STARTING_SHEETS,
  TASKS,
  checkEntry,
  emailArrival,
  netByAccount,
  type BookId,
  type Email,
  type JournalLine,
  type Task,
} from "./gaap";
import { Portrait, formatClock, type LunchView, type RequestView } from "./OfficeLunchAndTools";
import {
  Binder,
  Calculator,
  DeskTray,
  HighlightableText,
  type DeskTool,
  type Tape,
  type WorkpaperView,
} from "./OfficeSupplies";
import { GuideHand, type GuideStep } from "./GuideHand";
import { displayCell, type Cells } from "./spreadsheetFormula";

// The player's desktop computer: a retro OS with knockoff enterprise apps
// (PigeonMail, LedgerLite ERP, CellSheet 97), a contextual GAAP Hint drawer,
// and the physical desk tools (OfficeSupplies) in front of the monitor.

type App = "desktop" | "mail" | "ledger" | "sheet";

export const LOG_OFF_HOLD_MS = 3000;

interface PostedEntry {
  no: number;
  book: BookId;
  memo: string;
  lines: JournalLine[];
  taskId?: string; // set when the entry satisfied an assignment step
  reverses?: number;
  reversedBy?: number;
}

interface PostResult {
  tone: "good" | "info" | "warn";
  text: string;
}

/** Workpaper state for one assignment: which entries tie out and the stapled calculator tape. */
interface TaskProgress {
  steps: number[];
  tape: Tape | null;
}

type InboxEmail = Email & { at: number }; // `at` = resolved office minute it arrived

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseAmount = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const npc = (id: string) => NPCS.find((n) => n.id === id)!;
const firstName = (id: string) => npc(id).name.split(" ")[0];
const senderOf = (taskId: string) => EMAILS.find((e) => e.taskId === taskId)!;
const isEditable = (el: Element | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
const NO_PROGRESS: TaskProgress = { steps: [], tape: null };

// ---------------------------------------------------------------------------
// Hold Space (or the Log off button) for 3 seconds to leave the computer.
// ---------------------------------------------------------------------------
function useHoldToExit(active: boolean, onExit: () => void) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  });

  const begin = useCallback(() => {
    if (startRef.current !== null) return;
    startRef.current = performance.now();
    const step = () => {
      if (startRef.current === null) return;
      const p = Math.min(1, (performance.now() - startRef.current) / LOG_OFF_HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        startRef.current = null;
        setProgress(0);
        exitRef.current();
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const end = useCallback(() => {
    startRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      // Space still types normally inside text fields.
      if (e.code !== "Space" || isEditable(document.activeElement)) return;
      e.preventDefault();
      if (!e.repeat) begin(); // ignore the auto-repeat left over from sitting down
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") end();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", end);
      end();
    };
  }, [active, begin, end]);

  return { progress, begin, end };
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
/** Everything about the player's work at the computer that a saved game keeps. */
export interface WorkstationSave {
  readIds: string[];
  activeTask: string | null;
  done: string[];
  replies: InboxEmail[];
  journal: PostedEntry[];
  book: BookId;
  sheets: Record<string, Cells>;
  progress: Record<string, TaskProgress>;
  highlights: Record<string, string[]>;
}

/** A newly arrived email, announced to the office even when the player isn't at the computer. */
export interface MailNotice {
  from: string; // NPC id
  subject: string;
  assignment: boolean;
}

interface Props {
  open: boolean;
  playerName: string;
  clock: number; // office minutes since midnight of day 1
  career: Career;
  lunch: LunchView | null;
  request: RequestView | null;
  onExit: () => void;
  onReward: (points: number, text: string, taskId: string) => void;
  onMail: (notices: MailNotice[]) => void;
  guide: boolean; // show the new-hire guide hand
  saved: WorkstationSave | null; // restore from a saved game
  onSave: (state: WorkstationSave) => void; // called whenever the saved parts change
}

export default function OfficeWorkstation({
  open,
  playerName,
  clock,
  career,
  lunch,
  request,
  onExit,
  onReward,
  onMail,
  guide,
  saved,
  onSave,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<App>("desktop");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(saved?.readIds));
  const [activeTask, setActiveTask] = useState<string | null>(saved?.activeTask ?? null);
  const [done, setDone] = useState<Set<string>>(() => new Set(saved?.done)); // signed off
  const [replies, setReplies] = useState<InboxEmail[]>(saved?.replies ?? []);
  const [journal, setJournal] = useState<PostedEntry[]>(saved?.journal ?? []);
  const [book, setBook] = useState<BookId>(saved?.book ?? "tidewater");
  const [sheets, setSheets] = useState<Record<string, Cells>>(saved?.sheets ?? STARTING_SHEETS);
  const [sheetName, setSheetName] = useState("Scratch");
  const [hintOpen, setHintOpen] = useState(false);
  const [doubt, setDoubt] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, TaskProgress>>(saved?.progress ?? {});
  const [highlights, setHighlights] = useState<Record<string, string[]>>(saved?.highlights ?? {}); // email id → ticked figures
  const [highlighter, setHighlighter] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [binderOpen, setBinderOpen] = useState(false);
  const hold = useHoldToExit(open, onExit);

  useEffect(() => {
    if (open) rootRef.current?.focus();
  }, [open]);

  // Hand the saveable parts to the game whenever they change.
  useEffect(() => {
    onSave({ readIds: [...readIds], activeTask, done: [...done], replies, journal, book, sheets, progress, highlights });
    // onSave is a fresh closure each render; only real changes should report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readIds, activeTask, done, replies, journal, book, sheets, progress, highlights]);

  const now = Math.floor(clock);
  const emails: InboxEmail[] = [
    ...EMAILS.flatMap((e) => {
      const at = emailArrival(e, career.unlockedAt);
      return at !== null && at <= now ? [{ ...e, at }] : [];
    }),
    ...replies,
  ].sort((a, b) => b.at - a.at);
  const unread = emails.filter((e) => !readIds.has(e.id)).length;

  // Announce mail that arrives after the day starts (the first inbox load is silent).
  const seenMail = useRef<Set<string> | null>(null);
  const mailKey = emails.map((e) => e.id).join("|");
  useEffect(() => {
    const ids = mailKey ? mailKey.split("|") : [];
    if (!seenMail.current) {
      seenMail.current = new Set(ids);
      return;
    }
    const seen = seenMail.current;
    const fresh = emails.filter((e) => !seen.has(e.id));
    if (!fresh.length) return;
    for (const e of fresh) seen.add(e.id);
    onMail(fresh.map((e) => ({ from: e.from, subject: e.subject, assignment: !!e.taskId })));
    // Runs only when the set of emails changes; `emails` is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailKey]);
  const openTasks = emails.flatMap((e) => (e.taskId && !done.has(e.taskId) ? [TASKS[e.taskId]] : []));
  const currentTask = activeTask && !done.has(activeTask) ? TASKS[activeTask] : null;
  const progressOf = (id: string) => progress[id] ?? NO_PROGRESS;
  const books = (Object.keys(BOOKS) as BookId[]).filter((b) => BOOKS[b].tier <= career.rank + 1);

  // ---- Workpapers (binder pages), oldest assignment first
  const pages: WorkpaperView[] = emails
    .filter((e) => e.taskId)
    .reverse()
    .map((e) => {
      const task = TASKS[e.taskId!];
      const p = progressOf(task.id);
      const ticked = new Set(highlights[e.id] ?? []);
      const signedOff = done.has(task.id);
      return {
        taskId: task.id,
        title: task.title,
        tier: task.tier,
        from: npc(e.from).name,
        keyLabel: task.keyLabel,
        steps: task.steps.map((s, i) => ({ label: s.label, posted: signedOff || p.steps.includes(i) })),
        evidence: task.evidence.map((figure) => ({ figure, ticked: signedOff || ticked.has(figure) })),
        tape: p.tape,
        tapeTies: !!p.tape && Math.abs(p.tape.total - task.keyAmount) < 0.5,
        signedOff,
      };
    });
  const readyToSign = (p: WorkpaperView) =>
    !p.signedOff && p.steps.every((s) => s.posted) && p.evidence.every((e) => e.ticked) && p.tapeTies;

  // ---- Mail
  const selectEmail = (id: string) => {
    setSelectedEmail(id);
    setReadIds((r) => new Set(r).add(id));
  };

  const openApp = (next: App, sheet?: string) => {
    setApp(next);
    if (sheet) setSheetName(sheet);
  };

  const startTask = (taskId: string) => {
    setActiveTask(taskId);
    setBook(TASKS[taskId].book);
  };

  // ---- Assignments
  function completeTask(task: Task) {
    const src = senderOf(task.id);
    setDone((d) => new Set(d).add(task.id));
    setActiveTask((t) => (t === task.id ? null : t));
    setDoubt(null);
    setReplies((r) => [
      ...r,
      {
        id: `re-${task.id}`,
        from: src.from,
        subject: `Re: ${src.subject}`,
        arrivesAt: now,
        at: now,
        tier: task.tier,
        body: ["Workpaper reviewed. Everything ties out. Nice work! ✅", `— ${firstName(src.from)}`],
      },
    ]);
    onReward(task.reward, `✅ ${task.title} signed off (+${task.reward} pts)`, task.id);
  }

  const signOff = (taskId: string) => {
    const page = pages.find((p) => p.taskId === taskId);
    if (page && readyToSign(page)) completeTask(TASKS[taskId]);
  };

  const post = (memo: string, lines: JournalLine[]): PostResult => {
    const no = journal.length + 1;
    let hit: { task: Task; step: number } | null = null;
    for (const t of openTasks) {
      if (t.book !== book) continue;
      const posted = progressOf(t.id).steps;
      const step = t.steps.findIndex((s, i) => !posted.includes(i) && checkEntry(lines, s.expected) === "match");
      if (step >= 0) {
        hit = { task: t, step };
        break;
      }
    }
    setJournal((j) => [...j, { no, book, memo, lines, taskId: hit?.task.id }]);

    if (hit) {
      const { task, step } = hit;
      setProgress((p) => {
        const cur = p[task.id] ?? NO_PROGRESS;
        return { ...p, [task.id]: { ...cur, steps: [...cur.steps, step] } };
      });
      setDoubt(null);
      const remaining = task.steps.length - progressOf(task.id).steps.length - 1;
      const who = firstName(senderOf(task.id).from);
      return {
        tone: "good",
        text: `JE #${no} posted. ${who}: “${task.steps[step].label}: ties out ✓”. ${
          remaining
            ? `${remaining} more entr${remaining === 1 ? "y" : "ies"} to go.`
            : "Now finish the workpaper in your binder and sign off."
        }`,
      };
    }

    if (currentTask) {
      const who = firstName(senderOf(currentTask.id).from);
      const posted = progressOf(currentTask.id).steps;
      const results = currentTask.steps.filter((_, i) => !posted.includes(i)).map((s) => checkEntry(lines, s.expected));
      const note =
        currentTask.book !== book
          ? `${who}: "That belongs in the ${BOOKS[currentTask.book].name} book, not this one."`
          : results.includes("wrong-amount")
            ? `${who}: "Right accounts, but the amount doesn't tie out. Recheck the calculation."`
            : results.includes("wrong-accounts")
              ? `${who}: "Those aren't the accounts I'd expect for this."`
              : null;
      if (note) {
        setDoubt(note);
        return { tone: "warn", text: `JE #${no} posted. ${note} Reverse it from the Journal tab and try again.` };
      }
    }
    return { tone: "info", text: `JE #${no} posted.` };
  };

  const reverse = (no: number) => {
    setJournal((j) => {
      const original = j.find((e) => e.no === no);
      if (!original || original.reversedBy || original.reverses || original.taskId) return j;
      const newNo = j.length + 1;
      const swapped = original.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit }));
      return [
        ...j.map((e) => (e.no === no ? { ...e, reversedBy: newNo } : e)),
        { no: newNo, book: original.book, memo: `Reversal of JE #${no}`, lines: swapped, reverses: no },
      ];
    });
  };

  // ---- Desk tools
  const toggleTool = (tool: DeskTool) => {
    if (tool === "highlighter") setHighlighter((h) => !h);
    else if (tool === "calculator") setCalculatorOpen((o) => !o);
    else setBinderOpen((o) => !o);
  };

  const toggleHighlight = (emailId: string, figure: string) =>
    setHighlights((h) => {
      const ticked = new Set(h[emailId] ?? []);
      if (ticked.has(figure)) ticked.delete(figure);
      else ticked.add(figure);
      return { ...h, [emailId]: [...ticked] };
    });

  const stapleTape = (tape: Tape) => {
    if (!currentTask) return;
    setProgress((p) => ({ ...p, [currentTask.id]: { ...(p[currentTask.id] ?? NO_PROGRESS), tape } }));
    if (Math.abs(tape.total - currentTask.keyAmount) >= 0.5) {
      setDoubt(
        `Your calculator tape (${tape.total.toLocaleString("en-US")}) doesn't tie to “${currentTask.keyLabel}”. Recheck the formula.`,
      );
    }
  };

  const closeCalculator = useCallback(() => setCalculatorOpen(false), []);
  const closeBinder = useCallback(() => setBinderOpen(false), []);

  // ---- GAAP hint context: what's on screen decides which rules come first.
  const selected = emails.find((e) => e.id === selectedEmail) ?? null;
  const contextTask = app === "mail" ? (selected?.taskId ?? null) : (currentTask?.id ?? null);
  const hintIds = [
    ...new Set([
      ...(contextTask ? TASKS[contextTask].hints : []),
      ...(app === "sheet" ? (SHEET_HINTS[sheetName] ?? []) : []),
      ...(app === "ledger" ? ["double-entry"] : app === "sheet" ? ["sheet-formulas"] : []),
      ...(contextTask ? ["workpapers"] : []),
    ]),
  ];
  const sheetCells = sheets[sheetName];
  const sheetError = app === "sheet" && Object.keys(sheetCells).some((ref) => displayCell(sheetCells, ref).error);
  const doubtNote =
    doubt ?? (sheetError ? "A cell on this sheet shows an error. Check the formula syntax and references." : null);

  const closeHint = () => {
    setHintOpen(false);
    setDoubt(null);
  };

  // ---- New-hire guide: always points at the single next action for the assignment in focus.
  const guideStep = ((): GuideStep | null => {
    const appTarget = (a: "mail" | "ledger") => (app === "desktop" ? `icon-${a}` : `task-${a}`);
    const closeBinderStep: GuideStep = { id: "close-binder", text: "Close the binder for now.", target: "binder-close" };
    const openEmail = (e: InboxEmail): GuideStep =>
      app !== "mail"
        ? { id: "open-mail", text: "Open PigeonMail. Your assignments arrive by email.", target: appTarget("mail") }
        : { id: `open-${e.id}`, text: `Open ${firstName(e.from)}'s assignment email.`, target: `email-${e.id}` };

    if (doubtNote && app !== "desktop" && !hintOpen)
      return { id: "hint", text: "Stuck? GAAP Hint explains the rule and the formula.", target: "hint-button" };

    const focus = pages.find((p) => p.taskId === currentTask?.id) ?? null;
    if (!focus) {
      const next = pages.find((p) => !p.signedOff);
      if (!next) return null; // all caught up
      const email = emails.find((e) => e.taskId === next.taskId)!;
      if (binderOpen) return closeBinderStep;
      if (app !== "mail" || selectedEmail !== email.id) return openEmail(email);
      return { id: "start", text: "Read the request, then start the task.", target: "start-task" };
    }

    const email = emails.find((e) => e.taskId === focus.taskId)!;
    const task = TASKS[focus.taskId];
    const ticked = focus.evidence.filter((e) => e.ticked).length;
    if (ticked < focus.evidence.length) {
      if (binderOpen) return closeBinderStep;
      if (!highlighter)
        return { id: "pick-hl", text: "Pick up the highlighter to tick the figures you rely on.", target: "tool-highlighter" };
      if (app !== "mail" || selectedEmail !== email.id) return openEmail(email);
      return {
        id: "tick",
        text: `Click each figure you'll need for the math (${ticked}/${focus.evidence.length} ticked).`,
        target: "email-body",
      };
    }
    if (!focus.steps.every((s) => s.posted)) {
      if (binderOpen) return closeBinderStep;
      if (highlighter) return { id: "drop-hl", text: "Figures ticked! Put the highlighter down.", target: "tool-highlighter" };
      if (app !== "ledger")
        return { id: "open-ledger", text: "Open LedgerLite to post the journal entry.", target: appTarget("ledger") };
      return {
        id: "post",
        text: "Pick the accounts, enter the debit and the credit, then press Post entry.",
        target: "ledger-form",
      };
    }
    if (!focus.tapeTies) {
      if (binderOpen) return closeBinderStep;
      if (!calculatorOpen)
        return {
          id: "pick-calc",
          text: `Pick up the calculator to prove the ${task.keyLabel.toLowerCase()}.`,
          target: "tool-calculator",
        };
      return {
        id: "calc",
        text: focus.tape
          ? "That tape doesn't tie. Press C, redo the math, then staple again."
          : `Key in the math for the ${task.keyLabel.toLowerCase()}, press =, then 📎 Staple to workpaper.`,
        target: "calc",
      };
    }
    if (calculatorOpen) return { id: "drop-calc", text: "Tape stapled. Put the calculator down.", target: "tool-calculator" };
    if (!binderOpen) return { id: "open-binder", text: "Open your binder to review the workpaper.", target: "tool-binder" };
    return { id: "sign", text: "Everything ties. Sign off to submit!", target: "binder-signoff" };
  })();

  const windowTitle: Record<Exclude<App, "desktop">, string> = {
    mail: "PigeonMail — Inbox",
    ledger: `LedgerLite ERP — ${BOOKS[book].name}`,
    sheet: `CellSheet 97 — tidewater_workpapers.cls [${sheetName}]`,
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      inert={!open}
      aria-hidden={!open}
      aria-label="Workstation"
      className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-lg border-4 border-[#0b0d14] bg-[#151824] font-mono text-[11px] text-[#1b1b22] outline-none transition-[opacity,transform] duration-300"
      style={{
        opacity: open ? 1 : 0,
        transform: open ? "scale(1)" : "scale(0.97)",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* Monitor */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ background: "radial-gradient(circle at 50% 40%, #3a807a 0%, #2a625d 60%, #1f4a46 100%)" }}
      >
        <div className="relative min-h-0 flex-1 p-3">
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-white/15">
            <div>
              <div className="text-4xl font-bold tracking-widest">FinchOS</div>
              <div className="mt-1 text-[11px] tracking-[0.3em]">HARTWELL &amp; FINCH LLP</div>
            </div>
          </div>
          <div className="relative flex w-24 flex-col gap-3">
            <DesktopIcon label="PigeonMail" glyph="✉" color="#e0a33a" badge={unread} guide="icon-mail" onOpen={() => openApp("mail")} />
            <DesktopIcon label="LedgerLite ERP" glyph="⚖" color="#4a7fc1" guide="icon-ledger" onOpen={() => openApp("ledger")} />
            <DesktopIcon label="CellSheet 97" glyph="▦" color="#3d8b4a" onOpen={() => openApp("sheet")} />
          </div>

          {app !== "desktop" && (
            <section
              aria-label={windowTitle[app]}
              className="absolute inset-2 flex flex-col overflow-hidden rounded-sm border-2 border-[#0b0d14] bg-[#ebe7dc] shadow-[4px_4px_0_rgba(0,0,0,0.35)] sm:inset-3"
            >
              <div className="flex items-center gap-2 bg-[#2a2d45] px-2 py-1 text-[#f4efe4]">
                <span className="min-w-0 flex-1 truncate font-bold">{windowTitle[app]}</span>
                <button
                  type="button"
                  data-guide="hint-button"
                  onClick={() => setHintOpen((o) => !o)}
                  className={`rounded-sm border border-[#0b0d14] px-2 py-0.5 text-[10px] font-bold ${
                    doubtNote && !hintOpen ? "animate-pulse bg-[#f2c14e] text-[#1b1b22]" : "bg-[#c9a227] text-[#1b1b22]"
                  }`}
                  aria-expanded={hintOpen}
                >
                  {doubtNote && !hintOpen ? "Stuck? GAAP Hint" : "GAAP Hint"}
                </button>
                <button
                  type="button"
                  onClick={() => setApp("desktop")}
                  aria-label="Minimize"
                  className="grid h-5 w-5 place-items-center border border-[#0b0d14] bg-[#ebe7dc] text-[#1b1b22]"
                >
                  –
                </button>
              </div>
              <div className="relative flex min-h-0 flex-1">
                <div className="min-w-0 flex-1 overflow-auto">
                  {app === "mail" && (
                    <MailApp
                      emails={emails}
                      readIds={readIds}
                      selected={selected}
                      onSelect={selectEmail}
                      done={done}
                      activeTask={currentTask?.id ?? null}
                      onSetTask={startTask}
                      onOpenApp={openApp}
                      highlights={highlights}
                      highlighter={highlighter}
                      onHighlight={toggleHighlight}
                    />
                  )}
                  {app === "ledger" && (
                    <LedgerApp
                      journal={journal}
                      book={book}
                      books={books}
                      onBookChange={setBook}
                      currentTask={currentTask}
                      onPost={post}
                      onReverse={reverse}
                      onDoubt={setDoubt}
                      onOpenMail={() => openApp("mail")}
                    />
                  )}
                  {app === "sheet" && (
                    <SheetApp
                      sheets={sheets}
                      sheetName={sheetName}
                      currentTask={currentTask}
                      onSheetChange={setSheetName}
                      onCellChange={(ref, raw) =>
                        setSheets((s) => ({ ...s, [sheetName]: { ...s[sheetName], [ref]: raw } }))
                      }
                      onOpenMail={() => openApp("mail")}
                    />
                  )}
                </div>
                {hintOpen && <HintDrawer ids={hintIds} doubt={doubtNote} onClose={closeHint} />}
              </div>
            </section>
          )}
        </div>

        {/* Taskbar */}
        <div className="flex items-center gap-1.5 border-t-2 border-[#0b0d14] bg-[#ebe7dc] px-2 py-1">
          <button
            type="button"
            onClick={() => setApp("desktop")}
            className="border-2 border-[#0b0d14] bg-[#2a2d45] px-2 py-0.5 font-bold text-[#e8d28a]"
          >
            ◆ FinchOS
          </button>
          <TaskbarButton active={app === "mail"} guide="task-mail" onClick={() => openApp("mail")}>
            ✉ Mail{unread ? ` (${unread})` : ""}
          </TaskbarButton>
          <TaskbarButton active={app === "ledger"} guide="task-ledger" onClick={() => openApp("ledger")}>
            ⚖ Ledger
          </TaskbarButton>
          <TaskbarButton active={app === "sheet"} onClick={() => openApp("sheet")}>
            ▦ Sheet
          </TaskbarButton>
          <div className="ml-auto flex min-w-0 items-center gap-2 text-[10px]">
            {request && (
              <span className="truncate rounded-sm bg-[#c9a227] px-1.5 py-0.5 font-bold" role="status">
                🙋 {firstName(request.npcId)}{" "}
                {request.phase === "approaching" ? "is coming over" : `waiting ${Math.ceil(request.timeLeft)}s`}
              </span>
            )}
            {lunch && (
              <span
                className={`truncate rounded-sm px-1.5 py-0.5 font-bold ${lunch.phase === "break" ? "bg-[#e0a33a]" : "bg-[#b33a3a] text-white"}`}
                role="status"
              >
                {lunch.phase === "break" ? "🥪 Lunch" : "⏰ Back to desk"} {Math.ceil(lunch.timeLeft)}s
              </span>
            )}
            <span className="hidden lg:inline">
              <PerformanceBar career={career} />
            </span>
            <span>{formatClock(clock)}</span>
            <button
              type="button"
              onPointerDown={hold.begin}
              onPointerUp={hold.end}
              onPointerLeave={hold.end}
              className="relative overflow-hidden border-2 border-[#0b0d14] bg-[#f4efe4] px-2 py-0.5 font-bold"
              aria-label="Log off: hold Space or hold this button for 3 seconds"
            >
              <span
                className="absolute inset-y-0 left-0 bg-[#e2553f]/60"
                style={{ width: `${hold.progress * 100}%` }}
                aria-hidden
              />
              <span className="relative">{hold.progress > 0 ? "Logging off…" : "⏻ Hold Space"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Physical desk in front of the monitor */}
      <DeskTray
        tool={highlighter ? "highlighter" : null}
        calculatorOpen={calculatorOpen}
        binderOpen={binderOpen}
        binderBadge={pages.filter(readyToSign).length}
        onToggle={toggleTool}
      />
      {highlighter && (
        <div className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded-sm border-2 border-[#0b0d14] bg-[#f7e463] px-2 py-0.5 text-[10px] font-bold">
          🖍 Highlighter in hand: click figures in an email to tick them
        </div>
      )}
      {calculatorOpen && (
        <Calculator attachLabel={currentTask?.title ?? null} onAttach={stapleTape} onClose={closeCalculator} />
      )}
      {binderOpen && (
        <Binder
          pages={pages}
          preparer={playerName}
          initialTaskId={currentTask?.id ?? null}
          onSignOff={signOff}
          onClose={closeBinder}
        />
      )}
      <GuideHand step={guide && open ? guideStep : null} container={rootRef} />
    </div>
  );
}

function DesktopIcon({
  label,
  glyph,
  color,
  badge,
  guide,
  onOpen,
}: {
  label: string;
  glyph: string;
  color: string;
  badge?: number;
  guide?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} data-guide={guide} className="group flex flex-col items-center gap-1 text-white">
      <span
        className="relative grid h-11 w-11 place-items-center border-2 border-[#0b0d14] text-xl shadow-[2px_2px_0_#0b0d14] group-hover:-translate-y-0.5"
        style={{ background: color }}
      >
        {glyph}
        {!!badge && (
          <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full border border-[#0b0d14] bg-[#e2553f] px-1 text-[9px] font-bold">
            {badge}
          </span>
        )}
      </span>
      <span className="bg-[#0b0d14]/40 px-1 text-center text-[10px] leading-tight group-hover:bg-[#2a2d45]">
        {label}
      </span>
    </button>
  );
}

function TaskbarButton({
  active,
  guide,
  onClick,
  children,
}: {
  active: boolean;
  guide?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-guide={guide}
      onClick={onClick}
      className={`hidden border-2 px-2 py-0.5 sm:block ${active ? "border-[#0b0d14] bg-[#d6d1c3] shadow-[inset_1px_1px_0_#0b0d14]" : "border-[#0b0d14] bg-[#f4efe4]"}`}
    >
      {children}
    </button>
  );
}

function CurrentTaskStrip({ task, onOpenMail }: { task: Task | null; onOpenMail: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b-2 border-[#0b0d14] bg-[#fff6d8] px-3 py-1.5 text-[10px]">
      {task ? (
        <>
          <span className="font-bold">📌 Current task:</span>
          <span className="min-w-0 flex-1 truncate">
            {task.title} (from {firstName(senderOf(task.id).from)})
          </span>
        </>
      ) : (
        <span className="flex-1 text-[#6b6458]">No task selected. Pick an assignment in PigeonMail.</span>
      )}
      <button type="button" onClick={onOpenMail} className="underline">
        Open mail
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PigeonMail
// ---------------------------------------------------------------------------
function MailApp({
  emails,
  readIds,
  selected,
  onSelect,
  done,
  activeTask,
  onSetTask,
  onOpenApp,
  highlights,
  highlighter,
  onHighlight,
}: {
  emails: InboxEmail[];
  readIds: Set<string>;
  selected: InboxEmail | null;
  onSelect: (id: string) => void;
  done: Set<string>;
  activeTask: string | null;
  onSetTask: (id: string) => void;
  onOpenApp: (app: App, sheet?: string) => void;
  highlights: Record<string, string[]>;
  highlighter: boolean;
  onHighlight: (emailId: string, figure: string) => void;
}) {
  const sender = selected ? npc(selected.from) : null;
  const ticked = new Set(selected ? (highlights[selected.id] ?? []) : []);
  const task = selected?.taskId ? TASKS[selected.taskId] : null;
  return (
    <div className="flex h-full min-h-0">
      <ul className="w-44 shrink-0 overflow-auto border-r-2 border-[#0b0d14] bg-[#f4efe4] sm:w-56" aria-label="Inbox">
        {emails.map((e) => {
          const unread = !readIds.has(e.id);
          const status = e.taskId ? (done.has(e.taskId) ? "done" : e.taskId === activeTask ? "active" : "open") : null;
          return (
            <li key={e.id}>
              <button
                type="button"
                data-guide={`email-${e.id}`}
                onClick={() => onSelect(e.id)}
                className={`block w-full border-b border-[#cfc8b8] px-2 py-1.5 text-left ${selected?.id === e.id ? "bg-[#d9e4f2]" : "hover:bg-white"}`}
              >
                <div className="flex items-center gap-1">
                  {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2a6fb3]" aria-label="unread" />}
                  <span className={`truncate ${unread ? "font-bold" : ""}`}>{npc(e.from).name}</span>
                  {status && (
                    <span
                      className={`ml-auto shrink-0 rounded-sm px-1 text-[9px] font-bold ${
                        status === "done"
                          ? "bg-[#d9f2d0] text-[#2f6b35]"
                          : status === "active"
                            ? "bg-[#f2c14e]"
                            : "bg-[#e6dfd2]"
                      }`}
                    >
                      {status === "done" ? "✓ done" : status === "active" ? "current" : "task"}
                    </span>
                  )}
                </div>
                <div className={`truncate text-[10px] ${unread ? "text-[#1b1b22]" : "text-[#6b6458]"}`}>
                  {e.subject}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="min-w-0 flex-1 overflow-auto p-3">
        {selected && sender ? (
          <article className="space-y-3" data-guide="email-body">
            <header className="flex items-center gap-2 border-b-2 border-[#cfc8b8] pb-2">
              <Portrait palette={sender.palette} size={32} />
              <div className="min-w-0">
                <div className="font-bold">{selected.subject}</div>
                <div className="text-[10px] text-[#6b6458]">
                  {sender.name} · {sender.role}
                </div>
              </div>
            </header>
            {selected.body.map((p, i) => (
              <p key={i} className="leading-relaxed">
                <HighlightableText
                  text={p}
                  highlighted={ticked}
                  active={highlighter}
                  onToggle={(figure) => onHighlight(selected.id, figure)}
                />
              </p>
            ))}
            {selected.taskId && (
              <div className="space-y-2 border-2 border-[#0b0d14] bg-white p-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">📋 Assignment: {task!.title}</span>
                  <span className="text-[10px] text-[#6b6458]">
                    Tier {task!.tier} · {task!.steps.length} entr{task!.steps.length === 1 ? "y" : "ies"} ·{" "}
                    {task!.reward} pts
                  </span>
                </div>
                {!done.has(selected.taskId) && (
                  <div className="text-[10px] text-[#6b6458]">
                    🖍 Tickmarks: {task!.evidence.filter((f) => ticked.has(f)).length}/{task!.evidence.length} source
                    figures highlighted
                  </div>
                )}
                {done.has(selected.taskId) ? (
                  <div className="font-bold text-[#2f6b35]">✓ Signed off and reviewed</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <MailAction
                      primary
                      guide="start-task"
                      onClick={() => {
                        onSetTask(selected.taskId!);
                        onOpenApp("ledger");
                      }}
                    >
                      {activeTask === selected.taskId ? "Continue in LedgerLite" : "Start task in LedgerLite"}
                    </MailAction>
                    {selected.sheet && (
                      <MailAction
                        onClick={() => {
                          onSetTask(selected.taskId!);
                          onOpenApp("sheet", selected.sheet);
                        }}
                      >
                        Open “{selected.sheet}” in CellSheet
                      </MailAction>
                    )}
                  </div>
                )}
              </div>
            )}
          </article>
        ) : (
          <p className="text-[#6b6458]">Select a message to read it.</p>
        )}
      </div>
    </div>
  );
}

function MailAction({
  primary,
  guide,
  onClick,
  children,
}: {
  primary?: boolean;
  guide?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-guide={guide}
      onClick={onClick}
      className={`border-2 border-[#0b0d14] px-2 py-1 font-bold shadow-[2px_2px_0_#0b0d14] ${primary ? "bg-[#c9a227]" : "bg-[#f4efe4]"}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// LedgerLite ERP
// ---------------------------------------------------------------------------
interface DraftLine {
  account: string;
  debit: string;
  credit: string;
}
const blankLine = (): DraftLine => ({ account: "", debit: "", credit: "" });

function LedgerApp({
  journal,
  book,
  books,
  onBookChange,
  currentTask,
  onPost,
  onReverse,
  onDoubt,
  onOpenMail,
}: {
  journal: PostedEntry[];
  book: BookId;
  books: BookId[];
  onBookChange: (book: BookId) => void;
  currentTask: Task | null;
  onPost: (memo: string, lines: JournalLine[]) => PostResult;
  onReverse: (no: number) => void;
  onDoubt: (note: string) => void;
  onOpenMail: () => void;
}) {
  const [tab, setTab] = useState<"entry" | "journal" | "tb">("entry");
  const entries = journal.filter((e) => e.book === book);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [message, setMessage] = useState<{ tone: "good" | "info" | "warn" | "error"; text: string } | null>(null);

  const totalDebit = lines.reduce((s, l) => s + (parseAmount(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseAmount(l.credit) || 0), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;

  const update = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const filled = lines.filter((l) => l.account || l.debit.trim() || l.credit.trim());
    const problem =
      filled.length < 2
        ? "An entry needs at least two lines."
        : filled.some((l) => !l.account)
          ? "Pick an account for every line."
          : filled.some((l) => !!l.debit.trim() === !!l.credit.trim())
            ? "Each line needs a debit or a credit, not both."
            : filled.some((l) => {
                  const n = parseAmount(l.debit.trim() || l.credit);
                  return !(n > 0);
                })
              ? "Amounts must be positive numbers."
              : diff !== 0
                ? `Out of balance by $${money(Math.abs(diff))}. Total debits must equal total credits.`
                : null;
    if (problem) {
      setMessage({ tone: "error", text: problem });
      onDoubt(problem);
      return;
    }
    const posted = filled.map((l) => ({
      account: l.account,
      debit: parseAmount(l.debit) || 0,
      credit: parseAmount(l.credit) || 0,
    }));
    setMessage(onPost(memo.trim() || "Adjusting entry", posted));
    setMemo("");
    setLines([blankLine(), blankLine()]);
  };

  const balances = { ...OPENING_BALANCES[book] };
  for (const entry of entries)
    for (const [acct, net] of Object.entries(netByAccount(entry.lines))) balances[acct] = (balances[acct] ?? 0) + net;
  const tbRows = ACCOUNTS.filter((a) => Math.abs(balances[a.name] ?? 0) >= 0.005);
  const tbDebit = tbRows.reduce((s, a) => s + Math.max(0, balances[a.name]), 0);
  const tbCredit = tbRows.reduce((s, a) => s + Math.max(0, -balances[a.name]), 0);

  const toneClass = {
    good: "border-[#2f7a3a] bg-[#d9f2d0]",
    info: "border-[#0b0d14] bg-white",
    warn: "border-[#c9a227] bg-[#fff6d8]",
    error: "border-[#b33a3a] bg-[#f7d6d0]",
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CurrentTaskStrip task={currentTask} onOpenMail={onOpenMail} />
      <div className="flex items-center gap-2 border-b-2 border-[#0b0d14] bg-[#f4efe4] px-3 py-1 text-[10px]">
        <span className="font-bold uppercase text-[#6b6458]">Book</span>
        <select
          value={book}
          onChange={(e) => onBookChange(e.target.value as BookId)}
          aria-label="Ledger book"
          className="min-w-0 flex-1 border-2 border-[#0b0d14] bg-white px-1 py-0.5"
        >
          {books.map((b) => (
            <option key={b} value={b}>
              {BOOKS[b].name}
            </option>
          ))}
        </select>
        {currentTask && currentTask.book !== book && (
          <span className="font-bold text-[#9a2f2f]">Current task posts to another book</span>
        )}
      </div>
      <div className="flex gap-1 border-b-2 border-[#0b0d14] bg-[#d6d1c3] px-2 pt-1" role="tablist">
        {(
          [
            ["entry", "New journal entry"],
            ["journal", `Journal (${entries.length})`],
            ["tb", "Trial balance"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-2 border-b-0 border-[#0b0d14] px-2 py-0.5 ${tab === id ? "bg-[#ebe7dc] font-bold" : "bg-[#c4beae]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {message && (
          <div className={`mb-2 border-2 px-2 py-1.5 ${toneClass[message.tone]}`} role="status">
            {message.text}
          </div>
        )}

        {tab === "entry" && (
          <form onSubmit={submit} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-[#6b6458]">Date</span>
              <span className="border-2 border-[#0b0d14] bg-[#e6dfd2] px-2 py-0.5">12/31 (year-end)</span>
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-[#6b6458]">Memo</span>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="e.g. Record annual depreciation"
                  className="min-w-0 flex-1 border-2 border-[#0b0d14] bg-white px-2 py-0.5"
                />
              </label>
            </div>
            <table className="w-full border-collapse" data-guide="ledger-form">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[#6b6458]">
                  <th className="py-1">Account</th>
                  <th className="w-28 py-1 text-right">Debit</th>
                  <th className="w-28 py-1 text-right">Credit</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-1">
                      <select
                        value={l.account}
                        onChange={(e) => update(i, { account: e.target.value })}
                        aria-label={`Line ${i + 1} account`}
                        className="w-full border-2 border-[#0b0d14] bg-white px-1 py-0.5"
                      >
                        <option value="">Select account…</option>
                        {ACCOUNTS.map((a) => (
                          <option key={a.name}>{a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-0.5 pr-1">
                      <input
                        inputMode="decimal"
                        value={l.debit}
                        onChange={(e) => update(i, { debit: e.target.value })}
                        aria-label={`Line ${i + 1} debit`}
                        className="w-full border-2 border-[#0b0d14] bg-white px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="py-0.5 pr-1">
                      <input
                        inputMode="decimal"
                        value={l.credit}
                        onChange={(e) => update(i, { credit: e.target.value })}
                        aria-label={`Line ${i + 1} credit`}
                        className="w-full border-2 border-[#0b0d14] bg-white px-1 py-0.5 text-right"
                      />
                    </td>
                    <td>
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                          aria-label={`Remove line ${i + 1}`}
                          className="px-1 text-[#b33a3a]"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0b0d14] font-bold">
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => setLines((ls) => [...ls, blankLine()])}
                      className="font-normal underline"
                    >
                      + Add line
                    </button>
                  </td>
                  <td className="py-1 text-right">{money(totalDebit)}</td>
                  <td className="py-1 text-right">{money(totalCredit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <div className="flex items-center justify-between gap-2">
              <span
                className={
                  totalDebit === 0 && totalCredit === 0
                    ? "text-[#6b6458]"
                    : diff === 0
                      ? "font-bold text-[#2f6b35]"
                      : "text-[#9a2f2f]"
                }
              >
                {totalDebit === 0 && totalCredit === 0
                  ? "Enter amounts to begin."
                  : diff === 0
                    ? "✓ Balanced"
                    : `Out of balance by $${money(Math.abs(diff))}`}
              </span>
              <button
                type="submit"
                className="border-2 border-[#0b0d14] bg-[#4a7fc1] px-3 py-1 font-bold text-white shadow-[2px_2px_0_#0b0d14]"
              >
                Post entry
              </button>
            </div>
          </form>
        )}

        {tab === "journal" && (
          <div className="space-y-2">
            {!entries.length && <p className="text-[#6b6458]">No entries posted to this book yet.</p>}
            {[...entries].reverse().map((entry) => (
              <div key={entry.no} className="border-2 border-[#0b0d14] bg-white">
                <div className="flex items-center gap-2 border-b border-[#cfc8b8] bg-[#f4efe4] px-2 py-1">
                  <span className="font-bold">JE #{entry.no}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.memo}</span>
                  {entry.taskId && <span className="text-[10px] font-bold text-[#2f6b35]">✓ Reviewed</span>}
                  {entry.reversedBy && (
                    <span className="text-[10px] text-[#6b6458]">Reversed by #{entry.reversedBy}</span>
                  )}
                  {!entry.taskId && !entry.reversedBy && !entry.reverses && (
                    <button type="button" onClick={() => onReverse(entry.no)} className="text-[10px] underline">
                      Reverse
                    </button>
                  )}
                </div>
                <table className="w-full">
                  <tbody>
                    {entry.lines.map((l, i) => (
                      <tr key={i}>
                        <td className={`px-2 py-0.5 ${l.credit ? "pl-8" : ""}`}>{l.account}</td>
                        <td className="w-24 px-2 text-right">{l.debit ? money(l.debit) : ""}</td>
                        <td className="w-24 px-2 text-right">{l.credit ? money(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {tab === "tb" && (
          <table className="w-full border-2 border-[#0b0d14] bg-white">
            <thead className="bg-[#f4efe4] text-left text-[10px] uppercase text-[#6b6458]">
              <tr>
                <th className="px-2 py-1">Account</th>
                <th className="w-28 px-2 py-1 text-right">Debit</th>
                <th className="w-28 px-2 py-1 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {tbRows.map((a) => {
                const bal = balances[a.name];
                const abnormal = NORMAL_DEBIT.has(a.type) ? bal < 0 : bal > 0;
                return (
                  <tr key={a.name} className="border-t border-[#e6dfd2]">
                    <td className="px-2 py-0.5">
                      {a.name}
                      {abnormal && <span className="ml-1 text-[9px] text-[#b33a3a]">(abnormal balance)</span>}
                    </td>
                    <td className="px-2 text-right">{bal > 0 ? money(bal) : ""}</td>
                    <td className="px-2 text-right">{bal < 0 ? money(-bal) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#0b0d14] font-bold">
                <td className="px-2 py-1">Totals</td>
                <td className="px-2 text-right">{money(tbDebit)}</td>
                <td className="px-2 text-right">{money(tbCredit)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CellSheet 97
// ---------------------------------------------------------------------------
const COLUMNS = "ABCDEFGH".split("");
const ROW_COUNT = 14;

function SheetApp({
  sheets,
  sheetName,
  currentTask,
  onSheetChange,
  onCellChange,
  onOpenMail,
}: {
  sheets: Record<string, Cells>;
  sheetName: string;
  currentTask: Task | null;
  onSheetChange: (name: string) => void;
  onCellChange: (ref: string, raw: string) => void;
  onOpenMail: () => void;
}) {
  const cells = sheets[sheetName];
  const [selected, setSelected] = useState("A1");
  const [draft, setDraft] = useState(cells.A1 ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const select = (ref: string) => {
    setSelected(ref);
    setDraft(cells[ref] ?? "");
    inputRef.current?.focus();
  };

  const move = (dc: number, dr: number) => {
    const col = Math.min(COLUMNS.length - 1, Math.max(0, COLUMNS.indexOf(selected[0]) + dc));
    const row = Math.min(ROW_COUNT, Math.max(1, Number(selected.slice(1)) + dr));
    const ref = COLUMNS[col] + row;
    setSelected(ref);
    setDraft(cells[ref] ?? "");
  };

  const commit = () => {
    if (draft !== (cells[selected] ?? "")) onCellChange(selected, draft);
  };

  const switchSheet = (name: string) => {
    onSheetChange(name);
    setSelected("A1");
    setDraft(sheets[name].A1 ?? "");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CurrentTaskStrip task={currentTask} onOpenMail={onOpenMail} />
      <div className="flex items-center gap-2 border-b-2 border-[#0b0d14] bg-[#f4efe4] px-2 py-1">
        <span className="w-10 border-2 border-[#0b0d14] bg-white text-center font-bold">{selected}</span>
        <span className="italic text-[#6b6458]">fx</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              commit();
              if (e.key === "Enter") move(0, e.shiftKey ? -1 : 1);
              else move(e.shiftKey ? -1 : 1, 0);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(cells[selected] ?? "");
            }
          }}
          onBlur={commit}
          aria-label={`Contents of ${selected}`}
          placeholder="Type a value or =formula, then Enter"
          className="min-w-0 flex-1 border-2 border-[#0b0d14] bg-white px-2 py-0.5"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="border-collapse" role="grid" aria-label={`${sheetName} sheet`}>
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-8 border border-[#b8b2a3] bg-[#d6d1c3]" />
              {COLUMNS.map((c) => (
                <th
                  key={c}
                  className={`sticky top-0 z-10 border border-[#b8b2a3] px-1 font-normal ${selected[0] === c ? "bg-[#c4ccd9]" : "bg-[#d6d1c3]"} ${c === "A" ? "min-w-[150px]" : "min-w-[88px]"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROW_COUNT }, (_, r) => r + 1).map((row) => (
              <tr key={row}>
                <th
                  className={`border border-[#b8b2a3] px-1 text-center font-normal ${selected.slice(1) === String(row) ? "bg-[#c4ccd9]" : "bg-[#d6d1c3]"}`}
                >
                  {row}
                </th>
                {COLUMNS.map((c) => {
                  const ref = c + row;
                  const shown = displayCell(cells, ref);
                  const isSel = ref === selected;
                  return (
                    <td
                      key={ref}
                      onClick={() => select(ref)}
                      aria-selected={isSel}
                      className={`h-6 cursor-cell border border-[#d6d1c3] px-1 ${shown.numeric ? "text-right" : ""} ${
                        shown.error ? "font-bold text-[#b33a3a]" : ""
                      } ${isSel ? "outline outline-2 -outline-offset-2 outline-[#2a6fb3]" : ""} ${
                        cells[ref]?.startsWith("=") && !shown.error ? "bg-[#f2f8ee]" : ""
                      }`}
                    >
                      {shown.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-1 border-t-2 border-[#0b0d14] bg-[#d6d1c3] px-2 pb-1" role="tablist">
        {Object.keys(sheets).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === sheetName}
            onClick={() => switchSheet(name)}
            className={`border-2 border-t-0 border-[#0b0d14] px-2 py-0.5 ${name === sheetName ? "bg-white font-bold" : "bg-[#c4beae]"}`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GAAP Hint drawer
// ---------------------------------------------------------------------------
function HintDrawer({ ids, doubt, onClose }: { ids: string[]; doubt: string | null; onClose: () => void }) {
  const others = Object.keys(HINTS).filter((id) => !ids.includes(id));
  return (
    <aside
      aria-label="GAAP Hint"
      className="absolute inset-y-0 right-0 z-20 flex w-[min(320px,85%)] flex-col border-l-4 border-[#c9a227] bg-[#fdfaf2] shadow-[-4px_0_0_rgba(0,0,0,0.15)]"
    >
      <div className="flex items-center justify-between bg-[#c9a227] px-3 py-1.5">
        <span className="font-bold">📘 GAAP Hint</span>
        <button type="button" onClick={onClose} aria-label="Close hints" className="px-1 font-bold">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {doubt && <div className="border-2 border-[#c9a227] bg-[#fff6d8] p-2 leading-relaxed">💡 {doubt}</div>}
        {ids.length ? (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b6458]">
              For what you&apos;re working on
            </div>
            {ids.map((id, i) => (
              <HintCard key={id} id={id} defaultOpen={i === 0} />
            ))}
          </>
        ) : (
          <p className="text-[#6b6458]">Open an assignment email or app to see rules that apply to it.</p>
        )}
        <div className="pt-1 text-[10px] font-bold uppercase tracking-wider text-[#6b6458]">Browse all topics</div>
        {others.map((id) => (
          <HintCard key={id} id={id} defaultOpen={false} />
        ))}
      </div>
    </aside>
  );
}

function HintCard({ id, defaultOpen }: { id: string; defaultOpen: boolean }) {
  const hint = HINTS[id];
  return (
    <details open={defaultOpen} className="border-2 border-[#0b0d14] bg-white">
      <summary className="cursor-pointer px-2 py-1.5 font-bold">{hint.title}</summary>
      <div className="space-y-2 border-t border-[#e6dfd2] px-2 py-2 leading-relaxed">
        <div className="text-[10px] font-bold text-[#2a6fb3]">{hint.source}</div>
        <p>{hint.rule}</p>
        <div className="space-y-1 bg-[#2a2d45] p-2 text-[10px] text-[#e8d28a]">
          {hint.formula.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
        {hint.notes && (
          <ul className="list-disc space-y-1 pl-4 text-[10px] text-[#4a4438]">
            {hint.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
