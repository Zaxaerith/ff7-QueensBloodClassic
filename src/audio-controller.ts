import {WebAudioBackend, type AudioBackend, type AudioBus, type AudioVoice, type PlaybackOptions} from './web-audio-backend.js';

export type AudioState = 'Silent' | 'WaitingForLoop' | 'MatchLoop' | 'Scoring' | 'Victory' | 'ResultSilent';
export type MatchAudioSource = 'live' | 'replay';
export type MatchAudioPhase = 'mulligan' | 'playing' | 'finished';
export type MatchAudioSession = Readonly<{matchId: string; generation: number; source: MatchAudioSource}>;
export type AudioTracks = Readonly<{
  matchLoop?: Readonly<{url: string; loop: Readonly<LoopMetadata>}>;
  victory?: Readonly<{url: string}>;
}>;
export const defaultAudioVolumes: Readonly<Record<AudioBus, number>> = {bgm: 65, sfx: 80};

type LoopMetadata = {sampleRateHz: number; startFrame: number; endFrameExclusive: number};
type TrackId = keyof AudioTracks;
type PendingResult = {sequence: number; winner: 0 | 1 | null};
type LoadingTrack = {abort: AbortController; promise: Promise<AudioBuffer | undefined>};
const fadeSeconds = 0.120;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trackUrl(value: unknown, location: Location): string | undefined {
  if (!object(value) || typeof value.url !== 'string' || !/^\/(?![/\\])/.test(value.url)) return;
  const url = new URL(value.url, location.href);
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === location.origin
      && !url.search && !url.hash) return url.pathname;
}

function readLoop(value: unknown): LoopMetadata | undefined {
  if (!object(value)) return;
  const {sampleRateHz, startFrame, endFrameExclusive} = value;
  if (typeof sampleRateHz === 'number' && Number.isSafeInteger(sampleRateHz) && sampleRateHz > 0
      && typeof startFrame === 'number' && Number.isSafeInteger(startFrame) && startFrame >= 0
      && typeof endFrameExclusive === 'number' && Number.isSafeInteger(endFrameExclusive)
      && endFrameExclusive > startFrame) return {sampleRateHz, startFrame, endFrameExclusive};
}

/** A missing or unusable P4.1 bootstrap has no URLs to probe. */
export function readPrivateAudioTracks(page: Pick<Document, 'getElementById' | 'location'>): AudioTracks {
  const text = page.getElementById('qb-private-audio')?.textContent;
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (!object(value) || value.version !== 1 || !object(value.tracks)) return {};
    const {matchLoop, victory} = value.tracks;
    const loopUrl = trackUrl(matchLoop, page.location);
    const loop = object(matchLoop) ? readLoop(matchLoop.loop) : undefined;
    const victoryUrl = trackUrl(victory, page.location);
    return {
      ...(loopUrl && loop ? {matchLoop: {url: loopUrl, loop}} : {}),
      ...(victoryUrl ? {victory: {url: victoryUrl}} : {}),
    };
  } catch {
    return {};
  }
}

function loopBounds(buffer: AudioBuffer, metadata: LoopMetadata): PlaybackOptions['loop'] {
  const scale = buffer.sampleRate / metadata.sampleRateHz;
  const start = Math.round(metadata.startFrame * scale);
  const end = Math.round(metadata.endFrameExclusive * scale);
  const roundingTolerance = scale === 1 ? 0 : 1;
  if (start >= end || start >= buffer.length || end > buffer.length + roundingTolerance) return;
  // Use the actual decoded end for a whole-file loop, including resampled buffers.
  return {
    start: start / buffer.sampleRate,
    end: end >= buffer.length - roundingTolerance ? buffer.duration : end / buffer.sampleRate,
  };
}

export class AudioController {
  private currentState: AudioState = 'Silent';
  private session: MatchAudioSession | undefined;
  private generation = 0;
  private pendingResult: PendingResult | undefined;
  private waitingLoop: MatchAudioSession | undefined;
  private endedMatches = new Set<string>();
  private buffers = new Map<TrackId, AudioBuffer>();
  private loading = new Map<TrackId, LoadingTrack>();
  private voices = new Set<AudioVoice>();
  private currentVoice: AudioVoice | undefined;
  private disposed = false;
  private volume: Record<AudioBus, number> = {...defaultAudioVolumes};
  private muted: Record<AudioBus, boolean> = {bgm: false, sfx: false};

  constructor(private readonly tracks: AudioTracks, private readonly backend: AudioBackend = new WebAudioBackend()) {
    this.applyGain('bgm');
    this.applyGain('sfx');
  }

  get state(): AudioState { return this.currentState; }
  get hasAudio(): boolean { return !!(this.tracks.matchLoop || this.tracks.victory); }

  /** Starts a fresh binding for a new match, or returns the handle of the current match. */
  startOrResumeMatch(matchId: string, phase: MatchAudioPhase, source: MatchAudioSource = 'live'): MatchAudioSession | undefined {
    if (this.disposed) return;
    if (this.session?.matchId === matchId && this.session.source === source
        && (phase !== 'finished' || source === 'replay' || this.endedMatches.has(matchId))) {
      return this.session;
    }
    this.pauseOrExitMatch(undefined, true);
    const session = Object.freeze({matchId, generation: this.generation, source});
    this.session = session;
    if (source === 'replay') return session;
    if (phase === 'finished') this.endedMatches.add(matchId);
    if (!this.hasAudio) return session;
    this.currentState = this.endedMatches.has(matchId) ? 'ResultSilent'
      : this.tracks.matchLoop ? 'WaitingForLoop' : 'Silent';
    this.preparePlayback();
    return session;
  }

  /** Pass the handle for a match-local pause, or omit it when leaving the game route. */
  pauseOrExitMatch(session?: MatchAudioSession, immediate = false): void {
    if (session && this.session !== session) return;
    this.generation++;
    this.session = this.waitingLoop = undefined;
    this.pendingResult = undefined;
    this.currentState = 'Silent';
    this.cancelLoads();
    this.currentVoice = undefined;
    const stopAt = this.backend.currentTime + (immediate ? 0 : fadeSeconds);
    for (const voice of this.voices) this.stopVoice(voice, stopAt);
  }

  /** Call only for a new MatchEnded event from the real match, before totals are revealed. */
  enterScoring(session: MatchAudioSession, sequence: number, winner: 0 | 1 | null): void {
    if (this.session !== session || session.source !== 'live' || this.endedMatches.has(session.matchId)
        || !Number.isSafeInteger(sequence) || sequence < 0) return;
    this.endedMatches.add(session.matchId);
    if (!this.hasAudio) return;
    this.pendingResult = {sequence, winner};
    this.currentState = 'Scoring';
    this.cancelLoad('matchLoop');
    this.preparePlayback();
  }

  revealResult(session: MatchAudioSession, sequence: number): void {
    const result = this.pendingResult;
    if (this.session !== session || !result || result.sequence !== sequence) return;
    this.pendingResult = undefined;
    this.currentState = 'ResultSilent';
    this.cancelLoads();
    const loop = this.currentVoice;
    const when = this.backend.currentTime + (loop ? fadeSeconds : 0);
    this.currentVoice = undefined;
    if (loop) this.stopVoice(loop, when);

    const victory = this.buffers.get('victory');
    if (result.winner === 0 && victory && this.backend.running && this.effectiveGain('bgm') > 0) {
      this.play(victory, {when}, 'Victory');
    }
  }

  /** Call synchronously from a trusted click/touch/key activation; game actions need not await it. */
  async activateFromGesture(): Promise<boolean> {
    if (this.disposed || !this.hasAudio) return false;
    try {
      if (!await this.backend.activate() || this.disposed) return false;
      this.preparePlayback();
      return true;
    } catch {
      return false;
    }
  }

  setVolume(bus: AudioBus, value: number): void {
    if (!Number.isFinite(value) || this.disposed) return;
    this.volume[bus] = Math.min(100, Math.max(0, value));
    this.applyGain(bus);
  }

  setMuted(bus: AudioBus, muted: boolean): void {
    if (this.disposed) return;
    this.muted[bus] = muted;
    this.applyGain(bus);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.pauseOrExitMatch(undefined, true);
    this.voices.clear();
    this.buffers.clear();
    this.endedMatches.clear();
    try { await this.backend.close(); } catch { /* Audio cleanup is best effort. */ }
  }

  private effectiveGain(bus: AudioBus): number {
    return this.muted[bus] ? 0 : this.volume[bus] / 100;
  }

  private applyGain(bus: AudioBus): void {
    try { this.backend.setGain(bus, this.effectiveGain(bus)); } catch { /* Keep the preference for a later context. */ }
  }

  private preparePlayback(): void {
    const session = this.session;
    if (session?.source !== 'live' || !this.backend.running) return;
    if (this.currentState === 'WaitingForLoop') {
      if (this.waitingLoop === session) return;
      this.waitingLoop = session;
      void this.startLoop(session);
    } else if (this.currentState === 'Scoring' || !this.endedMatches.has(session.matchId)) {
      void this.load('victory');
    }
  }

  private async startLoop(session: MatchAudioSession): Promise<void> {
    const buffer = await this.load('matchLoop');
    if (this.session !== session || this.currentState !== 'WaitingForLoop') return;
    this.waitingLoop = undefined;
    if (!this.backend.running) return;
    const loop = buffer && this.tracks.matchLoop && loopBounds(buffer, this.tracks.matchLoop.loop);
    this.currentState = 'Silent';
    if (buffer && loop) this.play(buffer, {when: this.backend.currentTime, loop}, 'MatchLoop');
    void this.load('victory');
  }

  private load(id: TrackId): Promise<AudioBuffer | undefined> {
    const cached = this.buffers.get(id), track = this.tracks[id];
    if (cached || !track) return Promise.resolve(cached);
    const existing = this.loading.get(id);
    if (existing) return existing.promise;
    const abort = new AbortController();
    const promise = Promise.resolve().then(() => {
      abort.signal.throwIfAborted();
      return this.backend.load(track.url, abort.signal);
    }).then(buffer => {
      if (abort.signal.aborted || buffer.length <= 0 || buffer.numberOfChannels !== 2) return;
      this.buffers.set(id, buffer);
      return buffer;
    }).catch(() => undefined).finally(() => {
      if (this.loading.get(id)?.abort === abort) this.loading.delete(id);
    });
    this.loading.set(id, {abort, promise});
    return promise;
  }

  private cancelLoad(id: TrackId): void {
    this.loading.get(id)?.abort.abort();
    this.loading.delete(id);
  }

  private cancelLoads(): void {
    this.cancelLoad('matchLoop');
    this.cancelLoad('victory');
  }

  private play(buffer: AudioBuffer, options: PlaybackOptions, state: 'MatchLoop' | 'Victory'): void {
    try {
      const voice = this.backend.play(buffer, options, () => {
        this.voices.delete(voice);
        if (this.currentVoice !== voice) return;
        this.currentVoice = undefined;
        if (this.currentState === 'Victory') this.currentState = 'ResultSilent';
        if (this.currentState === 'MatchLoop') this.currentState = 'Silent';
      });
      this.voices.add(voice);
      this.currentVoice = voice;
      this.currentState = state;
    } catch { /* The caller's silent fallback remains in effect. */ }
  }

  private stopVoice(voice: AudioVoice, when: number): void {
    try { voice.stop(when); } catch { this.voices.delete(voice); }
  }
}

export function createAudioController(page = globalThis.document): AudioController {
  return new AudioController(page ? readPrivateAudioTracks(page) : {});
}
