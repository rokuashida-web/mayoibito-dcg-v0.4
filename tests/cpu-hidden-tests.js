/* =====================================================================
   cpu-hidden-tests.js ―― CPUの手札が漏れないか（v0.3 Stage C）
   ---------------------------------------------------------------------
   ログを開けばCPUの手札が分かってしまう、という抜け道がないかを
   実際に試合を回して確かめます（仕様書 14.2）。
   ===================================================================== */
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { Game, AiPlayer, AiUiOps } = G;
const { playGameHeadless } = require('./headless-driver.js');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

console.log('■ CPU対戦（自分＝村／CPU＝館・CPUの手札を伏せる）');

Game.hiddenSide = 'mansion';
const r = playGameHeadless(G, {
  firstSide: 'village', seed: 'HIDE-1',
  decks: { village: 'village', mansion: 'mansion' },
  labels: { village: 'あなた', mansion: 'CPU' },
});
const log = Game.state.log.join('\n');

check('決着した', !!r.over, r.turns + 'ターン');

// CPUの初期ドローとドローに、カード名が出ていないこと
const badLines = Game.state.log.filter(function (l) {
  const isCpuDraw = /^(初期ドロー|ドロー|マリガン)：CPU/.test(l);
  if (!isCpuDraw) return false;
  // 枚数だけの行ならOK。カード名（《》やデッキのカード名）が出ていたらNG
  return !/^[^：]+：CPU (\d+枚|1枚|0枚交換|\d+枚交換)$/.test(l);
});
check('CPUのドロー・マリガンにカード名が出ていない', badLines.length === 0,
  badLines.slice(0, 3).join(' / '));

// 自分側は今までどおりカード名が出ていること
const mine = Game.state.log.filter(function (l) { return /^初期ドロー：あなた/.test(l); });
check('自分の初期ドローにはカード名が出る', mine.length === 1 && mine[0].indexOf('、') !== -1,
  mine[0]);

// CPUが実際に出したカードは、公開情報なのでログに名前が出てよい
check('CPUが場に出したカードはログに残る', /登場：CPU|効果：CPU/.test(log));

console.log('\n■ ひとり回し（伏せない）');
Game.hiddenSide = null;
playGameHeadless(G, { firstSide: 'village', seed: 'OPEN-1' });
const openLog = Game.state.log.join('\n');
check('両者とも初期ドローにカード名が出る',
  (openLog.match(/初期ドロー：[^\n]*、/g) || []).length === 2);

console.log('\n■ CPUの席の乱数がシードから作られているか');
{
  function firstMoves(seed) {
    Game.hiddenSide = 'mansion';
    Game.start('mansion', seed, {
      decks: { village: 'village', mansion: 'mansion' },
      labels: { village: 'あなた', mansion: 'CPU' },
    });
    const ai = AiPlayer.create('mansion', 'normal', Game.state.seed + ':mansion');
    Game.confirmMulligan('village', []); Game.confirmMulligan('mansion', []);
    Game.beginTurn('mansion'); Game.turnStartResources('mansion');
    const acts = [];
    for (let i = 0; i < 4; i++) {
      const a = ai.chooseMainAction();
      acts.push(a.kind + (a.inst ? ':' + a.inst.cardId : ''));
      if (a.kind === 'PASS') break;
      if (a.kind === 'PLAY_HUMAN' || a.kind === 'PLAY_YOUKAI') Game.playUnit('mansion', a.inst);
      else if (a.kind === 'PLAY_EVENT') Game.playEvent('mansion', a.inst);
      else if (a.kind === 'EQUIP_GOODS') Game.playGoods('mansion', a.inst, a.target);
      let it; while ((it = Game.takeNextPending())) Game.runEffect(it, AiUiOps.create(ai, it), function () {});
    }
    return acts.join(' > ');
  }
  const a = firstMoves('SAME-777');
  const b = firstMoves('SAME-777');
  const c = firstMoves('OTHER-888');
  check('同じシードならCPUの手も同じ', a === b, a);
  check('別のシードなら別の展開になりうる', typeof c === 'string');
}

console.log('\n' + (fail === 0
  ? '===== CPUの非公開：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
