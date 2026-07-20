/* =====================================================================
   robust-tests.js ―― 堅牢化（v0.3 Stage I）
   ・不具合が起きても情報がそろうか（仕様書 29）
   ・読み込みが必ず終わるか（仕様書 30）
   ・止める理由が混ざらないか（仕様書 28）
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
function fakeEl() {
  const o = { textContent: '', value: '', style: {}, _cls: new Set() };
  o.classList = { add: c => o._cls.add(c), remove: c => o._cls.delete(c),
                  toggle: (c,on) => { on ? o._cls.add(c) : o._cls.delete(c); },
                  contains: c => o._cls.has(c) };
  o.querySelector = sel => { if (!o._sub) o._sub = {}; if (!o._sub[sel]) o._sub[sel] = fakeEl(); return o._sub[sel]; };
  o.addEventListener = (t, fn) => { o['_' + t] = fn; };
  o.focus = () => {}; o.select = () => {};
  return o;
}

console.log('■ 止める理由が混ざらない（仕様書 28）');
{
  const ctx = vm.createContext({
    console, Math, JSON, Date, Game, AiPlayer, AiUiOps,
    document: { getElementById: () => fakeEl() },
    setTimeout: fn => { fn(); return 0; }, ms: v => v,
    view: {}, match: { mode: 'watch', ai: {} },
    setCandidate(){}, closeQuickDetail(){}, renderAll(){}, showToast(){},
    showBanner(){}, hideBanner(){}, getCardImagePath: () => '',
    Se: { play(){} }, runPendingEffects: d => d(), goToEndPhase(){}, finishWithResult(){},
  });
  const D = vm.runInContext(fs.readFileSync('js/cpu-driver.js','utf8') + '\n;CpuDriver', ctx);

  D.stop();
  D.pause();                       // 利用者が止める
  D.hold('modal');                 // さらに設定を開く
  check('2つの理由で止まっている', D.paused === true);
  D.release('modal');              // 設定を閉じた
  check('利用者が止めたままなら動かない', D.paused === true && D.isUserPaused() === true);
  D.resume();                      // 利用者が再開
  check('理由がなくなると動く', D.paused === false);

  D.stop();
  D.hold('modal');
  check('設定だけで止めた状態', D.paused === true && D.isUserPaused() === false);
  D.release('modal');
  check('設定を閉じれば動き出す', D.paused === false);

  D.hold('modal'); D.hold('dialog');
  D.stop();
  check('stop で理由もすべて消える', D.paused === false && Object.keys(D._holds).length === 0);
}

console.log('\n■ 不具合の記録（仕様書 29）');
{
  const box = fakeEl();
  const ctx = vm.createContext({
    console, Date, String, Math,
    Game: Game, match: { mode: 'cpu' },
    Result: { envText: () => 'iOS / Safari' },
    CpuDriver: { stop(){} },
    navigator: {},
    window: { addEventListener(){}, location: { reload(){} } },
    document: { getElementById: id => (id === 'error-screen' ? box : null) },
    setTimeout,
  });
  const Errors = vm.runInContext(fs.readFileSync('js/errors.js','utf8') + '\n;Errors', ctx);

  Game.hiddenSide = 'mansion';
  Game.start('village', 'ERR-1', {
    decks: { village: 'village', mansion: 'mansion' },
    labels: { village: 'あなた', mansion: 'CPU' } });
  Game.beginTurn('village');
  Errors.note('カードを出す：狐のお面 コハク／unit');

  Errors.report(new Error('わざと起こした不具合'), 'テスト');
  const text = box.querySelector('.error__detail').textContent;
  console.log('--- 出力（先頭）---\n' + text.split('\n').slice(0, 12).join('\n') + '\n---');

  check('画面が出る', box._cls.has('is-on'));
  ['エラーID：', '場所：', 'モード：cpu', 'ターン：', 'フェイズ：', 'シード：ERR-1',
   '直前の行動：', '端末：', '内容：わざと起こした不具合'].forEach(function (n) {
    check('「' + n + '」が入る', text.indexOf(n) !== -1);
  });
  check('直前のログも入る', text.indexOf('直前のログ：') !== -1);

  const before = text;
  Errors.report(new Error('2回目'), 'テスト');
  check('同じ不具合で画面を出し直さない',
    box.querySelector('.error__detail').textContent === before);
  check('回数は数えている', Errors.count === 2);
}

console.log('\n■ ゲームが始まる前に落ちても記録できる');
{
  const box = fakeEl();
  const ctx = vm.createContext({
    console, Date, String, Math,
    Game: { state: null }, match: { mode: 'solo' },
    CpuDriver: { stop(){} }, navigator: {},
    window: { addEventListener(){} },
    document: { getElementById: id => (id === 'error-screen' ? box : null) },
    setTimeout,
  });
  const Errors = vm.runInContext(fs.readFileSync('js/errors.js','utf8') + '\n;Errors', ctx);
  let err = null;
  try { Errors.report(new Error('起動時の不具合'), '起動'); } catch (e) { err = e.message; }
  check('落ちずに記録できる', !err, err || '');
  check('「対戦：開始前」と出る',
    box.querySelector('.error__detail').textContent.indexOf('対戦：開始前') !== -1);
}

console.log('\n■ 読み込みは必ず終わる（仕様書 30）');
{
  const made = [];
  function makeCtx(behaviour) {
    return vm.createContext({
      console, DECKS: G.DECKS, setTimeout, clearTimeout,
      getCardImagePath: (id, owner) => 'images/' + id + '.webp',
      Image: function () {
        const img = {};
        made.push(img);
        setTimeout(function () { behaviour(img); }, 0);
        return img;
      },
    });
  }
  // すべて成功
  {
    const c = makeCtx(img => img.onload && img.onload());
    const A = vm.runInContext(fs.readFileSync('js/assets.js','utf8') + '\n;Assets', c);
    let done = null;
    A.preloadDecks(['village', 'mansion'], null, (d, t) => { done = [d, t]; });
    setTimeout(function () {
      check('全部読めたら終わる', done && done[0] === done[1] && done[1] > 0, done && done.join('/'));

      // すべて失敗
      const c2 = makeCtx(img => img.onerror && img.onerror());
      const A2 = vm.runInContext(fs.readFileSync('js/assets.js','utf8') + '\n;Assets', c2);
      let done2 = null;
      A2.preloadDecks(['village'], null, (d, t) => { done2 = [d, t]; });
      setTimeout(function () {
        check('全部読めなくても終わる', done2 && done2[0] === done2[1], done2 && done2.join('/'));
        check('読めなかったものを控えている', A2.failed.length > 0, A2.failed.length + '件');

        // 空でも終わる
        const c3 = makeCtx(() => {});
        const A3 = vm.runInContext(fs.readFileSync('js/assets.js','utf8') + '\n;Assets', c3);
        let done3 = null;
        A3.preloadDecks([], null, () => { done3 = true; });
        check('読むものが無くても終わる', done3 === true);

        // 進み具合が伝わる
        const c4 = makeCtx(img => img.onload && img.onload());
        const A4 = vm.runInContext(fs.readFileSync('js/assets.js','utf8') + '\n;Assets', c4);
        const steps = [];
        A4.preloadDecks(['village'], (d, t) => steps.push(d), () => {
          check('1枚ずつ進み具合が伝わる', steps.length > 3 && steps[0] === 1,
            steps.length + '回');
          finish();
        });
      }, 5);
    }, 5);
  }
}

function finish() {
  console.log('\n' + (fail === 0
    ? '===== 堅牢化：' + pass + '/' + pass + ' 通過 ====='
    : '===== 失敗 ' + fail + '件 ====='));
  process.exit(fail === 0 ? 0 : 1);
}
