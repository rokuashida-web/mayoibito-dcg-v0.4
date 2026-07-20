/* =====================================================================
   cpu-driver-tests.js ―― CPUの進め方（v0.3 Stage C）
   ---------------------------------------------------------------------
   cpu-driver.js の中身を、画面のかわりの受け皿で動かして確かめます。
   ・行動を1つずつ適用しているか（一気に最終結果へ飛ばしていないか）
   ・出せなくなった手を、直前の確認で弾いているか
   ・速度設定が効くか
   ===================================================================== */
const fs = require('fs'), vm = require('vm');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { Game, AiPlayer, AiUiOps } = G;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* --- 画面のかわり ------------------------------------------------- */
const seen = { reveals: [], notices: [], thinking: [], renders: 0, boards: [] };

function fakeEl() {
  const o = { textContent: '', style: {}, _cls: new Set() };
  o.classList = {
    add: c => o._cls.add(c), remove: c => o._cls.delete(c),
    toggle: (c, on) => { on ? o._cls.add(c) : o._cls.delete(c); },
    contains: c => o._cls.has(c),
  };
  o.querySelector = () => fakeElCached(o);
  return o;
}
const subCache = new Map();
function fakeElCached(parent) {
  if (!subCache.has(parent)) subCache.set(parent, fakeEl());
  return subCache.get(parent);
}
const els = { 'cpu-thinking': fakeEl(), 'cpu-reveal': fakeEl() };

/* setTimeout をすぐ実行する（待たずに最後まで進める） */
function immediate(fn) { fn(); return 0; }

const ctx = vm.createContext({
  console: console, Math: Math, JSON: JSON, Date: Date,
  Game: Game, AiPlayer: AiPlayer, AiUiOps: AiUiOps,
  document: { getElementById: id => els[id] || null },
  setTimeout: immediate,
  ms: v => v,
  view: { locked: false, handSelected: -1 },
  match: { mode: 'cpu', humanSide: 'village', ai: {} },
  setCandidate: function () {},
  closeQuickDetail: function () {},
  renderAll: function () {
    seen.renders++;
    // そのときの盤面の枚数を控えて、1手ずつ進んでいることを確かめる
    const p = Game.state.players.mansion;
    seen.boards.push(p.humans.length + p.youkai.length);
  },
  showToast: t => seen.notices.push(t),
  showBanner: function () {}, hideBanner: function () {},
  getCardImagePath: () => '',
  Se: { enabled:true, volume:0.6, play(){}, preview(){} },
  runPendingEffects: function (done) {
    let guard = 0;
    while (!Game.state.gameOver && guard++ < 200) {
      const item = Game.takeNextPending();
      if (!item) break;
      Game.runEffect(item, AiUiOps.create(ctxMatch.ai[item.side] || anyAi, item), function () {});
    }
    done();
  },
  goToEndPhase: function () { seen.endPhase = true; },
  finishWithResult: function () { seen.finished = true; },
});
const CpuDriver = vm.runInContext(fs.readFileSync('js/cpu-driver.js', 'utf8') + '\n;CpuDriver', ctx);
const ctxMatch = ctx.match;
let anyAi = null;

/* 元の reveal を包んで、公開されたカードを記録する */
const origReveal = CpuDriver.reveal;
CpuDriver.reveal = function (inst, next) {
  seen.reveals.push(inst ? inst.master.name : null);
  origReveal.call(CpuDriver, inst, next);
};

/* --- 局面を用意して1ターン走らせる ------------------------------- */
function runOneTurn(seed, difficulty) {
  seen.reveals = []; seen.notices = []; seen.boards = [];
  seen.endPhase = false; seen.finished = false;

  Game.hiddenSide = 'mansion';
  Game.start('mansion', seed, {
    decks: { village: 'village', mansion: 'mansion' },
    labels: { village: 'あなた', mansion: 'CPU' },
  });
  Game.confirmMulligan('village', []);
  Game.confirmMulligan('mansion', []);

  anyAi = AiPlayer.create('mansion', difficulty || 'strong', seed + ':m');
  ctxMatch.ai = { mansion: anyAi };

  Game.beginTurn('mansion');
  Game.turnStartResources('mansion');
  Game.state.players.mansion.energy = 6;   // 何手か打てるようにしておく

  CpuDriver.busy = false;
  CpuDriver.runTurn('mansion');
}

console.log('■ CPUが自分のターンを最後まで進める');
runOneTurn('DRV-1');
check('ターン終了まで到達した', seen.endPhase === true);
check('使うカードを一時公開している', seen.reveals.length >= 1, seen.reveals.join('／'));
check('行動を通知している', seen.notices.length >= 1, seen.notices[0]);
check('進行の鍵が解放されている', CpuDriver.busy === false);

console.log('\n■ 一気に最終結果へ飛ばしていないか（仕様書 4.2）');
{
  // 盤面の枚数が、途中で1ずつ増えている＝1手ずつ適用している
  const steps = seen.boards.filter((v, i, a) => i === 0 || v !== a[i - 1]);
  check('盤面が段階的に変化している', steps.length >= 2, steps.join(' → '));
}

console.log('\n■ 出せなくなった手を直前に弾く（合法性の再確認）');
{
  runOneTurn('DRV-2');
  const side = 'mansion';
  const inst = Game.state.players[side].hand[0];
  // 手札にないカードは弾かれる
  check('手札にないカードは弾く',
    CpuDriver._stillLegal(side, { kind: 'PLAY_YOUKAI', inst: { master: {}, cardId: 'x' } }) === false);
  // 気力0では出せない
  const before = Game.state.players[side].energy;
  Game.state.players[side].energy = 0;
  const costly = Game.state.players[side].hand.find(c => (c.master.cost || 0) > 0);
  if (costly) {
    check('気力が足りない手は弾く',
      CpuDriver._stillLegal(side, { kind: 'PLAY_YOUKAI', inst: costly }) === false,
      costly.master.name);
  }
  Game.state.players[side].energy = before;
  check('PASSは常に通る', CpuDriver._stillLegal(side, { kind: 'PASS' }) === true);
}

console.log('\n■ 二重起動よけ（仕様書 28）');
{
  runOneTurn('DRV-3');
  CpuDriver.busy = true;
  const before = seen.reveals.length;
  CpuDriver.runTurn('mansion');
  check('進行中に呼んでも二重に動かない', seen.reveals.length === before);
  CpuDriver.busy = false;
}

console.log('\n■ 行動速度（仕様書 16）');
{
  CpuDriver.speed = 'normal';
  const n = CpuDriver.gap('reveal');
  CpuDriver.speed = 'fast';
  const f = CpuDriver.gap('reveal');
  check('高速のほうが短い', f < n, '標準' + n + 'ms / 高速' + f + 'ms');
  CpuDriver.speed = 'normal';
}

console.log('\n■ 難易度5段階すべてで1ターン回る');
['weak', 'normal', 'strong', 'expert', 'unfair'].forEach(function (d) {
  let err = null;
  try { runOneTurn('DIFF-' + d, d); } catch (e) { err = e.message; }
  check(d + ' が最後まで進む', !err && seen.endPhase === true, err || '');
});

console.log('\n' + (fail === 0
  ? '===== CPUの進め方：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
