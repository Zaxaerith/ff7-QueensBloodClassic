import {describe,expect,it,vi,afterEach} from 'vitest';
import {InputManager,PointerTravel,acceptsAction,allowsPass,inputContext,type InputContext} from '../src/input/input-manager.js';
import {gridStep,legalTarget,smartSnap} from '../src/input/match-cursor.js';
import {createPosition,legalMoves} from '../src/engine.js';
import {PASS_HOLD_MS} from '../src/ui-gamepad.js';

it('snaps at entry by last cell and Manhattan distance, then allows every square',()=>{
  expect(smartSnap([9,5],null)).toBe(5);
  expect(smartSnap([9,5],9)).toBe(9);
  expect(smartSnap([9,5],4)).toBe(9);
  expect(smartSnap([6,0],5)).toBe(0);
  expect(smartSnap([],7)).toBe(7);
  expect(smartSnap([],null)).toBe(0);
  const visited=new Set<number>();
  let cell=0;
  for(let row=0;row<3;row++){
    for(let col=0;col<5;col++){
      visited.add(cell);
      if(col<4)cell=gridStep(cell,row%2?'left':'right');
    }
    cell=gridStep(cell,'down');
  }
  expect(visited.size).toBe(15);
  expect(gridStep(4,'right')).toBe(4);
  expect(gridStep(0,'up')).toBe(0);
  expect(gridStep(14,'down')).toBe(14);
});

it('retains invalid cursor positions, while only authoritative legal moves may commit',()=>{
  const game=createPosition({hands:[[2],[1]],board:[
    {row:0,col:0,owner:0,pawns:1},
    {row:1,col:0,owner:0,pawns:2},
    {row:2,col:0,owner:0,cardId:1},
  ]});
  const before=structuredClone(game),moves=legalMoves(game,0);
  expect(smartSnap(moves.map(move=>move.row*5+move.col),0)).toBe(5);
  expect(legalTarget(moves,gridStep(5,'right'))).toBeNull();
  expect(legalTarget(moves,gridStep(5,'up'))).toBeNull();
  expect(legalTarget(moves,gridStep(5,'down'))).toBeNull();
  expect(legalTarget(moves,5)).toMatchObject({handIndex:0,row:1,col:0});
  expect(game).toEqual(before);
});

it('gives the dialog priority over all match and replay contexts',()=>{
  for(const route of ['game','replay','home']){
    expect(inputContext(route,true,'Preview','target')).toBe('DIALOG_MODAL');
  }
  expect(inputContext('game',false,'Mulligan','target')).toBe('MULLIGAN');
  expect(inputContext('game',false,'OpponentTurn','target')).toBe('NPC_TURN');
  expect(inputContext('game',false,'PlayerResolve','target')).toBe('PRESENTATION_LOCK');
  expect(inputContext('game',false,'Result','target')).toBe('RESULT');
  expect(inputContext('game',false,'Preview','target')).toBe('MATCH_BOARD_TARGET');
  expect(inputContext('game',false,'PlayerSelect','inspect')).toBe('MATCH_BOARD_INSPECT');
  expect(inputContext('replay',false,'Preview','target')).toBe('REPLAY');
  expect(inputContext('home',false,'','hand')).toBe('NAV_MENU');
  expect(inputContext('prepare',false,'','hand')).toBe('PREPARE');
});

it('dispatches modal navigation but never forwards a board move or placement under it',()=>{
  let context:InputContext='DIALOG_MODAL';
  const handle=vi.fn(),manager=new InputManager({context:()=>context,handle,changed:()=>{},progress:()=>{},pointerTarget:()=>null});
  expect(manager.dispatch({type:'cell',index:6,hover:false})).toBe(false);
  expect(manager.dispatch({type:'control',control:'confirmPlay'})).toBe(false);
  expect(manager.dispatch({type:'pass'})).toBe(false);
  expect(manager.dispatch({type:'move',direction:'down'})).toBe(true);
  expect(handle).toHaveBeenCalledExactlyOnceWith({type:'move',direction:'down'},'DIALOG_MODAL');
  context='REPLAY';
  expect(manager.dispatch({type:'control',control:'confirmPlay'})).toBe(false);
  context='MATCH_BOARD_TARGET';
  expect(manager.dispatch({type:'control',control:'confirmPlay'})).toBe(true);
  expect(handle).toHaveBeenLastCalledWith({type:'control',control:'confirmPlay'},'MATCH_BOARD_TARGET');
});

it('forwards shoulders to the active view and blocks them during modal and presentation locks',()=>{
  let context:InputContext='NAV_MENU';
  const handle=vi.fn(),manager=new InputManager({context:()=>context,handle,changed:()=>{},progress:()=>{},pointerTarget:()=>null});
  for(const state of ['NAV_MENU','PREPARE','MATCH_HAND_BROWSE','MATCH_BOARD_TARGET','REPLAY'] as const){
    context=state;
    for(const step of [-1,1] as const){
      expect(manager.dispatch({type:'switch',step})).toBe(true);
      expect(handle).toHaveBeenLastCalledWith({type:'switch',step},state);
    }
  }
  for(const state of ['DIALOG_MODAL','MATCH_PAUSE','NPC_TURN','PRESENTATION_LOCK','RESULT'] as const){
    context=state;
    expect(manager.dispatch({type:'switch',step:1})).toBe(false);
  }
  expect(handle).toHaveBeenCalledTimes(10);
});

it('allows hold-to-pass when the active player is browsing, inspecting or targeting',()=>{
  expect(allowsPass('MATCH_HAND_BROWSE')).toBe(true);
  expect(allowsPass('MATCH_BOARD_TARGET')).toBe(true);
  expect(allowsPass('MATCH_BOARD_INSPECT')).toBe(true);
  for(const state of ['NPC_TURN','PRESENTATION_LOCK','DIALOG_MODAL','RESULT','MULLIGAN','MATCH_PAUSE','REPLAY'] as const){
    expect(acceptsAction(state,{type:'pass'})).toBe(false);
  }
  expect(acceptsAction('NPC_TURN',{type:'control',control:'presentationSkip'})).toBe(true);
  expect(acceptsAction('NPC_TURN',{type:'control',control:'cardDetails'})).toBe(false);
});

it('uses displacement from the pointer anchor instead of one tiny event',()=>{
  const pointer=new PointerTravel();
  expect(pointer.moved(100,100)).toBe(false);
  pointer.reset();
  expect(pointer.moved(102,101)).toBe(false);
  expect(pointer.moved(100,100)).toBe(false);
  expect(pointer.moved(102,101)).toBe(false);
  expect(pointer.moved(104,101)).toBe(true);
  pointer.reset();
  expect(pointer.moved(106,101)).toBe(false);
});

describe('Pointer PASS',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

  it('drops an early release and commits one intentional hold through Hydrogen',()=>{
    let frame:FrameRequestCallback|undefined;
    const doc={hidden:false,hasFocus:()=>false,activeElement:null};
    vi.stubGlobal('document',doc);
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});
    vi.spyOn(performance,'now').mockReturnValue(100);
    let context:InputContext='MATCH_HAND_BROWSE';
    const progress=vi.fn(),handle=vi.fn(()=>{context='PRESENTATION_LOCK';});
    const manager=new InputManager({context:()=>context,handle,progress,changed:()=>{},pointerTarget:()=>null});
    const button=Object.assign(new EventTarget(),{disabled:false,setPointerCapture:vi.fn()});
    manager.bindPassButton(button as unknown as HTMLButtonElement);
    function pointer(type:string){
      button.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{pointerId:1,isPrimary:true,button:0}));
    }

    pointer('pointerdown');
    frame!(220);
    expect(progress).toHaveBeenLastCalledWith(.2);
    pointer('pointerup');
    frame!(800);
    expect(handle).not.toHaveBeenCalled();

    pointer('pointerdown');
    frame!(100+PASS_HOLD_MS);
    expect(handle).toHaveBeenCalledExactlyOnceWith({type:'pass'},'MATCH_HAND_BROWSE');
    expect(progress).toHaveBeenLastCalledWith(0);
  });
});

describe('Mulligan shortcuts',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  function inputFixture(id='Xbox Controller'){
    const document=new EventTarget();
    let frame:FrameRequestCallback|undefined;
    let buttons:number[]=[];
    let context:InputContext='MULLIGAN';
    const handle=vi.fn(),progress=vi.fn();
    vi.stubGlobal('document',Object.assign(document,{
      hasFocus:()=>true,
      getElementById:()=>({}),
      activeElement:null,
      hidden:false,
    }));
    vi.stubGlobal('window',new EventTarget());
    vi.stubGlobal('Element',class {});
    vi.stubGlobal('MutationObserver',class {observe(){}});
    vi.stubGlobal('navigator',{getGamepads:()=>[{
      id,index:0,connected:true,mapping:'standard',axes:[0,0],
      buttons:Array.from({length:17},(_,index)=>({pressed:buttons.includes(index)})),
    }]});
    vi.stubGlobal('requestAnimationFrame',(next:FrameRequestCallback)=>{frame=next;return 1;});
    const manager=new InputManager({context:()=>context,handle,changed:()=>{},progress,pointerTarget:()=>null});
    manager.start();
    frame!(0); // A neutral sample arms the standard controller.
    return {
      manager,handle,progress,
      context(value:InputContext){context=value;manager.contextChanged();},
      sample(now:number,...pressed:number[]){buttons=pressed;frame!(now);},
      key(key:string,repeat=false){
        const event=Object.assign(new Event('keydown',{cancelable:true}),{key,repeat});
        document.dispatchEvent(event);
        return event.defaultPrevented;
      },
    };
  }

  it('uses North to edit the prepared deck without arming PASS across the route change',()=>{
    const input=inputFixture('DualSense');
    input.context('PREPARE');
    input.sample(10,3);
    expect(input.handle).toHaveBeenCalledExactlyOnceWith({type:'editDeck'},'PREPARE');
    input.context('MATCH_HAND_BROWSE');
    input.sample(10+PASS_HOLD_MS,3);
    expect(input.handle).toHaveBeenCalledTimes(1);
  });

  it('submits zero marked cards via Xbox North once; a release and new hold are required for PASS',()=>{
    const input=inputFixture();
    input.sample(10,3);
    expect(input.handle).toHaveBeenCalledExactlyOnceWith({type:'mulliganCommit'},'MULLIGAN');
    input.context('PRESENTATION_LOCK');
    input.sample(16,3);
    input.context('MATCH_HAND_BROWSE');
    const heldThroughTurn=10+2*PASS_HOLD_MS;
    input.sample(heldThroughTurn,3);
    expect(input.handle).toHaveBeenCalledTimes(1);
    expect(input.progress.mock.calls.every(([value])=>value===0)).toBe(true);

    const nextPress=heldThroughTurn+20;
    input.sample(nextPress-10);
    input.sample(nextPress,3);
    input.sample(nextPress+PASS_HOLD_MS-1,3);
    expect(input.handle).toHaveBeenCalledTimes(1);
    expect(input.progress).toHaveBeenLastCalledWith(expect.closeTo(1,2));
    input.sample(nextPress+PASS_HOLD_MS,3);
    input.sample(nextPress+2*PASS_HOLD_MS,3);
    expect(input.handle).toHaveBeenCalledTimes(2);
    expect(input.handle).toHaveBeenLastCalledWith({type:'pass'},'MATCH_HAND_BROWSE');
  });

  it('routes PlayStation marking, unmarking and browsing to the hand before North commits',()=>{
    const input=inputFixture('DualSense');
    // Toggle the first card off and back on, then mark the next card.
    input.sample(10,0);
    input.sample(20);
    input.sample(30,0);
    input.sample(40);
    input.sample(50,0);
    input.sample(60);
    input.sample(70,15);
    input.sample(80,0);
    input.sample(90,3);
    expect(input.manager.family).toBe('playstation');
    expect(input.handle.mock.calls).toEqual([
      [{type:'confirm'},'MULLIGAN'],
      [{type:'confirm'},'MULLIGAN'],
      [{type:'confirm'},'MULLIGAN'],
      [{type:'move',direction:'right'},'MULLIGAN'],
      [{type:'confirm'},'MULLIGAN'],
      [{type:'mulliganCommit'},'MULLIGAN'],
    ]);
  });

  it('blocks Mulligan commits in a modal and consumes North until released after closing it',()=>{
    const input=inputFixture();
    input.context('DIALOG_MODAL');
    input.sample(10,3);
    expect(input.manager.dispatch({type:'mulliganCommit'})).toBe(false);
    expect(input.manager.dispatch({type:'control',control:'confirmMulligan'})).toBe(false);
    expect(input.key('e')).toBe(false);
    input.context('MULLIGAN');
    input.sample(20,3);
    expect(input.handle).not.toHaveBeenCalled();
    input.sample(30);
    input.sample(40,3);
    expect(input.handle).toHaveBeenCalledExactlyOnceWith({type:'mulliganCommit'},'MULLIGAN');
  });

  it('uses E to submit Mulligan, preserves Enter and accepts the pointer submit control',()=>{
    const input=inputFixture();
    expect(input.key('Enter')).toBe(true);
    expect(input.key('E')).toBe(true);
    expect(input.key('e',true)).toBe(true);
    expect(input.handle.mock.calls).toEqual([
      [{type:'confirm'},'MULLIGAN'],
      [{type:'mulliganCommit'},'MULLIGAN'],
    ]);
    expect(input.manager.dispatch({type:'control',control:'confirmMulligan'})).toBe(true);
    expect(input.handle).toHaveBeenLastCalledWith({type:'control',control:'confirmMulligan'},'MULLIGAN');
  });
});
