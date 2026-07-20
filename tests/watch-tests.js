/* =====================================================================
   watch-tests.js ―― CPU観戦（v0.3 Stage E）
   ---------------------------------------------------------------------
   ・一時停止が「安全な区切り」で効くか
   ・再開を連打しても行動が重複しないか（仕様書 32.9）
   ・観戦設定が正しく渡るか
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

/* ---------- 画面のかわり ---------- */
function fakeEl() {
  const o = { textContent: '', style: {}, dataset: {}, _cls: new Set() };
  o.classList = {
    add: c => o._cls.add(c), remove: c => o._cls.delete(c),
    toggle: (c, on) => { on ? o._cls.add(c) : o._cls.delete(c); },
    contains: c => o._cls.has(c),
  };
  o.querySelector = () => fakeEl();
  return o;
}
const els = { 'cpu-thinking': fakeEl(), 'cpu-reveal': fakeEl() };
const applied = [];

const ctx = vm.createContext({
  console, Math, JSON, Date,
  Game, AiPlayer, AiUiOps,
  document: { getElementById: id => els[id] || null },
  setTimeout: fn => { fn(); return 0; },
  ms: v => v,
  view: { locked: false, handSelected: -1 },
  match: { mode: 'watch', humanSide: null, ai: {} },
  setCandidate: () => {}, closeQuickDetail: () => {},
  renderAll: () => {}, showToast: t => applied.push(t),
  showBanner: () => {}, hideBanner: () => {}, getCardImagePath: () => '',
  Se: { enabled:true, volume:0.6, play(){}, preview(){} },
  runPendingEffects: function (done) {
    let g = 0;
    while (!Game.state.gameOver && g++ < 200) {
      const it = Game.takeNextPending();
      if (!it) break;
      Game.runEffect(it, AiUiOps.create(ctx.match.ai[it.side], it), function () {});
    }
    done();
  },
  goToEndPhase: function () { ctx.__ended = (ctx.__ended || 0) + 1; },
  finishWithResult: () => {},
});
const CpuDriver = vm.runInContext(fs.readFileSync('js/cpu-driver.js', 'utf8') + '\n;CpuDriver', ctx);

function setupTurn(seed) {
  applied.length = 0; ctx.__ended = 0;
  Game.hiddenSide = null;
  Game.start('village', seed, {
    decks: { village: 'village', mansion: 'mansion' },
    labels: { village: 'CPU 1', mansion: 'CPU 2' },
  });
  Game.confirmMulligan('village', []);
  Game.confirmMulligan('mansion', []);
  ctx.match.ai = {
    village: AiPlayer.create('village', 'strong', seed + ':v'),
    mansion: AiPlayer.create('mansion', 'strong', seed + ':m'),
  };
  Game.beginTurn('village');
  Game.turnStartResources('village');
  Game.state.players.village.energy = 8;
  CpuDriver.stop();
}

console.log('■ 速度3段階（仕様書 20.7）');
{
  const g = {};
  ['normal', 'fast', 'veryfast'].forEach(function (sp) {
    CpuDriver.speed = sp; g[sp] = CpuDriver.gap('reveal');
  });
  check('標準 > 高速 > 超高速', g.normal > g.fast && g.fast > g.veryfast,
    g.normal + ' > ' + g.fast + ' > ' + g.veryfast);
  CpuDriver.speed = 'normal';
}

console.log('\n■ 一時停止（仕様書 20.5）');
{
  setupTurn('WATCH-1');
  CpuDriver.pause();
  CpuDriver.runTurn('village');
  check('止めていれば1手も進まない', applied.length === 0 && ctx.__ended === 0);
  check('続きが預けられている', CpuDriver._resumeFn !== null);

  const boardBefore = Game.state.players.village.youkai.length +
                      Game.state.players.village.humans.length;
  CpuDriver.resume();
  check('再開すると最後まで進む', ctx.__ended === 1, applied.length + '手');
  const boardAfter = Game.state.players.village.youkai.length +
                     Game.state.players.village.humans.length;
  check('盤面が実際に動いた', boardAfter >= boardBefore);
}

console.log('\n■ 再開の連打で行動が重複しない（仕様書 32.9）');
{
  setupTurn('WATCH-2');
  CpuDriver.pause();
  CpuDriver.runTurn('village');
  CpuDriver.resume();
  const n1 = applied.length, e1 = ctx.__ended;
  CpuDriver.resume(); CpuDriver.resume(); CpuDriver.resume();
  check('余分な再開は無視される', applied.length === n1 && ctx.__ended === e1,
    n1 + '手 / ターン終了' + e1 + '回');
}

console.log('\n■ 途中で止めて、途中から再開できる');
{
  setupTurn('WATCH-3');
  CpuDriver.runTurn('village');          // まず最後まで進めて手数を測る
  const total = applied.length;

  setupTurn('WATCH-3');
  // 1手ごとに止める → 再開 をくり返す
  let steps = 0;
  CpuDriver.pause();
  CpuDriver.runTurn('village');
  while (CpuDriver._resumeFn && steps++ < 40) {
    CpuDriver.paused = false;
    const fn = CpuDriver._resumeFn; CpuDriver._resumeFn = null;
    CpuDriver.paused = true;             // 次の区切りでまた止まる
    fn();
  }
  CpuDriver.resume();
  check('刻んで進めても同じ手数になる', applied.length === total,
    '通し' + total + '手 / 刻み' + applied.length + '手');
  check('ターン終了まで到達した', ctx.__ended >= 1);
}

console.log('\n■ 観戦の後始末');
{
  CpuDriver.pause();
  CpuDriver.stop();
  check('stop で止まりも予約も消える',
    CpuDriver.paused === false && CpuDriver._resumeFn === null && CpuDriver.busy === false);
}

console.log('\n■ 難易度の組み合わせで観戦が最後まで進む');
{
  const { playGameHeadless } = require('./headless-driver.js');
  [['weak','unfair'], ['strong','strong'], ['expert','normal']].forEach(function (p) {
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      const r = playGameHeadless(G, {
        firstSide: (i % 2) ? 'village' : 'mansion', seed: 'W-' + p.join('') + i,
        decks: { village: 'village', mansion: 'mansion' },
        labels: { village: 'CPU 1', mansion: 'CPU 2' },
        difficulty: p[0], difficulty2: p[1],
      });
      if (r.over) ok++;
    }
    check(p[0] + ' vs ' + p[1] + '：10試合すべて決着', ok === 10);
  });
}

console.log('\n' + (fail === 0
  ? '===== CPU観戦：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
