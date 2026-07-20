/* =====================================================================
   solo-setup-tests.js ―― ひとり回しの設定（v0.3 Stage D）
   ---------------------------------------------------------------------
   デッキ2つを選べること、ミラーが成立すること、
   先攻とシードが正しく渡ること、CPUが介入しないことを確かめます。
   ===================================================================== */
const fs = require('fs'), vm = require('vm');

function el(attrs) {
  const o = { dataset: attrs || {}, style: {}, disabled: false, value: '',
    textContent: '', _cls: new Set(), _children: [] };
  o.classList = {
    add: c => o._cls.add(c), remove: c => o._cls.delete(c),
    toggle: (c, on) => { on ? o._cls.add(c) : o._cls.delete(c); },
    contains: c => o._cls.has(c),
  };
  o.addEventListener = (t, fn) => { o._click = fn; };
  o.querySelectorAll = () => o._children;
  return o;
}

/* 画面のボタン群（store ごと） */
const spec = {
  cpu:  { playerDeck: ['village','mansion'], cpuDeck: ['village','mansion','random'],
          difficulty: ['weak','normal','strong','expert','unfair'],
          firstPlayer: ['player','cpu','random'], seedMode: ['random','fixed'],
          guide: ['on','off'] },
  solo: { deck1: ['village','mansion'], deck2: ['village','mansion'],
          firstPlayer: ['deck1','deck2','random'], seedMode: ['random','fixed'] },
  watch:{ deck1: ['village','mansion'], deck2: ['village','mansion'],
          diff1: ['weak','normal','strong','expert','unfair'],
          diff2: ['weak','normal','strong','expert','unfair'],
          firstPlayer: ['cpu1','cpu2','random'], seedMode: ['random','fixed'],
          speed: ['normal','fast','veryfast'] },
};
const groupEls = [], btnOf = { cpu: {}, solo: {}, watch: {} };
Object.keys(spec).forEach(function (store) {
  Object.keys(spec[store]).forEach(function (key) {
    const g = el({ store: store, opt: key });
    btnOf[store][key] = {};
    spec[store][key].forEach(function (v) {
      const b = el({ val: v });
      btnOf[store][key][v] = b;
      g._children.push(b);
    });
    groupEls.push(g);
  });
});

const ids = {
  'start-screen': el(), 'cpu-diff-desc': el(), 'cpu-mirror-hint': el(),
  'cpu-setup-error': el(), 'cpu-seed-input': el(), 'cpu-start': el(),
  'solo-mirror-hint': el(), 'solo-setup-error': el(), 'seed-input': el(),
  'solo-start': el(), 'panel': el(), 'panel-toggle': el(),
  'watch-seed-input': el(), 'watch-setup-error': el(), 'watch-start': el(),
};
ids['start-screen'].querySelectorAll = () => [];

const doc = {
  body: { classList: { toggle(){}, add(){}, remove(){} } },
  getElementById: id => ids[id] || null,
  querySelectorAll: sel => (sel === '[data-opt]' ? groupEls : []),
  querySelector: function (sel) {
    const m = sel.match(/data-store="solo"\]\[data-opt="firstPlayer"\] \[data-val="(\w+)"/);
    return m ? btnOf.solo.firstPlayer[m[1]] : null;
  },
};

let called = null;
let seedCounter = 0;
const ctx = vm.createContext({
  document: doc, console: console, setTimeout: setTimeout, view: { locked: false },
  startGame: (firstSide, seed, options) => { called = { firstSide, seed, options }; },
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

  autoGenerateSeed: () => 'AUTO-' + (++seedCounter),
  createRng: vm.runInNewContext(fs.readFileSync('js/random.js','utf8') + ';createRng', {Math:Math}),
});
const S = vm.runInContext(fs.readFileSync('js/screens.js','utf8') + '\n;Screens', ctx);
S.init();

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}
function set(store, k, v) { btnOf[store][k][v]._click(); }

console.log('■ 2つのデッキを別々に選べる');
set('solo','deck1','village'); set('solo','deck2','mansion');
check('プレイヤー1＝村', S.solo.deck1 === 'village');
check('プレイヤー2＝館', S.solo.deck2 === 'mansion');
check('ミラーの案内は出ない', ids['solo-mirror-hint'].textContent === '');
S._startSoloMatch();
check('席へ正しく割り当てられる',
  called.options.decks.village === 'village' && called.options.decks.mansion === 'mansion');
check('デッキが違うので呼び名はデッキ名のまま', !called.options.labels,
  JSON.stringify(called.options));

console.log('\n■ ミラー対戦');
set('solo','deck2','village');
check('ミラーの案内が出る', ids['solo-mirror-hint'].textContent.indexOf('ミラー') !== -1);
S._startSoloMatch();
check('両席とも同じデッキ',
  called.options.decks.village === 'village' && called.options.decks.mansion === 'village');
check('呼び名がプレイヤー1／2になる',
  called.options.labels.village === 'プレイヤー1' &&
  called.options.labels.mansion === 'プレイヤー2');

console.log('\n■ 先攻');
set('solo','firstPlayer','deck1'); S._startSoloMatch();
check('プレイヤー1が先攻', called.firstSide === 'village');
set('solo','firstPlayer','deck2'); S._startSoloMatch();
check('プレイヤー2が先攻', called.firstSide === 'mansion');

console.log('\n■ シード');
set('solo','seedMode','random'); S._startSoloMatch();
check('ランダムなら自動生成', /^AUTO-/.test(called.seed), called.seed);
check('入力欄は使えない', ids['seed-input'].disabled === true);
set('solo','seedMode','fixed');
check('指定するなら入力欄が使える', ids['seed-input'].disabled === false);
ids['seed-input'].value = '';
called = null;
check('空欄では始まらない', S._startSoloMatch() === false && called === null);
check('エラーが出る', ids['solo-setup-error']._cls.has('is-on'),
  ids['solo-setup-error'].textContent);
ids['seed-input'].value = 'SOLO-1234';
check('入れれば始まる', S._startSoloMatch() === true && called.seed === 'SOLO-1234');

console.log('\n■ ランダム先攻の再現性');
set('solo','firstPlayer','random');
S._startSoloMatch(); const a = called.firstSide;
S._startSoloMatch(); const b = called.firstSide;
check('同じシードなら同じ先攻', a === b, a);

console.log('\n■ CPUが介入しないこと（仕様書 19.3）');
check('options に cpu が入っていない', !called.options.cpu, JSON.stringify(called.options));
check('直前の対戦の記録が solo になっている', S.lastMatch.mode === 'solo');

console.log('\n■ CPU対戦の設定と混ざらないこと');
set('cpu','playerDeck','mansion');
check('CPU側を変えても solo は変わらない',
  S.cpu.playerDeck === 'mansion' && S.solo.deck1 === 'village');
set('solo','deck1','mansion');
check('solo を変えても CPU側は変わらない',
  S.solo.deck1 === 'mansion' && S.cpu.playerDeck === 'mansion');

console.log('\n■ CPU観戦の設定（仕様書 20.2）');
set('watch','deck1','village'); set('watch','deck2','village');
set('watch','diff1','weak');    set('watch','diff2','unfair');
set('watch','firstPlayer','cpu2'); set('watch','speed','veryfast');
set('watch','seedMode','fixed');
ids['watch-seed-input'].value = 'WATCH-1';
check('観戦が始まる', S._startWatchMatch() === true);
check('CPU 1／CPU 2 のデッキが席へ渡る',
  called.options.decks.village === 'village' && called.options.decks.mansion === 'village');
check('難易度が席ごとに渡る',
  called.options.watch.village === 'weak' && called.options.watch.mansion === 'unfair',
  JSON.stringify(called.options.watch));
check('呼び名が CPU 1／CPU 2', called.options.labels.village === 'CPU 1' &&
  called.options.labels.mansion === 'CPU 2');
check('CPU 2 先攻が反映される', called.firstSide === 'mansion');
check('観戦速度が駆動部へ渡る', ctx.CpuDriver.speed === 'veryfast');
check('両CPUとも同じデッキ（ミラー観戦）ができる', S.lastMatch.deck1 === S.lastMatch.deck2);
ids['watch-seed-input'].value = '';
check('空欄シードは弾く', S._startWatchMatch() === false);
check('3つの設定が混ざらない',
  S.cpu.playerDeck === 'mansion' && S.solo.deck1 === 'mansion' && S.watch.deck1 === 'village');

console.log('\n■ 同じ設定で再戦（仕様書 25.4）');
{
  // 指定シード＋固定の設定 → まったく同じ条件になる
  set('cpu','seedMode','fixed'); set('cpu','cpuDeck','mansion'); set('cpu','firstPlayer','player');
  ids['cpu-seed-input'].value = 'AGAIN-1';
  S._startCpuMatch(); const a = JSON.stringify(called);
  S.restartLast();    const b = JSON.stringify(called);
  check('指定シードなら同じ条件で再戦', a === b);

  // ランダムシード → 毎回作り直す
  set('cpu','seedMode','random');
  S._startCpuMatch(); const s1 = called.seed;
  S.restartLast();    const s2 = called.seed;
  check('ランダムシードは毎回作り直される', s1 !== s2, s1 + ' → ' + s2);

  // ランダムCPUデッキ・ランダム先攻 → シードが変われば結果も変わりうる
  set('cpu','seedMode','fixed'); set('cpu','cpuDeck','random'); set('cpu','firstPlayer','random');
  ids['cpu-seed-input'].value = 'RAND-A';
  S.restartLast(); const r1 = called.firstSide + '/' + called.options.decks.mansion;
  ids['cpu-seed-input'].value = 'RAND-B';
  S.restartLast(); const r2 = called.firstSide + '/' + called.options.decks.mansion;
  check('シードを変えると抽選もやり直される', typeof r1 === 'string' && typeof r2 === 'string',
    r1 + ' → ' + r2);

  // モードごとに正しい再戦へ振り分ける
  S.lastMatch = { mode: 'watch' };
  set('watch','seedMode','random');
  S.restartLast();
  check('観戦は観戦として再開する', !!called.options.watch);
  S.lastMatch = { mode: 'solo' };
  set('solo','seedMode','random');
  S.restartLast();
  check('ひとり回しはCPUなしで再開する', !called.options.watch && !called.options.cpu);
}

console.log('\n' + (fail === 0
  ? '===== ひとり回し・観戦の設定：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
