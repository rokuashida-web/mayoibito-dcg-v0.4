/* =====================================================================
   test-harness.js ―― 画面なしでゲームを動かすための土台
   ---------------------------------------------------------------------
   ブラウザ用に書かれたjsファイル（グローバル変数で繋がっている）を
   Node.jsの中で読み込み、Game や AiCore を直接触れるようにします。
   Stage 5のヘッドレス自己対戦テストでも、この仕組みを使います。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGame(dir) {
  const context = vm.createContext({
    console: console,
    Math: Math,
    JSON: JSON,
    Date: Date,
  });
  // 読み込み順はindex.htmlと同じ（ui.jsは画面用なので読み込まない）
  const files = ['events.js', 'cards.js', 'decks.js', 'random.js', 'effects.js',
                 'game.js', 'ai-core.js', 'ai-heuristic.js', 'ai-deckstack.js', 'ai-player.js',
                 'ai-uiops.js'];
  // 1本に繋げてから一度に実行する。
  // （const宣言はスクリプトごとの閉じた範囲に入るため、別々に実行すると
  //   後のファイルから前のファイルの変数が見えなくなる）
  const merged = files.map(function (f) {
    return fs.readFileSync(path.join(dir, 'js', f), 'utf8');
  }).join('\n;\n') +
    '\n;\n({ Game: Game, AiCore: AiCore, AiHeuristic: AiHeuristic, AiPlayer: AiPlayer, AiDeckStack: AiDeckStack, AiUiOps: AiUiOps, AI_PROFILES: AI_PROFILES, CARD_MASTER: CARD_MASTER, DECKS: DECKS, Effects: Effects, GameEvents: GameEvents, GAME_EVENT: GAME_EVENT })';
  return vm.runInContext(merged, context, { filename: 'merged.js' });
}

module.exports = { loadGame };
