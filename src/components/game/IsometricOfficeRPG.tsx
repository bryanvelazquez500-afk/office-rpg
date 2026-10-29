"use client";

import { useEffect, useRef, useState } from "react";
import {
  FIRM_NAME,
  MANAGING_PARTNER_ID,
  NPCS,
  createPlayerProfile,
  type CharacterProfile,
  type Facing,
  type SpritePalette,
} from "./characters";
import {
  DESK_VISITOR_TILES,
  FIRST_REQUEST_DELAY,
  INK,
  InquiryModal,
  LUNCH_DURATION,
  LUNCH_OFFICE_MINUTES,
  LUNCH_GOERS,
  LUNCH_START,
  LunchBanner,
  OfficeStatus,
  Portrait,
  REPUTATION,
  REQUESTERS,
  REQUEST_APPROACH_TIMEOUT,
  REQUEST_INTERVAL,
  REQUEST_PATIENCE,
  RETURN_GRACE,
  RequestCard,
  OFFICE_MINUTES_PER_SECOND,
  ToastStack,
  clockInAt,
  firstWorkday,
  formatMinutes,
  minuteOfDay,
  seasonFor,
  workdayDate,
  TOPIC_NAMES,
  withArticle,
  shade,
  type Inquiry,
  type LunchView,
  type RequestView,
  type Stats,
  type Toast,
  type WorkdayView,
} from "./OfficeLunchAndTools";
import OfficeWorkstation, { type MailNotice, type WorkstationSave } from "./OfficeWorkstation";
import { loadMuted, setMuted as storeMuted, sfx, unlockAudio, voiceBlip } from "./sound";
import { CoworkerChat, type ChatContext, type ChatTurn } from "./CoworkerChat";
import { EMAILS, emailArrival } from "./gaap";
import { DAILY_LIMIT, registerDailyWork, resetDailyWork } from "./dailyWork";
import { DailyChecklist, type DayLog } from "./DailyChecklist";
import {
  LEVEL_NAMES,
  LEVEL_UP_STREAK,
  newStudyPlan,
  nextQuestion,
  recordAnswer,
  restorePlan,
  savePlan,
  studyView,
} from "./studyPlan";
import { fromIsoDay, toIsoDay, writeSave, type EngineSave, type SaveData } from "./saveGame";
import {
  DAYS_TO_PROMOTE,
  PromotionTrack,
  TodayBar,
  PromotionCeremony,
  RANKS,
  applyPoints,
  endShift,
  initialCareer,
  type Career,
} from "./CareerProgression";

type Tile = [number, number];

// ---------------------------------------------------------------------------
// Office floor plan (row = y, column = x). Origin is the back corner.
//   .  floor        k  executive carpet   m  meeting carpet   c  cubicle seat
//   E  entrance mat b  breakroom tile     C  cubicle desk     D  executive desk
//   T  conference table   B  bookshelf    P  plant            W  water cooler
//   V  vending machine    R  reception desk
// ---------------------------------------------------------------------------
const MAP = [
  "BkkkkkB.PmmmmmmP.B",
  "kkkkkkk..mTTTTm...",
  "kkDDkkk..mTTTTm...",
  "kkkkkkk..mmmmmm...",
  "P................P",
  "..CC.CC.CC.CC.....",
  "..cc.cc.cc.cc.....",
  "..................",
  "..CC.CC.CC.CC.....",
  "..cc.cc.cc.cc.....",
  "bbbb..............",
  "WbVb..............",
  "bbbb.......RR.....",
  "bbbb...........EE.",
];
const COLS = MAP[0].length;
const ROWS = MAP.length;
const BLOCKING = new Set("CDTBPWVR");
const BASE_FLOOR: Record<string, string> = { T: "m", D: "k", W: "b", V: "b", C: "c" };
const BREAKROOM_CENTER: Tile = [1, 11];

// Three-quarter view: the floor is seen at an angle (tiles are wider than they are
// deep), the back wall stands tall along the top, and furniture shows a tall front face.
const TILE_W = 48;
const TILE_H = 34; // on-screen depth of one floor tile
const WALL_H = 104; // visible height of the back wall
const SIDE = 14; // thickness of the side and front walls, seen from above
const ENTRANCE_COLS = [15, 16]; // gap in the front wall
const WINDOW_COLS = [8, 15]; // first and last column with a window
const CANVAS_W = COLS * TILE_W + SIDE * 2;
const CANVAS_H = WALL_H + ROWS * TILE_H + SIDE;
const LIFT = 0.85; // how much of an object's height shows as its front face

const PLAYER_START: Tile = [15, 13];
const GUIDE_START: Tile = [14, 13];
const PLAYER_DESK: Tile = [6, 9];
const PLAYER_DESK_FURNITURE: Tile = [6, 8];

const CUTSCENE_SPEED = 2.6; // tiles/sec, shared so the player stays one step behind
const PLAYER_SPEED = 3.8;
const NPC_SPEED = 2.4;
const TYPE_SPEED = 48; // chars/sec
const INSPECT_RADIUS = 1.6;

// ---------------------------------------------------------------------------
// Onboarding script
// ---------------------------------------------------------------------------
type Step =
  | { kind: "say"; speaker: string; text: string }
  | { kind: "walk"; to: Tile } // Managing Partner leads, player follows one tile behind
  | { kind: "playerWalk"; to: Tile }
  | { kind: "face"; who: string; facing: Facing }
  | { kind: "end" };

const MP = MANAGING_PARTNER_ID;
const ONBOARDING: Step[] = [
  { kind: "say", speaker: MP, text: `Ah, you must be {name}! Welcome to ${FIRM_NAME}.` },
  {
    kind: "say",
    speaker: MP,
    text: "I'm Eleanor Hartwell, Managing Partner. We've been auditing, advising, and doing the taxes of this city's businesses for twenty-two years.",
  },
  {
    kind: "say",
    speaker: MP,
    text: "We have three practices under one roof: Assurance, Tax, and Advisory. You're starting in Assurance. Come on, I'll walk you to your desk.",
  },
  { kind: "walk", to: [13, 11] },
  { kind: "face", who: MP, facing: "W" },
  {
    kind: "say",
    speaker: MP,
    text: "This is Priya, our Office Manager. If you need a badge, a laptop, or the good stapler, she's your person.",
  },
  { kind: "say", speaker: "priya", text: "Hi {name}! Your laptop's already on your desk. Don't lose the charger." },
  { kind: "walk", to: [10, 10] },
  { kind: "face", who: MP, facing: "N" },
  {
    kind: "say",
    speaker: MP,
    text: "These are our cubicles; everyone gets their own. Dana runs Tax from the back row, and Gwen's Advisory team practically lives in that conference room.",
  },
  { kind: "walk", to: [5, 10] },
  { kind: "face", who: MP, facing: "N" },
  { kind: "say", speaker: MP, text: "And this is Marcus Bell, your Audit Senior. He's also your cubicle neighbor." },
  { kind: "say", speaker: "marcus", text: "Welcome aboard, {name}. I saved you the desk with the working monitor." },
  { kind: "playerWalk", to: PLAYER_DESK },
  { kind: "face", who: "player", facing: "N" },
  { kind: "face", who: MP, facing: "E" },
  {
    kind: "say",
    speaker: MP,
    text: "Here we are, your very own cubicle. Take a walk and introduce yourself; walk up to anyone to see who they are.",
  },
  {
    kind: "say",
    speaker: MP,
    text: "I'll be in my office in the back corner if you need me. Welcome to the firm, {name}.",
  },
  { kind: "end" },
];

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const walkable = ([x, y]: Tile) => inBounds(x, y) && !BLOCKING.has(MAP[y][x]);

// Each desk (C) and the seat in front of it (c) form one cubicle, walled on the back
// and both sides and open to the aisle. Side walls sit on the boundary between two
// columns; CUBICLE_WALLS holds "x,y" for a wall between (x, y) and (x + 1, y).
const CUBICLE_WALLS = new Set<string>();
for (let y = 0; y < ROWS; y++)
  for (let x = 0; x < COLS; x++)
    if (MAP[y][x] === "C")
      for (const row of [y, y + 1]) {
        CUBICLE_WALLS.add(`${x - 1},${row}`);
        CUBICLE_WALLS.add(`${x},${row}`);
      }
const wallBetween = (a: Tile, b: Tile) =>
  a[1] === b[1] && Math.abs(a[0] - b[0]) === 1 && CUBICLE_WALLS.has(`${Math.min(a[0], b[0])},${a[1]}`);

// Who sits in each cubicle, by desk tile. Staff you don't see walking around are out at client sites.
const CUBICLE_OWNERS: Record<string, string> = {
  "2,5": "Nina",
  "3,5": "Raj",
  "5,5": "Leo",
  "6,5": "Ava",
  "8,5": "Omar",
  "9,5": "Dana",
  "11,5": "Kim",
  "12,5": "Theo",
  "2,8": "Sam",
  "3,8": "Elena",
  "5,8": "Marcus",
  "8,8": "Jules",
  "9,8": "Ben",
  "11,8": "Tess",
  "12,8": "Hugo",
};
const sameTile = (a: Tile, b: Tile) => a[0] === b[0] && a[1] === b[1];
const NEIGHBORS: Tile[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** BFS over 4-connected tiles. Returns the path excluding `from` and including `to`. */
function findPath(from: Tile, to: Tile, isBlocked: (t: Tile) => boolean): Tile[] | null {
  if (sameTile(from, to)) return [];
  if (!walkable(to) || isBlocked(to)) return null;
  const key = (t: Tile) => t[1] * COLS + t[0];
  const cameFrom = new Map<number, Tile | null>([[key(from), null]]);
  const queue: Tile[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (sameTile(cur, to)) {
      const path: Tile[] = [];
      for (let t: Tile | null = cur; t && !sameTile(t, from); t = cameFrom.get(key(t)) ?? null) path.unshift(t);
      return path;
    }
    for (const [dx, dy] of NEIGHBORS) {
      const next: Tile = [cur[0] + dx, cur[1] + dy];
      if (!walkable(next) || wallBetween(cur, next) || cameFrom.has(key(next)) || isBlocked(next)) continue;
      cameFrom.set(key(next), cur);
      queue.push(next);
    }
  }
  return null;
}

function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "E" : "W";
  return dy >= 0 ? "S" : "N";
}

/** Screen position of a tile's center (works for fractional tile coordinates). */
function toScreen(x: number, y: number): [number, number] {
  return [SIDE + (x + 0.5) * TILE_W, WALL_H + (y + 0.5) * TILE_H];
}

function toTile(px: number, py: number): Tile {
  return [Math.floor((px - SIDE) / TILE_W), Math.floor((py - WALL_H) / TILE_H)];
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------
interface Actor {
  profile: CharacterProfile;
  x: number;
  y: number;
  target: Tile | null;
  path: Tile[];
  goal: Tile | null;
  facing: Facing;
  speed: number;
  stride: number;
  stall: number;
}

function makeActor(profile: CharacterProfile, [x, y]: Tile, facing: Facing, speed: number): Actor {
  return { profile, x, y, target: null, path: [], goal: null, facing, speed, stride: 0, stall: 0 };
}

const tileOf = (a: Actor): Tile => [Math.round(a.x), Math.round(a.y)];
const isIdle = (a: Actor) => !a.target && a.path.length === 0;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
const OUTLINE = "rgba(18,16,28,0.6)";

function poly(ctx: Ctx, pts: Pt[], fill: string | CanvasGradient, stroke: string | null = OUTLINE) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

const FLOOR_COLORS: Record<string, [string, string]> = {
  ".": ["#d9d2c3", "#d0c8b7"],
  k: ["#7a2f3a", "#722a35"],
  m: ["#3d5a80", "#385478"],
  c: ["#8a8f99", "#838892"],
  E: ["#3b3b42", "#45454d"],
  b: ["#c99a6b", "#c19162"],
};

function drawFloor(ctx: Ctx, x: number, y: number) {
  const ch = MAP[y][x];
  const kind = BLOCKING.has(ch) ? (BASE_FLOOR[ch] ?? ".") : ch;
  const colors = FLOOR_COLORS[kind] ?? FLOOR_COLORS["."];
  const left = SIDE + x * TILE_W;
  const top = WALL_H + y * TILE_H;
  ctx.fillStyle = colors[(x + y) % 2];
  ctx.fillRect(left, top, TILE_W, TILE_H);
  ctx.strokeStyle = "rgba(60,50,40,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, TILE_W - 1, TILE_H - 1);
}

/** Soft shadow where the floor meets the walls, so the room has depth. */
function drawFloorShading(ctx: Ctx) {
  const back = ctx.createLinearGradient(0, WALL_H, 0, WALL_H + 30);
  back.addColorStop(0, "rgba(40,30,20,0.28)");
  back.addColorStop(1, "rgba(40,30,20,0)");
  ctx.fillStyle = back;
  ctx.fillRect(SIDE, WALL_H, COLS * TILE_W, 30);
  for (const [x0, x1] of [
    [SIDE, SIDE + 18],
    [CANVAS_W - SIDE, CANVAS_W - SIDE - 18],
  ]) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, "rgba(40,30,20,0.22)");
    g.addColorStop(1, "rgba(40,30,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), WALL_H, 18, ROWS * TILE_H);
  }
}

/** Sunlight from the windows falling across the floor, with dust drifting in it. */
function drawWindowLight(ctx: Ctx, time: number) {
  const [first, last] = WINDOW_COLS;
  const reach = TILE_H * 4;
  const slant = 46; // the light falls down and to the right
  const glow = 0.1 + Math.sin(time * 0.4) * 0.02;
  ctx.fillStyle = `rgba(255,244,214,${glow})`;
  for (let c = first; c <= last; c++) {
    const l = SIDE + c * TILE_W + 6;
    const r = SIDE + (c + 1) * TILE_W - 6;
    ctx.beginPath();
    ctx.moveTo(l, WALL_H);
    ctx.lineTo(r, WALL_H);
    ctx.lineTo(r + slant, WALL_H + reach);
    ctx.lineTo(l + slant, WALL_H + reach);
    ctx.closePath();
    ctx.fill();
  }
  const span = (last - first + 1) * TILE_W;
  for (let i = 0; i < 16; i++) {
    const t = (i * 0.37 + time * 0.05) % 1;
    const px = SIDE + first * TILE_W + ((i * 53) % span) + t * slant + Math.sin(time + i) * 3;
    const py = WALL_H + 8 + t * (reach - 16);
    ctx.fillStyle = `rgba(255,250,230,${0.55 * Math.sin(t * Math.PI)})`;
    ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
  }
}

function drawWalls(ctx: Ctx, minute: number, time: number) {
  // Back wall, seen straight on: wall paint, a darker wainscot, then the baseboard.
  for (let x = 0; x < COLS; x++) {
    const left = SIDE + x * TILE_W;
    ctx.fillStyle = x % 2 ? "#e6dfd2" : "#e1d9cb";
    ctx.fillRect(left, 0, TILE_W, WALL_H);
  }
  ctx.fillStyle = "#cfc4b1";
  ctx.fillRect(SIDE, WALL_H - 34, COLS * TILE_W, 28);
  ctx.fillStyle = "#b9ad98";
  ctx.fillRect(SIDE, WALL_H - 34, COLS * TILE_W, 2);
  ctx.fillStyle = "#8f8576";
  ctx.fillRect(SIDE, WALL_H - 6, COLS * TILE_W, 6);

  // Windows, with a glint that drifts across the glass.
  const [first, last] = WINDOW_COLS;
  for (let c = first; c <= last; c++) {
    const l = SIDE + c * TILE_W + 6;
    const r = SIDE + (c + 1) * TILE_W - 6;
    const top = 22;
    const bottom = WALL_H - 40;
    const sky = ctx.createLinearGradient(0, top, 0, bottom);
    sky.addColorStop(0, "#7fb6dc");
    sky.addColorStop(1, "#c4e2f2");
    poly(
      ctx,
      [
        [l, top],
        [r, top],
        [r, bottom],
        [l, bottom],
      ],
      sky,
    );
    const g = (((time * 18 + c * 11) % 120) / 120) * (r - l + 30) - 15;
    ctx.save();
    ctx.beginPath();
    ctx.rect(l, top, r - l, bottom - top);
    ctx.clip();
    poly(
      ctx,
      [
        [l + g, top],
        [l + g + 10, top],
        [l + g - 4, bottom],
        [l + g - 14, bottom],
      ],
      "rgba(255,255,255,0.35)",
      null,
    );
    ctx.restore();
    ctx.fillStyle = "#8a8070"; // mullion and sill
    ctx.fillRect((l + r) / 2 - 1, top, 2, bottom - top);
    ctx.fillRect(l - 2, bottom, r - l + 4, 3);
  }

  // Wall clock showing the office time.
  const ccx = SIDE + 7 * TILE_W + TILE_W / 2;
  const ccy = 34;
  ctx.beginPath();
  ctx.arc(ccx, ccy, 12, 0, Math.PI * 2);
  ctx.fillStyle = "#fbf8f1";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const hand = (turns: number, len: number, width: number) => {
    const a = turns * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(ccx, ccy);
    ctx.lineTo(ccx + Math.cos(a) * len, ccy + Math.sin(a) * len);
    ctx.lineWidth = width;
    ctx.stroke();
  };
  hand(((minute / 60) % 12) / 12, 6, 2);
  hand((minute % 60) / 60, 9, 1.5);

  // Whiteboard with some notes on it.
  const wl = SIDE + 16 * TILE_W + 4;
  const wr = SIDE + 17 * TILE_W - 4;
  poly(
    ctx,
    [
      [wl, 20],
      [wr, 20],
      [wr, WALL_H - 42],
      [wl, WALL_H - 42],
    ],
    "#f4f6f8",
  );
  ctx.fillStyle = "#3c6aa8";
  ctx.fillRect(wl + 5, 27, 22, 2);
  ctx.fillRect(wl + 5, 33, 30, 2);
  ctx.fillStyle = "#b33a3a";
  ctx.fillRect(wl + 5, 39, 16, 2);

  // Firm name plaque and a framed painting above the executive office.
  const px = SIDE + TILE_W + 8;
  ctx.fillStyle = "#2a2d45";
  ctx.fillRect(px, 10, 150, 22);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, 11, 148, 20);
  ctx.fillStyle = "#e8d28a";
  ctx.font = "bold 10px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(FIRM_NAME.toUpperCase(), px + 8, 21.5);
  const fl = px + 45;
  ctx.fillStyle = "#6b4430";
  ctx.fillRect(fl, 38, 60, 30);
  ctx.fillStyle = "#9cc7e0";
  ctx.fillRect(fl + 4, 42, 52, 22);
  poly(
    ctx,
    [
      [fl + 4, 64],
      [fl + 22, 50],
      [fl + 34, 58],
      [fl + 44, 48],
      [fl + 56, 60],
      [fl + 56, 64],
    ],
    "#4b8f41",
    null,
  );

  // Side and front walls, seen from above; the front wall has a gap at the entrance.
  ctx.fillStyle = "#b9b0a0";
  ctx.fillRect(0, 0, SIDE, CANVAS_H);
  ctx.fillRect(CANVAS_W - SIDE, 0, SIDE, CANVAS_H);
  for (let x = 0; x < COLS; x++)
    if (!ENTRANCE_COLS.includes(x)) ctx.fillRect(SIDE + x * TILE_W, CANVAS_H - SIDE, TILE_W, SIDE);
  ctx.fillStyle = "#d3cbbd"; // lit inner edge of the side walls
  ctx.fillRect(SIDE - 3, WALL_H, 3, ROWS * TILE_H);
  ctx.fillRect(CANVAS_W - SIDE, WALL_H, 3, ROWS * TILE_H);
  ctx.fillStyle = "#6e6558"; // wall cap
  ctx.fillRect(0, 0, CANVAS_W, 4);
}

interface BoxStyle {
  h: number;
  top: string;
  side: string;
  inset?: number;
}

/**
 * Draws a piece of furniture on a tile: its top face plus a front face whose height
 * shows how tall it is. Returns the screen center x, the top face's center y and the
 * front face's span (for drawing details on it).
 */
function drawBox(ctx: Ctx, x: number, y: number, s: BoxStyle) {
  const [cx, cy] = toScreen(x, y);
  const k = 1 - (s.inset ?? 0);
  const hw = (TILE_W / 2) * k;
  const bottom = cy + (TILE_H / 2) * k;
  const lift = s.h * LIFT;
  const frontTop = bottom - lift;
  const depth = TILE_H * k;
  poly(
    ctx,
    [
      [cx - hw, frontTop],
      [cx + hw, frontTop],
      [cx + hw, bottom],
      [cx - hw, bottom],
    ],
    shade(s.side, -0.15),
  );
  poly(
    ctx,
    [
      [cx - hw, frontTop - depth],
      [cx + hw, frontTop - depth],
      [cx + hw, frontTop],
      [cx - hw, frontTop],
    ],
    s.top,
  );
  return { cx, top: frontTop - depth / 2, hw, frontTop, bottom };
}

/** Horizontal band on a box's front face between two heights. */
function frontBand(ctx: Ctx, b: { cx: number; hw: number; bottom: number }, h1: number, h2: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(b.cx - b.hw + 3, b.bottom - h2 * LIFT, b.hw * 2 - 6, (h2 - h1) * LIFT);
}

const PARTITION_H = 34;

type DeskItem = "mug" | "plant" | "photo" | "papers" | "lamp" | "binders" | "tenkey" | "phone";
const DESK_ITEMS: DeskItem[] = ["mug", "plant", "photo", "papers", "lamp", "binders", "tenkey", "phone"];
type Pinup = "sticky" | "calendar" | "pennant" | "certificate" | "drawing";
const PINUPS: Pinup[] = ["sticky", "calendar", "pennant", "certificate", "drawing"];
const ACCENTS = ["#b33a3a", "#3c6aa8", "#3d8b4a", "#c9a227", "#7a4fa3", "#e07a3a"];

/** A small personal item standing on a desk; (x, y) is where its base sits. */
function drawDeskItem(ctx: Ctx, item: DeskItem, x: number, y: number, accent: string, time: number) {
  const rect = (rx: number, ry: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + rx, y + ry, w, h);
  };
  switch (item) {
    case "mug":
      rect(-3, -7, 7, 7, INK);
      rect(-2, -6, 5, 5, accent);
      rect(4, -5, 2, 3, INK);
      if (Math.sin(time * 2 + x) > 0) rect(-1, -10 - (Math.floor(time * 3) % 2), 1, 2, "rgba(255,255,255,0.6)"); // steam
      break;
    case "plant":
      rect(-3, -4, 6, 4, "#b5653a");
      rect(-4, -9, 8, 5, "#3f7d3a");
      rect(-2, -11, 4, 2, "#5aa04a");
      break;
    case "photo":
      rect(-4, -10, 8, 10, INK);
      rect(-3, -9, 6, 7, "#9cc7e0");
      rect(-2, -6, 2, 4, "#6b4430");
      rect(1, -5, 2, 3, "#e9b98f");
      break;
    case "papers":
      rect(-6, -4, 11, 4, "#d9d4c6");
      rect(-5, -6, 11, 3, "#f7f4ec");
      rect(-4, -5, 7, 1, "#9aa4b8");
      break;
    case "lamp":
      rect(-3, -2, 6, 2, INK);
      rect(0, -11, 1, 9, INK);
      rect(-3, -13, 6, 3, accent);
      rect(-2, -10, 4, 1, "rgba(255,240,170,0.8)");
      break;
    case "binders":
      rect(-5, -10, 3, 10, "#b33a3a");
      rect(-2, -10, 3, 10, "#3c6aa8");
      rect(1, -9, 3, 9, "#3d8b4a");
      break;
    case "tenkey":
      rect(-4, -6, 9, 6, INK);
      rect(-3, -5, 7, 4, "#d8d8d8");
      rect(-2, -5, 5, 1, "#7fe0a0");
      break;
    case "phone":
      rect(-4, -4, 9, 4, INK);
      rect(-4, -6, 9, 2, "#2b3340");
      rect(2, -3, 2, 1, Math.sin(time * 4 + x) > 0.6 ? "#e2553f" : "#5b2620"); // voicemail light
      break;
  }
}

/** Something pinned to a cubicle's back partition; (x, y) is its top-left. */
function drawPinup(ctx: Ctx, pin: Pinup, x: number, y: number, accent: string) {
  const rect = (rx: number, ry: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + rx, y + ry, w, h);
  };
  switch (pin) {
    case "sticky":
      rect(0, 1, 5, 5, "#f7e463");
      rect(6, 0, 5, 5, "#f29bb4");
      rect(3, 6, 5, 5, "#9fd8f2");
      break;
    case "calendar":
      rect(0, 0, 10, 11, "#f7f4ec");
      rect(0, 0, 10, 3, accent);
      rect(2, 5, 6, 1, "#9aa4b8");
      rect(2, 8, 6, 1, "#9aa4b8");
      break;
    case "pennant":
      poly(
        ctx,
        [
          [x, y + 1],
          [x + 13, y + 4],
          [x, y + 8],
        ],
        accent,
        null,
      );
      break;
    case "certificate":
      rect(0, 0, 13, 10, "#6b4430");
      rect(1, 1, 11, 8, "#f4ead2");
      rect(3, 3, 7, 1, "#6b6458");
      rect(8, 5, 3, 3, "#c9a227");
      break;
    case "drawing":
      rect(0, 0, 10, 10, "#ffffff");
      rect(2, 6, 6, 2, "#3d8b4a");
      rect(5, 2, 3, 3, "#f2c14e");
      rect(2, 3, 2, 3, accent);
      break;
  }
}

function drawObject(ctx: Ctx, ch: string, x: number, y: number, time: number, playerName: string) {
  switch (ch) {
    case "C": {
      // Cubicle: partitions on the back and both sides (open to the aisle), a nameplate,
      // the desk and monitor, and the owner's own things pinned up and on the desk.
      const [cx, cy] = toScreen(x, y);
      const left = cx - TILE_W / 2;
      const back = cy - TILE_H / 2 + 3;
      const front = cy + TILE_H * 1.5 - 2; // front edge of the seat in front of the desk
      const ph = PARTITION_H * LIFT;
      const mine = sameTile([x, y], PLAYER_DESK_FURNITURE);
      const owner = mine ? playerName.split(" ")[0] : (CUBICLE_OWNERS[`${x},${y}`] ?? "");
      const seed = [...owner].reduce((n, c) => n + c.charCodeAt(0), x * 7 + y * 3);
      const accent = ACCENTS[seed % ACCENTS.length];

      ctx.fillStyle = "#8b97a6";
      ctx.fillRect(left, back - ph, TILE_W, ph);
      ctx.fillStyle = "#6d7886";
      ctx.fillRect(left, back - ph - 4, TILE_W, 4);
      drawPinup(ctx, PINUPS[seed % PINUPS.length], left + 4, back - ph + 2, accent);
      if (!mine) drawPinup(ctx, PINUPS[(seed + 2) % PINUPS.length], left + TILE_W - 15, back - ph + 2, accent);
      // Nameplate
      ctx.fillStyle = mine ? "#c9a227" : "#2a2d45";
      ctx.fillRect(cx - 13, back - ph + 1, 26, 8);
      ctx.fillStyle = mine ? INK : "#e8d28a";
      ctx.font = "bold 6px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(owner.slice(0, 7).toUpperCase(), cx, back - ph + 5.5);
      ctx.textAlign = "start";

      const box = drawBox(ctx, x, y, { h: 16, inset: 0.1, top: "#b08a5a", side: "#8a6a43" });
      ctx.fillStyle = INK;
      ctx.fillRect(box.cx - 8, box.top - 15, 16, 11);
      ctx.fillRect(box.cx - 1, box.top - 4, 2, 4);
      ctx.fillStyle = mine
        ? `rgb(110,${200 + Math.round(Math.sin(time * 3) * 30)},150)`
        : `hsl(203,63%,${55 + Math.round(Math.sin(time * 1.7 + x * 2.3 + y) * 5)}%)`;
      ctx.fillRect(box.cx - 7, box.top - 14, 14, 9);
      if (mine) {
        // The desk tools you use at the workstation: calculator, highlighter, binder.
        ctx.fillStyle = INK;
        ctx.fillRect(box.cx - 18, box.top - 8, 7, 6);
        ctx.fillRect(box.cx + 9, box.top - 9, 10, 8);
        ctx.fillStyle = "#8d93a0";
        ctx.fillRect(box.cx - 17, box.top - 7, 5, 4);
        ctx.fillStyle = "#2f5d3a";
        ctx.fillRect(box.cx + 10, box.top - 8, 8, 6);
        ctx.fillStyle = "#f7e463";
        ctx.fillRect(box.cx - 9, box.top - 1, 7, 2);
      } else {
        // A line of "work" scrolling on the screen, and the owner's things on the desk.
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(box.cx - 5, box.top - 12 + (Math.floor(time * 2 + x) % 4) * 2, 8, 1);
        drawDeskItem(ctx, DESK_ITEMS[seed % DESK_ITEMS.length], box.cx - 15, box.top + 5, accent, time);
        drawDeskItem(ctx, DESK_ITEMS[(seed * 3 + 1) % DESK_ITEMS.length], box.cx + 14, box.top + 5, accent, time);
      }

      // Side partitions: the top edge running back to front, then the end facing the aisle.
      for (const sx of [left, left + TILE_W]) {
        ctx.fillStyle = "#6d7886";
        ctx.fillRect(sx - 2, back - ph - 4, 4, front - back);
        ctx.fillStyle = "#7d8998";
        ctx.fillRect(sx - 2, front - ph - 4, 4, ph + 4);
      }
      break;
    }
    case "D": {
      const box = drawBox(ctx, x, y, { h: 18, inset: 0.04, top: "#6b4430", side: "#4a2c1d" });
      if (x === 2) {
        ctx.fillStyle = "#c9a227";
        ctx.fillRect(box.cx - 4, box.top - 6, 8, 4); // nameplate
      }
      break;
    }
    case "T":
      drawBox(ctx, x, y, { h: 14, top: "#cbbfa9", side: "#6d5a48" });
      break;
    case "B": {
      const box = drawBox(ctx, x, y, { h: 58, inset: 0.08, top: "#7d5838", side: "#6b4a2f" });
      ["#a83c3c", "#3c6aa8", "#c9a227"].forEach((c, i) => frontBand(ctx, box, 6 + i * 17, 18 + i * 17, c));
      break;
    }
    case "P": {
      const box = drawBox(ctx, x, y, { h: 12, inset: 0.34, top: "#7a4a2a", side: "#b5653a" });
      const leaves: [number, number, number, string][] = [
        [0, -9, 9, "#3f7d3a"],
        [-7, -4, 6, "#4b8f41"],
        [7, -5, 6, "#5aa04a"],
        [0, -16, 6, "#5aa04a"],
      ];
      const sway = Math.sin(time * 1.3 + x * 1.7 + y) * 1.5;
      for (const [dx, dy, r, c] of leaves) {
        ctx.beginPath();
        ctx.arc(box.cx + dx + (sway * -dy) / 16, box.top + dy, r, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
      }
      break;
    }
    case "W": {
      const box = drawBox(ctx, x, y, { h: 24, inset: 0.32, top: "#eef2f5", side: "#dfe6ec" });
      ctx.fillStyle = "#86c9e8";
      ctx.fillRect(box.cx - 6, box.top - 14, 12, 12);
      ctx.strokeStyle = OUTLINE;
      ctx.strokeRect(box.cx - 6, box.top - 14, 12, 12);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(box.cx - 2 + (Math.floor(time) % 2) * 3, box.top - 4 - ((time * 6) % 9), 2, 2);
      break;
    }
    case "V": {
      const box = drawBox(ctx, x, y, { h: 58, inset: 0.1, top: "#c94a50", side: "#b8323a" });
      frontBand(ctx, box, 16, 50, "#2b3340");
      frontBand(ctx, box, 40, 44, "#f2c14e");
      frontBand(ctx, box, 28, 32, Math.sin(time * 3) > 0 ? "#7fe0a0" : "#3f8f5a");
      break;
    }
    case "R":
      drawBox(ctx, x, y, { h: 22, top: "#d9d1c1", side: "#2f6f6a" });
      break;
  }
}

const FEET = 8; // characters' feet sit this far below the tile center

function drawCharacter(ctx: Ctx, a: Actor, time: number) {
  const [sx, sy0] = toScreen(a.x, a.y);
  const sy = sy0 + FEET;
  const cx = Math.round(sx);
  const cy = Math.round(sy);
  const moving = a.target !== null;
  const bob = moving ? Math.round(Math.abs(Math.sin(a.stride * Math.PI)) * 2) : 0;
  const base = cy - bob;
  // Standing still, people breathe (upper body rises 1px) and blink now and then.
  const seed = [...a.profile.id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const breathe = !moving && Math.sin(time * 2.2 + seed) > 0.3 ? 1 : 0;
  const blink = (time + seed * 0.37) % 4.2 < 0.13;
  const body = base - breathe;
  const p: SpritePalette = a.profile.palette;
  const front = a.facing === "S" || a.facing === "E";

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const swing = moving ? Math.round(Math.sin(a.stride * Math.PI) * 2) : 0;
  const leftLeg = 9 - Math.max(0, swing);
  const rightLeg = 9 - Math.max(0, -swing);
  const parts: [number, number, number, number, string][] = [
    [cx - 5, base - 9, 4, leftLeg, p.pants],
    [cx + 1, base - 9, 4, rightLeg, p.pants],
    [cx - 9, body - 21, 2, 10, shade(p.shirt, -0.12)],
    [cx + 7, body - 21, 2, 10, shade(p.shirt, -0.12)],
    [cx - 7, body - 22, 14, 14 + breathe, p.shirt],
    [cx - 6, body - 33, 12, 11, p.skin],
  ];
  // Outline pass first so overlapping parts keep a clean silhouette.
  ctx.fillStyle = INK;
  for (const [x, y, w, h] of parts) ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillRect(cx - 7, body - 36, 14, 4);
  for (const [x, y, w, h, c] of parts) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }
  // Shoes, shirt shading, hands
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 5, base - 9 + leftLeg - 2, 4, 2);
  ctx.fillRect(cx + 1, base - 9 + rightLeg - 2, 4, 2);
  ctx.fillStyle = shade(p.shirt, -0.18);
  ctx.fillRect(cx + 3, body - 22, 4, 14 + breathe);
  ctx.fillStyle = p.skin;
  ctx.fillRect(cx - 9, body - 12, 2, 2);
  ctx.fillRect(cx + 7, body - 12, 2, 2);

  ctx.fillStyle = p.hair;
  if (front) {
    ctx.fillRect(cx - 6, body - 35, 12, 4);
    ctx.fillRect(a.facing === "S" ? cx - 6 : cx + 4, body - 31, 2, 4);
    if (p.accent) {
      ctx.fillStyle = p.accent;
      ctx.fillRect(cx - 1, body - 21, 2, 8);
    }
    const shift = a.facing === "E" ? 1 : -1;
    ctx.fillStyle = INK;
    const eyeY = body - 28 + (blink ? 1 : 0);
    const eyeH = blink ? 1 : 2;
    ctx.fillRect(cx - 4 + shift, eyeY, 2, eyeH);
    ctx.fillRect(cx + 2 + shift, eyeY, 2, eyeH);
  } else {
    ctx.fillRect(cx - 6, body - 35, 12, 11);
  }
}

function drawNameTag(ctx: Ctx, a: Actor, label: string, color: string) {
  const [sx, sy] = toScreen(a.x, a.y);
  ctx.font = "bold 10px ui-monospace, monospace";
  const w = Math.ceil(ctx.measureText(label).width) + 10;
  const x = Math.round(sx - w / 2);
  const y = Math.round(sy) + FEET - 54;
  ctx.fillStyle = "rgba(14,16,24,0.85)";
  ctx.fillRect(x, y, w, 14);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 5, y + 7.5);
}

function drawTileMarker(ctx: Ctx, [x, y]: Tile, time: number, rgb = "242,193,78") {
  const [cx, cy] = toScreen(x, y);
  const pulse = 0.5 + Math.sin(time * 4) * 0.5;
  ctx.strokeStyle = `rgba(${rgb},${0.45 + pulse * 0.5})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - TILE_W / 2 + 4, cy - TILE_H / 2 + 3, TILE_W - 8, TILE_H - 6);
}

function drawArrow(ctx: Ctx, [x, y]: Tile, time: number) {
  const [cx, cy] = toScreen(x, y);
  const top = Math.round(cy + FEET - 70 - Math.abs(Math.sin(time * 3)) * 8);
  poly(
    ctx,
    [
      [cx - 7, top],
      [cx + 7, top],
      [cx, top + 9],
    ],
    "#f2c14e",
    INK,
  );
}

/** Speech bubble above a character, with an optional patience bar (0..1). */
function drawBubble(ctx: Ctx, a: Actor, glyph: string, time: number, patience?: number) {
  const [sx, sy] = toScreen(a.x, a.y);
  const cx = Math.round(sx);
  const top = Math.round(sy + FEET - 62 - Math.abs(Math.sin(time * 4)) * 2);
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 9, top - 1, 18, 18);
  ctx.fillRect(cx - 2, top + 16, 5, 4);
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(cx - 8, top, 16, 16);
  ctx.fillRect(cx - 1, top + 16, 3, 2);
  ctx.fillStyle = glyph === "?" ? "#2a6fb3" : "#b33a3a";
  ctx.font = "bold 13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, top + 8.5);
  ctx.textAlign = "start";
  if (patience !== undefined) {
    ctx.fillStyle = INK;
    ctx.fillRect(cx - 13, top - 8, 26, 5);
    ctx.fillStyle = patience > 0.5 ? "#9fd36b" : patience > 0.25 ? "#f2c14e" : "#e2553f";
    ctx.fillRect(cx - 12, top - 7, Math.max(0, Math.round(24 * patience)), 3);
  }
}

const inBreakroom = ([x, y]: Tile) => inBounds(x, y) && MAP[y][x] === "b";
const BREAKROOM_TILES: Tile[] = [];
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (inBreakroom([x, y])) BREAKROOM_TILES.push([x, y]);

const OBJECTS: { ch: string; x: number; y: number }[] = [];
for (let y = 0; y < ROWS; y++)
  for (let x = 0; x < COLS; x++) if (BLOCKING.has(MAP[y][x])) OBJECTS.push({ ch: MAP[y][x], x, y });

// Camera focus for the "sit at the computer" zoom: the monitor on the player's desk.
const [MONITOR_X, MONITOR_Y] = toScreen(...PLAYER_DESK_FURNITURE);
const MONITOR_FOCUS = `${(MONITOR_X / CANVAS_W) * 100}% ${((MONITOR_Y - 23) / CANVAS_H) * 100}%`;
const ZOOM_IN_MS = 900;

/** Enter fullscreen on `el`, or leave it. The browser may refuse (e.g. no user gesture); that's not an error. */
function toggleFullscreenFor(el: HTMLElement | null) {
  const request = document.fullscreenElement ? document.exitFullscreen() : el?.requestFullscreen();
  request?.catch(() => {});
}
const ZOOM_OUT_MS = 1150;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface DialogView {
  speakerId: string;
  text: string;
  shown: number;
}

interface Engine {
  advance: () => void;
  skip: () => void;
  click: (tile: Tile) => void;
  help: () => void;
  resolveRequest: (correct: boolean) => void;
  sitAtComputer: () => void;
  leaveComputer: () => void;
  reward: (points: number, text: string) => void;
  mail: (notices: MailNotice[]) => void;
  acceptPromotion: () => void;
  snapshot: () => EngineSave | null; // null until the onboarding intro is over
  togglePause: () => void;
  talk: () => void;
  endChat: () => void;
}

/** A coworker walking to the player's desk with a question. */
interface HelpRequest {
  actor: Actor;
  inquiry: Inquiry;
  phase: "approaching" | "waiting" | "helping";
  spot: Tile;
  timeLeft: number; // patience while waiting, or approach timeout
  warned: boolean; // the "running out of patience" alert has played
  retest: boolean; // a question the player missed before
}

interface Lunch {
  phase: "pending" | "break" | "return" | "done";
  timeLeft: number;
  visited: boolean;
}

const randomBetween = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);
const firstName = (a: Actor) => a.profile.name.split(" ")[0];

interface Props {
  playerName: string;
  save: SaveData | null; // continue a saved game, or null for a new character
  onQuit: () => void; // back to the title screen (the game is saved first)
}

const AUTOSAVE_MS = 5000;

export default function IsometricOfficeRPG({ playerName, save, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [mode, setMode] = useState<"cutscene" | "free">("cutscene");
  const [dialog, setDialog] = useState<DialogView | null>(null);
  const [nearbyId, setNearbyId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => save?.engine.clock ?? clockInAt(0));
  const [workday, setWorkday] = useState<WorkdayView | null>(null);
  const [study, setStudy] = useState(() => studyView(save ? restorePlan(save.engine.plan) : newStudyPlan()));
  const [dayLog, setDayLog] = useState<DayLog>(() => save?.engine.dayLog ?? { helped: 0, lunch: "pending" });
  const [signedOff, setSignedOff] = useState<ReadonlySet<string>>(() => new Set(save?.workstation?.done)); // assignments signed off
  const [muted, setMutedState] = useState(loadMuted); // the game only mounts in the browser, after clock-in
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [chatLogs, setChatLogs] = useState<Record<string, ChatTurn[]>>(save?.chats ?? {}); // one conversation per coworker
  const workstationSave = useRef<WorkstationSave | null>(save?.workstation ?? null);
  const signedOffRef = useRef(signedOff);
  const chatLogsRef = useRef(chatLogs);
  const [stats, setStats] = useState<Stats>(() => save?.engine.stats ?? { helped: 0, missed: 0 });
  const [career, setCareer] = useState<Career>(() => (save ? structuredClone(save.engine.career) : initialCareer()));
  const [ceremony, setCeremony] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [request, setRequest] = useState<RequestView | null>(null);
  const [lunch, setLunch] = useState<LunchView | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [computer, setComputer] = useState<"closed" | "entering" | "open" | "leaving">("closed");
  const [atDesk, setAtDesk] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;

    const playerProfile = createPlayerProfile(playerName);
    const player = makeActor(playerProfile, PLAYER_START, "W", CUTSCENE_SPEED);
    const npcs = NPCS.map((p) =>
      p.id === MP ? makeActor(p, GUIDE_START, "E", CUTSCENE_SPEED) : makeActor(p, p.home, p.facing, NPC_SPEED),
    );
    const guide = npcs.find((a) => a.profile.id === MP)!;
    const actors = [player, ...npcs];
    const byId = (id: string) => actors.find((a) => a.profile.id === id);

    let cutscene = true;
    let stepIndex = -1;
    let waiting: "dialog" | "walk" | null = null;
    let line: DialogView | null = null;
    let lastShown = -1;
    let nearby: string | null = null;
    let time = 0;
    const heldKeys: string[] = [];

    // Workday systems (run only after the intro).
    const saved = save?.engine;
    resetDailyWork(); // generated work is rebuilt for this game below
    let officeClock = saved?.clock ?? clockInAt(0); // office minutes since midnight of day 1
    let career = saved ? structuredClone(saved.career) : initialCareer(); // read when planning each day's work
    let shownMinute = -1;
    const firstDay = saved ? fromIsoDay(saved.firstDay) : firstWorkday(new Date());
    // How many routine assignments each day got (saved, so a reload rebuilds the same work).
    const dailySlots: number[] = saved?.dailySlots ? [...saved.dailySlots] : [];
    /** Routine slots for a day: fill up to DAILY_LIMIT after carried-over and already-scheduled work. */
    const slotsFor = (day: number) => {
      const start = day * 24 * 60;
      const busy = EMAILS.filter((e) => {
        const at = e.taskId ? emailArrival(e, career.unlockedAt) : null;
        if (at === null) return false;
        if (at < start) return !signedOffRef.current.has(e.taskId!); // still open from earlier
        return at < start + 24 * 60; // onboarding or promotion work landing today
      }).length;
      return Math.max(0, DAILY_LIMIT - busy);
    };
    const makeWorkday = (day: number): WorkdayView => {
      const date = workdayDate(firstDay, day);
      const season = seasonFor(date);
      // Older saves didn't record past days; assume the old 4 a day for them.
      dailySlots[day] ??= day < (saved?.day ?? 0) ? 4 : slotsFor(day);
      const before = dailySlots.slice(0, day).reduce((a, b) => a + (b ?? 0), 0);
      registerDailyWork(day, clockInAt(day), season.clockOut, dailySlots[day], before);
      return { day, date, season };
    };
    const dayLog: DayLog = saved ? { ...saved.dayLog } : { helped: 0, lunch: "pending" }; // for today's checklist
    const publishDayLog = () => setDayLog({ ...dayLog });
    for (let d = 0; d < (saved?.day ?? 0); d++) makeWorkday(d); // earlier days' work, for carried-over assignments
    let workday = makeWorkday(saved?.day ?? 0);
    setWorkday(workday);
    let nextRequestIn = FIRST_REQUEST_DELAY;
    let req: HelpRequest | null = null;
    let reqViewKey = "";
    const plan = saved ? restorePlan(saved.plan) : newStudyPlan(); // progressive CPA practice
    const lunchState: Lunch = {
      phase: saved?.lunchDone ? "done" : "pending",
      timeLeft: 0,
      visited: !!saved?.lunchDone,
    };
    let lunchViewKey = "";
    const score: Stats = saved ? { ...saved.stats } : { helped: 0, missed: 0 };
    let ceremonyOpen = false; // a promotion memo is on screen and needs acknowledging
    let paused = false; // freezes the whole world: clock, coworkers, patience, lunch
    const toastTimers = new Set<ReturnType<typeof setTimeout>>();
    let toastId = 0;
    const homeOf = (a: Actor) => NPCS.find((n) => n.id === a.profile.id)!.home;
    let atComputer = false; // world keeps running, but the player's input goes to the workstation
    let chatting = false; // talking with a coworker: the office holds still until the chat ends
    let atDeskShown = false;

    const occupied = (t: Tile, self: Actor) =>
      actors.some((a) => a !== self && (sameTile(tileOf(a), t) || (a.target !== null && sameTile(a.target, t))));

    function sendTo(a: Actor, goal: Tile) {
      a.goal = goal;
      a.path = findPath(a.target ?? tileOf(a), goal, (t) => occupied(t, a)) ?? [];
    }

    /** True if anyone stands on, is stepping onto, or is headed for this tile. */
    const claimed = (t: Tile) =>
      actors.some(
        (a) =>
          sameTile(tileOf(a), t) ||
          (a.target !== null && sameTile(a.target, t)) ||
          (a.goal !== null && sameTile(a.goal, t)),
      );

    function toast(tone: Toast["tone"], text: string) {
      const id = ++toastId;
      setToasts((list) => [...list.slice(-3), { id, tone, text }]);
      const timer = setTimeout(() => {
        toastTimers.delete(timer);
        setToasts((list) => list.filter((t) => t.id !== id));
      }, 3800);
      toastTimers.add(timer);
    }

    /** Performance points fill today's bar; promotions are decided at clock-out (see endDay). */
    function addReputation(delta: number) {
      career = applyPoints(career, delta);
      setCareer(career);
      setStats({ ...score });
    }

    // ---- Coworker help requests -------------------------------------------
    function startRequest() {
      const spot = DESK_VISITOR_TILES.find((t) => walkable(t) && !claimed(t));
      // Coworkers free to walk over: idle at their own spot, with a way to the desk.
      const routes = new Map<string, Tile[]>();
      for (const id of spot ? REQUESTERS : []) {
        const a = byId(id);
        if (!a || !isIdle(a) || a.goal || !sameTile(tileOf(a), homeOf(a))) continue;
        const path = findPath(tileOf(a), spot!, (t) => occupied(t, a));
        if (path) routes.set(id, path);
      }
      const pick = nextQuestion(plan, (q) => q.askers.some((id) => routes.has(id)));
      if (!pick) {
        nextRequestIn = 4; // nobody free or no room by the desk; try again shortly
        return;
      }
      const askers = pick.inquiry.askers.filter((id) => routes.has(id));
      const a = byId(askers[Math.floor(Math.random() * askers.length)])!;
      req = {
        actor: a,
        inquiry: pick.inquiry,
        phase: "approaching",
        spot: spot!,
        timeLeft: REQUEST_APPROACH_TIMEOUT,
        warned: false,
        retest: pick.retest,
      };
      a.goal = spot!;
      a.path = routes.get(a.profile.id)!;
      const kind = withArticle(pick.inquiry.topic);
      toast(
        "info",
        pick.retest
          ? `🔁 ${firstName(a)} is bringing back ${kind} question you missed. Retest time!`
          : `${firstName(a)} is coming over with ${kind} question.`,
      );
      sfx.visitor();
    }

    function endRequest() {
      if (!req) return;
      sendTo(req.actor, homeOf(req.actor));
      req = null;
      nextRequestIn = randomBetween(REQUEST_INTERVAL);
    }

    const canHelp = () =>
      req?.phase === "waiting" && Math.hypot(req.actor.x - player.x, req.actor.y - player.y) < INSPECT_RADIUS;

    function updateRequest(dt: number) {
      if (!req) {
        if (lunchState.phase === "break" || lunchState.phase === "return") return;
        nextRequestIn -= dt;
        if (nextRequestIn <= 0) startRequest();
        return;
      }
      const a = req.actor;
      if (req.phase === "approaching") {
        req.timeLeft -= dt;
        if (isIdle(a) && sameTile(tileOf(a), req.spot)) {
          req.phase = "waiting";
          req.timeLeft = REQUEST_PATIENCE;
          a.facing = facingFor(PLAYER_DESK[0] - a.x, PLAYER_DESK[1] - a.y);
        } else if (req.timeLeft <= 0) endRequest();
      } else if (req.phase === "waiting") {
        req.timeLeft -= dt;
        if (!req.warned && req.timeLeft <= 15) {
          req.warned = true;
          sfx.alert();
        }
        if (req.timeLeft <= 0) {
          score.missed++;
          addReputation(REPUTATION.ignored);
          toast("bad", `${firstName(a)} gave up waiting. (${REPUTATION.ignored} pts)`);
          sfx.penalty();
          endRequest();
        }
      }
    }

    function publishRequest() {
      const view: RequestView | null = req && {
        npcId: req.actor.profile.id,
        phase: req.phase,
        inquiry: req.inquiry,
        retest: req.retest,
        timeLeft: req.timeLeft,
        canHelp: canHelp(),
      };
      const key = view ? `${view.npcId}|${view.phase}|${Math.ceil(view.timeLeft)}|${view.canHelp}` : "";
      if (key !== reqViewKey) {
        reqViewKey = key;
        setRequest(view);
      }
    }

    // ---- Lunch break --------------------------------------------------------
    function startLunch() {
      lunchState.phase = "break";
      lunchState.timeLeft = LUNCH_DURATION;
      lunchState.visited = false;
      endRequest(); // whoever was asking goes to lunch instead, no penalty
      // Fill the breakroom from the back corner so the way in stays open for the player.
      const seats = [...BREAKROOM_TILES].sort((p, q) => q[1] - p[1] || p[0] - q[0]);
      for (const id of LUNCH_GOERS) {
        const a = byId(id);
        const seat = seats.find((t) => !claimed(t));
        if (a && seat) sendTo(a, seat);
      }
      toast("info", "🕛 12:00 PM: lunch break! Head to the breakroom.");
      sfx.lunch();
    }

    function updateLunch(dt: number) {
      if (lunchState.phase === "pending") {
        if (minuteOfDay(officeClock) >= LUNCH_START && req?.phase !== "helping") startLunch();
        return;
      }
      if (lunchState.phase === "break") {
        lunchState.timeLeft -= dt;
        if (!lunchState.visited && inBreakroom(tileOf(player))) {
          lunchState.visited = true;
          toast("good", "You grabbed lunch in the breakroom. 🥪");
        }
        if (lunchState.timeLeft <= 0) {
          lunchState.phase = "return";
          lunchState.timeLeft = RETURN_GRACE;
          for (const id of LUNCH_GOERS) {
            const a = byId(id);
            if (a) sendTo(a, homeOf(a));
          }
          toast("info", "Break's over! Get back to your desk.");
          sfx.alert();
        }
      } else if (lunchState.phase === "return") {
        lunchState.timeLeft -= dt;
        const atDesk = sameTile(tileOf(player), PLAYER_DESK);
        if (atDesk || lunchState.timeLeft <= 0) {
          lunchState.phase = "done";
          dayLog.lunch = !lunchState.visited ? "skipped" : atDesk ? "done" : "late";
          publishDayLog();
          if (!lunchState.visited) {
            addReputation(REPUTATION.lunchSkipped);
            toast("bad", `You skipped lunch. (${REPUTATION.lunchSkipped} pts)`);
            sfx.penalty();
          }
          if (atDesk) {
            addReputation(REPUTATION.lunchOnTime);
            toast("good", `Back at your desk on time. (+${REPUTATION.lunchOnTime} pts)`);
          } else {
            addReputation(REPUTATION.lunchLate);
            toast("bad", `Late back from lunch! (${REPUTATION.lunchLate} pts)`);
            sfx.penalty();
          }
          nextRequestIn = randomBetween(REQUEST_INTERVAL);
        }
      }
    }

    // ---- Clock out ------------------------------------------------------------
    /** Wrap the day at the season's clock-out time and start the next workday at 9:00 AM. */
    function endDay() {
      const out = formatMinutes(workday.season.clockOut);
      endRequest();
      const target = RANKS[career.rank].dailyTarget;
      const today = career.today;
      // A shift that ends with a full bar counts toward promotion. Decide it before planning
      // tomorrow, so work a promotion unlocks counts toward tomorrow's 5 assignments.
      const result = endShift(career, clockInAt(workday.day + 1));
      career = result.career;
      setCareer(career);
      workday = makeWorkday(workday.day + 1);
      officeClock = clockInAt(workday.day);
      lunchState.phase = "pending";
      dayLog.helped = 0;
      dayLog.lunch = "pending";
      publishDayLog();
      nextRequestIn = FIRST_REQUEST_DELAY;
      setWorkday(workday);
      const next = workday.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      toast("info", `🕔 ${out}: time to clock out! Next up: ${next}, clock in at 9:00 AM (${workday.season.name}).`);
      sfx.clockOut();

      if (result.promotedTo !== null) {
        ceremonyOpen = true;
        heldKeys.length = 0;
        player.path = [];
        setCeremony(result.promotedTo);
        const fanfare = setTimeout(() => {
          toastTimers.delete(fanfare);
          sfx.promotion();
        }, 1100);
        toastTimers.add(fanfare);
      } else if (result.full) {
        const toGo = RANKS[career.rank + 1] ? ` (${career.fullShifts}/${DAYS_TO_PROMOTE} toward promotion)` : "";
        toast("good", `⭐ Full-bar shift: ${today}/${target} pts${toGo}.`);
        sfx.fullShift();
      } else {
        toast("bad", `Shift ended at ${today}/${target} pts. Fill the bar to count it toward promotion.`);
      }
    }

    function publishLunch() {
      const active = lunchState.phase === "break" || lunchState.phase === "return";
      const key = active ? `${lunchState.phase}|${Math.ceil(lunchState.timeLeft)}|${lunchState.visited}` : "";
      if (key === lunchViewKey) return;
      lunchViewKey = key;
      setLunch(
        active
          ? {
              phase: lunchState.phase as LunchView["phase"],
              timeLeft: Math.max(0, lunchState.timeLeft),
              visitedBreakroom: lunchState.visited,
            }
          : null,
      );
    }

    function say(speakerId: string, text: string) {
      line = { speakerId, text: text.replaceAll("{name}", playerName), shown: 0 };
      lastShown = -1;
      waiting = "dialog";
    }

    function finish() {
      cutscene = false;
      waiting = null;
      line = null;
      setDialog(null);
      setMode("free");
      player.speed = PLAYER_SPEED;
      guide.speed = NPC_SPEED;
      const home = NPCS.find((n) => n.id === MP)!.home;
      sendTo(guide, home);
    }

    function nextStep() {
      const step = ONBOARDING[++stepIndex];
      if (!step || step.kind === "end") return finish();
      switch (step.kind) {
        case "say":
          return say(step.speaker, step.text);
        case "walk": {
          const start = tileOf(guide);
          const path = findPath(start, step.to, (t) => occupied(t, guide));
          if (!path?.length) return nextStep();
          guide.path = path;
          player.path = [start, ...path.slice(0, -1)];
          waiting = "walk";
          return;
        }
        case "playerWalk": {
          const path = findPath(tileOf(player), step.to, (t) => occupied(t, player));
          if (!path?.length) return nextStep();
          player.path = path;
          waiting = "walk";
          return;
        }
        case "face": {
          const a = byId(step.who);
          if (a) a.facing = step.facing;
          return nextStep();
        }
      }
    }

    function moveActor(a: Actor, dt: number) {
      let remaining = a.speed * dt;
      while (remaining > 0) {
        if (!a.target) {
          const next = a.path[0];
          if (!next) {
            // Free-roaming NPCs retry blocked goals (e.g. the player standing in a doorway).
            if (a.goal && !sameTile(tileOf(a), a.goal)) {
              a.stall += dt;
              if (a.stall > 0.6) {
                a.stall = 0;
                sendTo(a, a.goal);
              }
            } else a.goal = null;
            return;
          }
          // Scripted walks are choreographed, so only free movement checks collisions.
          if (!cutscene && (!walkable(next) || occupied(next, a))) {
            a.stall += dt;
            if (a.stall > 0.6) {
              a.stall = 0;
              if (a.goal) sendTo(a, a.goal);
              else a.path = [];
            }
            return;
          }
          const [fx, fy] = tileOf(a);
          a.path.shift();
          a.target = next;
          a.stall = 0;
          a.facing = facingFor(next[0] - fx, next[1] - fy);
        }
        const dx = a.target[0] - a.x;
        const dy = a.target[1] - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= remaining) {
          a.x = a.target[0];
          a.y = a.target[1];
          a.target = null;
          a.stride += dist;
          remaining -= dist;
        } else {
          a.x += (dx / dist) * remaining;
          a.y += (dy / dist) * remaining;
          a.stride += remaining;
          remaining = 0;
        }
      }
    }

    const KEY_DIRS: Record<string, Tile> = {
      ArrowUp: [0, -1],
      w: [0, -1],
      ArrowRight: [1, 0],
      d: [1, 0],
      ArrowDown: [0, 1],
      s: [0, 1],
      ArrowLeft: [-1, 0],
      a: [-1, 0],
    };

    function update(dt: number) {
      time += dt;

      if (line) {
        line.shown = Math.min(line.text.length, line.shown + dt * TYPE_SPEED);
        const shown = Math.floor(line.shown);
        if (shown !== lastShown) {
          const ch = line.text[shown - 1];
          if (ch && /[a-z0-9]/i.test(ch) && shown % 2 === 1) voiceBlip(byId(line.speakerId)?.profile.voice ?? 250, ch);
          lastShown = shown;
          setDialog({ ...line, shown });
        }
      }

      if (!cutscene && !atComputer && !ceremonyOpen && req?.phase !== "helping" && isIdle(player) && heldKeys.length) {
        const [dx, dy] = KEY_DIRS[heldKeys[heldKeys.length - 1]];
        const [px, py] = tileOf(player);
        const next: Tile = [px + dx, py + dy];
        player.facing = facingFor(dx, dy);
        player.goal = null;
        if (walkable(next) && !wallBetween([px, py], next) && !occupied(next, player)) player.path = [next];
      }

      for (const a of actors) moveActor(a, dt);

      if (waiting === "walk" && actors.every(isIdle)) {
        waiting = null;
        nextStep();
      }

      if (!cutscene) {
        // The lunch hour passes quickly so the break isn't a long wait.
        const rate = lunchState.phase === "break" ? LUNCH_OFFICE_MINUTES / LUNCH_DURATION : OFFICE_MINUTES_PER_SECOND;
        officeClock += dt * rate;
        const onBreak = lunchState.phase === "break" || lunchState.phase === "return";
        if (minuteOfDay(officeClock) >= workday.season.clockOut && !onBreak && req?.phase !== "helping") endDay();
        const minute = Math.floor(officeClock);
        if (minute !== shownMinute) {
          shownMinute = minute;
          setClock(officeClock);
        }
        updateLunch(dt);
        updateRequest(dt);
        publishRequest();
        publishLunch();
      }

      const deskReady = !cutscene && !atComputer && isIdle(player) && sameTile(tileOf(player), PLAYER_DESK);
      if (deskReady !== atDeskShown) {
        atDeskShown = deskReady;
        setAtDesk(deskReady);
      }

      // Character inspection: nearest NPC within reach of the player.
      let best: Actor | null = null;
      let bestDist = INSPECT_RADIUS;
      if (!cutscene) {
        for (const n of npcs) {
          const d = Math.hypot(n.x - player.x, n.y - player.y);
          if (d < bestDist) {
            best = n;
            bestDist = d;
          }
        }
      }
      const id = best?.profile.id ?? null;
      if (id !== nearby) {
        nearby = id;
        setNearbyId(id);
      }
      if (best) {
        if (isIdle(best)) best.facing = facingFor(player.x - best.x, player.y - best.y);
        const popup = popupRef.current;
        if (popup) {
          const [sx, sy] = toScreen(best.x, best.y);
          popup.style.left = `${Math.min(84, Math.max(16, (sx / CANVAS_W) * 100))}%`;
          popup.style.top = `${((sy - 44) / CANVAS_H) * 100}%`;
        }
      }
    }

    function render() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.imageSmoothingEnabled = false;
      ctx!.fillStyle = "#151824";
      ctx!.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawWalls(ctx!, minuteOfDay(officeClock), time);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawFloor(ctx!, x, y);
      drawFloorShading(ctx!);
      drawWindowLight(ctx!, time);
      const lunchBreak = lunchState.phase === "break" && !lunchState.visited;
      const backToDesk = cutscene || lunchState.phase === "return";
      if (backToDesk) drawTileMarker(ctx!, PLAYER_DESK, time);
      if (lunchBreak) for (const t of BREAKROOM_TILES) drawTileMarker(ctx!, t, time, "255,240,200");

      const drawables: { depth: number; draw: () => void }[] = OBJECTS.map((o) => ({
        depth: o.y,
        draw: () => drawObject(ctx!, o.ch, o.x, o.y, time, playerName),
      }));
      for (const a of actors) drawables.push({ depth: a.y + 0.1, draw: () => drawCharacter(ctx!, a, time) });
      drawables.sort((p, q) => p.depth - q.depth);
      for (const d of drawables) d.draw();

      if (backToDesk) drawArrow(ctx!, PLAYER_DESK, time);
      if (lunchBreak) drawArrow(ctx!, BREAKROOM_CENTER, time);
      if (req) {
        const patience = req.phase === "waiting" ? Math.max(0, req.timeLeft / REQUEST_PATIENCE) : undefined;
        drawBubble(ctx!, req.actor, req.phase === "approaching" ? "!" : "?", time, patience);
      }
      drawNameTag(ctx!, player, playerName, "#f2c14e");
    }

    let raf = 0;
    let last = performance.now();
    let frameError = false;
    const frame = (now: number) => {
      // Schedule the next frame first so one failing frame can't freeze or blank the office for good.
      raf = requestAnimationFrame(frame);
      try {
        if (!paused && !chatting) update(Math.min((now - last) / 1000, 0.05));
        render();
      } catch (err) {
        if (!frameError) console.error("Office frame failed:", err);
        frameError = true;
      }
      last = now;
    };
    raf = requestAnimationFrame(frame);

    engineRef.current = {
      advance() {
        if (waiting !== "dialog" || !line) return;
        if (line.shown < line.text.length) {
          line.shown = line.text.length;
          return;
        }
        line = null;
        waiting = null;
        setDialog(null);
        nextStep();
      },
      skip() {
        if (!cutscene) return;
        for (const a of actors) {
          a.path = [];
          a.target = null;
        }
        [player.x, player.y] = PLAYER_DESK;
        player.facing = "N";
        [guide.x, guide.y] = NPCS.find((n) => n.id === MP)!.home;
        guide.facing = "S";
        finish();
      },
      click(tile) {
        if (paused) return;
        if (cutscene) return engineRef.current?.advance();
        if (!inBounds(...tile) || req?.phase === "helping" || atComputer || ceremonyOpen) return;
        let dest = tile;
        if (!walkable(tile) || occupied(tile, player)) {
          // Clicked furniture or a person: walk to the closest free tile beside it.
          const options = NEIGHBORS.map(([dx, dy]): Tile => [tile[0] + dx, tile[1] + dy])
            .filter((t) => walkable(t) && !occupied(t, player))
            .sort(
              (p, q) => Math.hypot(p[0] - player.x, p[1] - player.y) - Math.hypot(q[0] - player.x, q[1] - player.y),
            );
          if (!options.length) return;
          dest = options[0];
        }
        heldKeys.length = 0;
        sendTo(player, dest);
      },
      help() {
        if (!req || atComputer || ceremonyOpen || !canHelp()) return;
        req.phase = "helping";
        heldKeys.length = 0;
        player.path = [];
        player.goal = null;
        publishRequest();
      },
      resolveRequest(correct) {
        if (req?.phase !== "helping") return;
        const name = firstName(req.actor);
        score.helped++;
        dayLog.helped++;
        publishDayLog();
        addReputation(correct ? REPUTATION.correct : REPUTATION.attempted);
        const { topic } = req.inquiry;
        const levelUp = recordAnswer(plan, req.inquiry, correct);
        setStudy(studyView(plan));
        if (levelUp) {
          toast("good", `📈 ${topic} level up: ${LEVEL_NAMES[levelUp - 1]}! Questions get tougher from here.`);
          sfx.fullShift();
        }
        toast(
          correct ? "good" : "info",
          correct
            ? `${name} owes you one! (+${REPUTATION.correct} pts)`
            : `${name} thanks you for trying. (+${REPUTATION.attempted} pts)`,
        );
        endRequest();
        publishRequest();
      },
      sitAtComputer() {
        if (cutscene || atComputer || ceremonyOpen || req?.phase === "helping") return;
        if (!isIdle(player) || !sameTile(tileOf(player), PLAYER_DESK)) return;
        atComputer = true;
        heldKeys.length = 0;
        player.facing = "N";
        setComputer("entering");
      },
      leaveComputer() {
        atComputer = false;
      },
      mail(notices) {
        const tasks = notices.filter((n) => n.assignment);
        (tasks.length ? sfx.assignment : sfx.email)();
        for (const n of notices) {
          const from = NPCS.find((p) => p.id === n.from)?.name.split(" ")[0] ?? "Someone";
          toast("info", `${n.assignment ? "📋 New assignment" : "📧 New email"} from ${from}: ${n.subject}`);
        }
      },
      reward(points, text) {
        toast("good", text);
        sfx.signOff();
        addReputation(points);
      },
      talk() {
        if (cutscene || atComputer || ceremonyOpen || chatting || req?.phase === "helping" || !nearby) return;
        const a = byId(nearby);
        if (!a) return;
        chatting = true;
        heldKeys.length = 0;
        player.path = [];
        player.goal = null;
        a.facing = facingFor(player.x - a.x, player.y - a.y);
        player.facing = facingFor(a.x - player.x, a.y - player.y);
        setChatWith(a.profile.id);
      },
      endChat() {
        chatting = false;
        setChatWith(null);
      },
      togglePause() {
        paused = !paused;
        heldKeys.length = 0;
        setPaused(paused);
      },
      snapshot() {
        if (cutscene) return null;
        return {
          clock: officeClock,
          day: workday.day,
          firstDay: toIsoDay(firstDay),
          career: structuredClone(career),
          plan: savePlan(plan),
          stats: { ...score },
          dayLog: { ...dayLog },
          lunchDone: lunchState.phase !== "pending",
          dailySlots: [...dailySlots],
        };
      },
      acceptPromotion() {
        if (!ceremonyOpen) return;
        ceremonyOpen = false;
        setCeremony(null);
        toast("good", `🎉 You're now ${RANKS[career.rank].title}! New assignments are on the way.`);
      },
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if (e.key.toLowerCase() === "p" && !typing && !e.repeat) {
        e.preventDefault();
        engineRef.current?.togglePause();
        return;
      }
      if (paused || atComputer || chatting) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === " " || key === "Enter") {
        e.preventDefault();
        if (cutscene) engineRef.current?.advance();
        else if (key === " " && !e.repeat) engineRef.current?.sitAtComputer();
      } else if (key === "Escape") {
        engineRef.current?.skip();
      } else if (key === "e") {
        engineRef.current?.help();
      } else if (key === "t" && !e.repeat) {
        e.preventDefault(); // otherwise the "t" lands in the chat box that opens
        engineRef.current?.talk();
      } else if (key in KEY_DIRS) {
        e.preventDefault();
        if (!heldKeys.includes(key)) heldKeys.push(key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const i = heldKeys.indexOf(key);
      if (i >= 0) heldKeys.splice(i, 1);
    };
    const onBlur = () => (heldKeys.length = 0);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    if (saved) {
      [player.x, player.y] = PLAYER_DESK;
      player.facing = "N";
      [guide.x, guide.y] = NPCS.find((n) => n.id === MP)!.home;
      guide.facing = "S";
      finish();
      toast("info", `Welcome back! It's ${formatMinutes(minuteOfDay(officeClock))} on day ${workday.day + 1}.`);
    } else nextStep();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      for (const timer of toastTimers) clearTimeout(timer);
      setToasts([]); // a restarted engine numbers its messages from 1 again
      engineRef.current = null;
    };
  }, [playerName, save]);

  // Autosave: every few seconds, and when the tab is hidden or closed.
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const saveNow = () => {
    const engine = engineRef.current?.snapshot();
    if (!engine) return false;
    const ok = writeSave({ playerName, engine, workstation: workstationSave.current, chats: chatLogsRef.current });
    if (ok) setLastSaved(Date.now());
    return ok;
  };
  const saveNowRef = useRef(saveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
    chatLogsRef.current = chatLogs;
    signedOffRef.current = signedOff;
  });
  useEffect(() => {
    const write = () => saveNowRef.current();
    const timer = setInterval(write, AUTOSAVE_MS);
    const onHide = () => document.visibilityState === "hidden" && write();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", write);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", write);
    };
  }, []);

  // Sound: browsers only start audio after a click or key press; M or the sidebar toggles mute.
  const toggleMute = () =>
    setMutedState((m) => {
      storeMuted(!m);
      return !m;
    });
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Fullscreen: the button or F toggles it; Esc (handled by the browser) leaves it.
  const toggleFullscreen = () => toggleFullscreenFor(shellRef.current);
  useEffect(() => {
    const onChange = () => setFullscreen(!!shellRef.current && document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (computer !== "closed") return; // the workstation has its own typing
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if (e.key.toLowerCase() === "m" && !typing && !e.repeat && !e.metaKey && !e.ctrlKey) {
        setMutedState((m) => {
          storeMuted(!m);
          return !m;
        });
        return;
      }
      if (e.key.toLowerCase() === "f" && !typing && !e.repeat && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleFullscreenFor(shellRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [computer]);

  // Camera zoom phases: the timers hand off to the next phase once each CSS transition finishes.
  useEffect(() => {
    if (computer !== "entering" && computer !== "leaving") return;
    const timer = setTimeout(
      () => {
        if (computer === "entering") setComputer("open");
        else {
          setComputer("closed");
          engineRef.current?.leaveComputer();
        }
      },
      computer === "entering" ? ZOOM_IN_MS : ZOOM_OUT_MS,
    );
    return () => clearTimeout(timer);
  }, [computer]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    engineRef.current?.click(toTile(px, py));
  };

  const nearby = NPCS.find((n) => n.id === nearbyId) ?? null;
  // What a coworker can help with when you chat: your inbox assignments and past quiz questions.
  const chatContext = (): ChatContext => ({
    taskIds: EMAILS.flatMap((e) => {
      const at = emailArrival(e, career.unlockedAt);
      return e.taskId && at !== null && at <= clock ? [e.taskId] : [];
    }),
    askedIds: study.answeredIds,
  });
  const speaker: CharacterProfile | null = dialog
    ? (NPCS.find((n) => n.id === dialog.speakerId) ?? createPlayerProfile(playerName))
    : null;
  const cinematic = mode === "cutscene";
  const requester = request ? (NPCS.find((n) => n.id === request.npcId) ?? null) : null;
  const helpable = !!request?.canHelp && request.npcId === nearbyId;
  const zoomed = computer === "entering" || computer === "open";
  const worldUi = computer === "closed";

  return (
    <div
      ref={shellRef}
      className={
        fullscreen ? "flex h-full w-full items-center justify-center overflow-auto bg-[#0b0d14] p-3" : "w-full"
      }
    >
      <div className="mx-auto flex w-full select-none flex-col gap-3 font-mono">
        {/* Top bar: who you are and when it is, plus sound and saving */}
        <header className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded border-4 border-[#0b0d14] bg-[#0e1018] px-4 py-2 text-[11px] text-[#d6dbe6]">
          <div className="leading-tight">
            <div className="font-bold tracking-wider text-[#e8d28a]">{playerName}</div>
            <div className="text-[10px] text-[#9aa4b8]">{RANKS[career.rank].title} · Assurance</div>
          </div>
          {!cinematic && <span className="hidden h-8 w-px bg-[#2a2d45] sm:block" aria-hidden />}
          {!cinematic && <OfficeStatus clock={clock} workday={workday} />}
          <div className="ml-auto flex items-center gap-1.5">
            {!cinematic && lastSaved && (
              <span className="mr-1 hidden text-[10px] text-[#9aa4b8] md:inline" aria-live="polite">
                Saved {new Date(lastSaved).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={!muted}
              aria-label={muted ? "Sound off (M)" : "Sound on (M)"}
              title={muted ? "Sound off (M)" : "Sound on (M)"}
              className="rounded border-2 border-[#9aa4b8] bg-[#0e1018] px-2 py-1 text-[11px] text-[#d6dbe6] hover:bg-[#1d2130] disabled:opacity-50"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            {cinematic ? (
              <button
                type="button"
                onClick={() => engineRef.current?.skip()}
                className="rounded border-2 border-[#9aa4b8] bg-[#0e1018] px-2 py-1 text-[11px] text-[#d6dbe6] hover:bg-[#1d2130] disabled:opacity-50"
              >
                Skip intro (Esc)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => saveNow()}
                  title="Save now (the game also autosaves every few seconds)"
                  className="rounded border-2 border-[#c9a227] bg-[#0e1018] px-2 py-1 text-[11px] font-bold text-[#e8d28a] hover:bg-[#1d2130]"
                >
                  💾 Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveNow();
                    onQuit();
                  }}
                  disabled={!worldUi}
                  className="rounded border-2 border-[#9aa4b8] bg-[#0e1018] px-2 py-1 text-[11px] text-[#d6dbe6] hover:bg-[#1d2130] disabled:opacity-50"
                >
                  Save &amp; quit
                </button>
              </>
            )}
          </div>
        </header>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:[grid-template-areas:'left_game'_'right_game'] xl:grid-cols-[14rem_minmax(0,1fr)_14rem] xl:[grid-template-areas:'left_game_right']">
          {/* Left panel: today's work */}
          {!cinematic && workday && (
            <aside
              aria-label="Today"
              className="order-2 space-y-3 rounded border-4 border-[#0b0d14] bg-[#0e1018] p-3 text-[11px] leading-tight text-[#d6dbe6] lg:order-none lg:[grid-area:left]"
            >
              <DailyChecklist
                clock={clock}
                workday={workday}
                unlockedAt={career.unlockedAt}
                signedOff={signedOff}
                log={dayLog}
                todayPoints={career.today}
                target={RANKS[career.rank].dailyTarget}
              />
              <TodayBar career={career} />
            </aside>
          )}
          <div
            className="order-1 mx-auto w-full min-w-0 lg:order-none lg:[grid-area:game]"
            // Fit the floor, the top bar and the control bar inside the viewport; fullscreen lets it grow past its native size.
            style={{
              maxWidth: fullscreen
                ? `min(100%, calc((100dvh - 215px) * ${CANVAS_W / CANVAS_H}))`
                : `min(${CANVAS_W}px, calc((100dvh - 215px) * ${CANVAS_W / CANVAS_H}))`,
            }}
          >
            <div className="relative">
              <div className="overflow-hidden rounded-lg border-4 border-[#0b0d14] bg-[#151824]">
                <canvas
                  ref={canvasRef}
                  onClick={onCanvasClick}
                  className="block w-full cursor-pointer"
                  style={{
                    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
                    imageRendering: "pixelated",
                    // Camera: push into the desk monitor, or pull back out after the screen fades.
                    transformOrigin: MONITOR_FOCUS,
                    transform: zoomed ? "scale(9)" : "scale(1)",
                    transition: `transform ${ZOOM_IN_MS}ms cubic-bezier(.7,0,.3,1) ${zoomed ? 0 : ZOOM_OUT_MS - ZOOM_IN_MS}ms`,
                  }}
                  aria-label={`${FIRM_NAME} office floor`}
                />
              </div>
              {/* Screen glow fills the frame as the camera reaches the monitor */}
              <div
                className="pointer-events-none absolute inset-0 z-10 rounded-lg bg-[#2a625d]"
                style={{
                  opacity: zoomed ? 1 : 0,
                  transition: `opacity 350ms ease ${zoomed ? ZOOM_IN_MS * 0.6 : 0}ms`,
                }}
              />
              <OfficeWorkstation
                open={computer === "open" && !paused}
                playerName={playerName}
                clock={clock}
                career={career}
                lunch={lunch}
                request={request}
                onExit={() => setComputer((c) => (c === "open" ? "leaving" : c))}
                onReward={(points, text, taskId) => {
                  setSignedOff((ids) => new Set(ids).add(taskId));
                  engineRef.current?.reward(points, text);
                }}
                onMail={(notices) => engineRef.current?.mail(notices)}
                guide={career.rank === 0}
                saved={save?.workstation ?? null}
                onSave={(state) => (workstationSave.current = state)}
              />

              {/* Cinematic letterbox during the onboarding cutscene */}
              <div
                className="pointer-events-none absolute inset-x-1 top-1 bg-black transition-all duration-700"
                style={{ height: cinematic ? "4%" : 0 }}
              />
              <div
                className="pointer-events-none absolute inset-x-1 bottom-1 bg-black transition-all duration-700"
                style={{ height: cinematic ? "4%" : 0 }}
              />

              {lunch && worldUi && (
                <div className="pointer-events-none absolute left-1/2 top-3 w-72 -translate-x-1/2 sm:top-4">
                  <LunchBanner view={lunch} />
                </div>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-pressed={fullscreen}
                aria-label={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
                title={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
                hidden={!worldUi}
                className="absolute right-2 top-2 z-30 grid h-7 w-7 place-items-center rounded border-2 border-[#9aa4b8] bg-[#0e1018]/85 text-[13px] leading-none text-[#d6dbe6] hover:bg-[#1d2130]"
              >
                {fullscreen ? "⤡" : "⛶"}
              </button>
              <div className="absolute right-3 top-11 flex flex-col items-end gap-2 sm:right-4" hidden={!worldUi}>
                {request && requester && request.phase !== "helping" && (
                  <RequestCard view={request} requester={requester} onHelp={() => engineRef.current?.help()} />
                )}
              </div>
              {chatWith && worldUi && (
                <CoworkerChat
                  key={chatWith}
                  npc={NPCS.find((n) => n.id === chatWith)!}
                  playerName={playerName}
                  history={chatLogs[chatWith] ?? []}
                  onHistory={(next) => setChatLogs((logs) => ({ ...logs, [chatWith]: next }))}
                  context={chatContext}
                  onClose={() => engineRef.current?.endChat()}
                />
              )}
              {/* Character inspection popup */}
              <div
                ref={popupRef}
                className="pointer-events-none absolute w-max max-w-48 -translate-x-1/2 -translate-y-full transition-opacity duration-150"
                style={{ opacity: nearby && worldUi && !chatWith ? 1 : 0 }}
                role="status"
                aria-live="polite"
              >
                {nearby && (
                  <div
                    className="rounded border-2 border-b-4 border-[#0b0d14] bg-[#2a2d45] px-2.5 py-1 text-center leading-tight shadow-[3px_3px_0_#0b0d14]"
                    style={{ borderBottomColor: nearby.palette.shirt }}
                  >
                    <div className="truncate text-[11px] font-bold text-[#f4efe4]">{nearby.name}</div>
                    <div className="truncate text-[9px] text-[#e8d28a]">{nearby.role}</div>
                  </div>
                )}
                <div className="mx-auto h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-[#0b0d14]" />
              </div>

              <ToastStack toasts={toasts} raised={!worldUi} />

              {request?.phase === "helping" && requester && (
                <InquiryModal
                  key={request.inquiry.id}
                  requester={requester}
                  inquiry={request.inquiry}
                  retest={request.retest}
                  onResolve={(correct) => engineRef.current?.resolveRequest(correct)}
                />
              )}

              {ceremony !== null && (
                <PromotionCeremony
                  rank={ceremony}
                  playerName={playerName}
                  onAccept={() => engineRef.current?.acceptPromotion()}
                />
              )}

              {paused && (
                <div className="absolute inset-0 z-50 grid place-items-center rounded-lg bg-[#0b0d14]/75 font-mono">
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="pause-title"
                    className="rounded border-4 border-[#0b0d14] bg-[#f4efe4] px-8 py-6 text-center text-[#1b1b22] shadow-[6px_6px_0_#0b0d14]"
                  >
                    <h2 id="pause-title" className="text-lg font-bold tracking-[0.3em]">
                      ⏸ PAUSED
                    </h2>
                    <p className="mt-1 text-[11px] text-[#6b6458]">The office clock, coworkers and lunch are frozen.</p>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => engineRef.current?.togglePause()}
                      className="mt-4 w-full border-2 border-[#0b0d14] bg-[#c9a227] py-2 text-[12px] font-bold uppercase tracking-wider shadow-[3px_3px_0_#0b0d14]"
                    >
                      ▶ Resume (P)
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-stretch gap-3">
              {/* Dialog panel sits below the floor so it never hides the action. */}
              {dialog && speaker ? (
                <button
                  type="button"
                  onClick={() => engineRef.current?.advance()}
                  className="flex min-h-[92px] min-w-0 flex-1 items-start gap-3 rounded border-4 border-[#0b0d14] bg-[#f4efe4] p-3 text-left text-[#1b1b22] shadow-[6px_6px_0_#0b0d14] sm:p-4"
                >
                  <Portrait palette={speaker.palette} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13px] font-bold">{speaker.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-[#6b6458]">{speaker.role}</span>
                    </div>
                    <p className="min-h-[2.8em] text-[12px] leading-relaxed sm:text-[13px]">
                      {dialog.text.slice(0, dialog.shown)}
                    </p>
                  </div>
                  <span
                    className={`self-end text-[10px] text-[#6b6458] ${dialog.shown >= dialog.text.length ? "animate-pulse" : "opacity-0"}`}
                  >
                    ▶ Space
                  </span>
                </button>
              ) : (
                <div className="flex min-h-[92px] min-w-0 flex-1 items-center justify-center rounded border-4 border-[#0b0d14] bg-[#0e1018] px-4 text-center text-[11px] text-[#9aa4b8]">
                  {cinematic ? (
                    "…"
                  ) : !worldUi ? (
                    "Hold Space for 3 seconds (outside a text box) to log off · Stuck on a calculation? Press GAAP Hint in the app's title bar"
                  ) : chatWith ? (
                    `Chatting with ${NPCS.find((n) => n.id === chatWith)?.name ?? "a coworker"} · the office waits while you talk · Esc when you're done`
                  ) : atDesk ? (
                    <span className="animate-pulse font-bold text-[#f2c14e]">Press Space to use your computer</span>
                  ) : nearby ? (
                    <span className="font-bold text-[#f2c14e]">
                      {helpable
                        ? `${nearby.name.split(" ")[0]} has ${withArticle(request!.inquiry.topic)} question. Press E to help`
                        : `Press T to chat with ${nearby.name.split(" ")[0]}`}
                    </span>
                  ) : (
                    "Arrows / WASD to move · Click a tile to walk there · T to chat with a coworker · E to help one who comes to your desk"
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => engineRef.current?.togglePause()}
                aria-pressed={paused}
                className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 rounded border-4 border-[#0b0d14] bg-[#0e1018] text-[11px] font-bold text-[#d6dbe6] hover:bg-[#1d2130]"
              >
                <span className="text-xl leading-none">{paused ? "▶" : "⏸"}</span>
                {paused ? "Resume" : "Pause"}
                <span className="text-[9px] font-normal text-[#9aa4b8]">(P)</span>
              </button>
            </div>
          </div>
          {/* Right panel: CPA study and career growth */}
          {!cinematic && (
            <aside
              aria-label="Progress"
              className="order-3 space-y-3 rounded border-4 border-[#0b0d14] bg-[#0e1018] p-3 text-[11px] leading-tight text-[#d6dbe6] lg:order-none lg:[grid-area:right]"
            >
              <div className="text-[10px]">
                <div className="font-bold uppercase tracking-wider text-[#7fb6dc]">CPA study session</div>
                <ul className="mt-1 space-y-1.5">
                  {study.sections.map((sec) => (
                    <li key={sec.topic} title={TOPIC_NAMES[sec.topic]}>
                      <div className="flex justify-between gap-2">
                        <span className="font-bold text-[#d6dbe6]">{sec.topic}</span>
                        <span className="text-[#e8d28a]">
                          L{sec.level} {LEVEL_NAMES[sec.level - 1]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[#9aa4b8]">
                        <span
                          className="flex gap-0.5"
                          aria-label={`${sec.streak} of ${LEVEL_UP_STREAK} in a row toward the next level`}
                        >
                          {sec.level < LEVEL_NAMES.length
                            ? Array.from({ length: LEVEL_UP_STREAK }, (_, k) => (
                                <span
                                  key={k}
                                  className={`h-2 w-2 border border-[#0b0d14] ${k < sec.streak ? "bg-[#9fd36b]" : "bg-[#2a2d45]"}`}
                                />
                              ))
                            : "Top level"}
                        </span>
                        <span>{sec.total ? `${sec.right}/${sec.total} right` : "not started"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 text-[#9aa4b8]">
                  {LEVEL_UP_STREAK} right in a row moves a section up a level.
                </div>
                {study.retests > 0 && (
                  <div className="mt-1 text-[#e8d28a]">
                    🔁 {study.retests} missed question{study.retests === 1 ? "" : "s"} queued for a retest.
                  </div>
                )}
              </div>
              <PromotionTrack career={career} />
              <div className="text-[10px] text-[#9aa4b8]">
                Coworkers helped: <span className="text-[#d6dbe6]">{stats.helped}</span> · missed:{" "}
                <span className="text-[#d6dbe6]">{stats.missed}</span>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
