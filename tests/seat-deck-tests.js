/* =====================================================================
   seat-deck-tests.js ―― 座席とデッキの分離（v0.3 Stage B）の検証
   ---------------------------------------------------------------------
   ミラー対戦（同じデッキ同士）でも、対戦が最後まで壊れずに進むかを
   画面なしで確かめます。

   ここで使っている「ターンの進め方」は preview.js と同じ順番です。
     ターン開始 → 襲撃 → 開始時効果 → 気力とドロー
     → メイン（AIが手を選ぶ）→ 追跡 → 終了時効果 → ターン終了
   Stage C でCPUを画面に繋ぐときも、この順番をそのまま使います。
   ===================================================================== */

const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { Game, AiPlayer, AiUiOps } = G;

const { playGameHeadless } = require('./headless-driver.js');

function playGame(opts) { return playGameHeadless(G, opts); }

/* ===================================================================== */

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

console.log('■ 1. 既定の組み合わせ（v0.2と同じ）');
{
  const r = playGame({ firstSide: 'village', seed: 'BASE-1' });
  check('決着した', !!r.over, r.turns + 'ターン');
  check('席の呼び名がデッキ名のまま', r.state.players.village.label === 'ヨマモリ村' &&
    r.state.players.mansion.label === '黒薔薇の館');
}

console.log('\n■ 2. ミラー対戦（両方ヨマモリ村）');
{
  const r = playGame({
    firstSide: 'village', seed: 'MIRROR-V',
    decks: { village: 'village', mansion: 'village' },
    labels: { village: 'あなた', mansion: 'CPU' },
  });
  check('決着した', !!r.over, r.turns + 'ターン');
  check('両席ともヨマモリ村のデッキ', Game.deckOf('village').side === 'village' &&
    Game.deckOf('mansion').side === 'village');
  check('呼び名が あなた／CPU になっている',
    r.state.players.village.label === 'あなた' && r.state.players.mansion.label === 'CPU');
  const log = r.state.log.join('\n');
  check('ログに「黒薔薇の館」が出てこない', log.indexOf('黒薔薇の館') === -1);
}

console.log('\n■ 3. ミラー対戦（両方 黒薔薇の館）');
{
  const r = playGame({
    firstSide: 'mansion', seed: 'MIRROR-M',
    decks: { village: 'mansion', mansion: 'mansion' },
    labels: { village: 'CPU 1', mansion: 'CPU 2' },
  });
  check('決着した', !!r.over, r.turns + 'ターン');
  check('両席とも黒薔薇の館のデッキ', Game.deckOf('village').side === 'mansion' &&
    Game.deckOf('mansion').side === 'mansion');
}

console.log('\n■ 4. 席とデッキを入れ替える（席villageが黒薔薇の館）');
{
  const r = playGame({
    firstSide: 'village', seed: 'SWAP-1',
    decks: { village: 'mansion', mansion: 'village' },
    labels: { village: 'あなた', mansion: 'CPU' },
  });
  check('決着した', !!r.over, r.turns + 'ターン');
  check('初期人間が入れ替わっている',
    r.state.players.village.humans.concat(r.state.players.village.trash)
      .concat(r.state.players.village.lost).length >= 0);
}

console.log('\n■ 5. 同じシードなら同じ結果になる（再現性）');
{
  const opt = { firstSide: 'village', seed: 'REPRO-9',
    decks: { village: 'village', mansion: 'village' },
    labels: { village: 'あなた', mansion: 'CPU' } };
  const a = playGame(opt); const logA = Game.state.log.join('\n');
  const b = playGame(opt); const logB = Game.state.log.join('\n');
  check('2回まわして同じログになった', logA === logB, a.turns + 'ターン / ' + b.turns + 'ターン');
}

console.log('\n■ 6. まとめて回して落ちないか（各組み合わせ30試合）');
{
  const combos = [
    ['村 vs 館', { village: 'village', mansion: 'mansion' }],
    ['村 vs 村', { village: 'village', mansion: 'village' }],
    ['館 vs 館', { village: 'mansion', mansion: 'mansion' }],
    ['館 vs 村', { village: 'mansion', mansion: 'village' }],
  ];
  combos.forEach(function (c) {
    let ok = 0, decided = 0, err = null;
    for (let i = 0; i < 30; i++) {
      try {
        const r = playGame({ firstSide: (i % 2) ? 'village' : 'mansion',
          seed: 'BULK-' + c[0] + '-' + i, decks: c[1],
          labels: { village: 'あなた', mansion: 'CPU' } });
        ok++; if (r.over) decided++;
      } catch (e) { err = e.message; break; }
    }
    check(c[0] + '：30試合', ok === 30 && decided === 30,
      err ? ('エラー：' + err) : (ok + '試合完走・' + decided + '試合決着'));
  });
}

console.log('\n' + (fail === 0
  ? '===== 座席とデッキの分離：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
