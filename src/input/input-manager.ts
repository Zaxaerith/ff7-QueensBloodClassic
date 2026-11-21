import {ARR_MS,DAS_MS,PassHold,watchGamepads,type ConfirmButtonMode,type Direction,type GamepadCommand,type GamepadFamily} from '../ui-gamepad.js';

export type InputModality='keyboard'|'pointer'|'gamepad';
export type InputContext='NAV_MENU'|'PREPARE'|'DIALOG_MODAL'|'MULLIGAN'|'MATCH_HAND_BROWSE'|'MATCH_BOARD_TARGET'|'MATCH_BOARD_INSPECT'|'MATCH_COMMAND'|'MATCH_PAUSE'|'NPC_TURN'|'PRESENTATION_LOCK'|'RESULT'|'REPLAY';
export type MatchControl='confirmPlay'|'confirmMulligan'|'passBtn'|'confirmPass'|'cardDetails'|'presentationSkip'|'resultsBtn';
type Intent='confirm'|'cancel'|'details'|'editDeck'|'mulliganCommit'|'pass'|'menu'|'help';
export type SemanticAction=
  | {type:Intent}
  | {type:'move'; direction:Direction}
  | {type:'switch'; step:-1|1}
  | {type:'scroll'; step:-1|1}
  | {type:'hand'|'cell'; index:number; hover:boolean}
  | {type:'control'; control:MatchControl};

export function inputContext(route:string,modal:boolean,phase:string,zone:'hand'|'inspect'|'target'|'command'):InputContext {
  if(modal)return 'DIALOG_MODAL';
  if(route==='replay')return 'REPLAY';
  if(route==='prepare')return 'PREPARE';
  if(route!=='game')return 'NAV_MENU';
  if(phase==='Result')return 'RESULT';
  if(phase==='OpponentTurn'||phase==='OpponentCommit')return 'NPC_TURN';
  if(phase==='Mulligan')return 'MULLIGAN';
  if(phase!=='PlayerSelect'&&phase!=='Preview')return 'PRESENTATION_LOCK';
  return zone==='target'?'MATCH_BOARD_TARGET':zone==='inspect'?'MATCH_BOARD_INSPECT':zone==='command'?'MATCH_COMMAND':'MATCH_HAND_BROWSE';
}

export function allowsPass(context:InputContext):boolean {
  return context==='MATCH_HAND_BROWSE'||context==='MATCH_BOARD_TARGET'||context==='MATCH_BOARD_INSPECT';
}

export function acceptsAction(context:InputContext,action:SemanticAction):boolean {
  const {type}=action;
  if(type==='mulliganCommit')return context==='MULLIGAN';
  if(type==='editDeck')return context==='PREPARE';
  if(context==='DIALOG_MODAL')return type==='move'||type==='scroll'||type==='confirm'||type==='cancel'||type==='details'||
    (type==='control'&&action.control==='confirmPass');
  if(context==='MATCH_PAUSE')return type==='move'||type==='scroll'||type==='confirm'||type==='cancel'||type==='menu'||type==='help';
  if(context==='NPC_TURN'||context==='PRESENTATION_LOCK')return type==='confirm'||
    (type==='control'&&action.control==='presentationSkip');
  if(context==='RESULT')return type==='confirm'||type==='cancel'||type==='move'||type==='menu'||
    (type==='control'&&action.control==='resultsBtn');
  if(context==='NAV_MENU'||context==='PREPARE'||context==='REPLAY')return type==='confirm'||type==='cancel'||type==='move'||
    type==='switch'||type==='details'||type==='scroll'||type==='help'||type==='menu';
  if(context==='MULLIGAN')return type!=='cell'&&type!=='pass'&&
    (type!=='control'||action.control==='confirmMulligan'||action.control==='cardDetails');
  if(type==='pass')return allowsPass(context);
  return type!=='control'||['confirmPlay','passBtn','cardDetails'].includes(action.control);
}

/** Compare with an anchor to accumulate small intentional movements without
 * treating a stationary pointer's back-and-forth jitter as travel. */
export class PointerTravel {
  private anchor:{x:number;y:number}|null=null;
  private last:{x:number;y:number}|null=null;
  reset():void {this.anchor=this.last;}
  moved(x:number,y:number):boolean {
    this.last={x,y};
    this.anchor??=this.last;
    return Math.hypot(x-this.anchor.x,y-this.anchor.y)>4;
  }
}

const keys:Partial<Record<string,SemanticAction>>={
  ArrowUp:{type:'move',direction:'up'},w:{type:'move',direction:'up'},
  ArrowDown:{type:'move',direction:'down'},s:{type:'move',direction:'down'},
  ArrowLeft:{type:'move',direction:'left'},a:{type:'move',direction:'left'},
  ArrowRight:{type:'move',direction:'right'},d:{type:'move',direction:'right'},
  Enter:{type:'confirm'},z:{type:'confirm'},Escape:{type:'cancel'},x:{type:'cancel'},Backspace:{type:'cancel'},
  q:{type:'details'},i:{type:'details'},e:{type:'editDeck'},h:{type:'help'},m:{type:'menu'},
  '1':{type:'switch',step:-1},'2':{type:'switch',step:1},
  PageUp:{type:'switch',step:-1},PageDown:{type:'switch',step:1},
};
const editing='input, select, textarea, [contenteditable]:not([contenteditable=false]), [role=combobox]';
const isEditing=(target:EventTarget|null)=>target instanceof Element&&!!target.closest(editing);
const padControl='select, input[type=checkbox], input[type=range]';

function padAction(command:Exclude<GamepadCommand,'pass'>):SemanticAction {
  switch(command){
    case 'up':case 'down':case 'left':case 'right':return {type:'move',direction:command};
    case 'previous':return {type:'switch',step:-1};
    case 'next':return {type:'switch',step:1};
    case 'scrollUp':return {type:'scroll',step:-1};
    case 'scrollDown':return {type:'scroll',step:1};
    default:return {type:command};
  }
}

interface InputView {
  context:()=>InputContext;
  handle:(action:SemanticAction,context:InputContext)=>void;
  changed:()=>void;
  progress:(value:number)=>void;
  pointerTarget:(node:Element|null)=>SemanticAction|null;
}

export class InputManager {
  modality:InputModality='keyboard';
  family:GamepadFamily='standard';
  unsupported=false;
  confirmMode:ConfirmButtonMode='south';
  private travel=new PointerTravel();
  private hold=new PassHold();
  private resetPad=()=>{};
  private keyboardPass:string|null=null;
  private pointerPass:number|null=null;
  private direction:{key:string;action:SemanticAction;next:number;context:InputContext}|null=null;
  private frame:number|null=null;

  constructor(private view:InputView){}

  dispatch(action:SemanticAction):boolean {
    const context=this.view.context();
    if(!acceptsAction(context,action))return false;
    this.view.handle(action,context);
    this.contextChanged();
    return true;
  }

  contextChanged():void {
    const context=this.view.context();
    if(!allowsPass(context))this.clearPass();
    if(this.direction?.context!==context)this.direction=null;
    this.view.changed();
  }

  setConfirmMode(mode:ConfirmButtonMode):void {
    this.confirmMode=mode;
    this.clearPass();this.resetPad();this.view.changed();
  }

  private clearPass():void {
    this.keyboardPass=null;this.pointerPass=null;this.hold.cancel();this.view.progress(0);
  }

  private use(modality:InputModality):void {
    if(this.modality===modality&&!this.unsupported)return;
    this.modality=modality;this.unsupported=false;this.travel.reset();this.clearPass();
    this.direction=null;
    if(modality!=='gamepad')this.resetPad();
    this.view.changed();
  }

  private checkPass(device:number|null,now:number):void {
    const value=this.hold.progress(device,now,allowsPass(this.view.context()));
    this.view.progress(value===1?0:value);
    if(value===1)this.dispatch({type:'pass'});
  }

  private pressNorth(device:number,now:number):boolean {
    const context=this.view.context();
    if(context==='PREPARE'){
      this.dispatch({type:'editDeck'});
      return false;
    }
    if(context==='MULLIGAN'){
      // A fresh button edge is required to arm PASS after this commit.
      this.clearPass();
      this.dispatch({type:'mulliganCommit'});
      return false;
    }
    if(!allowsPass(context))return false;
    this.hold.begin(device,now);
    return true;
  }

  bindPassButton(button:HTMLButtonElement):void {
    button.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||event.button!==0||button.disabled||!allowsPass(this.view.context()))return;
      event.preventDefault();
      this.use('pointer');
      this.pointerPass=event.pointerId;
      button.setPointerCapture(event.pointerId);
      this.hold.begin(-2,performance.now());
      this.scheduleHeldInput();
    });
    const release=(event:PointerEvent)=>{
      if(this.pointerPass!==event.pointerId)return;
      if(event.type==='pointerup')this.checkPass(-2,performance.now());
      this.clearPass();
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)button.addEventListener(type,release);
    button.addEventListener('pointermove',event=>{
      if(this.pointerPass!==event.pointerId)return;
      const {left,right,top,bottom}=button.getBoundingClientRect();
      if(event.clientX<left||event.clientX>right||event.clientY<top||event.clientY>bottom)this.clearPass();
    });
    button.addEventListener('click',event=>{
      // Native keyboard and assistive activation still have a confirmation path.
      if(event.detail>0)event.stopImmediatePropagation();
    },{capture:true});
    button.addEventListener('contextmenu',event=>event.preventDefault());
  }

  private scheduleHeldInput():void {
    if(this.frame!==null)return;
    this.frame=requestAnimationFrame(now=>{
      this.frame=null;
      if(document.hidden||this.pointerPass===null&&(!document.hasFocus()||isEditing(document.activeElement))){
        this.clearPass();this.direction=null;return;
      }
      if(this.pointerPass!==null)this.checkPass(-2,now);
      else if(this.keyboardPass)this.checkPass(-1,now);
      const direction=this.direction;
      if(direction&&now>=direction.next){
        direction.next=now+ARR_MS;
        if(direction.context===this.view.context())this.dispatch(direction.action);
      }
      if(this.keyboardPass||this.pointerPass!==null||this.direction)this.scheduleHeldInput();
    });
  }

  start():void {
    this.resetPad=watchGamepads({
      available:()=>!isEditing(document.activeElement)||Boolean(document.activeElement?.matches(padControl)),
      confirmMode:()=>this.confirmMode,
      device:mode=>{
        if(this.modality==='gamepad'){this.modality='keyboard';this.clearPass();}
        this.unsupported=mode==='unsupported';
        this.view.changed();
      },
      command:(command,family,device,now)=>{
        this.family=family;this.use('gamepad');
        if(command!=='pass')this.dispatch(padAction(command));
        else this.pressNorth(device,now);
        this.view.changed();
      },
      holdPass:(device,now)=>{if(this.modality==='gamepad')this.checkPass(device,now);},
    });
    document.addEventListener('keydown',event=>{
      if(event.defaultPrevented){this.use('keyboard');return;}
      if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||isEditing(event.target)){
        if(event.key==='Tab')this.use('keyboard');
        return;
      }
      const key=event.key.length===1?event.key.toLowerCase():event.key;
      this.use('keyboard');
      if(key==='Tab')return;
      const context=this.view.context(),pass=key===' '||key==='e';
      if(pass&&(allowsPass(context)||context==='MULLIGAN')){
        event.preventDefault();
        if(event.repeat)return;
        if(this.pressNorth(-1,performance.now())){
          this.keyboardPass=key;
          this.scheduleHeldInput();
        }
        return;
      }
      const mapped=keys[key];
      const action=mapped?.type==='switch'&&(key==='PageUp'||key==='PageDown')&&context==='DIALOG_MODAL'
        ?{type:'scroll',step:mapped.step} as const:mapped;
      if(!action||!acceptsAction(context,action))return;
      event.preventDefault();
      if(event.repeat)return;
      this.dispatch(action);
      if(action.type==='move'&&context===this.view.context()){
        this.direction={key,action,next:performance.now()+DAS_MS,context};this.scheduleHeldInput();
      }
    });
    document.addEventListener('keyup',event=>{
      const key=event.key.length===1?event.key.toLowerCase():event.key;
      if(this.direction?.key===key)this.direction=null;
      if(this.keyboardPass===key)this.clearPass();
    });
    document.addEventListener('pointermove',event=>{
      const moved=this.travel.moved(event.clientX,event.clientY);
      if(this.modality!=='pointer'&&!moved)return;
      this.use('pointer');
      const action=this.view.pointerTarget(event.target instanceof Element?event.target:null);
      if(action)this.dispatch(action);
    },{passive:true});
    for(const type of ['pointerdown','wheel']){
      document.addEventListener(type,()=>this.use('pointer'),{capture:true,passive:true});
    }
    document.addEventListener('contextmenu',event=>{
      const node=event.target;
      if(!(node instanceof Element)||!node.closest('#board, #hand')||!this.view.context().startsWith('MATCH_'))return;
      this.use('pointer');
      event.preventDefault();
      if(this.view.context()==='MATCH_BOARD_TARGET')this.dispatch({type:'cancel'});
      else{
        const pointed=this.view.pointerTarget(node);
        if(pointed)this.dispatch(pointed);
        this.dispatch({type:'details'});
      }
    });
    document.addEventListener('auxclick',event=>{
      if(event.button===1&&event.target instanceof Element&&event.target.closest('#board, #hand')){
        this.use('pointer');event.preventDefault();this.dispatch({type:'details'});
      }
    });
    const stop=()=>{this.direction=null;this.clearPass();};
    window.addEventListener('blur',stop);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
    document.addEventListener('focusin',()=>{if(isEditing(document.activeElement))stop();});
    this.view.changed();
  }
}
