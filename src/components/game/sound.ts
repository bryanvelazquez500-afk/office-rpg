"use client";

// Game sound effects, synthesized with the Web Audio API so there are no audio
// files to ship. Browsers only allow audio after the player interacts with the
// page, so the game calls unlockAudio() from its first click or key press.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const MUTE_KEY = "office-rpg:muted";

export function loadMuted() {
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Storage can be blocked (private windows); the toggle still works for this session.
  }
}

export function unlockAudio() {
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  slideTo?: number; // end frequency, for sweeps
}

/** One note: `at` and `dur` are seconds from now. */
function tone(freq: number, at: number, dur: number, { type = "sine", gain = 0.5, slideTo }: ToneOptions = {}) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  // Quick attack, smooth decay: no clicks at the start or end of the note.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short burst of filtered noise (paper, knocks, the cash drawer). */
function noise(at: number, dur: number, gain = 0.3, freq = 2000) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(master);
  src.start(t0);
}

const play = (fn: () => void) => () => {
  if (!muted && ctx) fn();
};

/**
 * One syllable of dialogue babble (Animal Crossing style, no real words): a short
 * square-wave chirp around the speaker's base pitch. Each letter nudges the pitch so
 * the same text "sounds" the same, vowels sit a little higher, and a second
 * detuned oscillator gives it a slightly robotic buzz.
 */
export function voiceBlip(base: number, ch: string) {
  if (muted || !ctx || !master) return;
  const code = ch.toLowerCase().charCodeAt(0);
  const vowel = "aeiouy".includes(ch.toLowerCase());
  const freq = base * (1 + (((code * 7) % 9) - 4) * 0.045 + (vowel ? 0.12 : 0));
  const t0 = ctx.currentTime;
  const dur = 0.06;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.11, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  for (const [type, f] of [
    ["square", freq],
    ["triangle", freq * 1.5 + 30], // detuned partner: the robotic edge
  ] as [OscillatorType, number][]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.linearRampToValueAtTime(f * 0.92, t0 + dur); // tiny downward glide per syllable
    osc.connect(env);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }
  env.connect(filter).connect(master);
}

// Note frequencies (Hz).
const C5 = 523.25,
  E5 = 659.25,
  G5 = 783.99,
  A5 = 880,
  C6 = 1046.5,
  E6 = 1318.5,
  G4 = 392,
  C4 = 261.63;

export const sfx = {
  /** New email in PigeonMail. */
  email: play(() => {
    tone(E6, 0, 0.18, { type: "triangle", gain: 0.35 });
    tone(A5 * 1.5, 0.09, 0.28, { type: "triangle", gain: 0.3 });
  }),
  /** New assignment email: a brighter three-note chime so tasks stand out from ordinary mail. */
  assignment: play(() => {
    tone(C6, 0, 0.16, { type: "triangle", gain: 0.35 });
    tone(E6, 0.1, 0.16, { type: "triangle", gain: 0.35 });
    tone(G5 * 2, 0.2, 0.35, { type: "triangle", gain: 0.35 });
  }),
  /** A coworker is heading to your desk: two knocks and a ping. */
  visitor: play(() => {
    noise(0, 0.06, 0.6, 900);
    noise(0.14, 0.06, 0.6, 900);
    tone(A5, 0.3, 0.25, { type: "sine", gain: 0.3 });
  }),
  correct: play(() => {
    tone(C5, 0, 0.12, { type: "square", gain: 0.12 });
    tone(E5, 0.08, 0.12, { type: "square", gain: 0.12 });
    tone(G5, 0.16, 0.22, { type: "square", gain: 0.12 });
  }),
  wrong: play(() => {
    tone(G4, 0, 0.18, { type: "sawtooth", gain: 0.12 });
    tone(G4 * 0.94, 0.16, 0.3, { type: "sawtooth", gain: 0.12 });
  }),
  /** Assignment signed off: cash drawer and bell. */
  signOff: play(() => {
    noise(0, 0.08, 0.4, 3000);
    tone(E6, 0.06, 0.4, { type: "triangle", gain: 0.3 });
    tone(C6 * 2, 0.06, 0.3, { type: "sine", gain: 0.15 });
  }),
  /** Lunch break: ding-dong. */
  lunch: play(() => {
    tone(E5, 0, 0.5, { type: "sine", gain: 0.4 });
    tone(C5, 0.35, 0.7, { type: "sine", gain: 0.4 });
  }),
  /** Hurry up: break's over, or a coworker is running out of patience. */
  alert: play(() => {
    tone(A5, 0, 0.09, { type: "square", gain: 0.12 });
    tone(A5, 0.14, 0.09, { type: "square", gain: 0.12 });
  }),
  /** Points lost. */
  penalty: play(() => {
    tone(C4 * 1.5, 0, 0.25, { type: "triangle", gain: 0.3, slideTo: C4 });
  }),
  /** Clock-out bell. */
  clockOut: play(() => {
    tone(G5, 0, 0.3, { type: "sine", gain: 0.35 });
    tone(E5, 0.2, 0.3, { type: "sine", gain: 0.35 });
    tone(C5, 0.4, 0.6, { type: "sine", gain: 0.35 });
  }),
  /** A shift ended with the bar full. */
  fullShift: play(() => {
    [C5, E5, G5, C6].forEach((f, i) => tone(f, 0.7 + i * 0.09, 0.25, { type: "triangle", gain: 0.3 }));
  }),
  promotion: play(() => {
    const notes = [C5, C5, C5, E5, G5, E5, G5, C6];
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.84, 0.96, 1.2];
    notes.forEach((f, i) => tone(f, times[i], i === notes.length - 1 ? 0.8 : 0.2, { type: "square", gain: 0.13 }));
    tone(C4, 1.2, 0.8, { type: "triangle", gain: 0.3 });
  }),
};
