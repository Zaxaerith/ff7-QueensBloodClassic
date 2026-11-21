import type {CarnivalPuzzleId} from '../puzzle-catalog.js';
import {getLocale} from './index.js';
import type {Locale} from './locales.js';

interface CarnivalMessages {
  title: string;
  intro: string;
  candidate: string;
  reward: string;
  start: string;
  finish: string;
  retry: string;
  list: string;
  cleared: string;
  noMoves: string;
  hints: Record<CarnivalPuzzleId, string>;
}

// New mode strings only. Puzzle proper names use the English names from the catalog.
const carnival: Record<Locale, CarnivalMessages> = {
  'zh-CN': {
    title: '卡牌嘉年华', intro: '用指定手牌解开固定棋局。对手没有回合，结算时总分领先即可通关。',
    candidate: 'Classic 候选开局', reward: '原作奖励（仅供参考）', start: '开始解谜', finish: '结束并计分',
    retry: '重试', list: '返回关卡列表', cleared: '已通关', noMoves: '当前没有合法落点。可以结束计分或重试。',
    hints: {
      'cc-three-card-stud': '扩张阵地并提升等级，让高等级牌进入棋盘。',
      'cc-go-for-choco-broke': '利用强化和赢行奖励扭转分差。',
      'cc-mischief-making-moogles': '用生成的莫古力牌强化友方、削弱对手。',
    },
  },
  'zh-TW': {
    title: '卡牌嘉年華', intro: '用指定手牌解開固定棋局。對手沒有回合，結算時總分領先即可通關。',
    candidate: 'Classic 候選開局', reward: '原作獎勵（僅供參考）', start: '開始解謎', finish: '結束並計分',
    retry: '重試', list: '返回關卡列表', cleared: '已通關', noMoves: '目前沒有合法落點。可以結束計分或重試。',
    hints: {
      'cc-three-card-stud': '擴張陣地並提升等級，讓高等級牌進入棋盤。',
      'cc-go-for-choco-broke': '利用強化和贏行獎勵扭轉分差。',
      'cc-mischief-making-moogles': '用生成的莫古力牌強化友方、削弱對手。',
    },
  },
  en: {
    title: 'Card Carnival', intro: 'Solve fixed positions with the cards provided. Play every turn and finish ahead on points.',
    candidate: 'Classic candidate setup', reward: 'Original reward (for reference)', start: 'Play puzzle', finish: 'Finish and score',
    retry: 'Retry', list: 'Back to puzzles', cleared: 'Cleared', noMoves: 'No legal placements. Finish and score or retry.',
    hints: {
      'cc-three-card-stud': 'Claim tiles and raise their ranks to play higher-rank cards.',
      'cc-go-for-choco-broke': 'Use enhancements and lane bonuses to close the score gap.',
      'cc-mischief-making-moogles': 'Use generated Moogle cards to strengthen allies and weaken opponents.',
    },
  },
  ja: {
    title: 'カードカーニバル', intro: '決められた手札で盤面のパズルに挑戦。相手の手番はなく、最終得点で勝てばクリア。',
    candidate: 'Classic の暫定初期配置', reward: '原作の報酬（参考）', start: 'パズル開始', finish: '終了して得点計算',
    retry: 'やり直す', list: 'パズル一覧へ', cleared: 'クリア済み', noMoves: '置けるマスがありません。得点計算に進むか、やり直せます。',
    hints: {
      'cc-three-card-stud': '陣地を広げてランクを上げ、高ランクのカードを配置しよう。',
      'cc-go-for-choco-broke': '強化とレーン勝利ボーナスで点差を逆転しよう。',
      'cc-mischief-making-moogles': '生成したモーグリのカードで味方を強化し、相手を弱体化しよう。',
    },
  },
  ko: {
    title: '카드 카니발', intro: '정해진 손패로 고정된 퍼즐을 풉니다. 상대 턴 없이 진행하며 최종 점수가 앞서면 클리어입니다.',
    candidate: 'Classic 후보 초기 배치', reward: '원작 보상(참고용)', start: '퍼즐 시작', finish: '종료 및 점수 계산',
    retry: '다시 시도', list: '퍼즐 목록으로', cleared: '클리어', noMoves: '놓을 수 있는 칸이 없습니다. 점수를 계산하거나 다시 시도하세요.',
    hints: {
      'cc-three-card-stud': '영역을 넓히고 랭크를 높여 상위 랭크 카드를 놓으세요.',
      'cc-go-for-choco-broke': '강화와 줄 승리 보너스로 점수 차를 뒤집으세요.',
      'cc-mischief-making-moogles': '생성된 모그리 카드로 아군을 강화하고 상대를 약화하세요.',
    },
  },
  fr: {
    title: 'Carnaval des cartes', intro: 'Résolvez chaque position avec la main fournie. Vous jouez seul et devez finir en tête au score.',
    candidate: 'Position de départ provisoire Classic', reward: 'Récompense originale (à titre indicatif)', start: 'Jouer', finish: 'Terminer et compter',
    retry: 'Réessayer', list: 'Retour aux défis', cleared: 'Réussi', noMoves: 'Aucun placement possible. Calculez le score ou recommencez.',
    hints: {
      'cc-three-card-stud': 'Prenez des cases et augmentez leur rang pour jouer des cartes de rang supérieur.',
      'cc-go-for-choco-broke': 'Exploitez les renforcements et les bonus de ligne pour rattraper le score.',
      'cc-mischief-making-moogles': 'Utilisez les cartes mog générées pour renforcer vos alliés et affaiblir les adversaires.',
    },
  },
  de: {
    title: 'Kartenkarneval', intro: 'Löse die vorgegebenen Stellungen mit den bereitgestellten Karten. Du machst alle Züge und brauchst die höhere Punktzahl.',
    candidate: 'Vorläufige Classic-Startstellung', reward: 'Originalbelohnung (zur Information)', start: 'Rätsel spielen', finish: 'Beenden und werten',
    retry: 'Erneut versuchen', list: 'Zur Rätselliste', cleared: 'Gelöst', noMoves: 'Keine gültige Platzierung. Werte das Spiel oder versuche es erneut.',
    hints: {
      'cc-three-card-stud': 'Besetze Felder und erhöhe ihren Rang, um Karten höherer Ränge zu spielen.',
      'cc-go-for-choco-broke': 'Nutze Verstärkungen und Reihenboni, um den Rückstand aufzuholen.',
      'cc-mischief-making-moogles': 'Erzeuge Mogry-Karten, um Verbündete zu stärken und Gegner zu schwächen.',
    },
  },
  it: {
    title: 'Carnevale delle carte', intro: 'Risolvi le posizioni con le carte assegnate. Giochi tutti i turni e devi chiudere in vantaggio.',
    candidate: 'Posizione iniziale provvisoria Classic', reward: 'Ricompensa originale (solo informativa)', start: 'Gioca', finish: 'Termina e calcola il punteggio',
    retry: 'Riprova', list: 'Torna alle sfide', cleared: 'Completato', noMoves: 'Nessuna casella disponibile. Calcola il punteggio o riprova.',
    hints: {
      'cc-three-card-stud': 'Conquista caselle e aumentane il rango per giocare carte di rango superiore.',
      'cc-go-for-choco-broke': 'Sfrutta i potenziamenti e i bonus di fila per recuperare lo svantaggio.',
      'cc-mischief-making-moogles': 'Usa le carte moguri generate per potenziare gli alleati e indebolire gli avversari.',
    },
  },
  'es-ES': {
    title: 'Carnaval de cartas', intro: 'Resuelve posiciones fijas con la mano asignada. Juegas todos los turnos y debes acabar por delante en puntos.',
    candidate: 'Posición inicial provisional de Classic', reward: 'Recompensa original (solo informativa)', start: 'Jugar', finish: 'Terminar y puntuar',
    retry: 'Reintentar', list: 'Volver a los desafíos', cleared: 'Superado', noMoves: 'No hay casillas válidas. Calcula la puntuación o vuelve a intentarlo.',
    hints: {
      'cc-three-card-stud': 'Reclama casillas y sube su rango para jugar cartas de rango superior.',
      'cc-go-for-choco-broke': 'Combina mejoras y bonificaciones de fila para remontar.',
      'cc-mischief-making-moogles': 'Usa las cartas de moguri generadas para potenciar a tus aliados y debilitar al rival.',
    },
  },
  'es-419': {
    title: 'Carnaval de cartas', intro: 'Resuelve posiciones fijas con las cartas asignadas. Juegas todos los turnos y necesitas terminar con más puntos.',
    candidate: 'Posición inicial provisional de Classic', reward: 'Recompensa original (solo como referencia)', start: 'Jugar', finish: 'Terminar y ver el puntaje',
    retry: 'Volver a intentar', list: 'Volver a los desafíos', cleared: 'Completado', noMoves: 'No hay casillas válidas. Consulta el puntaje o vuelve a intentarlo.',
    hints: {
      'cc-three-card-stud': 'Reclama casillas y sube su rango para jugar cartas de rango más alto.',
      'cc-go-for-choco-broke': 'Combina mejoras y bonificaciones de fila para recuperar la ventaja.',
      'cc-mischief-making-moogles': 'Usa las cartas de moguri generadas para fortalecer aliados y debilitar rivales.',
    },
  },
  'pt-BR': {
    title: 'Carnaval de cartas', intro: 'Resolva posições fixas com as cartas fornecidas. Você joga todos os turnos e precisa terminar com mais pontos.',
    candidate: 'Posição inicial provisória de Classic', reward: 'Recompensa original (apenas referência)', start: 'Jogar', finish: 'Encerrar e calcular pontos',
    retry: 'Tentar de novo', list: 'Voltar aos desafios', cleared: 'Concluído', noMoves: 'Não há casas válidas. Calcule os pontos ou tente novamente.',
    hints: {
      'cc-three-card-stud': 'Conquiste casas e aumente o nível delas para jogar cartas de nível mais alto.',
      'cc-go-for-choco-broke': 'Use melhorias e bônus de fileira para virar o placar.',
      'cc-mischief-making-moogles': 'Use as cartas de moogle geradas para fortalecer aliados e enfraquecer o adversário.',
    },
  },
};

export function carnivalMessages(locale: Locale = getLocale()): CarnivalMessages {
  return carnival[locale];
}
