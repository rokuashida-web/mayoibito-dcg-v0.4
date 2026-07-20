/* =====================================================================
   ai-tests.js ―― 移植した評価関数の固定局面テスト（Stage 3の検証）
   ---------------------------------------------------------------------
   Python版シミュレーターで確認済みの「正しい判断」を、JS版でも同じように
   選べるかを調べます。制作者の実戦知見が移植で失われていないかの確認です。

   実行： node tests/ai-tests.js
   ===================================================================== */
const path = require('path');
const { loadGame } = require(path.join(__dirname, 'test-harness.js'));

let passed = 0, failed = 0;

/* 盤面を作るための道具 --------------------------------------------- */
function setup() {
  const env = loadGame(path.join(__dirname, '..'));
  env.Game.start('village', 'test');
  env.Game.confirmMulligan('village', []);
  env.Game.confirmMulligan('mansion', []);
  return env;
}

/** 山札から指定IDのカードを取り出して、指定の場所へ置く */
function place(env, side, cardId, zone) {
  const p = env.Game.state.players[side];
  let idx = p.deck.findIndex(c => c.cardId === cardId);
  let card;
  if (idx >= 0) { card = p.deck.splice(idx, 1)[0]; }
  else {
    idx = p.hand.findIndex(c => c.cardId === cardId);
    if (idx >= 0) card = p.hand.splice(idx, 1)[0];
  }
  if (!card) throw new Error('カードが見つからない: ' + cardId);
  if (zone === 'humans') p.humans.push(card);
  else if (zone === 'youkai') p.youkai.push(card);
  else if (zone === 'hand') p.hand.push(card);
  else if (zone === 'lost') p.lost.push(card);
  else if (zone === 'trash') p.trash.push(card);
  return card;
}

/** 場と手札を空にして、狙った局面を作りやすくする */
function clearBoard(env, side) {
  const p = env.Game.state.players[side];
  p.deck = p.deck.concat(p.humans, p.youkai, p.hand);
  p.humans = []; p.youkai = []; p.hand = [];
}

function check(no, title, actual, expected) {
  const ok = (actual === expected);
  if (ok) { passed++; console.log('[○] #' + no + ' ' + title); }
  else {
    failed++;
    console.log('[×] #' + no + ' ' + title);
    console.log('      期待: ' + expected + ' / 実際: ' + actual);
  }
}

/* =====================================================================
   テスト1 鍵の温存：イザベラ着地前、人間に余裕があるなら鍵を使わない
   ===================================================================== */
(function () {
  const env = setup();
  const { Game, AiCore, AiHeuristic } = env;
  clearBoard(env, 'mansion'); clearBoard(env, 'village');

  const emma = place(env, 'mansion', 'mansion_emma', 'humans');   // エマ 2/3
  place(env, 'mansion', 'mansion_sylvie', 'humans');              // 予備の人間あり
  const ichimatsu = place(env, 'village', 'village_ichimatsu', 'youkai'); // 市松 3/2
  place(env, 'mansion', 'mansion_key', 'hand');
  Game.state.players['mansion'].energy = 5;
  Game.setTracking('village', ichimatsu, emma);   // エマが3点で倒される

  const act = AiHeuristic.chooseMainAction('mansion');
  const usedKey = (act.kind === 'EQUIP_GOODS' && act.inst.cardId === 'mansion_key');
  check(1, '鍵の温存（予備の人間がいるなら着地前に使わない）', usedKey, false);
})();

/* =====================================================================
   テスト2 鍵の緊急使用：最後の人間が倒される場面では鍵を使う
   ===================================================================== */
(function () {
  const env = setup();
  const { Game, AiHeuristic } = env;
  clearBoard(env, 'mansion'); clearBoard(env, 'village');

  const emma = place(env, 'mansion', 'mansion_emma', 'humans');   // 最後の1体
  const ichimatsu = place(env, 'village', 'village_ichimatsu', 'youkai');
  place(env, 'mansion', 'mansion_key', 'hand');
  Game.state.players['mansion'].energy = 5;
  Game.setTracking('village', ichimatsu, emma);

  const act = AiHeuristic.chooseMainAction('mansion');
  const usedKey = (act.kind === 'EQUIP_GOODS' && act.inst.cardId === 'mansion_key');
  check(2, '鍵の緊急使用（最後の人間を守る事故なら使う）', usedKey, true);
})();

/* =====================================================================
   テスト3 イザベラの最強ムーブ：
   ロスト3・エリーゼがロストにいる・最後の人間が倒される直前に出す
   ===================================================================== */
(function () {
  const env = setup();
  const { Game, AiHeuristic } = env;
  clearBoard(env, 'mansion'); clearBoard(env, 'village');
  const mp = Game.state.players['mansion'];

  // ロストを3枚（エリーゼを含む・すべて〈洋館〉）にする
  place(env, 'mansion', 'mansion_elise', 'lost');
  place(env, 'mansion', 'mansion_annette', 'lost');
  place(env, 'mansion', 'mansion_emma', 'lost');

  const lily = place(env, 'mansion', 'mansion_lily', 'humans');  // 最後の人間
  const kohaku = place(env, 'village', 'village_kohaku', 'youkai'); // 3点で倒す
  place(env, 'mansion', 'mansion_isabella', 'hand');
  place(env, 'mansion', 'mansion_chimera', 'hand');   // 誤答候補（安い怪異）
  mp.energy = 5;
  Game.setTracking('village', kohaku, lily);

  const act = AiHeuristic.chooseMainAction('mansion');
  const playedIsa = (act.kind === 'PLAY_YOUKAI' &&
                     act.inst.cardId === 'mansion_isabella');
  check(3, 'イザベラの敗北回避着地（蘇生でロストを減らして負けを避ける）',
        playedIsa, true);
})();

/* =====================================================================
   テスト4 コハクのコンボ：削れた相手怪異を登場時1点で仕留める
   ===================================================================== */
(function () {
  const env = setup();
  const { Game, AiHeuristic } = env;
  clearBoard(env, 'mansion'); clearBoard(env, 'village');
  const vp = Game.state.players['village'];

  place(env, 'village', 'village_sumire', 'humans');
  const armor = place(env, 'mansion', 'mansion_armor', 'youkai');  // 甲冑 3/4
  armor.accumulatedDamage = 3;             // 残り体力1（カエデに削られた想定）
  place(env, 'village', 'village_kohaku', 'hand');
  place(env, 'village', 'village_ichimatsu', 'hand');  // 誤答候補
  vp.energy = 4;

  const act = AiHeuristic.chooseMainAction('village');
  const playedKohaku = (act.kind === 'PLAY_YOUKAI' &&
                        act.inst.cardId === 'village_kohaku');
  check(4, 'カエデ→コハクのコンボ（削れた甲冑を登場時1点で落とす）',
        playedKohaku, true);
})();

/* =====================================================================
   テスト5 追跡：勝ちが決まる追跡を必ず選ぶ
   ===================================================================== */
(function () {
  const env = setup();
  const { Game, AiHeuristic } = env;
  clearBoard(env, 'mansion'); clearBoard(env, 'village');
  const mp = Game.state.players['mansion'];

  // 洋館のロストを3枚にする（規定4なのであと1枚で負け）
  place(env, 'mansion', 'mansion_annette', 'lost');
  place(env, 'mansion', 'mansion_emma', 'lost');
  place(env, 'mansion', 'mansion_lily', 'lost');

  const elise = place(env, 'mansion', 'mansion_elise', 'humans');  // 2/3
  place(env, 'mansion', 'mansion_sylvie', 'humans');               // 2/4（倒せない）
  const ichimatsu = place(env, 'village', 'village_ichimatsu', 'youkai'); // 3/2

  const opt = AiHeuristic.choosePursuit('village');
  const lethal = (opt.kind === 'PURSUE' && opt.human === elise);
  check(5, '勝ちが決まる追跡を選ぶ（ロスト規定枚数でのリーサル）', lethal, true);
})();

/* =====================================================================
   テスト6 イザベラで攻撃しすぎない：
   反撃で削られるなら、他の怪異での攻撃を優先する
   ===================================================================== */
(function () {
  const env = setup();
  const { Game, AiHeuristic } = env;
  clearBoard(env, 'mansion'); clearBoard(env, 'village');

  const isa = place(env, 'mansion', 'mansion_isabella', 'youkai');
  const chimera = place(env, 'mansion', 'mansion_chimera', 'youkai');
  place(env, 'village', 'village_kaede', 'humans');   // カエデ 3/4（反撃3）
  place(env, 'village', 'village_haruka', 'humans');
  place(env, 'village', 'village_luna', 'humans');

  const opt = AiHeuristic.choosePursuit('mansion');
  const usedIsa = (opt.kind === 'PURSUE' && opt.youkai === isa);
  check(6, 'イザベラで攻撃しすぎない（反撃を受ける攻撃は他の怪異を優先）',
        usedIsa, false);
})();

/* =====================================================================
   テスト7 削りの価値：倒せなくても攻撃を続ける（攻めないより良い）
   ===================================================================== */
(function () {
  const env = setup();
  const { Game, AiHeuristic } = env;
  clearBoard(env, 'mansion'); clearBoard(env, 'village');

  place(env, 'mansion', 'mansion_chimera', 'youkai');   // 3/2
  place(env, 'village', 'village_kaede', 'humans');     // 3/4（倒せない・反撃3）
  place(env, 'village', 'village_rin', 'humans');       // 2/4

  const opt = AiHeuristic.choosePursuit('mansion');
  check(7, '倒せなくても攻撃を続ける（継続圧力の価値）',
        opt.kind === 'PURSUE', true);
})();

/* ------------------------------------------------------------------- */
console.log();
console.log('===== 移植検証: ' + passed + '/' + (passed + failed) + ' 通過 =====');
if (failed > 0) process.exitCode = 1;
