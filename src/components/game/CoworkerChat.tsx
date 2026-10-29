"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { NpcProfile } from "./characters";
import { findAnswer, knowledgeFor, voiceAnswer } from "./chatKnowledge";
import { Portrait } from "./OfficeLunchAndTools";
import { voiceBlip } from "./sound";

// Chat with a coworker at their cubicle to clear up doubts: pick a suggested
// question or type your own. Answers come from the game's built-in knowledge
// (chatKnowledge.ts), so it works offline and costs nothing. Replies type out
// with the coworker's babble voice.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  taskIds: string[]; // assignments in the player's inbox
  askedIds: string[]; // quiz questions coworkers have already asked
}

const TYPE_MS = 28; // per character, about 35 characters a second
const THINK_MS = 450; // a short pause before the coworker answers

export function CoworkerChat({
  npc,
  playerName,
  history,
  onHistory,
  context,
  onClose,
}: {
  npc: NpcProfile;
  playerName: string;
  history: ChatTurn[];
  onHistory: (next: ChatTurn[]) => void;
  context: () => ChatContext;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [askedHere, setAskedHere] = useState<string[]>([]); // suggestion ids used this chat
  // Which line is typing out: -1 is the greeting, otherwise an index into history.
  const [animKey, setAnimKey] = useState<number | null>(() => (history.length ? null : -1));
  const [shown, setShown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const first = npc.name.split(" ")[0];
  // Fixed when the chat opens, so it doesn't change once the first question is asked.
  const [greeting] = useState(() => (history.length ? `Back again, ${playerName.split(" ")[0]}?` : npc.greeting));
  const [{ taskIds, askedIds }] = useState(context);
  const knowledge = useMemo(() => knowledgeFor(npc, taskIds, askedIds), [npc, taskIds, askedIds]);
  const suggestions = [
    ...knowledge.suggestions.filter((a) => !askedHere.includes(a.id)),
    ...knowledge.all.filter((a) => !askedHere.includes(a.id)),
  ].filter((a, i, list) => list.findIndex((b) => b.id === a.id) === i);
  const [page, setPage] = useState(0);
  const shownSuggestions = suggestions.slice(page * 4, page * 4 + 4);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Type the current line out, one babble blip every other letter.
  useEffect(() => {
    if (animKey === null) return;
    const text = animKey === -1 ? greeting : (history[animKey]?.content ?? "");
    let count = 0;
    const timer = setInterval(() => {
      count++;
      const ch = text[count - 1];
      if (ch && /[a-z0-9]/i.test(ch) && count % 2 === 1) voiceBlip(npc.voice, ch);
      setShown(count);
      if (count >= text.length) {
        clearInterval(timer);
        setAnimKey(null);
      }
    }, TYPE_MS);
    return () => clearInterval(timer);
    // Restarts only when a new line starts typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [history.length, shown, thinking]);

  const typing = animKey !== null;
  const textOf = (key: number, full: string) => (animKey === key ? full.slice(0, shown) : full);

  function ask(question: string, answerId?: string) {
    if (thinking) return;
    const match = answerId ? knowledge.all.find((a) => a.id === answerId)! : findAnswer(question, knowledge);
    const reply = match
      ? voiceAnswer(npc, match)
      : "Hmm, I don't have a good answer for that one. Try asking it another way, or pick one of the questions below.";
    if (match) setAskedHere((ids) => [...ids, match.id]);
    const next: ChatTurn[] = [...history, { role: "user", content: question }];
    onHistory(next);
    setDraft("");
    setPage(0);
    setThinking(true);
    setTimeout(() => {
      onHistory([...next, { role: "assistant", content: reply }]);
      setThinking(false);
      setShown(0);
      setAnimKey(next.length);
      inputRef.current?.focus();
    }, THINK_MS);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, 300);
    if (!text) return setAnimKey(null); // Enter on an empty box shows the current answer in full
    setAnimKey(null);
    ask(text);
  }

  return (
    <div
      role="dialog"
      aria-label={`Chat with ${npc.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="absolute inset-x-3 bottom-3 z-40 flex max-h-[78%] flex-col rounded border-4 border-[#0b0d14] bg-[#f4efe4] font-mono text-[12px] text-[#1b1b22] shadow-[6px_6px_0_#0b0d14]"
    >
      <div className="flex items-center gap-3 border-b-4 border-[#0b0d14] bg-[#2a2d45] px-3 py-2 text-[#e6e8ef]">
        <Portrait palette={npc.palette} size={32} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{npc.name}</div>
          <div className="text-[10px] text-[#e8d28a]">
            {npc.role} · {npc.department}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border-2 border-[#9aa4b8] px-2 py-0.5 text-[11px] hover:bg-[#1d2130]"
        >
          Done (Esc)
        </button>
      </div>

      <div ref={logRef} className="min-h-20 flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
        <Bubble who={first} text={textOf(-1, greeting)} onSkip={() => setAnimKey(null)} />
        {history.map((turn, i) =>
          turn.role === "user" ? (
            <div
              key={i}
              className="ml-auto w-fit max-w-[80%] rounded border-2 border-[#0b0d14] bg-[#d9e8f7] px-2.5 py-1.5"
            >
              {turn.content}
            </div>
          ) : (
            <Bubble key={i} who={first} text={textOf(i, turn.content)} onSkip={() => setAnimKey(null)} />
          ),
        )}
        {thinking && <Bubble who={first} text="…" />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t-2 border-[#0b0d14] bg-[#ece6d8] px-2 py-2">
        {shownSuggestions.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={thinking}
            onClick={() => ask(a.question, a.id)}
            className="max-w-full truncate rounded border-2 border-[#0b0d14] bg-white px-2 py-1 text-left text-[11px] hover:bg-[#fff6d6] disabled:opacity-50"
            title={a.question}
          >
            {a.question}
          </button>
        ))}
        {suggestions.length > 4 && (
          <button
            type="button"
            onClick={() => setPage((p) => ((p + 1) * 4 < suggestions.length ? p + 1 : 0))}
            className="rounded border-2 border-[#0b0d14] bg-[#c9a227] px-2 py-1 text-[11px] font-bold"
          >
            More questions ▸
          </button>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t-4 border-[#0b0d14] bg-[#e6dfd2] p-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          placeholder={`Or type a question for ${first}, e.g. "how does CECL work?"`}
          aria-label={`Question for ${first}`}
          className="min-w-0 flex-1 border-2 border-[#0b0d14] bg-white px-2 py-1.5 outline-none focus:border-[#2a6fb3]"
        />
        <button
          type="submit"
          disabled={thinking}
          className="border-2 border-[#0b0d14] bg-[#c9a227] px-3 font-bold uppercase tracking-wider shadow-[2px_2px_0_#0b0d14] disabled:opacity-50"
        >
          {typing && !draft.trim() ? "Skip" : "Ask"}
        </button>
      </form>
    </div>
  );
}

function Bubble({ who, text, onSkip }: { who: string; text: string; onSkip?: () => void }) {
  return (
    <div onClick={onSkip} className="w-fit max-w-[85%] rounded border-2 border-[#0b0d14] bg-white px-2.5 py-1.5">
      <span className="mr-1 font-bold text-[#2a6fb3]">{who}:</span>
      {text}
    </div>
  );
}
