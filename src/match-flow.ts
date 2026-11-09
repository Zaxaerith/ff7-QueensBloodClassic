import {createGame,seededRng,scoreBreakdown,LEGACY_RULES_VERSION,type Game,type RuleEvent,type RulesVersion} from './engine.js';
import {byId} from './cards.js';
import type {BotDifficulty} from './bot.js';
export interface MatchSettings {deck:readonly number[];seed:number;difficulty:BotDifficulty;first:'player'|'computer'|'seeded';}
export function rulesLabel(version:RulesVersion):string {
  return version===LEGACY_RULES_VERSION?'旧规则 · 出牌后补牌':'回合开始抽牌';
}
export function startMatch(settings:MatchSettings):Game {
  if(!Number.isInteger(settings.seed)||settings.seed<0||settings.seed>0xFFFFFFFF)throw Error('Seed 应为 0–4294967295 的整数');
  if(!['easy','normal','hard'].includes(settings.difficulty))throw Error('电脑难度无效');
  if(!['player','computer','seeded'].includes(settings.first))throw Error('自定义先手设置无效');
  const first=settings.first==='player'?0:settings.first==='computer'?1:seededRng(settings.seed)()<.5?0:1;
  return createGame([settings.deck,settings.deck],settings.seed,first);
}
export function eventLabel(event:RuleEvent):string {
  const who=event.player===0?'你':event.player===1?'电脑':'';
  const name=event.cardId===undefined?'':byId.get(event.cardId)?.name??'';
  switch(event.type){
    case 'CardPlayed':return `${who}：${name} → ${event.row!+1}-${event.col!+1}`;
    case 'CardAddedToHand':return event.reason==='draw'?`${who}补牌 1 张`:`${who}生成手牌 ${name}`;
    case 'CardDestroyed':return `${name} 被摧毁（${event.reason}）`;
    case 'PowerChanged':return `${name} 力量 ${event.amount!>=0?'+':''}${event.amount}`;
    case 'DerivedPowerChanged':return `${name} 持续/动态力量 → ${event.power}`;
    case 'CardReplaced':return `${who}替换 ${name}（原力量 ${event.power}）`;
    case 'TurnPassed':return `${who} PASS`;
    case 'MatchEnded':return '连续两次 PASS，对局结束';
    case 'MulliganCommitted':return `${who}完成换牌 ${event.amount} 张`;
    default:return '';
  }
}
export function actionFeedback(events:readonly RuleEvent[]):string {
  const played=events.find(e=>e.type==='CardPlayed'),passed=events.find(e=>e.type==='TurnPassed');
  const who=played?.player===0||passed?.player===0?'你':'电脑';
  const parts=[played?`${who}打出 ${byId.get(played.cardId!)!.name}`:passed?`${who} PASS`:'换牌完成'];
  const changes=events.filter(e=>e.type==='PowerChanged'||e.type==='DerivedPowerChanged').length;
  const destroyed=events.filter(e=>e.type==='CardDestroyed').length;
  const generated=events.filter(e=>e.type==='CardAddedToHand'&&e.reason==='generated').length;
  if(changes)parts.push(`力量变化 ${changes} 次`);if(destroyed)parts.push(`摧毁 ${destroyed} 张`);if(generated)parts.push(`生成手牌 ${generated} 张`);
  for(const event of events)if(event.type==='CardAddedToHand'&&event.reason==='draw')parts.push(eventLabel(event));
  return parts.join(' · ');
}
export function resultMarkup(game:Game):string {
  if(game.phase!=='finished')return '';
  const result=scoreBreakdown(game),title=result.winner===null?'平局':result.winner===0?'你赢了':'电脑获胜';
  const rows=result.rows.map(([a,b],i)=>`<tr><th scope="row">第 ${i+1} 行</th><td>${a} : ${b}</td><td>${result.awards[i][0]} : ${result.awards[i][1]}</td></tr>`).join('');
  return `<h2>${title} · ${result.scores[0]} : ${result.scores[1]}</h2><table><caption>最终逐行计分（你 : 电脑）</caption><thead><tr><th>行</th><th>力量</th><th>实际计分（含特殊奖励）</th></tr></thead><tbody>${rows}</tbody></table>`;
}
