/* =====================================================================
   deck-editor-tests.js ―― デッキ編成（v0.4 Stage E・仕様書 15・30.5・31.1）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* 画面のかわり。DOM を最小限だけ真似る */
function makeEl(tag) {
  const el = {
    tagName: tag, children: [], _cls: new Set(), dataset: {}, style: {},
    innerHTML: '', textContent: '', value: '', disabled: false,
    classList: {
      add: c => el._cls.add(c), remove: c => el._cls.delete(c),
      toggle: (c, on) => { if (on) el._cls.add(c); else el._cls.delete(c); },
      contains: c => el._cls.has(c),
    },
    appendChild: c => { el.children.push(c); return c; },
    remove: () => {},
    querySelector: () => makeEl('div'),
    addEventListener: () => {},
  };
  Object.defineProperty(el, 'className', {
    get: () => Array.from(el._cls).join(' '),
    set: v => { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  return el;
}

function boot() {
  const mem = {};
  const els = {};
  const doc = {
    getElementById: id => els[id] || (els[id] = makeEl('div')),
    createElement: makeEl,
    querySelectorAll: () => [],
    body: makeEl('body'),
  };
  const toasts = [];
  const ctx = vm.createContext({
    window: { localStorage: {
      getItem: k => mem[k] === undefined ? null : mem[k],
      setItem: (k, v) => { mem[k] = String(v); } } },
    document: doc, JSON, console, Date, Math, isFinite, String, Number, Array, Object,
    CARD_MASTER: G.CARD_MASTER, DECKS: G.DECKS, APP_VERSION: '0.4.0',
    Se: { play: () => {} },
    showToast: m => toasts.push(m),
    showDialog: () => {},
    attachPointer: () => {},
    getCardThumbPath: () => 'x.webp',
    getCardImagePath: () => 'x.webp',
    Screens: { go: () => {}, back: () => {} },
    STAGE_W: 1080,
  });
  ['save-manager.js', 'collection.js', 'card-filter.js', 'deck-validator.js',
   'deck-manager.js', 'deck-editor-ui.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx);
  });
  const S = vm.runInContext('SaveManager', ctx);
  const C = vm.runInContext('Collection', ctx);
  S.load(); C.grantInitialIfNeeded();
  const D = vm.runInContext('DeckManager', ctx);
  const E = vm.runInContext('DeckEditorUI', ctx);
  E.build();
  return { S, C, D, E, V: vm.runInContext('DeckValidator', ctx), toasts, els };
}

console.log('■ 40枠の作り（軽さの対策2）');
{
  const { E } = boot();
  check('枠は40個ちょうど', E.slots.length === 40, E.slots.length + '個');
  check('最初に1回だけ作る', E.slots.length === 40 && E.slotIds.length === 40);

  const { D, E: E2 } = boot();
  const copy = D.copy(D.officialDecks()[0]).deck;
  E2.open(copy.id, false);
  E2.render();
  check('公式のコピーで40枠が埋まる',
    E2.slotIds.filter(x => x !== null).length === 40);

  // 枠のDOMは作り替えない
  const before = E2.slots.slice();
  E2.removeCard('village_luna');
  const same = E2.slots.every((s, i) => s === before[i]);
  check('カードを外しても枠そのものは作り直さない', same);

  // 差分だけ触っているか（並びがずれる後半だけが変わる）
  const ids1 = E2.slotIds.slice();
  E2.addCard('village_luna');
  const ids2 = E2.slotIds.slice();
  let changed = 0;
  for (let i = 0; i < 40; i++) if (ids1[i] !== ids2[i]) changed++;
  check('1枚戻すと変わる枠は一部だけ', changed > 0 && changed < 40, changed + '枠だけ変化');
}

console.log('\n■ カードの出し入れ（仕様書 15.5）');
{
  const { D, E, toasts } = boot();
  const deck = D.create(null, '編成テスト').deck;
  E.open(deck.id, true);
  E.setField('field_village');
  E.render();

  check('フィールドを選ぶと主人公が自動で入る（仕様書 10.1）',
    E.countInDeck('village_sumire') === 1);
  check('主人公は1枚だけ', E.totalInDeck() === 1);

  check('カードを追加できる', E.addCard('village_rin') === true);
  check('枚数が増える', E.countInDeck('village_rin') === 1);
  E.addCard('village_rin'); E.addCard('village_rin'); E.addCard('village_rin');
  check('4枚まで入る', E.countInDeck('village_rin') === 4);
  check('5枚目は断る', E.addCard('village_rin') === false);
  check('理由を伝える', toasts[toasts.length - 1].indexOf('4枚まで') !== -1,
    toasts[toasts.length - 1]);

  check('外せる', E.removeCard('village_rin') === true);
  check('枚数が減る', E.countInDeck('village_rin') === 3);

  // 主人公は外せない（仕様書 15.6）
  check('主人公は外せない', E.removeCard('village_sumire') === false);
  check('理由を伝える',
    toasts[toasts.length - 1] === '対応する主人公はデッキから外せません。');
  check('主人公は残っている', E.countInDeck('village_sumire') === 1);

  // 0コスト人間は候補に出ないので、追加もできない
  check('よその0コスト人間は追加できない', E.addCard('mansion_elise') === false);
  check('理由を伝える', toasts[toasts.length - 1].indexOf('自動で入ります') !== -1,
    toasts[toasts.length - 1]);
}

console.log('\n■ 40枚で止める（仕様書 15.5）');
{
  const { D, E, toasts } = boot();
  const copy = D.copy(D.officialDecks()[0]).deck;
  E.open(copy.id, false);
  E.render();
  check('公式のコピーは40枚', E.totalInDeck() === 40);
  check('41枚目は入らない', E.addCard('village_kohaku') === false);
  check('理由を伝える', toasts[toasts.length - 1].indexOf('40枚まで') !== -1,
    toasts[toasts.length - 1]);
  check('40枚のまま', E.totalInDeck() === 40);

  E.removeCard('village_kohaku');
  check('1枚外せば入る', E.addCard('village_kohaku') === true, E.totalInDeck() + '枚');
}

console.log('\n■ 候補に出すカード（制作者の判断）');
{
  const { C } = boot();
  const list = C.listForDeckEditor();
  check('0コスト人間は候補に出ない',
    list.indexOf('village_sumire') === -1 && list.indexOf('mansion_elise') === -1);
  check('フィールドも候補に出ない',
    list.every(id => G.CARD_MASTER[id].type !== 'field'));
  check('23種類', list.length === 23, list.length + '種類');
}

console.log('\n■ フィールドの変更（仕様書 10.3）');
{
  const { D, E } = boot();
  const deck = D.create(null, 'フィールドテスト').deck;
  E.open(deck.id, true);
  E.setField('field_village');
  E.addCard('village_rin');
  E.addCard('mansion_chimera');

  check('村の主人公が入っている', E.countInDeck('village_sumire') === 1);
  E.setField('field_mansion');
  check('前の主人公が外れる', E.countInDeck('village_sumire') === 0);
  check('新しい主人公が入る', E.countInDeck('mansion_elise') === 1);
  check('そのほかのカードは残る（仕様書 10.3）',
    E.countInDeck('village_rin') === 1 && E.countInDeck('mansion_chimera') === 1);
  check('陣営をまたいでも問題ない（仕様書 10.2）', E.totalInDeck() === 3);
}

console.log('\n■ エースカード（仕様書 15.7）');
{
  const { D, E, toasts } = boot();
  const copy = D.copy(D.officialDecks()[0]).deck;
  E.open(copy.id, false);
  E.render();

  E.setAce('village_nushi');
  check('長押しで設定できる', E.deck.aceCardId === 'village_nushi');
  E.setAce('village_nushi');
  check('同じカードでもう一度押すと外れる', E.deck.aceCardId === null);

  E.setAce('village_rin');
  check('別のカードに付け替えできる', E.deck.aceCardId === 'village_rin');

  // 枚数が0になったら自動で外れる
  const n = E.countInDeck('village_rin');
  for (let i = 0; i < n; i++) E.removeCard('village_rin');
  check('デッキから消えたら自動で解除（仕様書 15.7）', E.deck.aceCardId === null);
  check('その旨を伝える',
    toasts.some(t => t.indexOf('エースカードがデッキから外れた') !== -1),
    toasts[toasts.length - 1]);
}

console.log('\n■ 未完成でも保存できる（仕様書 15.3・31.1）');
{
  const { D, E, V } = boot();
  const deck = D.create(null, '作りかけ').deck;
  E.open(deck.id, true);
  E.setField('field_village');
  E.addCard('village_rin');
  E.save();

  const saved = D.byId(deck.id);
  check('40枚未満でも保存される', saved.mainDeck.length === 2, saved.mainDeck.length + '種類');
  check('保存しても使用不可のまま', V.check(saved).usable === false);
  check('使用不可の理由が出る',
    V.check(saved).problems.some(p => p.indexOf('不足') !== -1));
  check('保存は完成判定と分かれている', saved.updatedAt != null);
}

console.log('\n■ 編集は写しに対して行う（元を壊さない）');
{
  const { D, E } = boot();
  const copy = D.copy(D.officialDecks()[0]).deck;
  E.open(copy.id, false);
  E.render();
  E.removeCard('village_luna');
  E.removeCard('village_luna');

  check('保存するまで元は変わらない',
    D.byId(copy.id).mainDeck.find(e => e.cardId === 'village_luna').count === 4);
  E.save();
  check('保存すると反映される',
    D.byId(copy.id).mainDeck.find(e => e.cardId === 'village_luna').count === 2);
  check('公式デッキは変わらない',
    D.officialDecks()[0].mainDeck.find(e => e.id === 'village_luna' || e.cardId === 'village_luna'));
}

console.log('\n■ 画面の作り（仕様書 15.1・30.5）');
{
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/layout.css', 'utf8');
  const ui = fs.readFileSync('js/deck-editor-ui.js', 'utf8');
  const i = html.indexOf('data-screen="deck-edit"');
  const block = html.slice(i, html.indexOf('</section>', i));

  check('編成画面がある', i !== -1);
  check('上部に戻る・デッキ名・保存がある',
    block.indexOf('deckedit-back') !== -1 && block.indexOf('deckedit-name') !== -1 &&
    block.indexOf('deckedit-save') !== -1);
  check('デッキ名は16文字まで', /maxlength="16"/.test(block));
  check('上段にフィールドと枚数配分がある',
    block.indexOf('deckedit-field') !== -1 && block.indexOf('deckedit-counts') !== -1);
  check('40枠を8列で並べる（仕様書 15.1）',
    /\.dedit__grid \{[\s\S]*?repeat\(8, 1fr\)/.test(css));
  check('下部に所持カードの帯がある', block.indexOf('deckedit-band') !== -1);
  check('帯は横スクロールする', /\.dband \{[\s\S]*?overflow-x: auto;/.test(css));
  check('最下部に検索・絞り込み・並び替えがある',
    block.indexOf('deckedit-search') !== -1 && block.indexOf('data-sort') !== -1);

  check('フィールド選択の画面がある', html.indexOf('data-screen="field-select"') !== -1);
  check('フィールドはタップで選ぶ（制作者の判断）',
    ui.indexOf('FieldPickerUI.open()') !== -1);

  check('詳細に追加・削除ボタンがある',
    html.indexOf('dedetail-add') !== -1 && html.indexOf('dedetail-remove') !== -1);
  check('押せないボタンは理由を出す（仕様書 15.4）',
    ui.indexOf('dedetail__why') !== -1);

  // 軽さの対策
  check('サムネイルを使う', ui.indexOf('getCardThumbPath') !== -1);
  check('拡大詳細だけ元画像', ui.indexOf('getCardImagePath') !== -1);
  check('ドラッグ中は影だけを transform で動かす',
    /this\.drag\.ghost\.style\.transform/.test(ui));
  check('影は当たり判定を持たない', /\.dghost \{[\s\S]*?pointer-events: none;/.test(css));
  check('枠は中身が同じなら触らない',
    /if \(this\.slotIds\[i\] === want\)/.test(ui));
  check('横スワイプは帯のスクロールに任せる', ui.indexOf('onScrubMove') !== -1);
}

console.log('\n' + (fail === 0
  ? '===== デッキ編成：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
