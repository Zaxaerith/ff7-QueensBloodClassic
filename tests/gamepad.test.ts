import {describe,expect,it} from 'vitest';
import {ARR_MS,DAS_MS,GamepadInput,PASS_HOLD_MS,PassHold,gamepadFamily,type GamepadCommand} from '../src/ui-gamepad.js';

function pad(pressed: number[] = [], axes = [0,0], index = 0, id = 'Xbox Controller', mapping: GamepadMappingType = 'standard') {
  return {
    id,index,connected:true,mapping,axes,
    buttons:Array.from({length:17},(_,i) => ({pressed:pressed.includes(i),touched:pressed.includes(i),value:Number(pressed.includes(i))})),
  };
}

describe('standard Gamepad input', () => {
  it.each<[number,GamepadCommand]>([
    [0,'confirm'],[1,'cancel'],[2,'details'],[3,'pass'],[4,'previous'],[5,'next'],[8,'help'],[9,'menu'],
    [12,'up'],[13,'down'],[14,'left'],[15,'right'],
  ])('maps button %i to %s on a fresh edge', (index, command) => {
    const input = new GamepadInput();
    expect(input.sample([pad([index])],0)).toBeUndefined();
    expect(input.sample([pad()],10)).toBeUndefined();
    expect(input.sample([pad([index])],20)?.command).toBe(command);
    expect(input.sample([pad([index])],25)).toBeUndefined();
  });

  it('only repeats directions after the initial delay, even while A is held', () => {
    const input = new GamepadInput();
    input.sample([pad()],0);
    expect(input.sample([pad([0,12])],10)?.command).toBe('confirm');
    const repeat=10+DAS_MS;
    expect(input.sample([pad([0,12])],repeat-1)).toBeUndefined();
    expect(input.sample([pad([0,12])],repeat)).toMatchObject({command:'up',repeat:true});
    expect(input.sample([pad([0,12])],repeat+ARR_MS-1)).toBeUndefined();
    expect(input.sample([pad([0,12])],repeat+ARR_MS)).toMatchObject({command:'up',repeat:true});
    expect(input.sample([pad([0])],600)).toBeUndefined();
    expect(input.sample([pad([0])],2000)).toBeUndefined();
    input.sample([pad()],2010);
    expect(input.sample([pad([0])],2020)?.command).toBe('confirm');
  });

  it('keeps a held stick direction stable through jitter until it returns near center', () => {
    const input = new GamepadInput();
    input.sample([pad()],0);
    expect(input.sample([pad([],[.19,.05])],10)).toBeUndefined();
    expect(input.sample([pad([],[.65,.50])],20)?.command).toBe('right');
    expect(input.sample([pad([],[.30,.7])],25)).toBeUndefined();
    expect(input.sample([pad([],[.24,.7])],30)?.command).toBe('down');
    expect(input.sample([pad([],[0,.24])],400)).toBeUndefined();
    expect(input.sample([pad([],[0,-.8])],410)?.command).toBe('up');
  });

  it('gates reconnect, blur reset, and nonstandard mappings', () => {
    const input = new GamepadInput();
    input.sample([pad()],0);
    expect(input.sample([pad([0])],10)?.command).toBe('confirm');
    input.sample([],20);
    expect(input.active).toBeNull();
    expect(input.sample([pad([0])],30)).toBeUndefined();
    input.sample([pad()],40);
    expect(input.sample([pad([3])],50)?.command).toBe('pass');
    input.reset();
    expect(input.sample([pad([3])],60)).toBeUndefined();
    input.sample([pad([],[],0,'Unknown','')],70);
    expect(input.sample([pad([0],[],0,'Unknown','')],80)).toBeUndefined();
  });

  it('switches active pads on a fresh edge, with no repeat from the old pad', () => {
    const input = new GamepadInput();
    const second = (pressed: number[]) => pad(pressed,[0,0],1,'DualSense');
    input.sample([pad(),second([])],0);
    expect(input.sample([pad([15]),second([])],10)).toMatchObject({index:0,command:'right'});
    expect(input.sample([pad([15]),second([2])],500)).toMatchObject({index:1,command:'details',family:'playstation'});
    expect(input.sample([pad([15]),second([2])],1000)).toBeUndefined();
    input.forget(1);
    expect(input.sample([pad([15]),second([2])],1500)).toBeUndefined();
  });

  it('derives button prompt labels from recognized device identity', () => {
    expect(gamepadFamily('Wireless Controller (Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(gamepadFamily('Gamepad (Vendor: 045e Product: 028e)')).toBe('xbox');
    expect(gamepadFamily('Nintendo Switch Pro Controller (Vendor: 057e)')).toBe('nintendo');
    expect(gamepadFamily('USB joystick 0123456789')).toBe('standard');
  });
});

it('confirms PASS once, only after a continuous hold from the same eligible device',()=>{
  const hold=new PassHold();
  hold.begin(0,0);
  expect(hold.progress(0,PASS_HOLD_MS-1,true)).toBeLessThan(1);
  expect(hold.progress(null,PASS_HOLD_MS,true)).toBe(0);
  expect(hold.progress(0,PASS_HOLD_MS+100,true)).toBe(0);
  hold.begin(0,1000);
  expect(hold.progress(1,1000+PASS_HOLD_MS,true)).toBe(0);
  hold.begin(1,2000);
  expect(hold.progress(1,2000+PASS_HOLD_MS,false)).toBe(0);
  expect(hold.progress(1,2100+PASS_HOLD_MS,true)).toBe(0);
  hold.begin(1,3000);
  expect(hold.progress(1,3000+PASS_HOLD_MS,true)).toBe(1);
  expect(hold.progress(1,3200+PASS_HOLD_MS,true)).toBe(0);
});

it('reports the active held PASS independently of button edges',()=>{
  const input=new GamepadInput();
  input.sample([pad()],0);
  expect(input.sample([pad([3])],10)?.command).toBe('pass');
  expect(input.sample([pad([3])],400)).toBeUndefined();
  expect(input.heldPass()).toBe(0);
  input.forget(0);
  expect(input.sample([pad([3])],500)).toBeUndefined();
  expect(input.heldPass()).toBeNull();
});

it('swaps South/East and keeps right-stick scrolling separate from board directions',()=>{
  const input=new GamepadInput();
  input.sample([pad()],0,'east');
  expect(input.sample([pad([0])],10,'east')?.command).toBe('cancel');
  input.sample([pad()],20,'east');
  expect(input.sample([pad([1])],30,'east')?.command).toBe('confirm');
  expect(input.sample([pad([],[0,0,0,.7])],40,'east')?.command).toBe('scrollDown');
  expect(input.sample([pad([],[0,0,0,.7])],50,'east')).toBeUndefined();
});

it('honors an analog button crossing the pressure threshold',()=>{
  const input=new GamepadInput(),sample=pad();
  input.sample([sample],0);
  sample.buttons[0].value=.4;
  expect(input.sample([sample],10)).toBeUndefined();
  sample.buttons[0].value=.5;
  expect(input.sample([sample],20)?.command).toBe('confirm');
});
