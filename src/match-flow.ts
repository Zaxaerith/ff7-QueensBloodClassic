import {t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import {createGame,createPosition,seededRng,scoreBreakdown,LEGACY_RULES_VERSION,TURN_DRAW_RULES_VERSION,type Game,type RuleEvent,type RulesVersion} from './engine.js';
import {byId} from './cards.js';
import {createBossOpeningPosition,findBossChallenger} from './boss-challengers.js';
import type {BotDifficulty} from './bot.js';
export interface MatchSettings {
  deck: readonly number[];
  seed: number;
  difficulty: BotDifficulty;
  first: 'player'|'computer'|'seeded';
  opponent?: {npcId:string;deck:readonly number[]};
}
export function rulesLabel(version:RulesVersion):string {
  return version===LEGACY_RULES_VERSION?t("legacyRulesDrawAfterPlaying"):t("drawAtTurnStart");
}
export function startMatch(settings:MatchSettings):Game {
  if(!Number.isInteger(settings.seed)||settings.seed<0||settings.seed>0xFFFFFFFF)throw Error(t("seedMustBeAnIntegerFrom0To2"));
  if(!['easy','normal','hard'].includes(settings.difficulty))throw Error(t("invalidComputerDifficulty"));
  if(!['player','computer','seeded'].includes(settings.first))throw Error(t("invalidStartingPlayerOption"));
  const opponent=settings.opponent;
  if(opponent&&(typeof opponent.npcId!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(opponent.npcId)||!Array.isArray(opponent.deck)))throw Error(t("invalidOpponentDeck"));
  const first=settings.first==='player'?0:settings.first==='computer'?1:seededRng(settings.seed)()<.5?0:1;
  const boss=findBossChallenger(opponent?.npcId);
  if(boss){
    const position=createBossOpeningPosition(boss,[settings.deck,opponent!.deck],settings.seed,first,TURN_DRAW_RULES_VERSION);
    return createPosition(position,TURN_DRAW_RULES_VERSION);
  }
  return createGame([settings.deck,opponent?.deck??settings.deck],settings.seed,first);
}
export function eventLabel(event:RuleEvent):string {
  const who=event.player===0?t("you"):event.player===1?t("computer"):'';
  const name=event.cardId===undefined?'':displayName(event.cardId,byId.get(event.cardId)?.name);
  switch(event.type){
    case 'CardPlayed':return `${who}：${name} → ${event.row!+1}-${event.col!+1}`;
    case 'CardAddedToHand':return event.reason==='draw'?t("drawEvent", who):t("handGenerationEvent", who, name);
    case 'CardDestroyed':return [name,t(event.reason==='replaced'?'replaced':'destroyed')].join(' · ');
    case 'PowerChanged':return t("powerEvent", name, event.amount!>=0?'+':'', event.amount);
    case 'DerivedPowerChanged':return t("derivedPowerEvent", name, event.power);
    case 'CardReplaced':return t("replacementEvent", who, name, event.power);
    case 'TurnPassed':return `${who} · ${t("pass")}`;
    case 'MatchEnded':return t("passEnding");
    case 'MulliganCommitted':return t("mulliganEvent", who, event.amount);
    default:return '';
  }
}
export function actionFeedback(events:readonly RuleEvent[]):string {
  const played=events.find(e=>e.type==='CardPlayed'),passed=events.find(e=>e.type==='TurnPassed');
  const who=played?.player===0||passed?.player===0?t("you"):t("computer");
  const parts=[played?t("playEvent", who, displayName(played.cardId!,byId.get(played.cardId!)!.name)):passed?`${who} · ${t("pass")}`:t("mulliganComplete")];
  const changes=events.filter(e=>e.type==='PowerChanged'||e.type==='DerivedPowerChanged').length;
  const destroyed=events.filter(e=>e.type==='CardDestroyed').length;
  const generated=events.filter(e=>e.type==='CardAddedToHand'&&e.reason==='generated').length;
  if(changes)parts.push(t("changedPowerCount", changes));if(destroyed)parts.push(t("destroyedCardCount", destroyed));if(generated)parts.push(t("generatedHandCount", generated));
  for(const event of events)if(event.type==='CardAddedToHand'&&event.reason==='draw')parts.push(eventLabel(event));
  return parts.join(' · ');
}
export function resultMarkup(game:Game):string {
  if(game.phase!=='finished')return '';
  const result=scoreBreakdown(game),title=result.winner===null?t("draw"):result.winner===0?t("youWon"):t("theComputerWon");
  const rows=result.rows.map(([a,b],i)=>`<tr><th scope="row">${t("laneNumber",i+1)}</th><td>${a} : ${b}</td><td>${result.awards[i][0]} : ${result.awards[i][1]}</td></tr>`).join('');
  return `<h2>${title} · ${result.scores[0]} : ${result.scores[1]}</h2><table><caption>${t("scoreCaption")}</caption><thead><tr><th>${t("lane")}</th><th>${t("power")}</th><th>${t("actualScore")}</th></tr></thead><tbody>${rows}</tbody></table>`;
}
