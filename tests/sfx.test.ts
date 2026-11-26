import {describe, expect, it} from 'vitest';
import {AudioController, type AudioTracks} from '../src/audio-controller.js';
import type {RuleEvent} from '../src/engine.js';
import {
  CURSOR_THROTTLE_MS, SFX_CUES, SFX_SAMPLE_RATE, SFX_SPECS,
  SfxEngine, sfxCuesForEvents, synthesizeSfxSamples,
} from '../src/sfx.js';
import type {AudioBackend, AudioBus, AudioVoice, PlaybackOptions} from '../src/web-audio-backend.js';

class FakeSfxBackend implements AudioBackend {
  running = false;
  currentTime = 0;
  activations = 0;
  createdBuffers = 0;
  gains: Record<AudioBus, number> = {bgm: 1, sfx: 1};
  sfxPlayed: {buffer: AudioBuffer; gain?: number | undefined; when?: number | undefined}[] = [];

  async activate(): Promise<boolean> {
    this.activations++;
    this.running = true;
    return true;
  }
  load(): Promise<AudioBuffer> {
    return Promise.reject(new Error('No BGM load expected'));
  }
  play(_buffer: AudioBuffer, _options: PlaybackOptions, _ended: () => void): AudioVoice {
    return {stop() {}};
  }
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    this.createdBuffers++;
    const data = new Float32Array(length);
    return {
      length,
      sampleRate,
      duration: length / sampleRate,
      numberOfChannels: channels,
      getChannelData: () => data,
      copyFromChannel() {},
      copyToChannel() {},
    };
  }
  playSfx(buffer: AudioBuffer, options?: {gain?: number; when?: number}): void {
    this.sfxPlayed.push({buffer, gain: options?.gain, when: options?.when});
  }
  setGain(bus: AudioBus, gain: number): void { this.gains[bus] = gain; }
  async close(): Promise<void> { this.running = false; }
}

describe('PS1 procedural synth SFX engine', () => {
  it.each(SFX_CUES)('synthesizes click-free 44.1kHz PCM buffer within 35-260ms for %s', cue => {
    const spec = SFX_SPECS[cue];
    expect(spec.durationMs).toBeGreaterThanOrEqual(35);
    expect(spec.durationMs).toBeLessThanOrEqual(260);

    const samples = synthesizeSfxSamples(cue, SFX_SAMPLE_RATE);
    expect(samples.length).toBeGreaterThanOrEqual(Math.floor(0.035 * SFX_SAMPLE_RATE));
    expect(samples.length).toBeLessThanOrEqual(Math.ceil(0.260 * SFX_SAMPLE_RATE) + 1);
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(0);

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      expect(Number.isFinite(s)).toBe(true);
      expect(Math.abs(s)).toBeLessThanOrEqual(1);
      sumSq += s * s;
      if (Math.abs(s) > peak) peak = Math.abs(s);
    }
    const rms = Math.sqrt(sumSq / samples.length);
    expect(peak).toBeGreaterThan(0.05);
    expect(rms).toBeGreaterThan(0.005);
  });

  it('caches generated AudioBuffers, throttles cursor ticks at 40ms, and degrades silently before activation', () => {
    let clock = 100;
    const backend = new FakeSfxBackend();
    const engine = new SfxEngine(backend, () => clock);

    // Inactive backend silently returns false without creating buffers.
    expect(engine.play('confirm')).toBe(false);
    expect(backend.createdBuffers).toBe(0);
    expect(backend.sfxPlayed).toHaveLength(0);

    backend.running = true;
    expect(engine.play('confirm')).toBe(true);
    expect(engine.play('confirm')).toBe(true);
    // Buffer synthesized once and reused.
    expect(backend.createdBuffers).toBe(1);
    expect(backend.sfxPlayed).toHaveLength(2);
    expect(backend.sfxPlayed[0].buffer).toBe(backend.sfxPlayed[1].buffer);

    // Cursor throttling at CURSOR_THROTTLE_MS (40ms).
    expect(engine.play('cursor')).toBe(true);
    clock += CURSOR_THROTTLE_MS - 1;
    expect(engine.play('cursor')).toBe(false);
    clock += 1;
    expect(engine.play('cursor')).toBe(true);
    expect(backend.createdBuffers).toBe(2);

    engine.clearCache();
    expect(engine.play('confirm')).toBe(true);
    expect(backend.createdBuffers).toBe(3);
  });

  it('maps resolved rule events to concise, non-muddy SFX cues', () => {
    const mockEvents = (types: RuleEvent['type'][]): RuleEvent[] =>
      types.map((type, seq) => ({type, seq} as unknown as RuleEvent));

    expect(sfxCuesForEvents(mockEvents(['PawnsClaimed']))).toEqual(['pawnClaim']);
    expect(sfxCuesForEvents(mockEvents(['PawnsClaimed', 'CardEnhanced']))).toEqual(['buff']);
    expect(sfxCuesForEvents(mockEvents(['CardEnfeebled']))).toEqual(['debuff']);
    expect(sfxCuesForEvents(mockEvents(['CardDestroyed', 'CardEnhanced', 'PawnsClaimed']))).toEqual(['destroy', 'buff']);
    expect(sfxCuesForEvents(mockEvents(['CardReplaced', 'CardEnfeebled']))).toEqual(['destroy', 'debuff']);
    expect(sfxCuesForEvents([])).toEqual([]);
  });

  it('activates SFX in public mode without BGM pack, honors sfx mute/volume, and yields fanfareLite to private Victory BGM', async () => {
    const publicBackend = new FakeSfxBackend();
    const publicAudio = new AudioController({}, publicBackend);
    expect(publicAudio.hasAudio).toBe(false);
    expect(await publicAudio.activateSfxFromGesture()).toBe(true);
    expect(publicBackend.activations).toBe(1);

    expect(publicAudio.playSfx('confirm')).toBe(true);
    expect(publicAudio.playSfx('fanfareLite', {skipIfVictoryTrack: true})).toBe(true);
    expect(publicBackend.sfxPlayed).toHaveLength(2);

    // Mute SFX blocks playback cleanly.
    publicAudio.setMuted('sfx', true);
    expect(publicAudio.playSfx('confirm')).toBe(false);
    publicAudio.setMuted('sfx', false);
    publicAudio.setVolume('sfx', 0);
    expect(publicAudio.playSfx('confirm')).toBe(false);
    publicAudio.setVolume('sfx', 60);
    expect(publicAudio.playSfx('confirm')).toBe(true);

    // With a private victory track & audible BGM, fanfareLite yields to avoid clashing.
    const privateBackend = new FakeSfxBackend();
    const tracks: AudioTracks = {victory: {url: '/music/victory.wav'}};
    const privateAudio = new AudioController(tracks, privateBackend);
    await privateAudio.activateSfxFromGesture();
    expect(privateAudio.playSfx('fanfareLite', {skipIfVictoryTrack: true})).toBe(false);

    // If BGM is muted, fanfareLite is allowed to play.
    privateAudio.setMuted('bgm', true);
    expect(privateAudio.playSfx('fanfareLite', {skipIfVictoryTrack: true})).toBe(true);
  });
});
