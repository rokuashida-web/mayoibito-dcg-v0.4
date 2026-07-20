/* screens.js の画面遷移だけを、最小限の偽DOMで確かめる */
const fs = require('fs'), vm = require('vm');

function makeEl(attrs) {
  return {
    dataset: attrs || {}, style: {}, disabled: false,
    _cls: new Set(),
    classList: {
      add: function (c) { this._o._cls.add(c); },
      remove: function (c) { this._o._cls.delete(c); },
      toggle: function (c, on) { on ? this._o._cls.add(c) : this._o._cls.delete(c); },
      contains: function (c) { return this._o._cls.has(c); },
    },
    addEventListener: function () {},
    querySelectorAll: function () { return []; },
  };
}
function wire(el) { el.classList._o = el; return el; }

const layer = wire(makeEl());
const secs = ['start','mode','battle-mode','card-mode','dev-mode',
              'deck-list','deck-view','deck-edit','field-select','card-list','cpu-setup','solo-setup','watch-setup','howto','options']
  .map(function (n) { return wire(makeEl({ screen: n })); });
layer.querySelectorAll = function () { return secs; };

const doc = {
  getElementById: function (id) { return id === 'start-screen' ? layer : null; },
  querySelectorAll: function () { return []; },
};
const ctx = vm.createContext({
  document: doc, console: console, view: { locked: false }, setTimeout: setTimeout,
  Storage: { _s:{cpuActionSpeed:'normal',animationSpeed:'normal',seEnabled:true,seVolume:60,mirrorLanes:true},
             _l:{}, load(){}, save(){}, get(k){return this._s[k];}, set(k,v){this._s[k]=v;},
             remember(o){Object.assign(this._l,o);}, lastOf(k){return this._l[k];},
             resetSettings(){}, resetGuide(){}, isGuideDone(){return false;},
             markGuideDone(){}, markGuideAllDone(){} },
  Se: { enabled:true, volume:0.6, play(){}, preview(){}, setup(){}, unlock(){} },
  Guide: { shown:{}, enabled:false, start(){}, check(){}, skip(){} },
  CpuDriver: { speed:'normal', paused:false },
  speedScale: 1,
  mirrorLanes: true,
});
const S = vm.runInContext(fs.readFileSync('js/screens.js', 'utf8') + '\n;Screens', ctx);

function now() { return secs.filter(function (s) { return s._cls.has('is-open'); }).map(function (s) { return s.dataset.screen; }).join(','); }
function check(label, expect) {
  const got = now();
  console.log((got === expect ? '[○] ' : '[×] ') + label + ' → ' + got + (got === expect ? '' : '（期待:' + expect + '）'));
  return got === expect;
}

let ok = true;
/* v0.4 の画面階層（仕様書 4）
   スタート → モード選択 →（対戦／カード／設定）→ 各設定画面 */
S.reset('start');                     ok &= check('起動 → スタート画面', 'start');
S.go('mode');                         ok &= check('タップ → モード選択', 'mode');
S.go('battle-mode');                  ok &= check('対戦 → 対戦モード選択', 'battle-mode');
S.go('cpu-setup');                    ok &= check('CPU対戦へ', 'cpu-setup');
S.back();                             ok &= check('戻る → 対戦モード選択', 'battle-mode');
S.back();                             ok &= check('戻る → モード選択', 'mode');
S.back();                             ok &= check('戻る → スタート画面', 'start');
S.back();                             ok &= check('スタート画面で戻る → そのまま', 'start');

S.reset('mode');
S.go('card-mode');                    ok &= check('カード → カードモード選択', 'card-mode');
S.back();                             ok &= check('戻る → モード選択', 'mode');
S.go('battle-mode');
S.go('dev-mode');                     ok &= check('開発者用モードへ', 'dev-mode');
S.go('watch-setup');                  ok &= check('CPU観戦の設定へ', 'watch-setup');
S.back();                             ok &= check('戻る → 開発者用モード', 'dev-mode');
S.back();                             ok &= check('戻る → 対戦モード選択', 'battle-mode');

S.reset('mode');
S.go('options');                      ok &= check('モード選択 → 設定', 'options');
S.back();                             ok &= check('設定から戻る → モード選択', 'mode');
S.go('mode'); S.go('solo-setup');     ok &= check('ひとり回し設定', 'solo-setup');
S.close();
console.log('  対戦へ入るとメニューが閉じる:', layer._cls.has('is-open') ? '[×] 開いたまま' : '[○]');
S.lastSetup = 'solo-setup';
S.reset('mode'); S.go('battle-mode'); if (S.lastSetup) S.go(S.lastSetup);
ok &= check('リザルト「新しい対戦」→ 直前の設定画面', 'solo-setup');
S.back();                             ok &= check('そこから戻る → 対戦モード選択', 'battle-mode');
console.log('\n表示は常に1枚だけか:', secs.filter(function(s){return s._cls.has('is-open');}).length === 1 ? '[○]' : '[×]');
console.log(ok ? '\n===== 画面遷移：全項目 通過 =====' : '\n===== 失敗あり =====');
process.exit(ok ? 0 : 1);
