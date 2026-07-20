/* =====================================================================
   cardlist-tests.js ―― カード一覧（v0.4 Stage C・仕様書 16・30.3）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const M = G.CARD_MASTER;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

const ctx = vm.createContext({ CARD_MASTER: M, console, String, Number });
vm.runInContext(fs.readFileSync('js/card-filter.js', 'utf8'), ctx);
const F = vm.runInContext('CardFilter', ctx);
const ALL = Object.keys(M);
const names = ids => ids.map(id => M[id].name);

console.log('■ 並び替え（仕様書 13.3・15.9）');
{
  const sorted = F.sort(ALL, 'default');
  const order = { human: 0, youkai: 1, goods: 2, event: 3, field: 4 };
  let ok = true;
  for (let i = 1; i < sorted.length; i++) {
    const a = M[sorted[i - 1]], b = M[sorted[i]];
    if (order[a.type] > order[b.type]) { ok = false; break; }
    if (order[a.type] === order[b.type]) {
      const ca = a.cost == null ? -1 : a.cost, cb = b.cost == null ? -1 : b.cost;
      if (ca > cb) { ok = false; break; }
    }
  }
  check('種類→コスト の順になっている', ok);
  check('フィールドは最後尾（制作者の指示）',
    sorted.slice(-2).every(id => M[id].type === 'field'), names(sorted.slice(-2)).join('、'));
  console.log('   ' + names(sorted).slice(0, 6).join('、') + ' … ' + names(sorted).slice(-2).join('、'));

  // 同じタイプ・同じコストの中は五十音順
  const humans1 = sorted.filter(id => M[id].type === 'human' && M[id].cost === 1);
  const sortedNames = names(humans1);
  const expect = sortedNames.slice().sort((a, b) => a.localeCompare(b, 'ja'));
  check('同コストの中は五十音順', JSON.stringify(sortedNames) === JSON.stringify(expect),
    sortedNames.join('、'));

  const asc = F.sort(ALL, 'costAsc').map(id => M[id].cost == null ? -1 : M[id].cost);
  check('コスト小さい順', asc.every((v, i) => i === 0 || asc[i - 1] <= v), asc.join(','));
  const desc = F.sort(ALL, 'costDesc').map(id => M[id].cost == null ? -1 : M[id].cost);
  check('コスト大きい順', desc.every((v, i) => i === 0 || desc[i - 1] >= v), desc.join(','));

  const byName = names(F.sort(ALL, 'name'));
  check('名前順', JSON.stringify(byName) === JSON.stringify(byName.slice().sort((a, b) => a.localeCompare(b, 'ja'))),
    byName.slice(0, 4).join('、') + ' …');

  // 並べても枚数は変わらない
  ['default', 'costAsc', 'costDesc', 'name'].forEach(function (mode) {
    check(mode + ' で枚数が変わらない', F.sort(ALL, mode).length === ALL.length);
  });
}

console.log('\n■ 検索（仕様書 15.9）');
{
  check('名前の部分一致', names(F.filter(ALL, { text: 'リン' })).join('、') === '頼れる委員長 リン',
    names(F.filter(ALL, { text: 'リン' })).join('、'));
  check('ひらがなでカタカナ名を見つける',
    F.filter(ALL, { text: 'るな' }).indexOf('village_luna') !== -1,
    names(F.filter(ALL, { text: 'るな' })).join('、'));
  check('空欄なら絞らない', F.filter(ALL, { text: '' }).length === ALL.length);
  check('前後の空白は無視', F.filter(ALL, { text: '  ヌシ  ' }).length === 1);
  check('見つからないときは0件', F.filter(ALL, { text: 'ぞぞぞ' }).length === 0);
}

console.log('\n■ 特徴での検索（制作者の指示・陣営の絞り込みと差し替え）');
{
  const seifuku = F.filter(ALL, { trait: '制服' });
  check('〔制服〕を持つカードが出る',
    names(seifuku).join('、') === '泣き虫転校生 ルナ、負けず嫌い カエデ、頼れる委員長 リン',
    names(seifuku).join('、'));
  check('〔洋館〕は13種類', F.filter(ALL, { trait: '洋館' }).length === 13);
  check('括弧を付けても同じ結果',
    F.filter(ALL, { trait: '〔洋館〕' }).length === F.filter(ALL, { trait: '洋館' }).length);
  check('部分一致で探せる', F.filter(ALL, { trait: '屋敷' }).length === 2,
    names(F.filter(ALL, { trait: '屋敷' })).join('、'));
  check('特徴が無いカードは引っかからない',
    F.filter(ALL, { trait: '村' }).indexOf('village_flashlight') === -1);
  check('空欄なら絞らない', F.filter(ALL, { trait: '' }).length === ALL.length);
  check('無い特徴では0件', F.filter(ALL, { trait: 'ぞぞぞ' }).length === 0);
  check('特徴の一覧が取れる', F.allTraits().length === 22, F.allTraits().length + '種類');

  check('陣営での絞り込みは無くなった',
    F.filter(ALL, { factions: ['village'] }).length === ALL.length);
}

console.log('\n■ 絞り込み（仕様書 15.9）');
{
  const h = F.filter(ALL, { types: ['human'] });
  check('人間だけ', h.every(id => M[id].type === 'human'), h.length + '種類');
  check('フィールドも絞れる（仕様書 16.2）',
    F.filter(ALL, { types: ['field'] }).length === 2);

  const c2 = F.filter(ALL, { costs: [2] });
  check('コスト2だけ', c2.every(id => M[id].cost === 2), c2.length + '種類');
  check('「5以上」は5以上をまとめる',
    F.filter(ALL, { costs: [5] }).every(id => M[id].cost >= 5) &&
    F.filter(ALL, { costs: [5] }).length === 1,
    names(F.filter(ALL, { costs: [5] })).join('、'));

  // 種類どうしは and
  const both = F.filter(ALL, { trait: '村', types: ['youkai'], costs: [2] });
  check('特徴〔村〕＋怪異＋コスト2 の重ねがけ',
    both.every(id => (M[id].traits || []).indexOf('村') !== -1 &&
                     M[id].type === 'youkai' && M[id].cost === 2),
    names(both).join('、'));
  check('条件に合わなければ0件',
    F.filter(ALL, { trait: '洋館', types: ['field'], costs: [3] }).length === 0);

  // 検索と絞り込みの併用
  const mix = F.apply(ALL, { text: 'エマ', trait: '使用人' }, 'default');
  check('名前と特徴を重ねられる', names(mix).join('、') === '微笑む使用人 エマ',
    names(mix).join('、'));
}

console.log('\n■ 所持カードの一覧（仕様書 16.2）');
{
  const c2 = vm.createContext({
    window: { localStorage: (() => { const m = {}; return {
      getItem: k => m[k] === undefined ? null : m[k], setItem: (k, v) => { m[k] = String(v); } }; })() },
    JSON, console, Date, Math, isFinite, CARD_MASTER: M, APP_VERSION: '0.4.0',
  });
  vm.runInContext(fs.readFileSync('js/save-manager.js', 'utf8'), c2);
  vm.runInContext(fs.readFileSync('js/collection.js', 'utf8'), c2);
  const S = vm.runInContext('SaveManager', c2), C = vm.runInContext('Collection', c2);
  S.load(); C.grantInitialIfNeeded();

  const list = C.list();
  check('全27種が並ぶ', list.length === 27, list.length + '種類');
  check('フィールドも含む', list.filter(id => M[id].type === 'field').length === 2);
  check('0コスト人間も含む', list.filter(id => C.isZeroCostHuman(id)).length === 2,
    names(list.filter(id => C.isZeroCostHuman(id))).join('、'));
  check('1種類につき1つだけ', new Set(list).size === list.length);
  check('所持枚数が取れる', C.countOf('village_rin') === 4 && C.countOf('field_village') === 1);
}

console.log('\n■ サムネイル画像（軽さの対策）');
{
  const c3 = vm.createContext({});
  vm.runInContext(fs.readFileSync('js/card-images.js', 'utf8'), c3);
  const thumb = vm.runInContext('getCardThumbPath', c3);
  const full = vm.runInContext('getCardImagePath', c3);

  check('サムネイルのパスが作れる', thumb('village_rin') === 'images/thumb/village_rin.webp',
    thumb('village_rin'));
  check('陣営ごとの絵柄にも対応',
    thumb('event_kyoukaisen', 'mansion') === 'images/thumb/event_kyoukaisen_mansion.webp');

  // 参照している画像が実在するか
  const missing = [];
  Object.keys(M).forEach(function (id) {
    ['village', 'mansion'].forEach(function (owner) {
      const p = thumb(id, owner);
      if (p && !fs.existsSync(p)) missing.push(p);
    });
  });
  check('サムネイルがすべて存在する', missing.length === 0, missing.join('／'));

  // 元画像より十分小さいか
  const fullSize = fs.statSync(full('village_rin')).size;
  const thumbSize = fs.statSync(thumb('village_rin')).size;
  check('元画像より小さい', thumbSize < fullSize / 3,
    Math.round(fullSize / 1024) + 'KB → ' + Math.round(thumbSize / 1024) + 'KB');

  const dir = fs.readdirSync('images/thumb').filter(f => f.endsWith('.webp'));
  const orig = fs.readdirSync('images').filter(f => f.endsWith('.webp'));
  check('元画像と同じ枚数ある', dir.length === orig.length, dir.length + '枚 / ' + orig.length + '枚');
}

console.log('\n■ 画面の作り（仕様書 16.1・30.3）');
{
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/layout.css', 'utf8');
  const i = html.indexOf('data-screen="card-list"');
  const block = html.slice(i, html.indexOf('</section>', i));

  check('カード一覧の画面がある', i !== -1);
  check('6列で並べる', /grid-template-columns: repeat\(6, 1fr\)/.test(css));
  check('上部に戻るとタイトルがある',
    block.indexOf('data-back') !== -1 && block.indexOf('カード一覧') !== -1);
  check('検索欄がある', block.indexOf('cardlist-search') !== -1);
  check('種類とコストの絞り込みがある',
    block.indexOf('data-filter="type"') !== -1 &&
    block.indexOf('data-filter="cost"') !== -1);
  check('陣営の絞り込みは無い', block.indexOf('data-filter="faction"') === -1);
  check('特徴の検索欄がある', block.indexOf('cardlist-trait') !== -1);

  // フィールドを別枠にする（制作者の指示）
  check('フィールド用の枠がある', block.indexOf('cardlist-fields') !== -1);
  check('区切りがある', block.indexOf('cardlist-sep') !== -1);
  check('フィールドは4列', /\.cardlist--field \{[^}]*repeat\(4, 1fr\)/.test(css));
  check('フィールドは横向きの形', /\.clcard--field \{ aspect-ratio: 1039 \/ 744; \}/.test(css));

  // 枠が伸縮しない（制作者の指示）
  check('一覧画面は縦のflexで、上下のバーが動かない',
    /\.menu\.menu--wide\.is-open \{[\s\S]*?flex-direction: column;/.test(css));
  check('画面いっぱいに貼り付けている（高さが決まらない事故を防ぐ）',
    /\.menu\.menu--wide\.is-open \{[\s\S]*?position: absolute;[\s\S]*?inset: 0;/.test(css));

  /* ★CSSの強さの点検（今回の不具合の再発防止）
     .menu.is-open { display: block } が後ろにあるので、
     一覧側は必ずそれより強いセレクタで上書きしていること。 */
  const strength = sel => (sel.match(/\./g) || []).length + (sel.match(/#/g) || []).length * 100;
  const wideSel = (css.match(/(\.menu[\w.-]*\.menu--wide\.is-open)/) || [])[1] || '';
  check('一覧のセレクタが .menu.is-open より強い',
    strength(wideSel) > strength('.menu.is-open'),
    wideSel + '（強さ ' + strength(wideSel) + '） > .menu.is-open（強さ ' +
    strength('.menu.is-open') + '）');
  check('流れるのは中央だけ', /\.cardlist__scroll \{[\s\S]*?flex: 1 1 0;[\s\S]*?min-height: 0;/.test(css));

  // ボタンの折り返し（制作者の指示）
  check('絞り込みの行は grid で列を決め打ちしている',
    /\.cltools__row \{[\s\S]*?display: grid;/.test(css));
  check('種類の行は5列ぶんの幅を取る', /\.cltools__row--c5 \{ grid-template-columns: 108px repeat\(5, 1fr\); \}/.test(css));
  check('コストの行は6列ぶん', /\.cltools__row--c6 \{ grid-template-columns: 108px repeat\(6, 1fr\); \}/.test(css));
  check('見出しの幅が同じなので行をまたいで端がそろう',
    (css.match(/grid-template-columns: 108px repeat/g) || []).length === 2);
  check('並び替えが4種類ある', (block.match(/data-sort=/g) || []).length === 4);
  check('カードモードから行ける', html.indexOf('data-go="card-list"') !== -1);

  const ui = fs.readFileSync('js/card-list-ui.js', 'utf8');
  check('一覧はサムネイルを使う', ui.indexOf('getCardThumbPath') !== -1);
  check('拡大詳細だけ元画像を使う', ui.indexOf('getCardImagePath') !== -1);
  check('所持枚数を×付きで出す', ui.indexOf("'×' + n") !== -1);
  check('詳細にデッキ追加・削除ボタンを出さない（仕様書 16.3）',
    ui.indexOf('デッキに追加') === -1 && ui.indexOf('デッキから削除') === -1);
  check('画像が読めないときは名前を出す', ui.indexOf('is-noimage') !== -1);
}

console.log('\n' + (fail === 0
  ? '===== カード一覧：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
