/* =====================================================================
   result-tests.js ―― リザルトと結果コピー（v0.3 Stage H）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { Game } = G;
const { playGameHeadless } = require('./headless-driver.js');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

function loadResult(nav) {
  const c = vm.createContext({
    Game, console, navigator: nav || { userAgent: '' },
    APP_TITLE: '『マヨイビト』DCG', APP_VERSION_LABEL: 'v0.3.3',
  });
  return vm.runInContext(fs.readFileSync('js/result.js', 'utf8') + '\n;Result', c);
}
const Result = loadResult({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1' });

/* CPU対戦を1試合まわす（自分＝村・席village） */
function runCpuMatch(seed, playerDeck, cpuDeck, playerFirst) {
  Game.hiddenSide = 'mansion';
  return playGameHeadless(G, {
    firstSide: playerFirst ? 'village' : 'mansion', seed: seed,
    decks: { village: playerDeck, mansion: cpuDeck },
    labels: { village: 'あなた', mansion: 'CPU' },
  });
}

console.log('■ CPU対戦の結果コピー（仕様書 26）');
{
  runCpuMatch('COPY-1', 'village', 'mansion', false);
  const last = { mode: 'cpu', playerDeck: 'village', cpuDeck: 'mansion',
                 difficulty: 'strong', playerFirst: false, seed: Game.state.seed,
                 seedMode: 'fixed' };
  const text = Result.copyText(Game.state, last);
  console.log('--- 出力 ---\n' + text + '\n------------');

  const need = ['『マヨイビト』DCG v0.3.3', 'モード：CPU対戦', '自分：ヨマモリ村',
                'CPU：黒薔薇の館', '難易度：強', '自分：後攻', '結果：',
                '勝敗理由：', '終了ターン：', 'シード：'];
  const missing = need.filter(n => text.indexOf(n) === -1);
  check('仕様書の項目がそろっている', missing.length === 0, missing.join('／'));
  check('シードが実際の値と一致', text.indexOf('シード：' + Game.state.seed) !== -1);
  check('端末の種別が入る', text.indexOf('iOS / Safari') !== -1);

  const won = Game.state.gameOver.winner === 'village';
  check('勝敗が自分から見た表記', text.indexOf('結果：' + (won ? '勝利' : '敗北')) !== -1,
    won ? '勝利' : '敗北');
}

console.log('\n■ 理不尽は特殊難易度と書く（仕様書 10.2・26）');
{
  const text = Result.copyText(Game.state,
    { mode: 'cpu', playerDeck: 'village', cpuDeck: 'mansion', difficulty: 'unfair', playerFirst: true });
  check('「理不尽（特殊難易度）」と出る', text.indexOf('難易度：理不尽（特殊難易度）') !== -1);
}

console.log('\n■ CPU観戦（仕様書 25.3）');
{
  Game.hiddenSide = null;
  playGameHeadless(G, { firstSide: 'village', seed: 'W-COPY',
    decks: { village: 'village', mansion: 'mansion' },
    labels: { village: 'CPU 1', mansion: 'CPU 2' } });
  const last = { mode: 'watch', deck1: 'village', diff1: 'weak',
                 deck2: 'mansion', diff2: 'unfair', firstIsCpu1: true, seed: Game.state.seed };
  const text = Result.copyText(Game.state, last);
  check('CPU 1／CPU 2 の内訳が出る',
    text.indexOf('CPU 1：ヨマモリ村／弱') !== -1 && text.indexOf('CPU 2：黒薔薇の館／理不尽（特殊難易度）') !== -1);
  check('勝者がCPU 1／CPU 2 で書かれる', /結果：(CPU 1の勝利|CPU 2の勝利|引き分け)/.test(text));

  const rows = Result.infoRows(Game.state, last);
  check('画面の行にも両CPUが出る', rows.some(r => r[0] === 'CPU 1') && rows.some(r => r[0] === 'CPU 2'));
  check('シードとターン数が行に入る',
    rows.some(r => r[0] === 'シード') && rows.some(r => r[0] === '経過ターン'));
}

console.log('\n■ ひとり回し（仕様書 25.2）');
{
  playGameHeadless(G, { firstSide: 'mansion', seed: 'S-COPY',
    decks: { village: 'village', mansion: 'village' },
    labels: { village: 'プレイヤー1', mansion: 'プレイヤー2' } });
  const last = { mode: 'solo', deck1: 'village', deck2: 'village', firstIsP1: false, seed: Game.state.seed };
  const text = Result.copyText(Game.state, last);
  check('勝ったプレイヤーが書かれる', /結果：(プレイヤー1の勝利|プレイヤー2の勝利|引き分け)/.test(text));
  check('先攻がプレイヤー表記', text.indexOf('先攻：プレイヤー2') !== -1);
}

console.log('\n■ 勝敗理由');
{
  const r = Result.reasonText(Game.state);
  check('理由が入っている', r.length > 0, r);
  const known = ['ロスト上限到達', '場の人間が0体', '山札が0枚'];
  check('既知の理由のどれか', known.some(k => r.indexOf(k) !== -1), r);
}

console.log('\n■ クリップボードの逃げ道（仕様書 33-11）');
{
  let ok = 0, ng = 0;
  // 使える場合
  const R1 = loadResult({ userAgent: '', clipboard: { writeText: () => Promise.resolve() } });
  R1.copy('x', () => ok++, () => ng++);
  // 使えない場合
  const R2 = loadResult({ userAgent: '' });
  R2.copy('x', () => ok++, () => ng++);
  setTimeout(function () {
    check('使える環境ではコピーが成功する', ok === 1, 'ok=' + ok);
    check('使えない環境では逃げ道へ回る', ng === 1, 'ng=' + ng);

    // 失敗を返す場合
    const R3 = loadResult({ userAgent: '', clipboard: { writeText: () => Promise.reject(new Error('x')) } });
    let ng2 = 0;
    R3.copy('x', () => {}, () => ng2++);
    setTimeout(function () {
      check('拒否されたときも逃げ道へ回る', ng2 === 1);
      finish();
    }, 10);
  }, 10);
}

function finish() {
  console.log('\n' + (fail === 0
    ? '===== リザルトと結果コピー：' + pass + '/' + pass + ' 通過 ====='
    : '===== 失敗 ' + fail + '件 ====='));
  process.exit(fail === 0 ? 0 : 1);
}
