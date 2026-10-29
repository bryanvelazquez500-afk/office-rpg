"use client";

import { useEffect, useReducer, useState, type ReactNode } from "react";

// Physical desk tools that sit in front of the monitor while you're at the
// workstation: a highlighter for ticking source figures in emails, a 10-key
// calculator with a paper tape, and the workpaper binder where assignments are
// signed off.

export type DeskTool = "highlighter" | "calculator" | "binder";

// ---------------------------------------------------------------------------
// Highlighter: any figure in an email body ($48,000 · 6% · 5) can be ticked.
// ---------------------------------------------------------------------------
const FIGURE = /\$?\d+(?:,\d{3})*(?:\.\d+)?%?/g;

export function HighlightableText({
  text,
  highlighted,
  active,
  onToggle,
}: {
  text: string;
  highlighted: ReadonlySet<string>;
  active: boolean;
  onToggle: (figure: string) => void;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(FIGURE)) {
    const figure = m[0];
    const i = m.index!;
    if (i > last) parts.push(text.slice(last, i));
    const on = highlighted.has(figure);
    parts.push(
      active ? (
        <button
          key={i}
          type="button"
          onClick={() => onToggle(figure)}
          aria-pressed={on}
          className={`rounded-sm px-0.5 ${on ? "bg-[#f7e463] shadow-[inset_0_-2px_0_#e0c21a]" : "bg-[#fff6b0]/40 hover:bg-[#f7e463]/70"}`}
          style={{ cursor: "crosshair" }}
        >
          {figure}
        </button>
      ) : (
        <mark key={i} className={on ? "rounded-sm bg-[#f7e463] px-0.5 text-inherit" : "bg-transparent text-inherit"}>
          {figure}
        </mark>
      ),
    );
    last = i + figure.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Calculator: immediate-execution 10-key with a printing tape.
// ---------------------------------------------------------------------------
interface CalcState {
  display: string;
  acc: number | null;
  op: string | null;
  fresh: boolean;
  tape: string[];
}

type CalcAction =
  | { type: "digit"; d: string }
  | { type: "op"; op: string }
  | { type: "equals" }
  | { type: "percent" }
  | { type: "back" }
  | { type: "clear" }
  | { type: "clearTape" };

const fmt = (n: number) => String(+n.toFixed(6));
const OP_SYMBOL: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function compute(a: number, op: string, b: number): number | null {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  return b === 0 ? null : a / b;
}

const ERROR: Omit<CalcState, "tape"> = { display: "Error", acc: null, op: null, fresh: true };

function calcReducer(s: CalcState, a: CalcAction): CalcState {
  const cur = Number(s.display);
  switch (a.type) {
    case "digit": {
      if (s.fresh || s.display === "Error") return { ...s, display: a.d === "." ? "0." : a.d, fresh: false };
      if (a.d === "." && s.display.includes(".")) return s;
      if (s.display.replace(/[-.]/g, "").length >= 12) return s;
      return { ...s, display: s.display === "0" && a.d !== "." ? a.d : s.display + a.d };
    }
    case "op": {
      if (s.display === "Error") return s;
      if (s.fresh && s.op) {
        // Changing your mind about the operator: rewrite the last tape line.
        const tape = [...s.tape];
        tape[tape.length - 1] = `${fmt(s.acc ?? cur)} ${OP_SYMBOL[a.op]}`;
        return { ...s, op: a.op, tape };
      }
      const acc = s.acc !== null && s.op ? compute(s.acc, s.op, cur) : cur;
      if (acc === null) return { ...s, ...ERROR, tape: [...s.tape, `${fmt(cur)} ÷ 0  ERROR`] };
      return { display: fmt(acc), acc, op: a.op, fresh: true, tape: [...s.tape, `${fmt(cur)} ${OP_SYMBOL[a.op]}`] };
    }
    case "equals": {
      if (s.acc === null || !s.op || s.display === "Error") return s;
      const result = compute(s.acc, s.op, cur);
      if (result === null) return { ...s, ...ERROR, tape: [...s.tape, `${fmt(cur)}  ERROR`] };
      return {
        display: fmt(result),
        acc: null,
        op: null,
        fresh: true,
        tape: [...s.tape, `${fmt(cur)} =`, `${fmt(result)} ✱`],
      };
    }
    case "percent":
      return s.display === "Error" ? s : { ...s, display: fmt(cur / 100), fresh: false };
    case "back":
      if (s.fresh || s.display === "Error") return s;
      return { ...s, display: s.display.length > 1 ? s.display.slice(0, -1) : "0" };
    case "clear":
      return { ...s, display: "0", acc: null, op: null, fresh: true };
    case "clearTape":
      return { ...s, tape: [] };
  }
}

export interface Tape {
  total: number;
  lines: string[];
}

export function Calculator({
  attachLabel,
  onAttach,
  onClose,
}: {
  attachLabel: string | null; // null when there's no current assignment to attach to
  onAttach: (tape: Tape) => void;
  onClose: () => void;
}) {
  const [s, dispatch] = useReducer(calcReducer, { display: "0", acc: null, op: null, fresh: true, tape: [] });
  const [attached, setAttached] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const k = e.key;
      if (/^[0-9.]$/.test(k)) dispatch({ type: "digit", d: k });
      else if ("+-*/".includes(k) && k.length === 1) dispatch({ type: "op", op: k });
      else if (k === "Enter" || k === "=") dispatch({ type: "equals" });
      else if (k === "%") dispatch({ type: "percent" });
      else if (k === "Backspace") dispatch({ type: "back" });
      else if (k.toLowerCase() === "c") dispatch({ type: "clear" });
      else if (k === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const key = (label: string, action: CalcAction, cls = "bg-[#e6e2d6]") => (
    <button
      key={label}
      type="button"
      onClick={() => {
        setAttached(false);
        dispatch(action);
      }}
      className={`border-2 border-[#0b0d14] py-1.5 text-[13px] font-bold shadow-[0_2px_0_#0b0d14] active:translate-y-0.5 active:shadow-none ${cls}`}
    >
      {label}
    </button>
  );

  const numeric = s.display !== "Error";

  return (
    <div
      role="dialog"
      aria-label="Calculator"
      className="absolute bottom-20 left-3 z-30 flex gap-2 font-mono text-[#1b1b22] drop-shadow-[4px_4px_0_rgba(0,0,0,0.45)]"
    >
      <div data-guide="calc" className="w-48 rounded-md border-4 border-[#0b0d14] bg-[#8d93a0] p-2">
        <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-[#2a2d45]">
          <span>FINCH-TEN 1200</span>
          <button type="button" onClick={onClose} aria-label="Put calculator down" className="px-1 text-[11px]">
            ✕
          </button>
        </div>
        <div
          className="mb-2 truncate border-2 border-[#0b0d14] bg-[#b9c9a8] px-2 py-1 text-right text-[17px] text-[#1d2a16]"
          aria-live="polite"
        >
          {s.op && <span className="float-left text-[11px]">{OP_SYMBOL[s.op]}</span>}
          {numeric ? Number(s.display).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "Error"}
          {s.display.endsWith(".") && "."}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {key("C", { type: "clear" }, "bg-[#e2553f] text-white")}
          {key("⌫", { type: "back" })}
          {key("%", { type: "percent" })}
          {key("÷", { type: "op", op: "/" }, "bg-[#c9a227]")}
          {["7", "8", "9"].map((d) => key(d, { type: "digit", d }))}
          {key("×", { type: "op", op: "*" }, "bg-[#c9a227]")}
          {["4", "5", "6"].map((d) => key(d, { type: "digit", d }))}
          {key("−", { type: "op", op: "-" }, "bg-[#c9a227]")}
          {["1", "2", "3"].map((d) => key(d, { type: "digit", d }))}
          {key("+", { type: "op", op: "+" }, "bg-[#c9a227]")}
          {key("0", { type: "digit", d: "0" })}
          {key(".", { type: "digit", d: "." })}
          <span className="col-span-2 grid">{key("=", { type: "equals" }, "bg-[#3d8b4a] text-white")}</span>
        </div>
      </div>
      {/* Paper tape */}
      <div className="flex w-40 flex-col self-stretch border-x-2 border-b-2 border-[#cfc8b8] bg-[#fffdf6] text-[10px] shadow-[inset_0_-6px_6px_-6px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between border-b border-dashed border-[#cfc8b8] px-2 py-1 text-[9px] font-bold text-[#6b6458]">
          <span>TAPE</span>
          <button type="button" onClick={() => dispatch({ type: "clearTape" })} className="underline">
            tear off
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 py-1 text-right">
          {s.tape.length ? (
            s.tape.map((line, i) => (
              <div key={i} className={line.endsWith("✱") ? "font-bold" : ""}>
                {line}
              </div>
            ))
          ) : (
            <div className="text-center text-[#a39a88]">(empty)</div>
          )}
        </div>
        <button
          type="button"
          data-guide="calc-staple"
          disabled={!attachLabel || !numeric}
          onClick={() => {
            onAttach({ total: Number(s.display), lines: s.tape });
            setAttached(true);
          }}
          className="m-1.5 border-2 border-[#0b0d14] bg-[#4a7fc1] px-1 py-1 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          title={attachLabel ? `Staple to: ${attachLabel}` : "Pick a current task in PigeonMail first"}
        >
          {attached ? "✓ Stapled to workpaper" : "📎 Staple to workpaper"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workpaper binder
// ---------------------------------------------------------------------------
export interface WorkpaperView {
  taskId: string;
  title: string;
  tier: number;
  from: string;
  keyLabel: string;
  steps: { label: string; posted: boolean }[];
  evidence: { figure: string; ticked: boolean }[];
  tape: Tape | null;
  tapeTies: boolean;
  signedOff: boolean;
}

export function Binder({
  pages,
  preparer,
  initialTaskId,
  onSignOff,
  onClose,
}: {
  pages: WorkpaperView[];
  preparer: string;
  initialTaskId: string | null;
  onSignOff: (taskId: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initialTaskId ?? pages[0]?.taskId ?? null);
  const page = pages.find((p) => p.taskId === selected) ?? pages[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stepsDone = page ? page.steps.every((s) => s.posted) : false;
  const evidenceDone = page ? page.evidence.every((e) => e.ticked) : false;
  const ready = !!page && stepsDone && evidenceDone && page.tapeTies && !page.signedOff;

  return (
    <div className="absolute inset-x-3 bottom-16 top-3 z-30 flex font-mono text-[11px] text-[#1b1b22] drop-shadow-[6px_6px_0_rgba(0,0,0,0.45)] sm:inset-x-10">
      {/* Cover + rings */}
      <div className="flex w-full rounded-md border-4 border-[#0b0d14] bg-[#2f5d3a] p-2">
        <div className="flex w-6 shrink-0 flex-col items-center justify-around" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-3 w-5 rounded-full border-2 border-[#0b0d14] bg-[#c9ccd3]" />
          ))}
        </div>
        <div className="relative flex min-w-0 flex-1 bg-[#fffdf6]">
          <div className="min-w-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-start justify-between gap-2 border-b-2 border-[#0b0d14] pb-2">
              <div>
                <div className="text-[9px] uppercase tracking-[0.25em] text-[#6b6458]">
                  Hartwell &amp; Finch LLP · Workpapers · FY close
                </div>
                <div className="text-[14px] font-bold">{page ? page.title : "No assignments yet"}</div>
              </div>
              <button
                type="button"
                data-guide="binder-close"
                onClick={onClose}
                className="border-2 border-[#0b0d14] bg-[#f4efe4] px-2 font-bold"
              >
                Close ✕
              </button>
            </div>
            {page ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 text-[10px] text-[#4a4438]">
                  <span>Client: Tidewater Supply Co.</span>
                  <span>Requested by: {page.from}</span>
                  <span>Tier {page.tier} assignment</span>
                  <span>Preparer: {page.signedOff ? preparer : "—"}</span>
                </div>
                <Section title="1. Journal entries posted" done={stepsDone}>
                  {page.steps.map((s) => (
                    <Check key={s.label} ok={s.posted}>
                      {s.label}
                    </Check>
                  ))}
                </Section>
                <Section title="2. Source figures tickmarked (highlighter)" done={evidenceDone}>
                  <div className="flex flex-wrap gap-1.5">
                    {page.evidence.map((e) => (
                      <span
                        key={e.figure}
                        className={`border px-1.5 py-0.5 ${e.ticked ? "border-[#e0c21a] bg-[#f7e463]" : "border-dashed border-[#a39a88] text-[#a39a88]"}`}
                      >
                        {e.ticked ? `${e.figure} ✓` : "? ? ?"}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-[#6b6458]">
                    {evidenceDone
                      ? "All source figures ticked to the request."
                      : `Pick up the highlighter and tick the ${page.evidence.length} figures from the email you relied on.`}
                  </p>
                </Section>
                <Section title={`3. Calculation: ${page.keyLabel} (calculator tape)`} done={page.tapeTies}>
                  {page.tape ? (
                    <div className="flex items-start gap-3">
                      <div className="w-36 border border-[#cfc8b8] bg-white px-2 py-1 text-right text-[10px] shadow-[2px_2px_0_rgba(0,0,0,0.15)]">
                        {page.tape.lines.slice(-6).map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                        <div className="border-t border-dashed border-[#cfc8b8] font-bold">
                          {page.tape.total.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <p className={page.tapeTies ? "font-bold text-[#2f6b35]" : "font-bold text-[#9a2f2f]"}>
                        {page.tapeTies
                          ? "✓ Tape ties to the entry."
                          : "✗ Tape total doesn't tie. Rerun the math and staple a new tape."}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-[#6b6458]">
                      No tape stapled. Run the computation on the calculator, then press “Staple to workpaper”.
                    </p>
                  )}
                </Section>
                <div className="flex items-center justify-between gap-3 border-t-2 border-[#0b0d14] pt-3">
                  {page.signedOff ? (
                    <span className="text-[16px] italic text-[#2a2d45]" style={{ fontFamily: "cursive" }}>
                      ✓ Signed off by {preparer}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#6b6458]">
                      {ready ? "Everything ties. Ready for sign-off." : "Complete steps 1–3 to sign off."}
                    </span>
                  )}
                  {!page.signedOff && (
                    <button
                      type="button"
                      disabled={!ready}
                      data-guide="binder-signoff"
                      onClick={() => onSignOff(page.taskId)}
                      className="border-2 border-[#0b0d14] bg-[#c9a227] px-3 py-1.5 font-bold shadow-[2px_2px_0_#0b0d14] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                    >
                      ✍ Sign off &amp; submit
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[#6b6458]">Assignments from PigeonMail get their own workpaper tab here.</p>
            )}
          </div>
          {/* Tab dividers */}
          <div
            className="flex w-28 shrink-0 flex-col gap-1 border-l border-[#cfc8b8] bg-[#f4efe4] py-2 pl-1"
            role="tablist"
          >
            {pages.map((p) => (
              <button
                key={p.taskId}
                type="button"
                role="tab"
                aria-selected={p.taskId === page?.taskId}
                onClick={() => setSelected(p.taskId)}
                className={`truncate border-2 border-r-0 border-[#0b0d14] px-1.5 py-1 text-left text-[9px] ${
                  p.taskId === page?.taskId
                    ? "-ml-1 bg-[#fffdf6] font-bold"
                    : p.signedOff
                      ? "bg-[#d9f2d0]"
                      : "bg-[#e0c9a6]"
                }`}
              >
                {p.signedOff ? "✓ " : ""}
                {p.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, done, children }: { title: string; done: boolean; children: ReactNode }) {
  return (
    <section className={`border-2 p-2 ${done ? "border-[#2f7a3a] bg-[#f2faef]" : "border-[#cfc8b8]"}`}>
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
        <span>{title}</span>
        <span className={done ? "text-[#2f6b35]" : "text-[#a39a88]"}>{done ? "✓ done" : "open"}</span>
      </div>
      {children}
    </section>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={ok ? "text-[#2f6b35]" : "text-[#6b6458]"}>
      {ok ? "☑" : "☐"} {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The desk surface in front of the monitor.
// ---------------------------------------------------------------------------
export function DeskTray({
  tool,
  calculatorOpen,
  binderOpen,
  binderBadge,
  onToggle,
}: {
  tool: DeskTool | null;
  calculatorOpen: boolean;
  binderOpen: boolean;
  binderBadge: number;
  onToggle: (tool: DeskTool) => void;
}) {
  const held = (t: DeskTool) =>
    t === "highlighter" ? tool === "highlighter" : t === "calculator" ? calculatorOpen : binderOpen;
  const item = (t: DeskTool, label: string, art: ReactNode) => (
    <button
      type="button"
      onClick={() => onToggle(t)}
      data-guide={`tool-${t}`}
      aria-pressed={held(t)}
      aria-label={`${held(t) ? "Put down" : "Pick up"} ${label}`}
      className="group flex flex-col items-center gap-0.5"
    >
      <span
        className={`transition-transform ${held(t) ? "-translate-y-2 drop-shadow-[0_4px_0_rgba(0,0,0,0.35)]" : "group-hover:-translate-y-1"}`}
      >
        {art}
      </span>
      <span className={`text-[9px] font-bold ${held(t) ? "text-[#f7e463]" : "text-[#f4efe4]/80"}`}>{label}</span>
    </button>
  );

  return (
    <div
      className="relative flex h-16 shrink-0 items-end justify-center gap-10 border-t-4 border-[#0b0d14] px-4 pb-1"
      style={{ background: "repeating-linear-gradient(90deg, #8a6a43 0 28px, #84653f 28px 56px)" }}
      aria-label="Desk"
    >
      {item(
        "calculator",
        "Calculator",
        <span className="block h-9 w-8 rounded-sm border-2 border-[#0b0d14] bg-[#8d93a0] p-0.5">
          <span className="block h-2 border border-[#0b0d14] bg-[#b9c9a8]" />
          <span
            className="mt-0.5 block h-4"
            style={{ background: "radial-gradient(circle, #e6e2d6 1.2px, transparent 1.4px) 0 0 / 5px 5px" }}
          />
        </span>,
      )}
      {item(
        "highlighter",
        "Highlighter",
        <span className="flex h-9 items-center">
          <span className="block h-3 w-10 -rotate-12 rounded-l-sm border-2 border-[#0b0d14] bg-[#f7e463]" />
          <span className="-ml-0.5 block h-2 w-2 -rotate-12 border-2 border-l-0 border-[#0b0d14] bg-[#e0c21a]" />
        </span>,
      )}
      {item(
        "binder",
        "Binder",
        <span className="relative block h-9 w-11 rounded-sm border-2 border-[#0b0d14] bg-[#2f5d3a]">
          <span className="absolute inset-y-1 left-1 w-1.5 bg-[#c9ccd3]" />
          <span className="absolute right-1 top-1.5 h-3 w-5 bg-[#fffdf6]" />
          {!!binderBadge && (
            <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full border border-[#0b0d14] bg-[#e2553f] px-1 text-[9px] font-bold text-white">
              {binderBadge}
            </span>
          )}
        </span>,
      )}
    </div>
  );
}
