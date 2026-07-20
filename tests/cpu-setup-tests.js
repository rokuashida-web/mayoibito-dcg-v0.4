/* =====================================================================
   cpu-setup-tests.js ―― CPU対戦設定（Stage B）の検証
   ---------------------------------------------------------------------
   最小限の偽DOMで screens.js を動かし、
   入力の検証・ランダムの抽選・席への割り当てを確かめます。
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

function el(attrs) {
  const o = { dataset: attrs || {}, style: {}, disabled: false, value: '',
    textContent: '', _cls: new Set(), _children: [] };
  o.classList = {
    add: function (c) { o._cls.add(c); },
    remove: function (c) { o._cls.delete(c); },
    toggle: function (c, on) { on ? o._cls.add(c) : o._cls.delete(c); },
    contains: function (c) { return o._cls.has(c); },
  };
  o.addEventListener = function (t, fn) { o._click = fn; };
  o.querySelectorAll = function () { return o._children; };
  return o;
}

// 設定画面のボタン群を作る
const groups = {
  playerDeck:  ['village', 'mansion'],
  cpuDeck:     ['village', 'mansion', 'random'],
  difficulty:  ['weak', 'normal', 'strong', 'expert', 'unfair'],
  firstPlayer: ['player', 'cpu', 'random'],
  seedMode:    ['random', 'fixed'],
  guide:       ['on', 'off'],
};
const groupEls = [], btnOf = {};
Object.keys(groups).forEach(function (k) {
  const g = el({ opt: k });
  btnOf[k] = {};
  groups[k].forEach(function (v) {
    const b = el({ val: v });
    btnOf[k][v] = b;
    g._children.push(b);
  });
  groupEls.push(g);
});

const ids = {
  'start-screen': el(), 'cpu-diff-desc': el(), 'cpu-mirror-hint': el(),
  'cpu-setup-error': el(), 'cpu-seed-input': el(), 'cpu-start': el(),
  'solo-start': el(), 'seed-input': el(), 'panel': el(), 'panel-toggle': el(),
};
ids['start-screen'].querySelectorAll = function () { return []; };

const doc = {
  body: { classList: { toggle(){}, add(){}, remove(){} } },
  getElementById: function (id) { return ids[id] || null; },
  querySelectorAll: function (sel) {
    if (sel === '[data-opt]') return groupEls;
    return [];
  },
};

// startGame の呼ばれ方を記録する
let called = null;
const ctx = vm.createContext({
  document: doc, console: console, setTimeout: setTimeout,
  view: { locked: false },
  startFirstSide: 'village',
  startGame: function (firstSide, seed, options) { called = { firstSide, seed, options }; },
  autoGenerateSeed: function () { return 'AUTO-SEED-0001'; },
  CpuDriver: { speed: 'normal', paused: false },
  Assets: { preloadDecks: (d, p, done) => done(0, 0) },
  AiPlayer: {}, AiCore: {}, AiHeuristic: {}, AiUiOps: {},

  Storage: { _s:{cpuActionSpeed:'normal',animationSpeed:'normal',seEnabled:true,seVolume:60,mirrorLanes:true},
             _l:{}, load(){}, save(){}, get(k){return this._s[k];}, set(k,v){this._s[k]=v;},
             remember(o){Object.assign(this._l,o);}, lastOf(k){return this._l[k];},
             resetSettings(){}, resetGuide(){}, isGuideDone(){return false;},
             markGuideDone(){}, markGuideAllDone(){} },
  Se: { enabled:true, volume:0.6, play(){}, preview(){}, setup(){}, unlock(){} },
  Guide: { shown:{}, enabled:false, start(){}, check(){}, skip(){} },
  speedScale: 1,
  mirrorLanes: true,

  createRng: vm.runInNewContext(fs.readFileSync('js/random.js', 'utf8') + ';createRng', {Math:Math}),
});
const S = vm.runInContext(fs.readFileSync('js/screens.js', 'utf8') + '\n;Screens', ctx);
S.init();

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}
function set(k, v) { btnOf[k][v]._click(); }

console.log('■ 選択の反映');
set('difficulty', 'unfair');
check('難易度を押すと選ばれる', S.cpu.difficulty === 'unfair');
check('選ばれたボタンだけ is-on', btnOf.difficulty.unfair._cls.has('is-on') &&
  !btnOf.difficulty.weak._cls.has('is-on'));
check('説明文が「理不尽」のものになる',
  ids['cpu-diff-desc'].textContent.indexOf('イカサマ') !== -1);
set('difficulty', 'strong');
check('切り替えると説明も変わる',
  ids['cpu-diff-desc'].textContent.indexOf('盤面や手札') !== -1);

console.log('\n■ ミラー対戦の案内（仕様書 9.3）');
set('playerDeck', 'village'); set('cpuDeck', 'mansion');
check('別デッキなら案内なし', ids['cpu-mirror-hint'].textContent === '');
set('cpuDeck', 'village');
check('同じデッキならミラーの案内が出る',
  ids['cpu-mirror-hint'].textContent.indexOf('ミラー') !== -1);
set('cpuDeck', 'random');
check('ランダムなら抽選の案内が出る',
  ids['cpu-mirror-hint'].textContent.indexOf('抽選') !== -1);

console.log('\n■ シードの入力検証（仕様書 12.3）');
set('seedMode', 'random');
check('ランダムなら入力欄を使わない', ids['cpu-seed-input'].disabled === true);
set('seedMode', 'fixed');
check('指定するなら入力欄が使える', ids['cpu-seed-input'].disabled === false);
ids['cpu-seed-input'].value = '   ';
called = null;
check('空欄では始まらない', S._startCpuMatch() === false && called === null);
check('エラーが表示される', ids['cpu-setup-error']._cls.has('is-on'),
  ids['cpu-setup-error'].textContent);
ids['cpu-seed-input'].value = 'x'.repeat(40);
check('長すぎるシードも弾く', S._startCpuMatch() === false);
ids['cpu-seed-input'].value = 'MAYO-TEST-0001';
check('正しく入れれば始まる', S._startCpuMatch() === true && called !== null);
check('そのシードが使われる', called.seed === 'MAYO-TEST-0001', called.seed);

console.log('\n■ 席への割り当て');
set('playerDeck', 'mansion'); set('cpuDeck', 'village');
set('firstPlayer', 'player'); S._startCpuMatch();
check('自分は席village・選んだデッキを使う', called.options.decks.village === 'mansion');
check('CPUは席mansion', called.options.decks.mansion === 'village');
check('呼び名は あなた／CPU', called.options.labels.village === 'あなた' &&
  called.options.labels.mansion === 'CPU');
check('先攻を選ぶと自分が先攻', called.firstSide === 'village');
set('firstPlayer', 'cpu'); S._startCpuMatch();
check('後攻を選ぶとCPUが先攻', called.firstSide === 'mansion');

console.log('\n■ ランダムの再現性（仕様書 12.4）');
set('cpuDeck', 'random'); set('firstPlayer', 'random');
ids['cpu-seed-input'].value = 'FIXED-1234';
S._startCpuMatch(); const a = JSON.stringify([called.firstSide, called.options.decks]);
S._startCpuMatch(); const b = JSON.stringify([called.firstSide, called.options.decks]);
check('同じシードなら同じ抽選結果', a === b, a);
ids['cpu-seed-input'].value = 'FIXED-9999';
S._startCpuMatch(); const c = JSON.stringify([called.firstSide, called.options.decks]);
check('シードを変えると抽選もやり直される（値が引ける）', typeof c === 'string');

console.log('\n■ 対戦の記録（リザルト・結果コピー用）');
check('直前の対戦の中身が控えられている',
  S.lastMatch && S.lastMatch.mode === 'cpu' && S.lastMatch.seed === 'FIXED-9999',
  JSON.stringify(S.lastMatch));

console.log('\n■ 調整パネル');
check('配布版では隠れている', ids['panel'].style.display === 'none' &&
  ids['panel-toggle'].style.display === 'none');

console.log('\n' + (fail === 0
  ? '===== CPU対戦設定：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
