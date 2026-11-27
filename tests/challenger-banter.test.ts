import {expect,test} from 'vitest';
import {SHADOWBLOOD_QUEEN_ID} from '../src/boss-challengers.js';
import {
  BANTER_OPPONENT_IDS,getChallengerBanter,type BanterLocale,
} from '../src/challenger-banter.js';
import {challengers} from '../src/challengers.js';
import {locales} from '../src/i18n/locales.js';
import {TOURNAMENT_ROUNDS} from '../src/tournament-session.js';

const fullBanterLocales:readonly BanterLocale[]=['zh-CN','zh-TW','en','ja'];

test('all 33 challengers, Shadowblood Queen and all 6 cruise tournament rivals have complete non-empty banter',()=>{
  const expectedIds=new Set<string>([
    ...challengers.map(c=>c.id),
    SHADOWBLOOD_QUEEN_ID,
    ...TOURNAMENT_ROUNDS.map(r=>r.opponentId),
  ]);
  expect(expectedIds.size).toBe(38);
  expect(new Set(BANTER_OPPONENT_IDS)).toEqual(expectedIds);

  for(const id of expectedIds){
    for(const locale of fullBanterLocales){
      const banter=getChallengerBanter(id,locale);
      expect(banter,`${id} / ${locale}`).not.toBeNull();
      expect(banter!.intro.trim(),`${id} / ${locale} intro`).not.toBe('');
      expect(banter!.playerWin.trim(),`${id} / ${locale} playerWin`).not.toBe('');
      expect(banter!.playerLoss.trim(),`${id} / ${locale} playerLoss`).not.toBe('');
    }
    // Distinct localized text across zh-CN, en, ja.
    expect(getChallengerBanter(id,'zh-CN')!.intro).not.toBe(getChallengerBanter(id,'en')!.intro);
    expect(getChallengerBanter(id,'ja')!.intro).not.toBe(getChallengerBanter(id,'en')!.intro);
  }
});

test('non-core locales fall back smoothly to English and unknown opponents return null',()=>{
  for(const locale of locales){
    const banter=getChallengerBanter('regina',locale);
    expect(banter).not.toBeNull();
    if(!fullBanterLocales.includes(locale as BanterLocale)){
      expect(banter).toEqual(getChallengerBanter('regina','en'));
    }
  }
  expect(getChallengerBanter('red-xiii-overfang','unknown-locale')).toEqual(getChallengerBanter('red-xiii-overfang','en'));
  expect(getChallengerBanter('nonexistent-opponent','zh-CN')).toBeNull();
});
