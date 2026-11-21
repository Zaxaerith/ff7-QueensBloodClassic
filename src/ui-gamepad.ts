export type Direction = 'up' | 'down' | 'left' | 'right';
export type GamepadCommand = Direction | 'confirm' | 'cancel' | 'details' | 'pass' | 'previous' | 'next' | 'menu' | 'help' | 'scrollUp' | 'scrollDown';
export type GamepadFamily = 'xbox' | 'playstation' | 'nintendo' | 'standard';
export type ConfirmButtonMode = 'south' | 'east';

type Pad = Pick<Gamepad, 'id' | 'index' | 'connected' | 'mapping' | 'axes' | 'buttons'>;
const buttons = [[1,'cancel'],[0,'confirm'],[2,'details'],[3,'pass'],[4,'previous'],[5,'next'],[8,'help'],[9,'menu']] as const;
const directions = [[12,'up'],[13,'down'],[14,'left'],[15,'right']] as const;
export const DAS_MS = 220, ARR_MS = 95, PASS_HOLD_MS = 600;
const stickEngage = 0.42, stickRelease = 0.25;

export class PassHold {
  private press: {device:number; started:number} | null = null;

  begin(device:number, now:number): void { this.press={device,started:now}; }
  cancel(): void { this.press=null; }
  progress(device:number|null, now:number, allowed:boolean): number {
    const press=this.press;
    if(!allowed||!press||device!==press.device){this.cancel();return 0;}
    const progress=Math.min(1,Math.max(0,(now-press.started)/PASS_HOLD_MS));
    if(progress===1)this.cancel();
    return progress;
  }
}

export function gamepadFamily(id: string): GamepadFamily {
  if (/playstation|dualsense|dualshock|054c|\bps[45]\b/i.test(id)) return 'playstation';
  if (/nintendo|switch|joy-con|pro controller|057e/i.test(id)) return 'nintendo';
  if (/xbox|vendor:\s*045e/i.test(id)) return 'xbox';
  return 'standard';
}

function stickDirection(axes: Pad['axes'], previous: Direction | null): Direction | null {
  const [x=0, y=0] = axes;
  const current = previous === 'left' ? -x : previous === 'right' ? x : previous === 'up' ? -y : previous === 'down' ? y : 0;
  if (current > stickRelease) return previous;
  if (Math.max(Math.abs(x), Math.abs(y)) < stickEngage) return null;
  return Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
}

const pressed=(button:GamepadButton|undefined)=>Boolean(button&&(button.pressed||button.value>=.5));

interface PadState {
  id: string;
  ready: boolean;
  held: Set<GamepadCommand>;
  stick: Direction | null;
  direction: Direction | null;
  repeatAt: number;
  scroll: 'scrollUp'|'scrollDown'|null;
  scrollAt: number;
}

export class GamepadInput {
  private devices = new Map<number, PadState>();
  active: number | null = null;

  forget(index: number): void {
    this.devices.delete(index);
    if (this.active === index) this.active = null;
  }

  reset(): void {
    this.devices.clear();
    this.active = null;
  }

  heldPass(): number | null {
    return this.active!==null&&this.devices.get(this.active)?.held.has('pass')?this.active:null;
  }

  sample(pads: readonly (Pad | null)[], now: number, confirmMode:ConfirmButtonMode='south') {
    const available = pads.filter(pad => pad?.connected && pad.mapping === 'standard');
    for (const index of this.devices.keys()) {
      if (!available.some(pad => pad?.index === index)) this.forget(index);
    }
    const signals: {index: number; family: GamepadFamily; command: GamepadCommand; repeat: boolean}[] = [];
    for (const pad of available) {
      if (!pad) continue;
      let state = this.devices.get(pad.index);
      if (state?.id !== pad.id) {
        this.forget(pad.index);
        state = {id:pad.id,ready:false,held:new Set(),stick:null,direction:null,repeatAt:0,scroll:null,scrollAt:0};
        this.devices.set(pad.index,state);
      }
      const held = buttons.filter(([index])=>pressed(pad.buttons[index])).map(([,command])=>
        confirmMode==='east'&&command==='confirm'?'cancel':confirmMode==='east'&&command==='cancel'?'confirm':command);
      state.stick = stickDirection(pad.axes,state.stick);
      const direction = directions.find(([index])=>pressed(pad.buttons[index]))?.[1] ?? state.stick;
      const rightY=pad.axes[3]??0;
      const scroll=Math.abs(rightY)>=stickEngage?(rightY<0?'scrollUp':'scrollDown'):null;
      if (!state.ready) {
        // A button that exposed the pad, or was held while the document lost
        // focus, must be released before this device can act.
        state.ready = !held.length && !direction && !scroll &&
          Math.abs(pad.axes[0] ?? 0) <= stickRelease && Math.abs(pad.axes[1] ?? 0) <= stickRelease;
        continue;
      }
      const edge = held.find(command => !state.held.has(command));
      state.held = new Set(held);
      const moving = direction !== state.direction;
      const repeating = !moving && this.active === pad.index && now >= state.repeatAt;
      if (moving) state.repeatAt = now + DAS_MS;
      else if (direction && repeating) state.repeatAt = now + ARR_MS;
      state.direction = direction;
      const scrollEdge=scroll!==state.scroll;
      const scrollReady=scrollEdge||(this.active===pad.index&&now>=state.scrollAt);
      state.scroll=scroll;
      if(scroll&&scrollReady)state.scrollAt=now+ARR_MS;
      const command = edge ?? (direction && (moving || repeating) ? direction : null) ?? (scrollReady?scroll:null);
      if (command) signals.push({index:pad.index,family:gamepadFamily(pad.id),command,repeat:!edge&&!moving&&!scrollEdge});
    }
    // A new intentional press can claim control. Repeats from the old device
    // cannot override that press, and inactive pads never repeat.
    const signal = signals.find(item => !item.repeat && item.index === this.active)
      ?? signals.find(item => !item.repeat) ?? signals[0];
    if (signal) this.active = signal.index;
    return signal;
  }
}

interface GamepadTarget {
  available: () => boolean;
  command: (command: GamepadCommand, family: GamepadFamily, device:number, now:number) => void;
  holdPass: (device:number|null, now:number) => void;
  device: (mode: 'other' | 'unsupported') => void;
  confirmMode: () => ConfirmButtonMode;
}

/** The browser adapter reports signals only. InputManager owns the modality. */
export function watchGamepads(target: GamepadTarget): () => void {
  if (typeof navigator.getGamepads !== 'function') return ()=>{};
  const input = new GamepadInput();
  let frame: number | null = null;
  let unsupported = false;
  const available = () => !document.hidden && document.hasFocus() && target.available();

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    input.reset();
    unsupported = false;
    target.device('other');
  }
  function wake() {
    if (!available()) { stop(); return; }
    if (frame === null) frame = requestAnimationFrame(poll);
  }
  function poll(now: number) {
    frame = null;
    if (!available()) { stop(); return; }
    let pads: (Gamepad | null)[];
    try { pads = navigator.getGamepads(); }
    catch { stop(); return; }
    const standard = pads.some(pad => pad?.connected && pad.mapping === 'standard');
    const withUnsupported = !standard && pads.some(pad => pad?.connected);
    const active = input.active, signal = input.sample(pads,now,target.confirmMode());
    if (withUnsupported !== unsupported || (active !== null && input.active === null)) {
      unsupported = withUnsupported;
      target.device(unsupported ? 'unsupported' : 'other');
    }
    if (signal) target.command(signal.command,signal.family,signal.index,now);
    target.holdPass(input.heldPass(),now);
    if (standard) wake();
  }

  window.addEventListener('gamepadconnected',wake);
  window.addEventListener('gamepaddisconnected',event => {
    if (input.active === event.gamepad.index) target.device('other');
    input.forget(event.gamepad.index);
    wake();
  });
  window.addEventListener('blur',stop);
  window.addEventListener('focus',wake);
  document.addEventListener('visibilitychange',wake);
  document.addEventListener('focusin',wake);
  // Focus may leave an input by clicking empty space, without a focusin event.
  document.addEventListener('focusout',() => queueMicrotask(wake));
  new MutationObserver(wake).observe(document.getElementById('app')!,{attributes:true,attributeFilter:['data-view']});
  wake();
  return ()=>{input.reset();unsupported=false;wake();};
}
