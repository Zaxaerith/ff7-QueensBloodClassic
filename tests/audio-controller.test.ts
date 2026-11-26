import {describe, expect, it} from 'vitest';
import {AudioController, readPrivateAudioTracks, type AudioTracks} from '../src/audio-controller.js';
import type {AudioBackend, AudioBus, AudioVoice, PlaybackOptions} from '../src/web-audio-backend.js';

const tracks: AudioTracks = {
  matchLoop: {url: '/music/loop.wav', loop: {sampleRateHz: 44100, startFrame: 0, endFrameExclusive: 3432646}},
  victory: {url: '/music/victory.wav'},
};

function decoded(length: number, sampleRate: number): AudioBuffer {
  return {
    length, sampleRate, duration: length / sampleRate, numberOfChannels: 2,
    getChannelData: () => new Float32Array(0), copyFromChannel() {}, copyToChannel() {},
  };
}

const loopBuffer = decoded(3736214, 48000);
const victoryBuffer = decoded(1986926, 44100);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

type Request = {url: string; signal: AbortSignal; resolve: (buffer: AudioBuffer) => void; reject: (error: Error) => void};
type Played = {buffer: AudioBuffer; options: PlaybackOptions; stops: number[]; ended: () => void};

class FakeAudio implements AudioBackend {
  running = false;
  currentTime = 10;
  activations = 0;
  closed = 0;
  activationBlocked = false;
  gains: Record<AudioBus, number> = {bgm: 1, sfx: 1};
  requests: Request[] = [];
  played: Played[] = [];

  async activate(): Promise<boolean> {
    this.activations++;
    if (this.activationBlocked) throw new Error('Autoplay blocked');
    this.running = true;
    return true;
  }
  load(url: string, signal: AbortSignal): Promise<AudioBuffer> {
    // Tests can still deliver a response after abort, as with an in-flight decode.
    return new Promise((resolve, reject) => this.requests.push({url, signal, resolve, reject}));
  }
  play(buffer: AudioBuffer, options: PlaybackOptions, ended: () => void): AudioVoice {
    const entry: Played = {buffer, options, stops: [], ended};
    this.played.push(entry);
    return {stop: time => entry.stops.push(time)};
  }
  setGain(bus: AudioBus, value: number): void { this.gains[bus] = value; }
  async close(): Promise<void> { this.closed++; this.running = false; }
}

async function setupPlaying(prewarm = true) {
  const backend = new FakeAudio();
  const controller = new AudioController(tracks, backend);
  const session = controller.startOrResumeMatch('first', 'playing')!;
  await controller.activateFromGesture();
  backend.requests[0].resolve(loopBuffer);
  await flush();
  if (prewarm) {
    backend.requests[1].resolve(victoryBuffer);
    await flush();
  }
  return {controller, backend, session};
}

describe('AudioController', () => {
  it('starts one loop after activation and uses the actual resampled buffer end', async () => {
    const backend = new FakeAudio();
    const controller = new AudioController(tracks, backend);
    const session = controller.startOrResumeMatch('first', 'mulligan');
    expect(controller.state).toBe('WaitingForLoop');
    expect(backend.requests).toHaveLength(0);
    await Promise.all([controller.activateFromGesture(), controller.activateFromGesture()]);
    expect(controller.startOrResumeMatch('first', 'playing')).toBe(session);
    expect(backend.requests.map(r => r.url)).toEqual(['/music/loop.wav']);

    backend.requests[0].resolve(loopBuffer);
    await flush();
    expect(controller.state).toBe('MatchLoop');
    expect(backend.played.map(p => p.options)).toEqual([{when: 10, loop: {start: 0, end: loopBuffer.duration}}]);
    expect(controller.startOrResumeMatch('first', 'playing')).toBe(session);

    controller.pauseOrExitMatch(session);
    const resumed = controller.startOrResumeMatch('first', 'playing');
    expect(resumed).not.toBe(session);
    await flush();
    expect(backend.requests.filter(r => r.url === '/music/loop.wav')).toHaveLength(1);
    expect(backend.played.map(p => p.buffer)).toEqual([loopBuffer, loopBuffer]);
    backend.played[0].ended();
    controller.pauseOrExitMatch(session);
    expect(controller.state).toBe('MatchLoop');
  });

  it('cancels an old request on a new binding and ignores its late decode', async () => {
    const backend = new FakeAudio();
    const controller = new AudioController(tracks, backend);
    const first = controller.startOrResumeMatch('first', 'playing')!;
    await controller.activateFromGesture();
    const old = backend.requests[0];
    const next = controller.startOrResumeMatch('next', 'playing');
    await flush();
    expect(next?.generation).toBeGreaterThan(first.generation);
    expect(old.signal.aborted).toBe(true);
    old.resolve(loopBuffer);
    controller.enterScoring(first, 1, 0);
    controller.revealResult(first, 1);
    await flush();
    expect(backend.played).toHaveLength(0);

    backend.requests[1].resolve(loopBuffer);
    await flush();
    expect(backend.played).toHaveLength(1);
    expect(controller.state).toBe('MatchLoop');
  });

  it('fades the loop over 120 ms and schedules exactly one full Victory', async () => {
    const {controller, backend, session} = await setupPlaying();
    controller.enterScoring(session, 22, 0);
    controller.revealResult(session, 21);
    expect(controller.state).toBe('Scoring');
    expect(backend.played[0].stops).toEqual([]);

    controller.revealResult(session, 22);
    controller.revealResult(session, 22);
    controller.enterScoring(session, 22, 0);
    expect(backend.played[0].stops).toEqual([10.12]);
    expect(backend.played[1].options).toEqual({when: 10.12});
    expect(backend.played[1].buffer).toBe(victoryBuffer);
    expect(backend.played).toHaveLength(2);
    expect(controller.state).toBe('Victory');
    backend.played[0].ended();
    expect(controller.state).toBe('Victory');
    backend.played[1].ended();
    expect(controller.state).toBe('ResultSilent');
    controller.pauseOrExitMatch(session);
    controller.startOrResumeMatch('first', 'finished');
    expect(backend.played).toHaveLength(2);
  });

  it('stops a scheduled Victory when a rematch replaces the session', async () => {
    const {controller, backend, session} = await setupPlaying();
    controller.enterScoring(session, 1, 0);
    controller.revealResult(session, 1);
    const victory = backend.played[1];
    controller.startOrResumeMatch('rematch', 'mulligan');
    await flush();
    expect(victory.stops).toEqual([10]);
    expect(victory.stops[0]).toBeLessThan(victory.options.when);
    expect(backend.played[2].buffer).toBe(loopBuffer);
    victory.ended();
    expect(controller.state).toBe('MatchLoop');
  });

  it.each([1, null] as const)('silences the loop without a cue for winner %s', async winner => {
    const {controller, backend, session} = await setupPlaying();
    controller.enterScoring(session, 22, winner);
    controller.revealResult(session, 22);
    expect(backend.played[0].stops).toEqual([10.12]);
    expect(backend.played).toHaveLength(1);
    expect(controller.state).toBe('ResultSilent');
  });

  it('ignores wins from Replay and an already-finished save', async () => {
    const {controller, backend, session} = await setupPlaying();
    controller.pauseOrExitMatch(session);
    const replay = controller.startOrResumeMatch('replay', 'playing', 'replay')!;
    controller.enterScoring(replay, 22, 0);
    controller.revealResult(replay, 22);
    expect(controller.state).toBe('Silent');
    const saved = controller.startOrResumeMatch('saved', 'finished')!;
    controller.enterScoring(saved, 22, 0);
    controller.revealResult(saved, 22);
    expect(controller.state).toBe('ResultSilent');
    expect(backend.played.map(p => p.buffer)).toEqual([loopBuffer]);
  });

  it('does not start Victory when decoding finishes after totals are revealed', async () => {
    const {controller, backend, session} = await setupPlaying(false);
    controller.enterScoring(session, 22, 0);
    controller.revealResult(session, 22);
    expect(controller.state).toBe('ResultSilent');
    expect(backend.requests[1].signal.aborted).toBe(true);
    backend.requests[1].resolve(victoryBuffer);
    await flush();
    await controller.activateFromGesture();
    expect(backend.played).toHaveLength(1);
    expect(controller.state).toBe('ResultSilent');
  });

  it('uses independent gain and mute preferences and releases the backend once', async () => {
    const {controller, backend, session} = await setupPlaying();
    expect(backend.gains).toEqual({bgm: 0.65, sfx: 0.8});
    controller.setVolume('bgm', 120);
    controller.setMuted('bgm', true);
    controller.setVolume('bgm', 42);
    controller.setVolume('sfx', -2);
    expect(backend.gains).toEqual({bgm: 0, sfx: 0});
    controller.enterScoring(session, 22, 0);
    controller.revealResult(session, 22);
    controller.setMuted('bgm', false);
    expect(backend.gains).toEqual({bgm: 0.42, sfx: 0});
    expect(backend.played).toHaveLength(1);
    await controller.dispose();
    await controller.dispose();
    expect(backend.closed).toBe(1);
    expect(controller.state).toBe('Silent');
    expect(backend.played[0].stops.at(-1)).toBe(10);
  });

  it('updates BGM gain during Loop and Victory without replacing either source', async () => {
    const {controller, backend, session} = await setupPlaying();
    const loop = backend.played[0];
    controller.setVolume('bgm', 38);
    controller.setMuted('bgm', true);
    expect(backend.gains).toEqual({bgm: 0, sfx: 0.8});
    controller.setMuted('bgm', false);
    expect(backend.gains.bgm).toBe(0.38);
    expect(backend.played).toEqual([loop]);
    expect(loop.stops).toEqual([]);
    controller.enterScoring(session, 22, 0);
    controller.revealResult(session, 22);
    const victory = backend.played[1];
    controller.setVolume('bgm', 12);
    expect(backend.gains.bgm).toBe(0.12);
    expect(backend.played).toEqual([loop, victory]);
    expect(victory.stops).toEqual([]);
  });

  it('handles a blocked activation and a failed audio request', async () => {
    const backend = new FakeAudio();
    const controller = new AudioController(tracks, backend);
    controller.startOrResumeMatch('first', 'playing');
    backend.activationBlocked = true;
    expect(await controller.activateFromGesture()).toBe(false);
    expect(backend.requests).toHaveLength(0);
    backend.activationBlocked = false;
    expect(await controller.activateFromGesture()).toBe(true);
    backend.requests[0].reject(new Error('Cannot decode WAV'));
    await flush();
    expect(controller.state).toBe('Silent');
    expect(backend.played).toHaveLength(0);
  });

  it('remains silent without the bootstrap and rejects absolute input paths', async () => {
    function page(text?: string) {
      return {
        location: new URL('http://127.0.0.1:5198/') as unknown as Location,
        getElementById: () => text ? {textContent: text} as HTMLElement : null,
      };
    }
    const decodedTracks = readPrivateAudioTracks(page(JSON.stringify({version: 1, tracks})));
    expect(decodedTracks).toEqual(tracks);
    expect(readPrivateAudioTracks(page(JSON.stringify({version: 1, tracks: {
      matchLoop: {...tracks.matchLoop, url: 'D:\\recordings\\loop.wav'},
      victory: {url: '//elsewhere.test/victory.wav'},
    }})))).toEqual({});
    const backend = new FakeAudio();
    const controller = new AudioController(readPrivateAudioTracks(page()), backend);
    const session = controller.startOrResumeMatch('first', 'playing')!;
    expect(await controller.activateFromGesture()).toBe(false);
    controller.enterScoring(session, 22, 0);
    controller.revealResult(session, 22);
    expect(controller.state).toBe('Silent');
    expect(backend.activations).toBe(0);
    expect(backend.requests).toHaveLength(0);
  });

  it('routes challengeLoop and bossLoop via trackHint and parses them from bootstrap', async () => {
    const multiTracks: AudioTracks = {
      ...tracks,
      challengeLoop: {url: '/music/challenge.wav', loop: {sampleRateHz: 44100, startFrame: 0, endFrameExclusive: 3298559}},
      bossLoop: {url: '/music/boss.wav', loop: {sampleRateHz: 44100, startFrame: 0, endFrameExclusive: 3681395}},
    };
    const page = {
      location: new URL('http://127.0.0.1:5198/') as unknown as Location,
      getElementById: () => ({textContent: JSON.stringify({version: 1, tracks: multiTracks})}) as HTMLElement,
    };
    expect(readPrivateAudioTracks(page)).toEqual(multiTracks);

    const backend = new FakeAudio();
    const controller = new AudioController(multiTracks, backend);
    const challengeBuffer = decoded(3298559, 44100);
    const bossBuffer = decoded(3681395, 44100);

    const s1 = controller.startOrResumeMatch('carnival-1', 'playing', 'live', 'challengeLoop')!;
    await controller.activateFromGesture();
    expect(backend.requests.map(r => r.url)).toEqual(['/music/challenge.wav']);
    backend.requests[0].resolve(challengeBuffer);
    await flush();
    expect(controller.state).toBe('MatchLoop');
    expect(backend.played[0].buffer).toBe(challengeBuffer);
    expect(controller.startOrResumeMatch('carnival-1', 'playing', 'live', 'challengeLoop')).toBe(s1);

    controller.startOrResumeMatch('queen-boss', 'mulligan', 'live', 'bossLoop');
    await flush();
    expect(backend.requests.at(-1)?.url).toBe('/music/boss.wav');
    backend.requests.at(-1)!.resolve(bossBuffer);
    await flush();
    expect(controller.state).toBe('MatchLoop');
    expect(backend.played.at(-1)?.buffer).toBe(bossBuffer);
  });

  it('falls back smoothly to matchLoop when requested optional track is missing or fails to decode', async () => {
    const backend = new FakeAudio();
    const controller = new AudioController(tracks, backend);
    controller.startOrResumeMatch('boss-without-track', 'playing', 'live', 'bossLoop');
    await controller.activateFromGesture();
    expect(backend.requests.map(r => r.url)).toEqual(['/music/loop.wav']);
    backend.requests[0].resolve(loopBuffer);
    await flush();
    expect(controller.state).toBe('MatchLoop');
    expect(backend.played[0].buffer).toBe(loopBuffer);

    const backend2 = new FakeAudio();
    const partialTracks: AudioTracks = {
      ...tracks,
      challengeLoop: {url: '/music/broken-challenge.wav', loop: {sampleRateHz: 44100, startFrame: 0, endFrameExclusive: 3298559}},
    };
    const controller2 = new AudioController(partialTracks, backend2);
    controller2.startOrResumeMatch('challenge-fallback', 'playing', 'live', 'challengeLoop');
    await controller2.activateFromGesture();
    expect(backend2.requests[0].url).toBe('/music/broken-challenge.wav');
    backend2.requests[0].reject(new Error('Decode failed'));
    await flush();
    expect(backend2.requests[1].url).toBe('/music/loop.wav');
    backend2.requests[1].resolve(loopBuffer);
    await flush();
    expect(controller2.state).toBe('MatchLoop');
    expect(backend2.played[0].buffer).toBe(loopBuffer);
  });
});
