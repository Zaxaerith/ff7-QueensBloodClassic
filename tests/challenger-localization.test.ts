import {expect,test} from 'vitest';
import {botOptionsForMatch,observeGame} from '../src/bot.js';
import {starterDeck} from '../src/cards.js';
import {challengers,findChallenger} from '../src/challengers.js';
import {mulligan,replayMatch,TURN_DRAW_RULES_VERSION,type Command} from '../src/engine.js';
import {restoreMatch,saveMatch,type SavedMatch} from '../src/match-archive.js';
import {startMatch,type MatchSettings} from '../src/match-flow.js';

const seed=701;

test.each(challengers)('$id honors first player, the saved ordered decks and independent Bot difficulty',npc=>{
  const opponent={npcId:npc.id,deck:npc.deck};
  for(const [first,player] of [['player',0],['computer',1]] as const){
    const settings:MatchSettings={deck:starterDeck,seed,difficulty:'normal',first,opponent};
    const game=startMatch(settings);
    const saved=saveMatch(game,settings,'Classic',npc.id);
    expect(saved.settings).toEqual(settings);
    expect(saved.replay).toMatchObject({seed,decks:[starterDeck,npc.deck],firstPlayer:player,version:1});
    mulligan(game,0,[]);mulligan(game,1,[]);
    expect(game.turn).toBe(player);
    if(player===1){
      const view=observeGame(game,1);
      for(const difficulty of ['easy','normal','hard'] as const){
        expect(botOptionsForMatch(view,{...settings,difficulty})).toMatchObject({
          difficulty,strategy:npc.id,
        });
      }
    }
  }
});

// State checks captured by emitting both snapshots with the archived start/save
// modules at 6823df3 (A1) and 0be5520 (B1), using their own ordered NPC decks.
const historical=[
  {id:'nene',first:'player',difficulty:'normal',handIndex:0,before:'eb27b877',after:'82eae527'},
  {id:'zogan',first:'computer',difficulty:'hard',handIndex:1,before:'da9a9a69',after:'a8fb3e71'},
  {id:'isabelle',first:'player',difficulty:'easy',handIndex:0,before:'961feb8f',after:'000462ca'},
  {id:'mirror',first:'computer',difficulty:'normal',handIndex:0,before:'1639f163',after:'17c4bc30'},
  {id:'devin-moore',first:'computer',difficulty:'normal',handIndex:2,before:'55a51c02',after:'5eb6c8af'},
  {id:'darren-moore',first:'player',difficulty:'hard',handIndex:0,before:'61567a16',after:'4c593219'},
] as const;

test.each(historical)('$id historical V1 saves retain both recorded state checks and the rematch opening',row=>{
  const npc=findChallenger(row.id);
  const settings:MatchSettings={
    deck:starterDeck,seed,first:row.first,difficulty:row.difficulty,
    ...(npc?{opponent:{npcId:npc.id,deck:npc.deck}}:{}),
  };
  const firstPlayer=row.first==='computer'?1:0;
  const opening:Command[]=[{type:'mulligan',player:0,indices:[]},{type:'mulligan',player:1,indices:[]}];
  const played:Command={type:'play',player:firstPlayer,handIndex:row.handIndex,row:0,col:firstPlayer===0?0:4};
  for(const [check,commands,next] of [
    [row.before,opening,firstPlayer],[row.after,[...opening,played],1-firstPlayer],
  ] as const){
    const historicalSave:SavedMatch={
      schema:'qbclassic.match',version:1,rulesVersion:TURN_DRAW_RULES_VERSION,
      id:row.id,deckName:'Classic',settings,phase:'playing',check,
      replay:{
        version:1,rulesVersion:TURN_DRAW_RULES_VERSION,seed,firstPlayer,
        decks:[[...starterDeck],[...(npc?.deck??starterDeck)]],commands:[...commands],
      },
    };
    const restored=restoreMatch(historicalSave);
    expect(restored.save).toEqual(historicalSave);
    expect(restored.game.turn).toBe(next);
    expect(restored.game).toEqual(replayMatch(historicalSave.replay));
    expect(startMatch(restored.save.settings).replay).toEqual({...historicalSave.replay,commands:[]});
  }
});
