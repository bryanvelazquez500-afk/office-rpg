// Character profile system: every person in the office (NPCs and the player)
// is described by a CharacterProfile. Roles drive the inspection popup and the
// onboarding script; palettes drive the procedural pixel sprites.

export type Facing = "N" | "S" | "E" | "W";

export type NpcRole =
  | "Managing Partner"
  | "Office Manager"
  | "Audit Senior"
  | "Tax Manager"
  | "Senior Manager, Advisory"
  | "IT Specialist"
  | "HR Business Partner";

export interface SpritePalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  accent?: string; // tie / lanyard / scarf
}

export interface CharacterProfile {
  id: string;
  name: string;
  role: NpcRole | "New Staff Accountant";
  department: string;
  bio: string;
  greeting: string;
  palette: SpritePalette;
  /** Base pitch (Hz) of the character's dialogue babble: higher for women, lower for men. */
  voice: number;
}

export interface NpcProfile extends CharacterProfile {
  role: NpcRole;
  home: [number, number]; // tile the NPC stands on when idle
  facing: Facing;
}

export const FIRM_NAME = "Hartwell & Finch LLP";

export const MANAGING_PARTNER_ID = "eleanor";

export const NPCS: NpcProfile[] = [
  {
    id: MANAGING_PARTNER_ID,
    name: "Eleanor Hartwell",
    role: "Managing Partner",
    department: "Firm Leadership",
    bio: "Founded the firm 22 years ago. Signs every audit opinion and remembers every footnote.",
    greeting: "My door is always open. Mostly.",
    palette: { skin: "#e9b98f", hair: "#d9d4cc", shirt: "#3b3f6b", pants: "#23263f", accent: "#c9a227" },
    voice: 300,
    home: [3, 3],
    facing: "S",
  },
  {
    id: "priya",
    name: "Priya Nair",
    role: "Office Manager",
    department: "Operations",
    bio: "Keeps the lights on, the coffee hot, and the conference room bookings honest.",
    greeting: "Badge, laptop, parking pass. You're all set!",
    palette: { skin: "#a8724f", hair: "#1e1512", shirt: "#2f8f83", pants: "#2b2b33", accent: "#f2c14e" },
    voice: 380,
    home: [12, 11],
    facing: "E",
  },
  {
    id: "marcus",
    name: "Marcus Bell",
    role: "Audit Senior",
    department: "Assurance",
    bio: "Your in-charge on the first engagement. Lives in spreadsheets, speaks fluent tick-mark.",
    greeting: "Welcome, neighbor. Want to see a three-way match?",
    palette: { skin: "#6b4430", hair: "#141010", shirt: "#d8dde6", pants: "#3a4558", accent: "#b33a3a" },
    voice: 165,
    home: [5, 9],
    facing: "S",
  },
  {
    id: "dana",
    name: "Dana Okafor",
    role: "Tax Manager",
    department: "Tax",
    bio: "Can recite the Internal Revenue Code from memory and has strong opinions about Form 1065.",
    greeting: "Busy season starts in January. Hydrate now.",
    palette: { skin: "#4e3326", hair: "#2a1d18", shirt: "#7a4fa3", pants: "#2e2638" },
    voice: 330,
    home: [9, 6],
    facing: "S",
  },
  {
    id: "gwen",
    name: "Gwen Liu",
    role: "Senior Manager, Advisory",
    department: "Advisory",
    bio: "Runs the conference room like a war room. Her slide decks have slide decks.",
    greeting: "Got a minute? I have forty slides.",
    palette: { skin: "#f0caa4", hair: "#0f0f14", shirt: "#c4553b", pants: "#31313b" },
    voice: 360,
    home: [12, 3],
    facing: "W",
  },
  {
    id: "theo",
    name: "Theo Park",
    role: "IT Specialist",
    department: "Information Technology",
    bio: "Has turned it off and on again more times than anyone alive.",
    greeting: "If the VPN breaks, it wasn't me.",
    palette: { skin: "#e3b48a", hair: "#3a2a1f", shirt: "#3d6b3a", pants: "#4a3f35", accent: "#9fd36b" },
    voice: 195,
    home: [12, 6], // his cubicle (12,5 is the desk)
    facing: "S",
  },
  {
    id: "sofia",
    name: "Sofia Reyes",
    role: "HR Business Partner",
    department: "People & Culture",
    bio: "Onboarding, benefits, and the keeper of the good snacks in the break area.",
    greeting: "Don't forget to enroll in benefits by Friday!",
    palette: { skin: "#c98e66", hair: "#4a2416", shirt: "#e0a33a", pants: "#3b2e4a" },
    voice: 350,
    home: [1, 11],
    facing: "E",
  },
];

export function createPlayerProfile(name: string): CharacterProfile {
  return {
    id: "player",
    name,
    role: "New Staff Accountant",
    department: "Assurance",
    bio: "First day on the job.",
    greeting: "",
    palette: { skin: "#dca37c", hair: "#5a3420", shirt: "#4a7fc1", pants: "#2c3446", accent: "#f2f2f2" },
    voice: 250, // mid-range: the player's gender isn't set anywhere
  };
}

// Player name rules shared by the name-entry screen.
export const PLAYER_NAME_MAX = 20;
export function validatePlayerName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "Please enter a name.";
  if (name.length > PLAYER_NAME_MAX) return `Keep it under ${PLAYER_NAME_MAX} characters.`;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} '.-]*$/u.test(name)) return "Letters, spaces, apostrophes, periods and hyphens only.";
  return null;
}
