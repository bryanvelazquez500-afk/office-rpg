"use client";

import { useEffect, useRef, type RefObject } from "react";

// Tutorial pointer for new hires: a Mac-style arrow cursor that points at the
// next thing to do, with a short instruction. Targets are either DOM elements
// tagged with data-guide="…" or a live point given as fractions of the container
// (for things that move around the office floor). Neither the arrow nor the
// bubble is allowed to sit on top of the target or other things the player
// needs to see or click.

export interface GuideStep {
  id: string;
  text: string;
  target: string | (() => { x: number; y: number } | null);
}

// Pixelated macOS arrow cursor: o white outline, b black fill. Tip at the top-left.
const ARROW_PIXELS = [
  "o...........",
  "oo..........",
  "obo.........",
  "obbo........",
  "obbbo.......",
  "obbbbo......",
  "obbbbbo.....",
  "obbbbbbo....",
  "obbbbbbbo...",
  "obbbbbbbbo..",
  "obbbbbooooo.",
  "obbobbo.....",
  "obo.obbo....",
  "oo..obbo....",
  "o....obbo...",
  ".....obbo...",
  "......oo....",
];
const ARROW_COLORS: Record<string, string> = { o: "#ffffff", b: "#000000" };
const ARROW_RECTS = ARROW_PIXELS.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (ARROW_COLORS[ch] ? [{ x, y, fill: ARROW_COLORS[ch] }] : [])),
);
const ARROW_PX = 2; // screen pixels per art pixel
const ARROW_W = ARROW_PIXELS[0].length * ARROW_PX;
const ARROW_H = ARROW_PIXELS.length * ARROW_PX;

const EDGE = 6; // keep the bubble this far inside the screen
const GAP = 8; // space between the bubble and what it sits next to
const RELAYOUT_FRAMES = 6; // re-pick the bubble spot this often (frames)
// Things the bubble should avoid covering, besides the target and the arrow.
const IMPORTANT = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [data-guide]';

type Box = { left: number; top: number; right: number; bottom: number };

const area = (b: Box) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);

function overlap(a: Box, b: Box) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

export function GuideHand({ step, container }: { step: GuideStep | null; container: RefObject<HTMLElement | null> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const target = step?.target;

  useEffect(() => {
    if (!target) return;
    let raf = 0;
    let frame = 0;
    let bubbleAt: { left: number; top: number } | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const box = container.current;
      const root = rootRef.current;
      const arrowEl = arrowRef.current;
      const bubble = bubbleRef.current;
      if (!box || !root || !arrowEl || !bubble) return;
      const c = box.getBoundingClientRect();
      const rel = (r: DOMRect): Box => ({
        left: r.left - c.left,
        top: r.top - c.top,
        right: r.right - c.left,
        bottom: r.bottom - c.top,
      });

      let t: Box;
      let targetEl: Element | null = null;
      if (typeof target === "string") {
        targetEl = box.querySelector(`[data-guide="${CSS.escape(target)}"]`);
        const r = targetEl?.getBoundingClientRect();
        if (!r || r.width === 0) {
          root.style.opacity = "0";
          return;
        }
        t = rel(r);
      } else {
        const p = target();
        if (!p) {
          root.style.opacity = "0";
          return;
        }
        const x = p.x * c.width;
        const y = p.y * c.height;
        t = { left: x, top: y, right: x, bottom: y };
      }
      root.style.opacity = "1";

      // Arrow: tip just touches the target's lower-right corner so the arrow itself sits outside
      // the target. Mirror it to point in from the other side when it would run off screen.
      const inset = targetEl ? 2 : 0;
      const flipX = t.right + ARROW_W > c.width;
      const flipY = t.bottom + ARROW_H > c.height;
      const tipX = flipX ? t.left + inset : t.right - inset;
      const tipY = flipY ? t.top + inset : t.bottom - inset;
      const arrowLeft = flipX ? tipX - ARROW_W : tipX;
      const arrowTop = flipY ? tipY - ARROW_H : tipY;
      const arrow: Box = { left: arrowLeft, top: arrowTop, right: arrowLeft + ARROW_W, bottom: arrowTop + ARROW_H };
      arrowEl.style.transform = `translate(${arrowLeft}px, ${arrowTop}px)`;
      arrowEl.style.setProperty("--flip-x", flipX ? "-1" : "1");
      arrowEl.style.setProperty("--flip-y", flipY ? "-1" : "1");

      // Bubble: try spots around the target and arrow, keep the one covering the least.
      if (frame++ % RELAYOUT_FRAMES === 0 || !bubbleAt) {
        const bw = bubble.offsetWidth;
        const bh = bubble.offsetHeight;
        const cx = (t.left + t.right) / 2;
        const cy = (t.top + t.bottom) / 2;
        const spots = [
          { left: arrow.left, top: flipY ? arrow.top - bh - GAP : arrow.bottom + GAP }, // past the arrow
          { left: flipX ? arrow.left - bw - GAP : arrow.right + GAP, top: arrow.top }, // beside the arrow
          { left: cx - bw / 2, top: t.top - bh - GAP }, // above the target
          { left: cx - bw / 2, top: Math.max(t.bottom, arrow.bottom) + GAP }, // below the target
          { left: t.left - bw - GAP, top: cy - bh / 2 }, // left of the target
          { left: Math.max(t.right, arrow.right) + GAP, top: cy - bh / 2 }, // right of the target
        ];
        if (bubbleAt) spots.push(bubbleAt);
        const screen = c.width * c.height;
        const obstacles = Array.from(box.querySelectorAll(IMPORTANT))
          .filter((el) => el !== targetEl && !root.contains(el))
          .map((el) => rel(el.getBoundingClientRect()))
          // Skip whole panels (e.g. a big form); their buttons are listed on their own.
          .filter((o) => area(o) > 0 && area(o) < screen * 0.2);
        let best = spots[0];
        let bestScore = Infinity;
        for (const s of spots) {
          const left = Math.min(Math.max(s.left, EDGE), c.width - bw - EDGE);
          const top = Math.min(Math.max(s.top, EDGE), c.height - bh - EDGE);
          const b = { left, top, right: left + bw, bottom: top + bh };
          let score = overlap(b, t) * 100 + overlap(b, arrow) * 50;
          for (const o of obstacles) score += overlap(b, o);
          // Stay put unless another spot is clearly better, so the bubble doesn't jitter.
          if (s === bubbleAt) score -= 200;
          if (score < bestScore) {
            bestScore = score;
            best = { left, top };
          }
        }
        bubbleAt = best;
      }
      bubble.style.transform = `translate(${bubbleAt.left}px, ${bubbleAt.top}px)`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, container]);

  if (!step) return null;
  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[45] transition-opacity duration-300" style={{ opacity: 0 }}>
      <div ref={arrowRef} className="absolute left-0 top-0 transition-transform duration-300 ease-out">
        <div className="guide-nudge" style={{ transform: "scale(var(--flip-x, 1), var(--flip-y, 1))" }}>
          <Arrow />
        </div>
      </div>
      <div
        ref={bubbleRef}
        role="status"
        aria-live="polite"
        className="absolute left-0 top-0 w-max max-w-[230px] rounded border-2 border-[#0b0d14] bg-[#fffdf6] px-2.5 py-1.5 font-mono text-[11px] leading-snug text-[#1b1b22] shadow-[3px_3px_0_#0b0d14] transition-transform duration-300 ease-out"
      >
        <span className="mr-1 font-bold text-[#2a6fb3]">Guide:</span>
        {step.text}
      </div>
    </div>
  );
}

/** Pixelated version of the standard macOS arrow cursor. */
function Arrow() {
  return (
    <svg
      viewBox={`0 0 ${ARROW_PIXELS[0].length} ${ARROW_PIXELS.length}`}
      width={ARROW_W}
      height={ARROW_H}
      shapeRendering="crispEdges"
      aria-hidden
      className="block"
      style={{ filter: "drop-shadow(1px 2px 0 rgba(0,0,0,0.35))" }}
    >
      {ARROW_RECTS.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width="1" height="1" fill={r.fill} />
      ))}
    </svg>
  );
}
