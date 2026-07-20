/* =====================================================================
   headless-driver.js ―― 画面なしで1試合を最後まで回す
   ---------------------------------------------------------------------
   ここで使っているターンの順番は、preview.js / cpu-driver.js と同じです。
     ターン開始 → 襲撃 → 開始時効果 → 気力とドロー
     → メイン（AIが手を選ぶ）→ 追跡 → 終了時効果 → ターン終了
   複数のテストから使うため、独立したファイルにしてあります。
   ===================================================================== */

function playGameHeadless(G, opts) {
  const { Game, AiPlayer, AiUiOps } = G;

  Game.start(opts.firstSide, opts.seed, {
    decks: opts.decks,
    labels: opts.labels,
  });

  const ais = {
    village: AiPlayer.create('village', opts.difficulty || 'strong', opts.seed + ':v'),
    mansion: AiPlayer.create('mansion', opts.difficulty2 || opts.difficulty || 'strong', opts.seed + ':m'),
  };

  function resolvePending(ai) {
    let guard = 0;
    while (!Game.state.gameOver && guard++ < 200) {
      const item = Game.takeNextPending();
      if (!item) break;
      let done = false;
      Game.runEffect(item, AiUiOps.create(ai, item), function () { done = true; });
      if (!done) throw new Error('効果の解決が終わらなかった：' + item.source.cardId);
    }
  }

  function playTurn(side) {
    const ai = ais[side];
    const st = Game.state;

    if (ai.onTurnStart) ai.onTurnStart();     // エキスパート・理不尽のズル
    Game.beginTurn(side);

    const info = Game.prepareAttack(side);
    if (info) { Game.applyAttackDamage(info); Game.finishAttack(info); }
    if (st.gameOver) return;

    resolvePending(ai);
    if (st.gameOver) return;

    Game.turnStartResources(side);
    resolvePending(ai);
    if (st.gameOver) return;

    let guard = 0;
    while (!st.gameOver && guard++ < 60) {
      const act = ai.chooseMainAction();
      if (!act || act.kind === 'PASS') break;
      if (act.kind === 'PLAY_HUMAN' || act.kind === 'PLAY_YOUKAI') Game.playUnit(side, act.inst);
      else if (act.kind === 'EQUIP_GOODS') Game.playGoods(side, act.inst, act.target);
      else if (act.kind === 'PLAY_EVENT') Game.playEvent(side, act.inst);
      else break;
      resolvePending(ai);
    }
    if (st.gameOver) return;

    Game.endMain();
    const pursuit = ai.choosePursuit();
    if (pursuit && pursuit.kind === 'PURSUE') Game.setTracking(side, pursuit.youkai, pursuit.human);
    else Game.skipTracking(side);
    if (st.gameOver) return;

    Game.queueEndTurnEffects(side);
    resolvePending(ai);
    if (st.gameOver) return;
    Game.toEndPhase();
    Game.endTurn();
  }

  ['village', 'mansion'].forEach(function (s) {
    Game.confirmMulligan(s,
      ais[s].shouldMulligan() ? Game.state.players[s].hand.map(function (c) { return c.uid; }) : []);
  });

  let side = Game.state.firstSide;
  let turns = 0;
  while (!Game.state.gameOver && turns++ < 200) {
    playTurn(side);
    side = Game.otherSide(side);
  }
  return { over: Game.state.gameOver, turns: turns, state: Game.state, ais: ais };
}

module.exports = { playGameHeadless };
