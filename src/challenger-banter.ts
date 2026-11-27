import type {Locale} from './i18n/locales.js';

export type BanterLocale='zh-CN'|'zh-TW'|'en'|'ja';

export interface ChallengerBanter {
  readonly intro:string;
  readonly playerWin:string;
  readonly playerLoss:string;
}

type LocalizedBanter=Record<BanterLocale,ChallengerBanter>;

const BANTER_TABLE:Record<string,LocalizedBanter>={
  nene:{
    'zh-CN':{
      intro:'刚学会女王之血吗？那先在卡姆街角和我热热身吧！',
      playerWin:'哇，你的阵线铺得好快！看来卡姆已经留不住你啦。',
      playerLoss:'嘻嘻，先抢占前排格子的诀窍，现在记住了吗？',
    },
    'zh-TW':{
      intro:'剛學會女王之血嗎？那先在卡姆街角和我熱熱身吧！',
      playerWin:'哇，你的陣線鋪得好快！看來卡姆已經留不住你啦。',
      playerLoss:'嘻嘻，先搶佔前排格子的訣竅，現在記住了嗎？',
    },
    en:{
      intro:'New to the board? Let us warm up right here on the streets of Kalm!',
      playerWin:'Whoa, you claimed the whole lane so fast! Kalm is already too small for you.',
      playerLoss:'Hehe, taking the front tiles early pays off, right? Care for a rematch?',
    },
    ja:{
      intro:'クイーンズ・ブラッドは初めて？カームの街角で肩慣らしといこう！',
      playerWin:'わあ、陣地の広げ方が見事だね！もうカームじゃ物足りないかも。',
      playerLoss:'ふふっ、先に前線を押さえるのがコツだよ。もう一戦どう？',
    },
  },
  zogan:{
    'zh-CN':{
      intro:'下珠诺的牌桌可不讲情面，接得住我的连携强化吗？',
      playerWin:'好眼力……连我的强化链都被你拆得干干净净。',
      playerLoss:'光靠单张蛮力可赢不了，学会借光环叠势再来吧。',
    },
    'zh-TW':{
      intro:'下珠諾的牌桌可不講情面，接得住我的連攜強化嗎？',
      playerWin:'好眼力……連我的強化鏈都被你拆得乾乾淨淨。',
      playerLoss:'光靠單張蠻力可贏不了，學會借光環疊勢再來吧。',
    },
    en:{
      intro:'Under Junon plays rough. Let us see if your line holds against my buff chains.',
      playerWin:'Sharp eye... you broke my enhancement chain before it could snowball.',
      playerLoss:'Raw numbers alone will not cut it down here. Build synergy and try again.',
    },
    ja:{
      intro:'アンダージュノンの卓は甘くないぞ。俺の強化コンボを受け切れるか？',
      playerWin:'やるな……強化の連鎖まで綺麗に見切られるとは。',
      playerLoss:'単体のパワーだけじゃ勝てん。味方の連携を磨いて出直してきな。',
    },
  },
  isabelle:{
    'zh-CN':{
      intro:'棋盘如冰镜，每一步升阶都在我的计算之中。请落子吧。',
      playerWin:'出色的破局……连寒霜也未能封住你的进攻节奏。',
      playerLoss:'空阵地正是绝佳的舞台。若想战胜我，先学会守住格子吧。',
    },
    'zh-TW':{
      intro:'棋盤如冰鏡，每一步升階都在我的計算之中。請落子吧。',
      playerWin:'出色的破局……連寒霜也未能封住你的進攻節奏。',
      playerLoss:'空陣地正是絕佳的舞台。若想戰勝我，先學會守住格子吧。',
    },
    en:{
      intro:'Every empty rank is a stage for frost. Make your opening move.',
      playerWin:'A crisp counterplay... even the frost could not freeze your tempo.',
      playerLoss:'Open ranks belong to the patient. Seal the board before challenging me again.',
    },
    ja:{
      intro:'盤面は氷の鏡。ランクを上げる一手一手がすべて布石よ。さあ、どうぞ。',
      playerWin:'見事な読みね……氷塵の陣を崩されるとは思わなかったわ。',
      playerLoss:'空きマスは私の独壇場よ。次までに盤面を封じる術を学んでおくことね。',
    },
  },
  ned:{
    'zh-CN':{
      intro:'稳扎稳打、上下呼应——这就是我的卡姆基本功！',
      playerWin:'输得心服口服！你的攻防衔接比我更严密。',
      playerLoss:'嘿嘿，别小看响板蟹的垂直配合，再来一局切磋吧。',
    },
    'zh-TW':{
      intro:'穩紮穩打、上下呼應——這就是我的卡姆基本功！',
      playerWin:'輸得心服口服！你的攻防銜接比我更嚴密。',
      playerLoss:'嘿嘿，別小看響板蟹的垂直配合，再來一局切磋吧。',
    },
    en:{
      intro:'Steady links and vertical buffs—that is my Kalm fundamentals in action!',
      playerWin:'Fair and square! Your formation held tighter than mine.',
      playerLoss:'Never underestimate a good vertical boost. Ready for another round?',
    },
    ja:{
      intro:'堅実につないで上下で強化――これが俺流の基本戦術だ！',
      playerWin:'完敗だよ！あんたの布陣のほうが一枚上手だったな。',
      playerLoss:'縦の強化もバカにできないだろ？またいつでも相手になるよ。',
    },
  },
  zahira:{
    'zh-CN':{
      intro:'手牌充裕、步步升阶，终盘的棋盘自然尽归我手。',
      playerWin:'真精彩，你在我铺开三级格之前就抢先压制了全场。',
      playerLoss:'手牌见底了吧？懂得留足后劲，才能笑到最后哦。',
    },
    'zh-TW':{
      intro:'手牌充裕、步步升階，終盤的棋盤自然盡歸我手。',
      playerWin:'真精彩，你在我鋪開三級格之前就搶先壓制了全場。',
      playerLoss:'手牌見底了吧？懂得留足後勁，才能笑到最後哦。',
    },
    en:{
      intro:'Keep the hand full, climb to rank three, and the late board is mine.',
      playerWin:'Well played! You closed out the lanes before my rank-three engine awoke.',
      playerLoss:'Out of cards already? Patience and hand control win the long game.',
    },
    ja:{
      intro:'手札を切らさずランクを上げれば、終盤の盤面は自然と私のものよ。',
      playerWin:'お見事ね。ランク3が整う前に押し切られてしまったわ。',
      playerLoss:'手札が尽きたみたいね。余力を残す戦い方を覚えるといいわ。',
    },
  },
  'devin-moore':{
    'zh-CN':{
      intro:'双子之战可别只盯着中路，小心我从上下两翼包抄你！',
      playerWin:'啧，三线都被你稳住了！看来弟弟也得打起精神了。',
      playerLoss:'哈哈，两翼失守就难翻身了吧！这就是跨行扩张的威力。',
    },
    'zh-TW':{
      intro:'雙子之戰可別只盯著中路，小心我從上下兩翼包抄你！',
      playerWin:'嘖，三線都被你穩住了！看來弟弟也得打起精神了。',
      playerLoss:'哈哈，兩翼失守就難翻身了吧！這就是跨行擴張的威力。',
    },
    en:{
      intro:'Keep your eyes off the center—my flanks are coming from top and bottom!',
      playerWin:'Tch, you covered every lane! My twin had better watch out too.',
      playerLoss:'Caught on both wings! Wide cross-lane pressure is hard to stop, huh?',
    },
    ja:{
      intro:'中央ばかり見てると危ないぜ？上下の両翼から一気に挟み撃ちだ！',
      playerWin:'ちっ、三列ぜんぶ抑えられたか！弟にも気を引き締めさせないとな。',
      playerLoss:'ははっ、両翼を取られたら終わりだぜ！広い展開力の勝ちだな。',
    },
  },
  'darren-moore':{
    'zh-CN':{
      intro:'哥哥喜欢铺面，我偏爱正面击穿！先吃我一记前排削弱！',
      playerWin:'干得漂亮……正面强压居然被你硬生生扛住了。',
      playerLoss:'这就是集中火力的痛快！想赢我就别让前排露破绽。',
    },
    'zh-TW':{
      intro:'哥哥喜歡鋪面，我偏愛正面擊穿！先吃我一記前排削弱！',
      playerWin:'幹得漂亮……正面強壓居然被你硬生生扛住了。',
      playerLoss:'這就是集中火力的痛快！想贏我就別讓前排露破綻。',
    },
    en:{
      intro:'My brother spreads wide—I punch straight through the front line!',
      playerWin:'Solid defense... you shrugged off my frontline pressure and took the lane.',
      playerLoss:'Pure lane dominance! Guard your front rank better next time.',
    },
    ja:{
      intro:'兄貴は広く攻めるが、俺は正面突破だ！まずは前線を削らせてもらうぞ！',
      playerWin:'やるじゃないか……正面からの圧力を真っ向から押し返されるとはな。',
      playerLoss:'一点突破の気持ちよさ、味わえたか？次は前線の守りを固めて来いよ。',
    },
  },
  michaela:{
    'zh-CN':{
      intro:'侧珠诺的阴影会悄无声息吞噬力量……准备好面对削弱之雾了吗？',
      playerWin:'有趣……在重重负面光环下，你竟还能保持阵线不崩。',
      playerLoss:'力量一点点流失的滋味不好受吧？这正是控场的艺术。',
    },
    'zh-TW':{
      intro:'側珠諾的陰影會悄無聲息吞噬力量……準備好面對削弱之霧了嗎？',
      playerWin:'有趣……在重重負面光環下，你竟還能保持陣線不崩。',
      playerLoss:'力量一點點流失的滋味不好受吧？這正是控場的藝術。',
    },
    en:{
      intro:'The shadows of Crow’s Nest drain strength quietly. Ready for the debuff fog?',
      playerWin:'Intriguing... you kept your lines standing even inside my weakening aura.',
      playerLoss:'Watching your power fade turn by turn—that is the beauty of control.',
    },
    ja:{
      intro:'サイドジュノンの影は静かに力を奪うわ……弱体化の霧に耐えられるかしら？',
      playerWin:'面白いわ……この弱体化オーラの中で戦線を保ち切るなんて。',
      playerLoss:'じわじわ力を削られる気分はどう？これが盤面支配の醍醐味よ。',
    },
  },
  neil:{
    'zh-CN':{
      intro:'叠满友方强化、把火焰兵顶在最前排——赌一把痛快的对攻吧！',
      playerWin:'哈哈，反伤没炸到你反倒被你借势翻盘，这局真过瘾！',
      playerLoss:'轰隆！前排稳住了，陆行鸟与莫古力的力量也就停不下来啦！',
    },
    'zh-TW':{
      intro:'疊滿友方強化、把火焰兵頂在最前排——賭一把痛快的對攻吧！',
      playerWin:'哈哈，反傷沒炸到你反倒被你借勢翻盤，這局真過癮！',
      playerLoss:'轟隆！前排穩住了，陸行鳥與莫古力的力量也就停不下來啦！',
    },
    en:{
      intro:'Stack the buffs, push Flametrooper up front—let us play with fire!',
      playerWin:'Haha, you turned my own blast risk against me! What a rush!',
      playerLoss:'Boom! Once the frontline holds, the buff count just keeps climbing!',
    },
    ja:{
      intro:'味方を強化して前線に火力を並べる――スリル満点の勝負といこうぜ！',
      playerWin:'ははっ、自爆のリスクを逆手に取られたか！熱い一戦だったな！',
      playerLoss:'ドカンと決まったな！強化された味方が並べばこっちの勝ちだ！',
    },
  },
  cameron:{
    'zh-CN':{
      intro:'每倒下一张牌，大蛇便强上一分。你的阵地，足够它吞噬吗？',
      playerWin:'了不起，你连残血交换的时机都掐得死死的。',
      playerLoss:'摧毁与成长永不停歇……下次带套更抗压的牌组再来吧。',
    },
    'zh-TW':{
      intro:'每倒下一張牌，大蛇便強上一分。你的陣地，足夠牠吞噬嗎？',
      playerWin:'了不起，你連殘血交換的時機都掐得死死的。',
      playerLoss:'消滅與成長永不停歇……下次帶套更抗壓的牌組再來吧。',
    },
    en:{
      intro:'Every card destroyed feeds the serpent. Let us see how much your board can endure.',
      playerWin:'Impressive—you denied my kills and starved the growth engine.',
      playerLoss:'Destruction fuels power. Bring a sturdier line next time we meet.',
    },
    ja:{
      intro:'カードが消滅するたび大蛇は力を増す。お前の陣地はどこまで耐えられるかな？',
      playerWin:'見事だ。消滅のタイミングまで完全に封じられるとはな。',
      playerLoss:'破壊と成長は止まらない……次はもっとタフなデッキで挑んでこい。',
    },
  },
  felix:{
    'zh-CN':{
      intro:'欢迎登上第八神罗丸！锦标赛前先过我这关疾风快攻吧！',
      playerWin:'哇啊，才开局几回合就被你稳稳压住了！看来你瞄准的是冠军呀！',
      playerLoss:'速度就是船上牌局的生命线！调整下起手节奏再来试试吧！',
    },
    'zh-TW':{
      intro:'歡迎登上第八神羅丸！錦標賽前先過我這關疾風快攻吧！',
      playerWin:'哇啊，才開局幾回合就被你穩穩壓住了！看來你瞄準的是冠軍呀！',
      playerLoss:'速度就是船上牌局的生命線！調整下起手節奏再來試試吧！',
    },
    en:{
      intro:'Welcome aboard the Shinra-8! Think you can keep pace with my opening rush?',
      playerWin:'Whoa, you shut down my rush in just a few turns! You really are aiming for the trophy!',
      playerLoss:'Speed rules on this deck! Tune your opening curve and let us go again.',
    },
    ja:{
      intro:'第八神羅丸へようこそ！大会の前に俺の速攻をさばき切れるか試してみようぜ！',
      playerWin:'うわっ、あっという間に主導権を握られた！こりゃ優勝候補だな！',
      playerLoss:'船上の勝負はスピード命さ！初動を整えてもう一戦やろうぜ！',
    },
  },
  regina:{
    'zh-CN':{
      intro:'我叫蕾吉娜。第八神罗丸的王座，可不会轻易让给无名之辈。',
      playerWin:'不可思议……你确实配得上站在决赛的牌桌对面。下次我不会留手了。',
      playerLoss:'这就是实力差距。等你磨亮锋芒，再来挑战我吧。',
    },
    'zh-TW':{
      intro:'我叫蕾吉娜。第八神羅丸的王座，可不會輕易讓給無名之輩。',
      playerWin:'不可思議……你確實配得上站在決賽的牌桌對面。下次我不會留手了。',
      playerLoss:'這就是實力差距。等你磨亮鋒芒，再來挑戰我吧。',
    },
    en:{
      intro:'I am Regina. The crown of the Shinra-8 does not bow to amateurs.',
      playerWin:'Remarkable... you earned your place across the finals table. Next time will be different.',
      playerLoss:'That is the gap between contender and ace. Sharpen your deck and return.',
    },
    ja:{
      intro:'私がレジーナ。第八神羅丸の王座は、並の挑戦者には渡さないわ。',
      playerWin:'見事ね……決勝の卓に立つ資格は本物みたい。次は本気でいかせてもらうわ。',
      playerLoss:'これが実力の差よ。腕を磨いて、また挑んでいらっしゃい。',
    },
  },
  maurya:{
    'zh-CN':{
      intro:'太阳海岸的浪花一波接一波，我的衍生牌阵也是如此哦！',
      playerWin:'哎呀，浪潮被你彻底挡在沙滩外了，真是个厉害的度假客！',
      playerLoss:'绵延不断的手牌攻势很棘手吧？吹吹海风再来一盘！',
    },
    'zh-TW':{
      intro:'太陽海岸的浪花一波接一波，我的衍生牌陣也是如此哦！',
      playerWin:'哎呀，浪潮被你徹底擋在沙灘外了，真是個厲害的度假客！',
      playerLoss:'綿延不斷的手牌攻勢很棘手吧？吹吹海風再來一盤！',
    },
    en:{
      intro:'Like the waves of Costa del Sol, my generated cards just keep rolling in!',
      playerWin:'Oh my, you broke the tide right on the shore! What a sharp traveler!',
      playerLoss:'Hard to outlast an endless wave of tokens, right? Catch the breeze and rematch!',
    },
    ja:{
      intro:'コスタ・デル・ソルの波みたいに、私の生成カードも次々押し寄せるわよ！',
      playerWin:'あらら、波をぜんぶ押し返されちゃった！すごい腕前の旅行客ね！',
      playerLoss:'途切れない手札攻勢は厄介だったでしょ？潮風に当たったらもう一戦ね！',
    },
  },
  biff:{
    'zh-CN':{
      intro:'北科雷尔不兴花架子——爆弹一响，谁站得住谁赢！',
      playerWin:'痛快！硬碰硬还能赢我，你小子有两把刷子！',
      playerLoss:'哈哈，炸得够响亮吧！怕了就赶紧加固你的阵线再来！',
    },
    'zh-TW':{
      intro:'北科雷爾不興花架子——爆彈一響，誰站得住誰贏！',
      playerWin:'痛快！硬碰硬還能贏我，你小子有兩把刷子！',
      playerLoss:'哈哈，炸得夠響亮吧！怕了就趕緊加固你的陣線再來！',
    },
    en:{
      intro:'No fancy tricks in North Corel—when the Bombs go off, whoever stands wins!',
      playerWin:'Now that is a brawl! Beating me head-to-head earns my respect!',
      playerLoss:'Haha, loud enough for ya? Patch up your board and come back swinging!',
    },
    ja:{
      intro:'北コレルに小細工はいらねえ――ボムが爆発したあと立ってた奴の勝ちだ！',
      playerWin:'最高だぜ！真っ向勝負で俺を押し切るとは、見上げた腕前だ！',
      playerLoss:'ははっ、派手に吹き飛んだな！陣地を立て直してまた来な！',
    },
  },
  lidrehl:{
    'zh-CN':{
      intro:'欲越七阶血之门，先证明你能驾驭强化与献祭的平衡吧。',
      playerWin:'力量流转如行云流水……你有资格继续踏向更高的血之段位。',
      playerLoss:'阴阳失衡，阵脚便乱。领悟替换继承之道后再来叩门吧。',
    },
    'zh-TW':{
      intro:'欲越七階血之門，先證明你能駕馭強化與獻祭的平衡吧。',
      playerWin:'力量流轉如行雲流水……你有資格繼續踏向更高的血之段位。',
      playerLoss:'陰陽失衡，陣腳便亂。領悟替換繼承之道後再來叩門吧。',
    },
    en:{
      intro:'To pass the Rank 7 gate, prove you can balance enhancement and sacrifice.',
      playerWin:'Flawless flow of power... you are worthy to climb higher in the Blood ranks.',
      playerLoss:'Lose balance and the board collapses. Master inheritance and challenge the gate again.',
    },
    ja:{
      intro:'ランク7の門を越えたければ、強化と犠牲の均衡を制して見せよ。',
      playerWin:'力の循環が見事だ……さらに高みへ進む資格は十分にある。',
      playerLoss:'陰陽の調和を乱せば盤面は崩れる。継承の理を掴んで再び挑め。',
    },
  },
  zhijun:{
    'zh-CN':{
      intro:'贡加加的密林处处是伏兵，可别轻易踏进我的减益陷阱。',
      playerWin:'好冷静的判断，竟从密林的层层削弱中杀出了生路。',
      playerLoss:'深陷泥沼了吧？在丛林里，急躁的猎手往往先成猎物。',
    },
    'zh-TW':{
      intro:'貢加加的密林處處是伏兵，可別輕易踏進我的減益陷阱。',
      playerWin:'好冷靜的判斷，竟從密林的層層削弱中殺出了生路。',
      playerLoss:'深陷泥沼了吧？在叢林裡，急躁的獵手往往先成獵物。',
    },
    en:{
      intro:'Every shadow in Gongaga hides an ambush. Step carefully around my debuff traps.',
      playerWin:'Cool nerves—you cut right through the jungle snare without losing momentum.',
      playerLoss:'Trapped in the undergrowth? In the jungle, impatient hunters become prey.',
    },
    ja:{
      intro:'ゴンガガの密林は伏兵だらけだ。弱体化の罠に足を踏み入れないよう気をつけな。',
      playerWin:'落ち着いた捌きだな。密林の包囲網を鮮やかに抜けられるとは。',
      playerLoss:'沼にハマったな？ジャングルでは焦った狩人ほど獲物になるのさ。',
    },
  },
  'regina-rematch':{
    'zh-CN':{
      intro:'又见面了。这一次我带来了全新的替换阵型——别让我失望！',
      playerWin:'哪怕是全力以赴的再战，依然败给了你……你真是最棒的对手。',
      playerLoss:'哼，这一回胜利归我！我们的宿命对决还远没结束呢。',
    },
    'zh-TW':{
      intro:'又見面了。這一次我帶來了全新的替換陣型——別讓我失望！',
      playerWin:'哪怕是全力以赴的再戰，依然敗給了你……你真是最棒的對手。',
      playerLoss:'哼，這一回勝利歸我！我們的宿命對決還遠沒結束呢。',
    },
    en:{
      intro:'We meet again. This time I brought my elite replacement lineup—do not disappoint me!',
      playerWin:'Even at full strength in a rematch, you bested me... you truly are my finest rival.',
      playerLoss:'Hmph, this round is mine! Our rivalry is far from over.',
    },
    ja:{
      intro:'また会ったわね。今度は切り札の上書き戦術を用意してきたわ――失望させないで！',
      playerWin:'全力の再戦でも届かないなんて……あなた、最高のライバルね。',
      playerLoss:'ふっ、今回は私の勝ちよ！私たちの決着はまだこれからね。',
    },
  },
  bernard:{
    'zh-CN':{
      intro:'星陨峡谷的古石沉重如山。来试试撼动我的重甲石像阵吧！',
      playerWin:'撼山易，撼此阵难……你竟然用巧劲瓦解了巨像之威！',
      playerLoss:'根基不稳如何抗衡古岩？准备好突破高阶壁垒后再来吧。',
    },
    'zh-TW':{
      intro:'星隕峽谷的古石沉重如山。來試試撼動我的重甲石像陣吧！',
      playerWin:'撼山易，撼此陣難……你竟然用巧勁瓦解了巨像之威！',
      playerLoss:'根基不穩如何抗衡古岩？準備好突破高階壁壘後再來吧。',
    },
    en:{
      intro:'Ancient stone of Cosmo Canyon stands unyielding. Try moving my heavy monoliths!',
      playerWin:'To topple mountains takes true craft... you shattered my golem wall cleanly.',
      playerLoss:'Light footing cannot crack bedrock. Fortify your strategy and return.',
    },
    ja:{
      intro:'コスモキャニオンの古岩は揺るがぬ。我が重厚なる石像の陣を崩せるかな？',
      playerWin:'見事だ……山の如き巨像の壁を鮮やかに打ち砕くとはな。',
      playerLoss:'土台が脆くては巨岩に抗えぬ。高ランクを制する策を練って再戦しよう。',
    },
  },
  turner:{
    'zh-CN':{
      intro:'强化与弱化不过是一体两面。你能跟上我翻转状态的节奏吗？',
      playerWin:'漂亮！连双面光环的拐点都被你精准预判了。',
      playerLoss:'顺风转逆风只在一念之间，这就是状态反转的魅力所在。',
    },
    'zh-TW':{
      intro:'強化與弱化不過是一體兩面。你能跟上我翻轉狀態的節奏嗎？',
      playerWin:'漂亮！連雙面光環的拐點都被你精準預判了。',
      playerLoss:'順風轉逆風只在一念之間，這就是狀態反轉的魅力所在。',
    },
    en:{
      intro:'Enhancement and enfeeblement are two faces of the same coin. Ready for the flip?',
      playerWin:'Brilliant! You read every pivot of my dual aura before it swung.',
      playerLoss:'One shift turns fortune upside down—that is the thrill of status inversion.',
    },
    ja:{
      intro:'強化と弱体化は表裏一体。状態反転の駆け引きについて来られるかな？',
      playerWin:'お見事！二面オーラの転換点まで完璧に読まれてしまったよ。',
      playerLoss:'一手で天と地がひっくり返る――これこそ反転戦術の妙味さ。',
    },
  },
  'vincent-gatekeeper':{
    'zh-CN':{
      intro:'神罗公馆的寂静不容轻扰……若想前行，便接下这份亡语与赎罪之牌。',
      playerWin:'……出色的意志。黑暗之中，你的每一步都未曾动摇。',
      playerLoss:'沉睡于此吧。待你准备好直面终局之暗，再叩响这扇门。',
    },
    'zh-TW':{
      intro:'神羅公館的寂靜不容輕擾……若想前行，便接下這份亡語與贖罪之牌。',
      playerWin:'……出色的意志。黑暗之中，你的每一步都未曾動搖。',
      playerLoss:'沉睡於此吧。待你準備好直面終局之暗，再叩響這扇門。',
    },
    en:{
      intro:'The silence of Shinra Manor is not lightly broken... face my cards of sacrifice.',
      playerWin:'...Steadfast resolve. Not once did your hand waver in the dark.',
      playerLoss:'Rest here a while. Knock again when you are ready for the final shadow.',
    },
    ja:{
      intro:'神羅屋敷の静寂を乱すか……ならば、犠牲と贖罪の札を受けてみろ。',
      playerWin:'……見事な意志だ。闇の中でも、お前の一手は揺らがなかった。',
      playerLoss:'今は退くがいい。終局の闇と向き合う覚悟ができたら、また扉を叩け。',
    },
  },
  rolf:{
    'zh-CN':{
      intro:'汪！汪呜！（“我可是科雷尔最快的小狗牌手！准备接招吧！”）',
      playerWin:'呜汪……（摇着尾巴叼来奖励卡：“你跑得比我的快攻还快，服气啦！”）',
      playerLoss:'汪汪汪！（开心地原地转圈：“咬住前排格子就不松口，再来一局！”）',
    },
    'zh-TW':{
      intro:'汪！汪嗚！（「我可是科雷爾最快的小狗牌手！準備接招吧！」）',
      playerWin:'嗚汪……（搖著尾巴叼來獎勵卡：「你跑得比我的快攻還快，服氣啦！」）',
      playerLoss:'汪汪汪！（開心地原地轉圈：「咬住前排格子就不鬆口，再來一局！」）',
    },
    en:{
      intro:'Woof! Arf-arf! ("Fastest paws in Corel! Try keeping up with my rush deck!")',
      playerWin:'Arf... whimper-woof! (Wags tail happily: "You outran my pack fair and square!")',
      playerLoss:'Bark! Woof-woof! (Spins in a circle: "Grab the front tiles and never let go!")',
    },
    ja:{
      intro:'ワン！ワォン！（「コレル最速のワンコバトラーだぞ！速攻勝負だ！」）',
      playerWin:'クゥン……ワン！（しっぽを振りながら「ボクの速攻に追いつくなんてすごいワン！」）',
      playerLoss:'ワンワン！（楽しそうに飛び跳ねて「前線にかじりついたら離さないワン！もう一回！」）',
    },
  },
  navalan:{
    'zh-CN':{
      intro:'荒漠的守门人从不仁慈……你的牌阵，撑得过我的持续削弱吗？',
      playerWin:'好强的韧性……你确实配得上跨越血之守门人的试炼。',
      playerLoss:'力量被一点点抽干了吧？这就是沙漠守门人的洗礼。',
    },
    'zh-TW':{
      intro:'荒漠的守門人從不仁慈……你的牌陣，撐得過我的持續削弱嗎？',
      playerWin:'好強的韌性……你確實配得上跨越血之守門人的試煉。',
      playerLoss:'力量被一點點抽乾了吧？這就是沙漠守門人的洗禮。',
    },
    en:{
      intro:'A Keeper of the desert shows no mercy... can your line survive endless drain?',
      playerWin:'Steadfast resolve... you have earned passage past a Keeper of the Cruor.',
      playerLoss:'Feel your strength evaporating? That is the desert Keeper’s trial.',
    },
    ja:{
      intro:'砂漠の番人に慈悲はない……俺の弱体化地獄を耐え抜けるか？',
      playerWin:'見事な粘りだ……血の番人の試練を越える資格は十分にある。',
      playerLoss:'じわじわ力を吸い取られたな？これが砂漠の番人の洗礼だ。',
    },
  },
  mary:{
    'zh-CN':{
      intro:'欢迎来到碟下区！想赢我，可别被我的献祭与鬼牌节奏绕晕了哦。',
      playerWin:'呀，连我的鬼牌反转都被你提前识破了，真是厉害的客人！',
      playerLoss:'嘻嘻，场上越乱，我的牌就越强！调整好牌组再来挑战吧。',
    },
    'zh-TW':{
      intro:'歡迎來到碟下區！想贏我，可別被我的犧牲與鬼牌節奏繞暈了喔。',
      playerWin:'呀，連我的鬼牌反轉都被你提前識破了，真是厲害的客人！',
      playerLoss:'嘻嘻，場上越亂，我的牌就越強！調整好牌組再來挑戰吧。',
    },
    en:{
      intro:'Welcome to the Dustbowl! Careful my sacrifices and Jokers do not spin you around.',
      playerWin:'Whoa, you read every Joker swing before it landed! Sharp player!',
      playerLoss:'Hehe, the messier the board gets, the stronger I grow! Care for a rematch?',
    },
    ja:{
      intro:'アンダーソーサーへようこそ！私の生贄とジョーカーに振り回されないでね。',
      playerWin:'あら、ジョーカーの切り返しまで読まれちゃった！すごい腕前ね！',
      playerLoss:'ふふっ、盤面が荒れるほど強くなるのよ！デッキを整えてまた来てね。',
    },
  },
  pietro:{
    'zh-CN':{
      intro:'沙漠里的毒雾无孔不入，让我看看你的高阶牌还能剩下几点力量！',
      playerWin:'啧，减益阵居然被你硬生生撕开了一道口子，干得不错！',
      playerLoss:'哈哈，看着满场红字一点点变成我的分数，这感觉真痛快！',
    },
    'zh-TW':{
      intro:'沙漠裡的毒霧無孔不入，讓我看看你的高階牌還能剩下幾點力量！',
      playerWin:'嘖，減益陣居然被你硬生生撕開了一道口子，幹得不錯！',
      playerLoss:'哈哈，看著滿場紅字一點點變成我的分數，這感覺真痛快！',
    },
    en:{
      intro:'Desert venom slips into every lane—let us see how much power your big cards keep!',
      playerWin:'Tch, you tore straight through my debuff web! Not bad at all.',
      playerLoss:'Haha, turning every enfeebled card on the table into my score feels great!',
    },
    ja:{
      intro:'砂漠の毒霧はどこへでも忍び込むぜ。お前の高ランク札がどこまで持つかな？',
      playerWin:'ちっ、弱体化の網を力業で破られたか！なかなかやるじゃねえか！',
      playerLoss:'ははっ、弱体化した札がまるごと俺の得点になる気分は最高だぜ！',
    },
  },
  dax:{
    'zh-CN':{
      intro:'少废话，在科雷尔监狱牌桌就是用硬拳头说话！接招吧！',
      playerWin:'唔……居然能顶住我的猛攻反手翻盘，算你小子够硬气！',
      playerLoss:'哈哈！挡不住就滚一边去，想报仇就拿出更狠的牌组来！',
    },
    'zh-TW':{
      intro:'少廢話，在科雷爾監獄牌桌就是用硬拳頭說話！接招吧！',
      playerWin:'唔……居然能頂住我的猛攻反手翻盤，算你小子夠硬氣！',
      playerLoss:'哈哈！擋不住就滾一邊去，想報仇就拿出更狠的牌組來！',
    },
    en:{
      intro:'Cut the chatter—out here in Corel Prison, raw muscle talks! Show me what you got!',
      playerWin:'Grr... took my heaviest shots and hit back harder. Alright, you earned that one.',
      playerLoss:'Hah! Folded under pressure! Bring a tougher deck if you want a rematch.',
    },
    ja:{
      intro:'能書きはいい、コレルプリズンじゃ力こそすべてだ！かかってこい！',
      playerWin:'ぐっ……俺の猛攻を受け切って逆転しやがったか。根性だけは認めてやるよ。',
      playerLoss:'ははっ！耐え切れなかったな！やり直したけりゃもっと強いデッキを持ってきな！',
    },
  },
  'wize-3':{
    'zh-CN':{
      intro:'哔哔——怀兹3.0 Ver.2.0 启动！三维格斗战术模块已切换为女王之血模式！',
      playerWin:'警报！警报！战术模型超载……判定：挑战者胜率 100%，请求系统升级。',
      playerLoss:'嘀——胜利确认！完美连段！请投币并重新校准您的出牌算法。',
    },
    'zh-TW':{
      intro:'嗶嗶——懷茲3.0 Ver.2.0 啟動！三維格鬥戰術模組已切換為女王之血模式！',
      playerWin:'警報！警報！戰術模型超載……判定：挑戰者勝率 100%，請求系統升級。',
      playerLoss:'嘀——勝利確認！完美連段！請投幣並重新校準您的出牌演算法。',
    },
    en:{
      intro:'BZZT—Wize 3.0 Ver. 2.0 ONLINE! 3D Brawler combat matrix loaded for Queen’s Blood!',
      playerWin:'WARNING! TACTICAL OVERLOAD! Challenger victory confirmed—scheduling firmware patch.',
      playerLoss:'BEEP! FLAWLESS COMBO! Insert coin and recalibrate your deck heuristics.',
    },
    ja:{
      intro:'ピピッ――ワイズ3.0 Ver.2.0 起動！3Dバトラー演算回路、クイーンズ・ブラッドに最適化完了！',
      playerWin:'警告！予測不能な一手ヲ検出……勝敗判定：挑戦者ノ勝利。アップデートヲ要請シマス。',
      playerLoss:'ピロリン！完全勝利ヲ確認！コインヲ投入シテ戦術アルゴリズムヲ再構築シテクダサイ。',
    },
  },
  oscar:{
    'zh-CN':{
      intro:'在贡加加静心打磨过的友方强化阵，请务必认真接下这一局。',
      playerWin:'畅快！你在我光环成型前就打乱了节奏，真是一场好对局。',
      playerLoss:'稳步堆叠每一格的援护，优势自然会向我这边倾斜。随时欢迎再来！',
    },
    'zh-TW':{
      intro:'在貢加加靜心打磨過的友方強化陣，請務必認真接下這一局。',
      playerWin:'暢快！你在我光環成型前就打亂了節奏，真是一場好對局。',
      playerLoss:'穩步堆疊每一格的援護，優勢自然會向我這邊傾斜。隨時歡迎再來！',
    },
    en:{
      intro:'I honed this buff formation quietly in Gongaga. Give me your best game.',
      playerWin:'Well played! You disrupted my aura network before it could lock the lanes.',
      playerLoss:'Steady buffs win steady matches. Come back anytime for another round!',
    },
    ja:{
      intro:'ゴンガガでじっくり磨き上げた強化布陣だ。全力で相手をしてくれよ。',
      playerWin:'見事だな！連携が整う前に崩されてしまったよ。いい勝負だった！',
      playerLoss:'堅実に味方を支え続ければ、勝負は自然と傾くものさ。またいつでもどうぞ！',
    },
  },
  robin:{
    'zh-CN':{
      intro:'星陨峡谷的风变幻莫测——我的替换与复活牌组也是如此！',
      playerWin:'真有一套！连我最得意的亡语复活都被你算得明明白白。',
      playerLoss:'倒下又站起来，这就是峡谷牌手的韧性！还想再试一盘吗？',
    },
    'zh-TW':{
      intro:'星隕峽谷的風變幻莫測——我的替換與復活牌組也是如此！',
      playerWin:'真有一套！連我最得意的消滅復活都被你算得明明白白。',
      playerLoss:'倒下又站起來，這就是峽谷牌手的韌性！還想再試一盤嗎？',
    },
    en:{
      intro:'The winds of Cosmo Canyon shift fast—just like my replacement and revival deck!',
      playerWin:'Nicely done! You saw right through my resurrection loops and shut them down.',
      playerLoss:'Knock us down and we rise right back up! Up for another whirl?',
    },
    ja:{
      intro:'コスモキャニオンの風は気まぐれだよ――僕の上書きと復活デッキみたいにね！',
      playerWin:'やるなあ！自慢の復活ループまでしっかり封じられちゃったよ。',
      playerLoss:'倒れても何度でも蘇るのが強みなんだ！もう一戦やってみる？',
    },
  },
  kadina:{
    'zh-CN':{
      intro:'星辰运转讲究平衡，强化与弱化的流转亦然。请赐教。',
      playerWin:'好敏锐的洞察力，竟在状态交错的迷阵中寻到了破局之道。',
      playerLoss:'光影相生，失衡则败。待你参透双面之理，我们再战一局。',
    },
    'zh-TW':{
      intro:'星辰運轉講究平衡，強化與弱化的流轉亦然。請賜教。',
      playerWin:'好敏銳的洞察力，竟在狀態交錯的迷陣中尋到了破局之道。',
      playerLoss:'光影相生，失衡則敗。待你參透雙面之理，我們再戰一局。',
    },
    en:{
      intro:'The stars turn in balance, just as buff and debuff intertwine. Shall we begin?',
      playerWin:'Keen insight... you threaded the needle through every status shift.',
      playerLoss:'Light and shadow mirror each other. Study both sides and challenge me again.',
    },
    ja:{
      intro:'星の巡りは調和によって保たれる。強化と弱体化も同じこと……さあ、始めましょう。',
      playerWin:'鋭い洞察ね。状態変化の交錯を見事に読み切られてしまったわ。',
      playerLoss:'光と影は表裏一体。均衡を掴んだら、またいつでも挑んでちょうだい。',
    },
  },
  riana:{
    'zh-CN':{
      intro:'太阳海岸可不止有阳光沙滩，还有我这套疾速强化的冲锋牌组！',
      playerWin:'哇啊，竟然比我的冲锋还猛！你绝对是牌桌上的耀眼明星！',
      playerLoss:'嘻嘻，纵列强化叠起来的冲击力很爽快吧？再来一局热热身！',
    },
    'zh-TW':{
      intro:'太陽海岸可不止有陽光沙灘，還有我這套疾速強化的衝鋒牌組！',
      playerWin:'哇啊，竟然比我的衝鋒還猛！你絕對是牌桌上的耀眼明星！',
      playerLoss:'嘻嘻，縱列強化疊起來的衝擊力很爽快吧？再來一局熱熱身！',
    },
    en:{
      intro:'Costa del Sol is not just sunshine—wait till you feel my high-speed buff charge!',
      playerWin:'Whoa, you hit even harder than my charge! You are a real star at this table!',
      playerLoss:'Hehe, nothing beats a stacked vertical rush! Ready for round two?',
    },
    ja:{
      intro:'コスタ・デル・ソルは海だけじゃないわよ！私の高速強化ラッシュ、受けてみて！',
      playerWin:'きゃっ、私の突撃より鋭いなんて！あなた、なかなかの凄腕ね！',
      playerLoss:'ふふっ、縦の強化を重ねた一撃は爽快でしょ？もう一戦どう？',
    },
  },
  dokaccha:{
    'zh-CN':{
      intro:'太阳海岸的牌局讲究节奏变换——看我用替换连携打乱你的全盘部署！',
      playerWin:'漂亮！连我的阴阳双线切换都被你见招拆招了，佩服佩服。',
      playerLoss:'哈哈，光顾着防正面可不行，替换一落全场形势就逆转啦！',
    },
    'zh-TW':{
      intro:'太陽海岸的牌局講究節奏變換——看我用替換連攜打亂你的全盤部署！',
      playerWin:'漂亮！連我的陰陽雙線切換都被你見招拆招了，佩服佩服。',
      playerLoss:'哈哈，光顧著防正面可不行，替換一落全場形勢就逆轉啦！',
    },
    en:{
      intro:'A good beach duel is all about tempo shifts—watch my replacements flip the script!',
      playerWin:'Slick play! You countered every swap and Yin-Yang pivot I threw at you.',
      playerLoss:'Haha, guard one lane and I replace into another! Want another shot?',
    },
    ja:{
      intro:'リゾート勝負は緩急が命さ――上書きコンボで盤面をひっくり返してやるよ！',
      playerWin:'お見事！イン＆ヤンの切り替えまで完璧にさばかれたか、脱帽だよ。',
      playerLoss:'ははっ、正面ばかり守っちゃダメさ。上書き一手で流れは変わるんだぜ！',
    },
  },
  maahir:{
    'zh-CN':{
      intro:'海风虽暖，牌桌却冷酷无情。若破不了我的削弱与亚历山大之阵，胜负便已注定。',
      playerWin:'精彩绝伦……竟在重重弱化与巨神压迫下完成反超，我心悦诚服。',
      playerLoss:'每一步削弱都在为终局铺路。准备好迎接真正的圣光裁决后再来吧。',
    },
    'zh-TW':{
      intro:'海風雖暖，牌桌卻冷酷無情。若破不了我的削弱與亞歷山大之陣，勝負便已註定。',
      playerWin:'精彩絕倫……竟在重重弱化與巨神壓迫下完成反超，我心悅誠服。',
      playerLoss:'每一步削弱都在為終局鋪路。準備好迎接真正的聖光裁決後再來吧。',
    },
    en:{
      intro:'Warm breeze, cold board. Break through my enfeeblement and Alexander—if you can.',
      playerWin:'Superb... overturning both my debuff web and Alexander’s weight takes real mastery.',
      playerLoss:'Every debuff paves the road to judgment. Refine your line and challenge me again.',
    },
    ja:{
      intro:'海風は穏やかでも、勝負は非情だ。我が弱体化とアレクサンダーの陣を崩せるかな？',
      playerWin:'見事と言うほかない……弱体化と巨神の重圧を覆すとは、完敗だ。',
      playerLoss:'すべての弱体化は終局への布石だ。策を練り直して再び挑みたまえ。',
    },
  },
  dale:{
    'zh-CN':{
      intro:'尼布尔山脚的强者只认硬实力——尝尝巨龙与重甲替换的压迫感吧！',
      playerWin:'轰轰烈烈的一战！连我的高阶重炮阵都被你正面击穿了！',
      playerLoss:'高阶牌一落，胜负立分。去打磨一套更厚重的牌组再来较量吧！',
    },
    'zh-TW':{
      intro:'尼布爾山腳的強者只認硬實力——嚐嚐巨龍與重甲替換的壓迫感吧！',
      playerWin:'轟轟烈烈的一戰！連我的高階重砲陣都被你正面擊穿了！',
      playerLoss:'高階牌一落，勝負立分。去打磨一套更厚重的牌組再來較量吧！',
    },
    en:{
      intro:'At the foot of Mt. Nibel, only heavyweights survive—brace for dragons and towering replacements!',
      playerWin:'What a clash! You smashed straight through my heavy late-game titans!',
      playerLoss:'When rank-three monsters hit the board, the lanes decide themselves. Come back stronger!',
    },
    ja:{
      intro:'ニブル山の麓じゃ実力がすべてだ――ドラゴンと重量級上書きの圧力を味わえ！',
      playerWin:'熱い勝負だった！俺の重厚な高ランク布陣を真っ向から打ち破るとはな！',
      playerLoss:'切り札が盤面に降りれば勝負ありだ。もっと骨太なデッキでまた来いよ！',
    },
  },
  'shadowblood-queen':{
    'zh-CN':{
      intro:'凡人啊，棋盘上的每一道伤痕都将化作我的王冠之力——向黑红之血臣服吧！',
      playerWin:'不可能……在黑红阴影笼罩下，你竟以凡人之躯斩断了女王的执念……',
      playerLoss:'虚弱吧、凋零吧……你的每一张残牌，都在颂扬黑红女王的永恒支配！',
    },
    'zh-TW':{
      intro:'凡人啊，棋盤上的每一道傷痕都將化作我的王冠之力——向黑紅之血臣服吧！',
      playerWin:'不可能……在黑紅陰影籠罩下，你竟以凡人之軀斬斷了女王的執念……',
      playerLoss:'虛弱吧、凋零吧……你的每一張殘牌，都在頌揚黑紅女王的永恆支配！',
    },
    en:{
      intro:'Mortal, every scar upon this board crowns my throne—kneel before the Shadowblood!',
      playerWin:'Impossible... through the crimson veil, a mortal hand has shattered the Queen’s reign...',
      playerLoss:'Wither and weaken... every enfeebled card sings the glory of the Shadowblood Queen!',
    },
    ja:{
      intro:'人の子よ、盤面のすべての傷跡は我が王冠の糧となる――黒紅の血に跪け！',
      playerWin:'馬鹿な……黒紅の呪縛を断ち切り、女王の支配を打ち砕くとは……',
      playerLoss:'弱れ、朽ちよ……弱体化した全ての札が、黒紅の女王に永遠の力を捧げるのだ！',
    },
  },
  'aerith-cruise':{
    'zh-CN':{
      intro:'难得的游轮大赛，我也组了套充满魔晄祝福的牌组哦！请多指教啦～',
      playerWin:'哇，你真的好厉害！看来这艘船上的冠军非你莫属呢。',
      playerLoss:'嘿嘿，魔法壶和光环的配合不错吧？别气馁，下次一定会赢回来的！',
    },
    'zh-TW':{
      intro:'難得的遊輪大賽，我也組了套充滿魔晄祝福的牌組哦！請多指教啦～',
      playerWin:'哇，你真的好厲害！看來這艘船上的冠軍非你莫屬呢。',
      playerLoss:'嘿嘿，魔法壺和光環的配合不錯吧？別氣餒，下次一定會贏回來的！',
    },
    en:{
      intro:'A cruise tournament sounds fun! I built a bright blessing deck just for this—good luck!',
      playerWin:'Wow, you are really good! I think the ship’s trophy already has your name on it.',
      playerLoss:'Hehe, those buffs lined up nicely! Shake it off and show me your comeback next round!',
    },
    ja:{
      intro:'せっかくの船上大会だもん、私も祝福たっぷりのデッキを組んでみたよ！よろしくね！',
      playerWin:'わあ、本当に強いんだね！この大会の優勝はきまりかも！',
      playerLoss:'えへへ、強化の連携ばっちりだったでしょ？落ち込まずに次はリベンジしてね！',
    },
  },
  'barret-cruise':{
    'zh-CN':{
      intro:'别以为老子只会扣扳机！尝尝我这套重炮轰炸牌组的厉害！',
      playerWin:'靠，真有你的！连我的重装火力都被你拆了，继续冲到决赛吧！',
      playerLoss:'哈哈哈哈！看到没有，火力覆盖就是硬道理！再来一局别认怂！',
    },
    'zh-TW':{
      intro:'別以為老子只會扣扳機！嚐嚐我這套重砲轟炸牌組的厲害！',
      playerWin:'靠，真有你的！連我的重裝火力都被你拆了，繼續衝到決賽吧！',
      playerLoss:'哈哈哈哈！看到沒有，火力覆蓋就是硬道理！再來一局別認慫！',
    },
    en:{
      intro:'Think I only know how to pull a trigger? Brace yourself for my heavy artillery deck!',
      playerWin:'Damn, you got guts! Broke right through my barrage—go win the whole damn tourney!',
      playerLoss:'Bahaha! Nothin’ beats heavy firepower! Dust yourself off and run it back!',
    },
    ja:{
      intro:'俺が銃しか扱えねえと思ったら大間違いだ！重火器デッキの威力、食らいやがれ！',
      playerWin:'くそっ、やるじゃねえか！俺の砲撃を突破したんだ、そのまま優勝まで突っ走れ！',
      playerLoss:'ガハハハ！見たか、火力が正義だ！ビビってねえでもう一戦来い！',
    },
  },
  'tifa-cruise':{
    'zh-CN':{
      intro:'半决赛可不能手软哦！接招吧，我的疾风替换连击！',
      playerWin:'好漂亮的节奏！决赛一定要赢下来，我会在观众席为你加油的！',
      playerLoss:'连击手感正热呢！抓住机会反打回来吧，我相信你！',
    },
    'zh-TW':{
      intro:'準決賽可不能手軟哦！接招吧，我的疾風替換連擊！',
      playerWin:'好漂亮的節奏！決賽一定要贏下來，我會在觀眾席為你加油的！',
      playerLoss:'連擊手感正熱呢！抓住機會反打回來吧，我相信你！',
    },
    en:{
      intro:'No holding back in the semifinals! Ready for my rapid replacement combos?',
      playerWin:'What a clean finish! Take the finals too—I will be cheering from the deck!',
      playerLoss:'My combo rhythm is on fire today! Catch your breath and strike back!',
    },
    ja:{
      intro:'準決勝は手加減なしだよ！いくよ、私の疾風コンボデッキ！',
      playerWin:'お見事！決勝もそのまま勝ち切ってね、客席から応援してるから！',
      playerLoss:'今日はコンボの調子がいいみたい！諦めずに次は反撃してね！',
    },
  },
  'red-xiii-overfang':{
    'zh-CN':{
      intro:'嗷呜——新晋冠军，敢在甲板上接受“狂飙兽王”赤红十三的特别挑战吗？',
      playerWin:'哼哼……名副其实的游轮王者！这场酣畅淋漓的表演赛令我永生难忘。',
      playerLoss:'狂飙之牙可不会手下留情！重整阵型，让我见识冠军真正的实力！',
    },
    'zh-TW':{
      intro:'嗷嗚——新晉冠軍，敢在甲板上接受「狂飆獸王」赤紅十三的特別挑戰嗎？',
      playerWin:'哼哼……名副其實的遊輪王者！這場酣暢淋漓的表演賽令我永生難忘。',
      playerLoss:'狂飆之牙可不會手下留情！重整陣型，讓我見識冠軍真正的實力！',
    },
    en:{
      intro:'Awooo—new champion, dare you face Red XIII the Overfang in a special deck exhibition?',
      playerWin:'Hmph... a true champion of the seas! That exhibition was worthy of the title.',
      playerLoss:'The Overfang shows no mercy! Regroup and show me a champion’s true fangs!',
    },
    ja:{
      intro:'アォーン！新チャンピオンよ、甲板で「ぶっとびビースト」の特別試合を受ける勇気はあるか？',
      playerWin:'ふっ……名実ともに船上の王者だな！実に胸のすくエキシビションだったぞ。',
      playerLoss:'野生の牙は容赦しないぞ！体勢を立て直し、王者の真価を見せてみろ！',
    },
  },
};

export const BANTER_OPPONENT_IDS:readonly string[]=Object.freeze(Object.keys(BANTER_TABLE));

function resolveBanterLocale(locale:Locale|string):BanterLocale {
  if(locale==='zh-CN'||locale==='zh-TW'||locale==='en'||locale==='ja')return locale;
  return 'en';
}

/** Retrieve localized FF7 classic dialog-box banter for any world challenger, boss, or cruise tournament rival.
 * Locales outside zh-CN / zh-TW / en / ja fall back cleanly to en. */
export function getChallengerBanter(
  opponentId:string,
  locale:Locale|string='en',
):ChallengerBanter|null {
  const entry=BANTER_TABLE[opponentId];
  if(!entry)return null;
  return entry[resolveBanterLocale(locale)];
}
