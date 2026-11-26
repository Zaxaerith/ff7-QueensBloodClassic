/* 1997 PS1-inspired procedural Web Audio SFX synthesizer (public-safe, zero external audio assets).
   Pre-renders ultra-short mono PCM buffers at 44.1 kHz and caches them per AudioBackend so UI and
   tabletop interactions stay crisp, click-free, and lightweight. */
import type {RuleEvent} from './engine.js';
import type {AudioBackend} from './web-audio-backend.js';

export type SfxCue =
  | 'cursor'
  | 'confirm'
  | 'cancel'
  | 'cardLift'
  | 'cardPlace'
  | 'pawnClaim'
  | 'buff'
  | 'debuff'
  | 'destroy'
  | 'scoreTick'
  | 'fanfareLite';

export const SFX_CUES: readonly SfxCue[] = [
  'cursor',
  'confirm',
  'cancel',
  'cardLift',
  'cardPlace',
  'pawnClaim',
  'buff',
  'debuff',
  'destroy',
  'scoreTick',
  'fanfareLite',
] as const;

export const SFX_SAMPLE_RATE = 44100;
export const CURSOR_THROTTLE_MS = 40;

export interface SfxCueSpec {
  readonly durationMs: number;
  readonly gain: number;
}

export const SFX_SPECS: Readonly<Record<SfxCue, SfxCueSpec>> = {
  cursor: {durationMs: 42, gain: 0.40},
  confirm: {durationMs: 118, gain: 0.48},
  cancel: {durationMs: 110, gain: 0.46},
  cardLift: {durationMs: 58, gain: 0.42},
  cardPlace: {durationMs: 105, gain: 0.56},
  pawnClaim: {durationMs: 138, gain: 0.46},
  buff: {durationMs: 185, gain: 0.50},
  debuff: {durationMs: 180, gain: 0.48},
  destroy: {durationMs: 195, gain: 0.54},
  scoreTick: {durationMs: 52, gain: 0.44},
  fanfareLite: {durationMs: 255, gain: 0.54},
};

const TWO_PI = Math.PI * 2;

function clampSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-0.98, Math.min(0.98, value));
}

function triangle(phase: number): number {
  const norm = ((phase / TWO_PI) % 1 + 1) % 1;
  return norm < 0.25 ? 4 * norm : norm < 0.75 ? 2 - 4 * norm : 4 * norm - 4;
}

/** Deterministic PRNG for click-free, repeatable noise envelopes (card flick & shatter). */
function nextNoise(state: {seed: number}): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return (state.seed / 0xffffffff) * 2 - 1;
}

/** Smooth raised-cosine edge fades guarantee zero-crossing start/end and eliminate clicks/pops. */
function applyMicroEnvelope(samples: Float32Array, sampleRate: number, attackMs = 2.5, releaseMs = 8): void {
  const attack = Math.min(samples.length, Math.max(1, Math.round((attackMs / 1000) * sampleRate)));
  const release = Math.min(samples.length, Math.max(1, Math.round((releaseMs / 1000) * sampleRate)));
  for (let i = 0; i < attack; i++) {
    const w = 0.5 * (1 - Math.cos((Math.PI * i) / attack));
    samples[i] *= w;
  }
  const startRelease = samples.length - release;
  for (let i = 0; i < release; i++) {
    const idx = startRelease + i;
    const w = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / release));
    samples[idx] *= w;
  }
  if (samples.length > 0) {
    samples[0] = 0;
    samples[samples.length - 1] = 0;
  }
}

function addToneNote(
  out: Float32Array,
  sampleRate: number,
  startSec: number,
  durationSec: number,
  freqStart: number,
  freqEnd: number,
  amp: number,
  decayRate: number,
  wave: 'sine' | 'crystal' | 'tri' = 'crystal',
): void {
  const startIdx = Math.max(0, Math.floor(startSec * sampleRate));
  const len = Math.max(1, Math.floor(durationSec * sampleRate));
  const endIdx = Math.min(out.length, startIdx + len);
  const atk = Math.max(1, Math.min(len, Math.floor(0.003 * sampleRate)));
  let phase = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const local = i - startIdx;
    const u = local / len;
    const t = local / sampleRate;
    const freq = freqStart + (freqEnd - freqStart) * u;
    phase += (TWO_PI * freq) / sampleRate;
    let sig: number;
    if (wave === 'sine') {
      sig = Math.sin(phase);
    } else if (wave === 'tri') {
      sig = 0.65 * triangle(phase) + 0.35 * Math.sin(phase);
    } else {
      // Crisp 1997 PS1 glassy menu chime: fundamental + gentle 2nd & 3rd bell partials.
      sig = 0.72 * Math.sin(phase) + 0.21 * Math.sin(phase * 2) + 0.07 * Math.sin(phase * 3);
    }
    const attackEnv = local < atk ? local / atk : 1;
    const decayEnv = Math.exp(-decayRate * t);
    const tailFade = u > 0.82 ? Math.max(0, (1 - u) / 0.18) : 1;
    out[i] += sig * amp * attackEnv * decayEnv * tailFade;
  }
}

/** Synthesize a deterministic mono PCM buffer in [-1, 1] for a given PS1 SFX cue. */
export function synthesizeSfxSamples(cue: SfxCue, sampleRate = SFX_SAMPLE_RATE): Float32Array {
  const spec = SFX_SPECS[cue];
  const length = Math.max(64, Math.round((spec.durationMs / 1000) * sampleRate));
  const out = new Float32Array(length);
  const rng = {seed: 0x77ff1997 ^ (cue.charCodeAt(0) * 2654435761)};

  switch (cue) {
    case 'cursor':
      // Crisp high-register PS1 crystal menu tick.
      addToneNote(out, sampleRate, 0, 0.040, 1760, 2349.3, 0.72, 62, 'crystal');
      break;

    case 'confirm':
      // Classic bright two-note ascending confirmation chime (A5 -> E6).
      addToneNote(out, sampleRate, 0, 0.056, 880, 880, 0.56, 28, 'crystal');
      addToneNote(out, sampleRate, 0.040, 0.078, 1318.5, 1326, 0.68, 22, 'crystal');
      break;

    case 'cancel':
      // Clean two-note descending cancel retract (E5 -> B4).
      addToneNote(out, sampleRate, 0, 0.052, 659.25, 648, 0.54, 28, 'tri');
      addToneNote(out, sampleRate, 0.038, 0.072, 493.88, 476, 0.60, 24, 'tri');
      break;

    case 'cardLift': {
      // Tactile light card brush + subtle upward air flick.
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const u = i / length;
        const n = nextNoise(rng);
        lp = lp * 0.62 + n * 0.38;
        const env = Math.sin(Math.PI * Math.pow(u, 0.65)) * Math.exp(-3.4 * u);
        out[i] += (n - lp) * 0.48 * env;
      }
      addToneNote(out, sampleRate, 0.004, 0.050, 620, 920, 0.30, 44, 'sine');
      break;
    }

    case 'cardPlace': {
      // Solid obsidian-slate tactile placement thud + crisp edge snap.
      addToneNote(out, sampleRate, 0, 0.095, 172, 68, 0.78, 28, 'sine');
      addToneNote(out, sampleRate, 0, 0.024, 920, 410, 0.34, 85, 'tri');
      let prev = 0;
      const snapLen = Math.min(length, Math.floor(0.020 * sampleRate));
      for (let i = 0; i < snapLen; i++) {
        const u = i / snapLen;
        const n = nextNoise(rng);
        const hp = n - prev * 0.7;
        prev = n;
        out[i] += hp * 0.32 * Math.exp(-8 * u);
      }
      break;
    }

    case 'pawnClaim':
      // Luminous materia crystal resonance (D5 + A5 + D6 staggered shimmer).
      addToneNote(out, sampleRate, 0, 0.11, 587.33, 592, 0.45, 22, 'crystal');
      addToneNote(out, sampleRate, 0.018, 0.115, 880, 886, 0.42, 20, 'crystal');
      addToneNote(out, sampleRate, 0.036, 0.10, 1174.66, 1184, 0.38, 22, 'crystal');
      break;

    case 'buff':
      // Radiant ascending major triad sparkle (C5 -> E5 -> G5 -> C6).
      addToneNote(out, sampleRate, 0.000, 0.070, 523.25, 528, 0.46, 22, 'crystal');
      addToneNote(out, sampleRate, 0.035, 0.080, 659.25, 665, 0.48, 20, 'crystal');
      addToneNote(out, sampleRate, 0.070, 0.085, 783.99, 790, 0.50, 18, 'crystal');
      addToneNote(out, sampleRate, 0.105, 0.080, 1046.5, 1054, 0.56, 18, 'crystal');
      break;

    case 'debuff':
      // Subdued downward minor pulse (Eb4 -> Bb3).
      addToneNote(out, sampleRate, 0.000, 0.092, 311.13, 294, 0.54, 16, 'tri');
      addToneNote(out, sampleRate, 0.064, 0.116, 233.08, 208, 0.58, 15, 'tri');
      break;

    case 'destroy': {
      // Crystal shatter noise burst + low impact drop + sharp shard pings.
      addToneNote(out, sampleRate, 0, 0.135, 148, 46, 0.68, 22, 'sine');
      addToneNote(out, sampleRate, 0.012, 0.070, 1860, 1280, 0.24, 34, 'crystal');
      addToneNote(out, sampleRate, 0.034, 0.065, 2280, 1540, 0.20, 38, 'crystal');
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const u = i / length;
        const n = nextNoise(rng);
        lp = lp * 0.52 + n * 0.48;
        const burst = (n - lp * 0.65) * Math.exp(-9.5 * u);
        out[i] += burst * 0.52;
      }
      break;
    }

    case 'scoreTick':
      // Tight tabular score counter pip (C6 -> E6).
      addToneNote(out, sampleRate, 0, 0.026, 1046.5, 1060, 0.52, 48, 'crystal');
      addToneNote(out, sampleRate, 0.018, 0.034, 1318.5, 1330, 0.50, 44, 'crystal');
      break;

    case 'fanfareLite':
      // Compact 255ms FF-inspired triumphant arpeggio (C5 -> E5 -> G5 -> C6).
      addToneNote(out, sampleRate, 0.000, 0.085, 523.25, 523.25, 0.46, 16, 'crystal');
      addToneNote(out, sampleRate, 0.052, 0.095, 659.25, 659.25, 0.48, 15, 'crystal');
      addToneNote(out, sampleRate, 0.104, 0.110, 783.99, 783.99, 0.52, 13, 'crystal');
      addToneNote(out, sampleRate, 0.156, 0.099, 1046.5, 1052, 0.62, 12, 'crystal');
      addToneNote(out, sampleRate, 0.156, 0.099, 523.25, 523.25, 0.28, 13, 'sine');
      break;
  }

  for (let i = 0; i < out.length; i++) out[i] = clampSample(out[i]);
  applyMicroEnvelope(out, sampleRate, cue === 'cardPlace' ? 1.5 : 2.5, cue === 'cursor' ? 6 : 10);
  return out;
}

/** Pick 1-2 crisp, non-muddy SFX cues representing a resolved batch of rule events. */
export function sfxCuesForEvents(events: readonly RuleEvent[]): SfxCue[] {
  const cues: SfxCue[] = [];
  let hasDestroy = false;
  let hasBuff = false;
  let hasDebuff = false;
  let hasPawn = false;
  for (const event of events) {
    if (event.type === 'CardDestroyed' || event.type === 'CardReplaced') hasDestroy = true;
    else if (event.type === 'CardEnhanced') hasBuff = true;
    else if (event.type === 'CardEnfeebled') hasDebuff = true;
    else if (event.type === 'PawnsClaimed') hasPawn = true;
  }
  if (hasDestroy) cues.push('destroy');
  if (hasBuff) cues.push('buff');
  else if (hasDebuff) cues.push('debuff');
  if (!cues.length && hasPawn) cues.push('pawnClaim');
  return cues.slice(0, 2);
}

export class SfxEngine {
  private readonly cache = new Map<SfxCue, AudioBuffer>();
  private lastCursorAt = -Infinity;

  constructor(
    private readonly backend: AudioBackend,
    private readonly now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  ) {}

  /** Play a cached procedural PS1 SFX cue through the backend's SFX bus. Never throws. */
  play(cue: SfxCue, options?: {gain?: number}): boolean {
    if (!this.backend.running || !this.backend.createBuffer || !this.backend.playSfx) return false;
    if (cue === 'cursor') {
      const current = this.now();
      if (current - this.lastCursorAt < CURSOR_THROTTLE_MS) return false;
      this.lastCursorAt = current;
    }
    try {
      let buffer = this.cache.get(cue);
      if (!buffer) {
        const samples = synthesizeSfxSamples(cue, SFX_SAMPLE_RATE);
        buffer = this.backend.createBuffer(1, samples.length, SFX_SAMPLE_RATE);
        buffer.getChannelData(0).set(samples);
        this.cache.set(cue, buffer);
      }
      const gain = options?.gain ?? SFX_SPECS[cue].gain;
      this.backend.playSfx(buffer, {gain});
      return true;
    } catch {
      return false;
    }
  }

  playForEvents(events: readonly RuleEvent[]): SfxCue[] {
    const cues = sfxCuesForEvents(events);
    for (const cue of cues) this.play(cue);
    return cues;
  }

  clearCache(): void {
    this.cache.clear();
    this.lastCursorAt = -Infinity;
  }
}
