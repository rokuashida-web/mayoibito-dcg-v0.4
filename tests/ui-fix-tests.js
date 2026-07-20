/* =====================================================================
   ui-fix-tests.js ―― 操作まわりの5つの修正（v0.3）
   ===================================================================== */
const fs = require('fs');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}
const src = fs.readFileSync('js/preview.js', 'utf8');
const css = fs.readFileSync('css/layout.css', 'utf8');

console.log('■ 1. CPUのターン中に手札を閉じられる');
{
  check('自動で開き直す条件からCPUの番を外した',
    src.indexOf("(view.locked && !isCpuSide(turnSide()))") !== -1);
  check('マリガン中は今までどおり開いたまま',
    /autoOpen = \(play\.mode === 'mulligan'\)/.test(src));
}

console.log('\n■ 2. なぞりとドラッグの切り分け（斜め上へのドラッグ）');
{
  const m = src.match(/const SCRUB_RATIO = ([\d.]+);/);
  check('なぞり判定の狭さを定数にした', !!m, m ? m[1] : '');
  const ratio = m ? parseFloat(m[1]) : 1;
  check('1.0より狭い（斜めはドラッグ扱いになる）', ratio > 1, String(ratio));

  check('判定に使われている',
    src.indexOf('Math.abs(dx) > Math.abs(dy) * SCRUB_RATIO') !== -1);

  // 角度ごとに、なぞりになるかドラッグになるかを確かめる
  function isScrub(dx, dy) { return Math.abs(dx) > Math.abs(dy) * ratio; }
  const cases = [
    ['真横（0度）',        30,   0, true],
    ['ほぼ横（10度）',     30,   5, true],
    ['やや斜め（30度）',   30,  17, false],
    ['斜め上（45度）',     30,  30, false],
    ['ほぼ真上（75度）',    8,  30, false],
    ['真上（90度）',        0,  30, false],
  ];
  cases.forEach(function (c) {
    const got = isScrub(c[1], -c[2]);   // 上方向は dy が負
    check(c[0] + ' → ' + (c[3] ? 'なぞり' : 'ドラッグ'), got === c[3]);
  });
  const deg = Math.atan2(1, ratio) * 180 / Math.PI;
  console.log('   （水平から約' + deg.toFixed(0) + '度までがなぞり）');
}

console.log('\n■ 3. マリガンの案内文');
{
  check('showHint / hideHint がある',
    /function showHint/.test(src) && /function hideHint/.test(src));
  check('配り終わってから出す',
    src.indexOf("showHint('入れ替える手札を選択してください')") !== -1);
  check('確定したら消す', /function afterMulliganConfirmed\(side, count\) \{\s*\n\s*hideHint\(\);/.test(src));
}

console.log('\n■ 4. メインフェイズの文字演出');
{
  check('「◯◯のメインフェイズ」を出す',
    src.indexOf("'\\nのメインフェイズ'") !== -1);
  check('演出が終わってから操作できるようになる',
    /のメインフェイズ[\s\S]{0,400}view\.locked = false;/.test(src));
  check('CPUの番なら演出のあとAIへ渡す',
    /のメインフェイズ[\s\S]{0,300}CpuDriver\.runTurn\(side\)/.test(src));
}

console.log('\n■ 5. 出せるカードの発光');
{
  check('canOperateHand がある', /function canOperateHand/.test(src));
  check('is-playable を付けている', src.indexOf("card.classList.add('is-playable')") !== -1);
  check('操作できるときだけ付ける',
    src.indexOf('canPlayNow === true && canOperateHand()') !== -1);

  // 消える条件がそろっているか
  [['演出中', 'view.locked'], ['マリガン中', "play.mode === 'mulligan'"],
   ['メイン以外', "st.phase !== 'main'"], ['CPUの番', 'isCpuSide(st.currentSide)'],
   ['決着後', 'st.gameOver']].forEach(function (c) {
    const fn = src.slice(src.indexOf('function canOperateHand'),
                         src.indexOf('function canOperateHand') + 700);
    check(c[0] + 'は光らない', fn.indexOf(c[1]) !== -1);
  });

  check('CSSが定義されている', css.indexOf('.fan-card.is-playable') !== -1);
  check('選んでいるときは点滅を止める',
    css.indexOf('.fan-card.is-playable.is-selected { animation: none; }') !== -1);
  check('動きを減らす設定に配慮している',
    css.indexOf('prefers-reduced-motion') !== -1);
}

console.log('\n' + (fail === 0
  ? '===== 操作まわりの修正：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
