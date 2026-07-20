/* =====================================================================
   deck-tests.js ―― デッキの管理と検証（v0.4 Stage D・仕様書 10〜13・31.1）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

function boot() {
  const mem = {};
  const ctx = vm.createContext({
    window: { localStorage: {
      getItem: k => mem[k] === undefined ? null : mem[k],
      setItem: (k, v) => { mem[k] = String(v); } } },
    JSON, console, Date, Math, isFinite, String, Number, Array, Object,
    CARD_MASTER: G.CARD_MASTER, DECKS: G.DECKS, APP_VERSION: '0.4.0',
  });
  ['save-manager.js', 'collection.js', 'card-filter.js',
   'deck-validator.js', 'deck-manager.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx);
  });
  const S = vm.runInContext('SaveManager', ctx);
  const C = vm.runInContext('Collection', ctx);
  S.load(); C.grantInitialIfNeeded();
  return {
    S: S, C: C,
    V: vm.runInContext('DeckValidator', ctx),
    D: vm.runInContext('DeckManager', ctx),
  };
}

console.log('■ 公式デッキ（仕様書 11.2・12・30.4）');
{
  const { D, V } = boot();
  const off = D.officialDecks();
  check('公式は2つ', off.length === 2, off.map(d => d.name).join('、'));
  check('村と洋館', off[0].name === 'ヨマモリ村' && off[1].name === '黒薔薇の館');
  check('戦術ラベルが付く（仕様書 11.4）',
    off[0].tactics === '中速ミッドレンジ' && off[1].tactics === '低速コンボ');
  check('公式は編集できない（仕様書 12.1）',
    off.every(d => D.isEditable(d) === false));
  check('公式はどちらも40枚ちょうど',
    off.every(d => V.check(d).total === 40), off.map(d => V.check(d).total).join('／'));
  check('公式はどちらも対戦で使える',
    off.every(d => V.check(d).usable),
    off.map(d => V.check(d).problems.join('／')).join(' | '));

  const c = V.check(off[0]).counts;
  check('枚数配分が出る（仕様書 13.4）',
    c.human + c.youkai + c.goods + c.event === 40,
    `人間${c.human}／怪異${c.youkai}／グッズ${c.goods}／イベント${c.event}`);
}

console.log('\n■ 40枚の並べ方（仕様書 13.2・13.3）');
{
  const { D } = boot();
  const ids = D.expand(D.officialDecks()[0]);
  check('40枚に展開される', ids.length === 40, ids.length + '枚');
  check('同名カードも枚数ぶん並ぶ',
    ids.filter(id => id === 'village_luna').length === 4);

  const order = { human: 0, youkai: 1, goods: 2, event: 3, field: 4 };
  let ok = true;
  for (let i = 1; i < ids.length; i++) {
    const a = G.CARD_MASTER[ids[i - 1]], b = G.CARD_MASTER[ids[i]];
    if (order[a.type] > order[b.type]) { ok = false; break; }
    if (order[a.type] === order[b.type] && a.cost > b.cost) { ok = false; break; }
  }
  check('タイプ→コスト の順に並ぶ', ok);
  check('先頭は0コスト人間', G.CARD_MASTER[ids[0]].cost === 0,
    G.CARD_MASTER[ids[0]].name);
}

console.log('\n■ 自作デッキの作成・コピー・削除（仕様書 11.3・12.2・31.1）');
{
  const { D, S } = boot();
  check('最初は自作デッキが無い', D.customDecks().length === 0);

  const r = D.create(null, 'テストデッキ');
  check('作れる', r.ok === true && r.deck.name === 'テストデッキ');
  check('IDが振られる', /^deck_custom_\d{3}$/.test(r.deck.id), r.deck.id);
  check('作成日時が入る', typeof r.deck.createdAt === 'string');
  check('保存される', S.data.customDecks.length === 1);

  // 公式からコピー
  const copy = D.copy(D.officialDecks()[0]);
  check('公式からコピーできる（仕様書 12.2）', copy.ok === true);
  check('コピーは自作あつかい', D.isEditable(copy.deck) === true);
  check('中身が同じ', copy.deck.mainDeck.length === D.officialDecks()[0].mainDeck.length);
  check('名前に「のコピー」が付く', copy.deck.name.indexOf('のコピー') !== -1, copy.deck.name);
  check('コピー元は変わらない',
    D.officialDecks()[0].name === 'ヨマモリ村');

  // コピーを書き換えても元に影響しない
  copy.deck.mainDeck[0].count = 99;
  D.update(copy.deck);
  check('コピーを変えても公式は変わらない',
    D.officialDecks()[0].mainDeck[0].count !== 99);

  // 上限10個
  const { D: D2 } = boot();
  for (let i = 0; i < 10; i++) D2.create(null, 'デッキ' + i);
  check('10個まで作れる', D2.customDecks().length === 10);
  check('上限を超えると作れない', D2.canAddMore() === false);
  const over = D2.create(null, '11個目');
  check('11個目は断られる', over.ok === false, over.reason);
  check('断られても10個のまま', D2.customDecks().length === 10);

  // 削除
  const id = D2.customDecks()[0].id;
  check('削除できる', D2.remove(id).ok === true);
  check('9個になる', D2.customDecks().length === 9);
  check('削除したら また作れる', D2.canAddMore() === true);
  check('無いデッキの削除は断る', D2.remove('no_such_deck').ok === false);
}

console.log('\n■ デッキ名（仕様書 15.2）');
{
  const { D } = boot();
  check('前後の空白を取る', D.cleanName('  村デッキ  ') === '村デッキ');
  check('空欄なら初期名', D.cleanName('') === '新しいデッキ');
  check('空白だけでも初期名', D.cleanName('   ') === '新しいデッキ');
  check('16文字まで', D.cleanName('あ'.repeat(30)).length === 16);
  const a = D.create(null, '同じ名前'), b = D.create(null, '同じ名前');
  check('同名デッキを許す', a.ok && b.ok && a.deck.id !== b.deck.id);
}

console.log('\n■ 使えるかどうかの判定（仕様書 10・11.5・31.1）');
{
  const { D, V, C } = boot();
  const base = D.officialDecks()[0];
  const clone = () => JSON.parse(JSON.stringify(base));

  check('公式そのままは使える', V.check(base).usable);

  // 枚数不足
  let d = clone();
  d.mainDeck[1].count -= 8;
  let r = V.check(d);
  check('40枚未満は使えない', !r.usable);
  check('不足枚数を伝える', r.problems.some(p => p.indexOf('8枚不足') !== -1),
    r.problems.join('／'));

  // 枚数超過
  d = clone(); d.mainDeck[1].count += 2;
  r = V.check(d);
  check('40枚超過も使えない', !r.usable);
  check('超過枚数を伝える', r.problems.some(p => p.indexOf('2枚多すぎ') !== -1),
    r.problems.join('／'));

  // 同名5枚
  d = clone();
  d.mainDeck.find(e => e.cardId === 'village_luna').count = 5;
  d.mainDeck.find(e => e.cardId === 'village_kaede').count = 2;
  r = V.check(d);
  check('同名5枚は使えない', !r.usable);
  check('上限を伝える', r.problems.some(p => p.indexOf('4枚までしか') !== -1),
    r.problems.join('／'));

  // フィールド未設定
  d = clone(); d.fieldId = null;
  r = V.check(d);
  check('フィールド未設定は使えない', !r.usable);
  check('理由を伝える', r.problems.some(p => p.indexOf('フィールドが設定されていません') !== -1));

  // 主人公を外した
  d = clone();
  d.mainDeck = d.mainDeck.filter(e => e.cardId !== 'village_sumire');
  d.mainDeck.find(e => e.cardId === 'village_haruka').count += 1;
  r = V.check(d);
  check('主人公が無いと使えない', !r.usable);
  check('主人公の名前を出す', r.problems.some(p => p.indexOf('放課後の帰り道 スミレ') !== -1),
    r.problems.join('／'));

  // 対応しない0コスト人間を入れた（制作者の判断：1デッキに完全に1枚まで）
  d = clone();
  d.mainDeck.find(e => e.cardId === 'village_haruka').count -= 1;
  d.mainDeck.push({ cardId: 'mansion_elise', count: 1 });
  r = V.check(d);
  check('よそのコスト0人間は入れられない', !r.usable);
  check('理由を伝える',
    r.problems.some(p => p.indexOf('コスト0の人間は、フィールドに対応する1枚だけ') !== -1),
    r.problems.join('／'));

  // 不明なカード
  d = clone(); d.mainDeck.push({ cardId: 'no_such_card', count: 1 });
  r = V.check(d);
  check('不明なカードを見つける（仕様書 27.2）',
    r.problems.some(p => p.indexOf('不明なカード') !== -1), r.problems.join('／'));

  // 陣営混成は許す（仕様書 10.2）
  d = clone();
  d.mainDeck.find(e => e.cardId === 'village_luna').count = 1;
  d.mainDeck.push({ cardId: 'mansion_chimera', count: 3 });
  r = V.check(d);
  check('村デッキに洋館カードを入れられる（仕様書 10.2）', r.usable,
    r.problems.join('／'));

  // 問題は全部まとめて返す
  d = clone();
  d.fieldId = null;
  d.mainDeck.find(e => e.cardId === 'village_luna').count = 9;
  r = V.check(d);
  check('問題をまとめて返す（仕様書 11.5）', r.problems.length >= 3,
    r.problems.length + '件：' + r.problems.join('／'));
  check('一覧用に1件目だけ取り出せる', V.shortReason(r) === r.problems[0]);
}

console.log('\n■ 代表画像の優先順位（仕様書 15.7）');
{
  const { D } = boot();
  const d = D.create(null, 'テスト').deck;
  d.fieldId = 'field_village';
  check('エースが無ければ主人公', D.faceCardOf(d) === 'village_sumire', D.faceCardOf(d));
  d.aceCardId = 'village_nushi';
  check('エースがあればエース', D.faceCardOf(d) === 'village_nushi');
  d.aceCardId = null; d.fieldId = null;
  check('どちらも無ければ null', D.faceCardOf(d) === null);
}

console.log('\n■ 画面の作り（仕様書 11・13・30.4）');
{
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/layout.css', 'utf8');
  const ui = fs.readFileSync('js/deck-list-ui.js', 'utf8');
  const blockOf = function (name) {
    const i = html.indexOf('data-screen="' + name + '"');
    return i === -1 ? '' : html.slice(i, html.indexOf('</section>', i));
  };
  const list = blockOf('deck-list'), view = blockOf('deck-view');

  check('デッキ一覧の画面がある', list.length > 0);
  check('2列で並べる（仕様書 11.1）', /\.decklist \{[\s\S]*?grid-template-columns: 1fr 1fr;/.test(css));
  check('右下にデッキ作成がある', list.indexOf('decklist-add') !== -1);
  check('上限の理由を出す場所がある', list.indexOf('decklist-note') !== -1);
  check('カードモードから行ける', html.indexOf('data-go="deck-list"') !== -1);

  check('デッキ確認の画面がある', view.length > 0);
  check('40枚を8列で並べる（仕様書 13.2）',
    /\.dview__grid \{[\s\S]*?repeat\(8, 1fr\)/.test(css));
  check('フィールドを別枠で出す', view.indexOf('deckview-field') !== -1);
  check('枚数配分を出す（仕様書 13.4）', view.indexOf('deckview-counts') !== -1);
  check('使えない理由を出す場所がある', view.indexOf('deckview-problems') !== -1);
  ['edit', 'copy', 'image', 'delete'].forEach(function (k) {
    check('「' + k + '」ボタンがある', view.indexOf('deckview-' + k) !== -1);
  });

  check('公式では編集と削除を隠す（仕様書 13.6）',
    /\['deckview-edit', 'deckview-delete'\][\s\S]*?editable \? '' : 'none'/.test(ui));
  check('削除前に確認を出す（仕様書 13.7）',
    ui.indexOf('この操作は元に戻せません。') !== -1);
  check('使用不可は暗く見せる（仕様書 11.5）', /\.dcard--unusable \{[^}]*opacity/.test(css));
  check('使用不可のラベルを出す', ui.indexOf("'使用不可'") !== -1);

  check('一覧はサムネイルを使う', ui.indexOf('getCardThumbPath') !== -1);
  check('デッキ画像もサムネイルで描く（Canvasを小さく保つ）',
    ui.indexOf('getCardThumbPath(cardId, m.faction)') !== -1 &&
    ui.indexOf('getCardImagePath') === -1);
  check('40枚が入る大きさで描く',
    /COLS = 8, ROWS = 5/.test(ui));
  check('ファイル名に使えない文字を置き換える', ui.indexOf('imageFileName') !== -1 &&
    ui.indexOf("replace(") !== -1 && /safe = String\(deck\.name\)\.replace/.test(ui));
}

console.log('\n' + (fail === 0
  ? '===== デッキの管理と検証：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
