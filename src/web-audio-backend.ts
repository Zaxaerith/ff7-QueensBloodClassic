export type AudioBus = 'bgm' | 'sfx';
export type PlaybackOptions = {
  when: number;
  loop?: {start: number; end: number};
};

export interface AudioVoice {
  /** Fade to silence and stop at this audio-clock time. A pending start is cancelled immediately. */
  stop(when: number): void;
}

export interface AudioBackend {
  readonly running: boolean;
  readonly currentTime: number;
  activate(): Promise<boolean>;
  load(url: string, signal: AbortSignal): Promise<AudioBuffer>;
  play(buffer: AudioBuffer, options: PlaybackOptions, ended: () => void): AudioVoice;
  setGain(bus: AudioBus, gain: number): void;
  close(): Promise<void>;
}

function ramp(param: AudioParam, value: number, now: number, end: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
  } else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
  param.linearRampToValueAtTime(value, end);
}

export class WebAudioBackend implements AudioBackend {
  private context: AudioContext | undefined;
  private buses: Record<AudioBus, GainNode> | undefined;
  private readonly levels: Record<AudioBus, number> = {bgm: 1, sfx: 1};

  get running(): boolean { return this.context?.state === 'running'; }
  get currentTime(): number { return this.context?.currentTime ?? 0; }

  /** Invoked directly by the caller's trusted user gesture. */
  async activate(): Promise<boolean> {
    if (!this.context) {
      let context: AudioContext;
      try {
        context = new AudioContext({sampleRate: 44100});
      } catch {
        context = new AudioContext();
      }
      this.context = context;
      try {
        this.buses = {bgm: context.createGain(), sfx: context.createGain()};
        for (const bus of ['bgm', 'sfx'] as const) {
          this.buses[bus].gain.value = this.levels[bus];
          this.buses[bus].connect(context.destination);
        }
      } catch (error) {
        await this.close();
        throw error;
      }
    }
    const context = this.context;
    if (context.state !== 'running') await context.resume();
    return this.context === context && context.state === 'running';
  }

  async load(url: string, signal: AbortSignal): Promise<AudioBuffer> {
    const context = this.context;
    if (!context) throw new Error('Audio context is unavailable');
    const response = await fetch(url, {signal, mode: 'same-origin', redirect: 'error', cache: 'no-store'});
    if (!response.ok) throw new Error('Audio resource is unavailable');
    const data = await response.arrayBuffer();
    signal.throwIfAborted();
    return context.decodeAudioData(data);
  }

  play(buffer: AudioBuffer, {when, loop}: PlaybackOptions, ended: () => void): AudioVoice {
    const context = this.context, bus = this.buses?.bgm;
    if (!context || !bus || !this.running) throw new Error('Audio context is unavailable');
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = buffer;
    if (loop) {
      source.loop = true;
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
      envelope.gain.setValueAtTime(0, when);
      envelope.gain.linearRampToValueAtTime(1, when + 0.008);
    }
    const disconnect = () => {
      source.onended = null;
      source.disconnect();
      envelope.disconnect();
    };
    source.onended = () => {
      disconnect();
      ended();
    };
    try {
      source.connect(envelope);
      envelope.connect(bus);
      source.start(when, loop?.start ?? 0);
    } catch (error) {
      disconnect();
      throw error;
    }
    return {stop(stopAt) {
      const now = context.currentTime;
      if (stopAt <= now || when > now || context.state !== 'running') {
        source.stop(now);
        disconnect();
        ended();
        return;
      }
      ramp(envelope.gain, 0, now, stopAt);
      source.stop(stopAt);
    }};
  }

  setGain(bus: AudioBus, gain: number): void {
    this.levels[bus] = gain;
    const node = this.buses?.[bus];
    if (node) ramp(node.gain, gain, this.currentTime, this.currentTime + 0.015);
  }

  async close(): Promise<void> {
    const context = this.context, buses = this.buses;
    this.context = undefined;
    this.buses = undefined;
    buses?.bgm.disconnect();
    buses?.sfx.disconnect();
    if (context && context.state !== 'closed') await context.close();
  }
}
