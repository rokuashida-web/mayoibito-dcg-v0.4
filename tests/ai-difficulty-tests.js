/* =====================================================================
   ai-difficulty-tests.js ―― 難易度が本当に違う判断をするかの検証
   ---------------------------------------------------------------------
   同じ局面を弱・中・強それぞれに見せて、選ぶ手を比べます。
   強だけが「制作者の知見どおり」に指せていれば成功です。

   実行： node tests/ai-difficulty-tests.js
   ===================================================================== */
const path = require('path');
const { loadGame } = require(path.join(__dirname, 'test-harness.js'));

const LEVELS = ['weak', 'normal', 'strong'];
let issues = 0;

function setup() {
  const env = loadGame(path.join(__dirname, '..'));
  env.Game.start('village', 'diff');
  env.Game.confirmMulligan('village', []);
  env.Game.confirmMulligan('mansion', []);
  return env;
}

function place(env, side, cardId, zone) {
  const p = env.Game.state.players[side];
  let idx = p.deck.findIndex(c => c.cardId === cardId);
  let card;
  if (idx >= 0) card = p.deck.splice(idx, 1)[0];
  else {
    idx = p.hand.findIndex(c => c.cardId === cardId);
    if (idx >= 0) card = p.hand.splice(idx, 1)[0];
  }
  if (!card) throw new Error('見つからない: ' + cardId);
  ({ humans: p.humans, youkai: p.youkai, hand: p.hand,
     lost: p.lost, trash: p.trash })[zone].push(card);
  return card;
}

function clearBoard(env, side) {
  const p = env.Game.state.players[side];
  p.deck = p.deck.concat(p.humans, p.youkai, p.hand);
  p.humans = []; p.youkai = []; p.hand = [];
}

function label(a) {
  if (!a) return '(なし)';
  if (a.kind === 'PASS') return '何もしない';
  if (a.kind === 'NO_PURSUE') return '追跡しない';
  if (a.kind === 'PURSUE') return a.youkai.master.name + ' → ' + a.human.master.name;
  return a.inst.master.name + (a.target ? ' → ' + a.target.master.name : '');
}

/* --- 局面1：鍵の温存（予備の人間がいる）--- */
function case1(env, level) {
  clearBoard(env, 'mansion'); clearBoard(env, 'village');
  const emma = place(env, 'mansion', 'mansion_emma', 'humans');
  place(env, 'mansion', 'mansion_sylvie', 'humans');
  const ichi = place(env, 'village', 'village_ichimatsu', 'youkai');
  place(env, 'mansion', 'mansion_key', 'hand');
  env.Game.state.players['mansion'].energy = 5;
  env.Game.setTracking('village', ichi, emma);
  return env.AiPlayer.create('mansion', level, 7).chooseMainAction();
}

/* --- 局面2：イザベラの敗北回避着地 --- */
function case2(env, level) {
  clearBoard(env, 'mansion'); clearBoard(env, 'village');
  place(env, 'mansion', 'mansion_elise', 'lost');
  place(env, 'mansion', 'mansion_annette', 'lost');
  place(env, 'mansion', 'mansion_emma', 'lost');
  const lily = place(env, 'mansion', 'mansion_lily', 'humans');
  const kohaku = place(env, 'village', 'village_kohaku', 'youkai');
  place(env, 'mansion', 'mansion_isabella', 'hand');
  place(env, 'mansion', 'mansion_chimera', 'hand');
  env.Game.state.players['mansion'].energy = 5;
  env.Game.setTracking('village', kohaku, lily);
  return env.AiPlayer.create('mansion', level, 7).chooseMainAction();
}

/* --- 局面3：イザベラで攻撃しすぎない --- */
function case3(env, level) {
  clearBoard(env, 'mansion'); clearBoard(env, 'village');
  place(env, 'mansion', 'mansion_isabella', 'youkai');
  place(env, 'mansion', 'mansion_chimera', 'youkai');
  place(env, 'village', 'village_kaede', 'humans');
  place(env, 'village', 'village_haruka', 'humans');
  place(env, 'village', 'village_luna', 'humans');
  return env.AiPlayer.create('mansion', level, 7).choosePursuit();
}

const CASES = [
  { no: 1, title: '鍵の温存（強は使わないのが正解）', fn: case1,
    expectStrong: a => !(a.kind === 'EQUIP_GOODS' && a.inst.cardId === 'mansion_key') },
  { no: 2, title: 'イザベラの敗北回避着地（強は出すのが正解）', fn: case2,
    expectStrong: a => a.kind === 'PLAY_YOUKAI' && a.inst.cardId === 'mansion_isabella' },
  { no: 3, title: 'イザベラで攻撃しすぎない（強は別の怪異で攻める）', fn: case3,
    expectStrong: a => !(a.kind === 'PURSUE' && a.youkai.cardId === 'mansion_isabella') },
];

CASES.forEach(function (c) {
  console.log('■ 局面' + c.no + '：' + c.title);
  const results = {};
  LEVELS.forEach(function (lv) {
    const env = setup();
    const a = c.fn(env, lv);
    results[lv] = label(a);
    console.log('   ' + env.AI_PROFILES[lv].label + ' → ' + label(a));
    if (lv === 'strong' && !c.expectStrong(a)) {
      console.log('   ！強モードが正解を選べていません');
      issues++;
    }
  });
  if (results.strong === results.weak && results.strong === results.normal) {
    console.log('   （※3段階とも同じ手。この局面では差が出ません）');
  }
  console.log();
});

/* --- 再現性の確認：同じseedなら毎回同じ手を選ぶか --- */
(function () {
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const env = setup();
    picks.push(label(case1(env, 'weak')));
  }
  const same = picks.every(function (x) { return x === picks[0]; });
  console.log('■ 再現性：同じseedで3回とも同じ手 → ' + (same ? 'OK' : 'NG'));
  if (!same) issues++;
})();

/* --- 弱が「気力を使い切る」性格になっているかの確認 --- */
(function () {
  const env = setup();
  clearBoard(env, 'mansion'); clearBoard(env, 'village');
  place(env, 'mansion', 'mansion_elise', 'humans');
  place(env, 'mansion', 'mansion_chimera', 'hand');   // 1コスト
  place(env, 'mansion', 'mansion_armor', 'hand');     // 2コスト
  env.Game.state.players['mansion'].energy = 3;
  const weak = env.AiPlayer.create('mansion', 'weak', 3).chooseMainAction();
  console.log('■ 弱の性格：気力3で何を出すか → ' + label(weak) +
              '（重いカードを優先＝気力を使い切る動き）');
})();

console.log();
console.log(issues === 0
  ? '===== 難易度の検証：問題なし ====='
  : '===== 問題 ' + issues + ' 件 =====');
if (issues > 0) process.exitCode = 1;
