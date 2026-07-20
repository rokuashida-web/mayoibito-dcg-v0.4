/* =====================================================================
   save-tests.js ―― 保存基盤（v0.4 Stage A・仕様書 25/26/31.2）
   ===================================================================== */
const fs = require('fs'), vm = require('vm');
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/* localStorage のかわり */
function makeStore(opts) {
  const o = opts || {};
  const mem = {};
  return {
    getItem: k => { if (o.readFails) throw new Error('読めません'); return mem[k] === undefined ? null : mem[k]; },
    setItem: (k, v) => { if (o.writeFails) throw new Error('QuotaExceededError'); mem[k] = String(v); },
    _mem: mem,
  };
}

/** SaveManager と Collection を、指定の localStorage で読み込む */
function boot(store) {
  const ctx = vm.createContext({
    window: { localStorage: store }, JSON, console, Date, Math, isFinite,
    CARD_MASTER: G.CARD_MASTER, APP_VERSION: '0.4.0',
  });
  vm.runInContext(fs.readFileSync('js/save-manager.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/collection.js', 'utf8'), ctx);
  return {
    S: vm.runInContext('SaveManager', ctx),
    C: vm.runInContext('Collection', ctx),
  };
}

console.log('■ 初期状態');
{
  const store = makeStore();
  const { S } = boot(store);
  S.load();
  check('スキーマ版は2', S.data.schemaVersion === 2, String(S.data.schemaVersion));
  check('設定の既定値が入る',
    S.get('cpuActionSpeed') === 'normal' && S.get('seVolume') === 60 && S.get('seEnabled') === true);
  check('チュートリアルは未クリア',
    S.data.tutorial.basicCompleted === false && S.data.tutorial.advancedCompleted === false);
  check('自作デッキは空', S.data.customDecks.length === 0);
  check('初回配布はまだ', S.data.initialGrantCompleted === false);
}

console.log('\n■ 初回配布（仕様書 9.1・31.2）');
{
  const store = makeStore();
  const { S, C } = boot(store);
  S.load();
  const r = C.grantInitialIfNeeded();
  check('配布された', r.granted === true, r.kinds + '種類');

  const ids = Object.keys(G.CARD_MASTER);
  const normals = ids.filter(id => G.CARD_MASTER[id].type !== 'field' && !C.isZeroCostHuman(id));
  check('通常カードは各4枚', normals.every(id => C.countOf(id) === 4),
    normals.map(id => C.countOf(id)).join(','));
  const fields = ids.filter(id => G.CARD_MASTER[id].type === 'field');
  check('フィールドは各1枚', fields.every(id => C.countOf(id) === 1));
  const zeros = ids.filter(id => C.isZeroCostHuman(id));
  check('0コスト人間は各1枚', zeros.every(id => C.countOf(id) === 1),
    zeros.map(id => G.CARD_MASTER[id].name).join('、'));

  // 二重配布の防止
  const before = C.countOf(normals[0]);
  const r2 = C.grantInitialIfNeeded();
  check('2回目は配らない', r2.granted === false && C.countOf(normals[0]) === before);

  // 読み直しても増えない
  const { S: S2, C: C2 } = boot(store);
  S2.load();
  C2.grantInitialIfNeeded();
  check('再起動しても増えない', C2.countOf(normals[0]) === 4, String(C2.countOf(normals[0])));
}

console.log('\n■ デッキ編成に0コスト人間を出さない（制作者の判断）');
{
  const store = makeStore();
  const { S, C } = boot(store);
  S.load(); C.grantInitialIfNeeded();

  const forEditor = C.listForDeckEditor();
  const zeros = Object.keys(G.CARD_MASTER).filter(id => C.isZeroCostHuman(id));
  check('0コスト人間が候補に出ない',
    zeros.every(id => forEditor.indexOf(id) === -1),
    zeros.map(id => G.CARD_MASTER[id].name).join('、'));
  check('フィールドも候補に出ない',
    forEditor.every(id => G.CARD_MASTER[id].type !== 'field'));
  check('それ以外は全部出る', forEditor.length === 23, forEditor.length + '種類');

  check('0コスト人間のデッキ投入上限は1枚', zeros.every(id => C.maxInDeck(id) === 1));
  check('通常カードの投入上限は4枚',
    C.maxInDeck('village_rin') === 4, String(C.maxInDeck('village_rin')));
  check('フィールドは別枠で選ぶ', C.listFields().length === 2, C.listFields().join('、'));
}

console.log('\n■ v0.3からの引き継ぎ（仕様書 25.5・31.2）');
{
  const store = makeStore();
  store.setItem('mayohibito.v03', JSON.stringify({
    storageSchemaVersion: 1,
    settings: { cpuActionSpeed: 'fast', animationSpeed: 'fast', seEnabled: false,
                seVolume: 25, mirrorLanes: false },
    guide: { completedItems: ['hand', 'play'], hasCompleted: true },
    last: { cpuDifficulty: 'expert', playerDeck: 'mansion', seedMode: 'fixed' },
  }));
  const { S } = boot(store);
  S.load();

  check('CPU速度が引き継がれる', S.get('cpuActionSpeed') === 'fast');
  check('演出速度が引き継がれる', S.get('animationSpeed') === 'fast');
  check('SEのON/OFFが引き継がれる', S.get('seEnabled') === false);
  check('音量が引き継がれる', S.get('seVolume') === 25, String(S.get('seVolume')));
  check('左右反転が引き継がれる', S.get('mirrorLanes') === false);
  check('前回の難易度が引き継がれる', S.lastOf('cpuDifficulty') === 'expert');
  check('前回のデッキが引き継がれる', S.lastOf('playerDeck') === 'mansion');

  check('旧ガイドの記録は引き継がない',
    JSON.stringify(S.data).indexOf('completedItems') === -1 &&
    JSON.stringify(S.data).indexOf('hasCompleted') === -1);
  check('旧ガイドをチュートリアルのクリアに読み替えない',
    S.data.tutorial.basicCompleted === false && S.data.tutorial.advancedCompleted === false);

  // 引き継いだ結果が v0.4 のキーへ保存されている
  check('v0.4のキーへ保存される', !!store._mem['mayohibito.v04']);
}

console.log('\n■ 壊れたデータ（仕様書 25.6・27.3）');
{
  // 読めないJSON
  {
    const store = makeStore();
    store.setItem('mayohibito.v04', '{壊れた');
    const { S } = boot(store);
    let err = null;
    try { S.load(); } catch (e) { err = e.message; }
    check('落ちない', !err, err || '');
    check('初期状態で始まる', S.get('seVolume') === 60);
    check('直した箇所を控えている', S.repairs.length > 0, S.repairs[0]);
    check('壊れた中身を控えている', typeof S.brokenBackup === 'string');
  }
  // おかしい値だけを弾く
  {
    const store = makeStore();
    store.setItem('mayohibito.v04', JSON.stringify({
      schemaVersion: 2,
      settings: { cpuActionSpeed: '超速', animationSpeed: 'fast', seVolume: 999, seEnabled: 'はい' },
      collection: { village_rin: 3, 'unknown_card': 4, mansion_key: -5 },
      customDecks: [
        { id: 'ok', name: 'まとも', fieldId: 'field_village', mainDeck: [{ cardId: 'village_rin', count: 4 }] },
        { name: 'IDなし' },
        'デッキじゃない',
      ],
      initialGrantCompleted: true,
    }));
    const { S, C } = boot(store);
    S.load();
    check('知らない値は既定のまま', S.get('cpuActionSpeed') === 'normal');
    check('正しい値は取り込む', S.get('animationSpeed') === 'fast');
    check('範囲外の音量は無視', S.get('seVolume') === 60);
    check('型が違う値は無視', S.get('seEnabled') === true);
    check('知らないカードIDは除く', C.countOf('village_rin') === 3 && C.countOf('unknown_card') === 0);
    check('負の枚数は除く', C.countOf('mansion_key') === 0);
    check('壊れたデッキだけを除き、まともなデッキは残す',
      S.data.customDecks.length === 1 && S.data.customDecks[0].id === 'ok',
      S.data.customDecks.length + '個');
    check('直した箇所を控えている', S.repairs.length >= 2, S.repairs.join(' / '));
  }
  // デッキ11個以上
  {
    const decks = [];
    for (let i = 0; i < 13; i++) decks.push({ id: 'd' + i, name: 'デッキ' + i, mainDeck: [] });
    const store = makeStore();
    store.setItem('mayohibito.v04', JSON.stringify({ schemaVersion: 2, customDecks: decks }));
    const { S } = boot(store);
    S.load();
    check('自作デッキは10個まで', S.data.customDecks.length === 10, S.data.customDecks.length + '個');
  }
}

console.log('\n■ 保存できない環境（仕様書 27.3）');
{
  const { S } = boot(makeStore({ writeFails: true }));
  S.load();
  const r = S.set('seVolume', 30);
  check('保存失敗を隠さない', r.ok === false, r.reason);
  const { S: S2 } = boot(makeStore({ readFails: true }));
  let err = null;
  try { S2.load(); } catch (e) { err = e.message; }
  check('読めない環境でも落ちない', !err, err || '');
  check('使えないことを控えている', S2.repairs.length > 0, S2.repairs[0]);
}

console.log('\n■ 書き出しと読み込み（仕様書 26・31.2）');
{
  const store = makeStore();
  const { S, C } = boot(store);
  S.load(); C.grantInitialIfNeeded();
  S.set('seVolume', 15);
  S.data.tutorial.basicCompleted = true;
  S.data.customDecks.push({ id: 'deck_custom_001', name: '混成テスト',
    fieldId: 'field_village', mainDeck: [{ cardId: 'mansion_isabella', count: 4 }],
    aceCardId: 'mansion_isabella' });
  S.save();

  const text = S.exportText();
  check('書き出したものがJSONとして読める', (() => { try { JSON.parse(text); return true; } catch (e) { return false; } })());
  const obj = JSON.parse(text);
  ['schemaVersion', 'appVersion', 'exportedAt', 'settings', 'tutorial',
   'collection', 'customDecks', 'lastSelections'].forEach(function (k) {
    check('「' + k + '」が入る', k in obj);
  });
  check('ファイル名が作れる', /^マヨイビト_セーブデータ_\d{8}\.json$/.test(S.exportFileName()),
    S.exportFileName());

  // 別の端末へ読み込む
  const { S: S2 } = boot(makeStore());
  S2.load();
  const r = S2.importText(text);
  check('読み込める', r.ok === true, r.reason || '');
  check('音量が復元される', S2.get('seVolume') === 15);
  check('チュートリアルのクリアが復元される', S2.data.tutorial.basicCompleted === true);
  check('自作デッキが復元される',
    S2.data.customDecks.length === 1 && S2.data.customDecks[0].name === '混成テスト');
  check('所持カードが復元される', S2.data.collection.village_rin === 4);

  // 不正なJSON
  check('壊れたJSONは拒む', S2.importText('{こわれ').ok === false);
  check('形式違いは拒む', S2.importText('123').ok === false);
  check('版が違えば拒む',
    S2.importText(JSON.stringify({ schemaVersion: 99 })).ok === false);
  check('拒んだあとも中身が壊れない', S2.get('seVolume') === 15);
}

console.log('\n■ 初期化（仕様書 26.3）');
{
  const store = makeStore();
  const { S, C } = boot(store);
  S.load(); C.grantInitialIfNeeded();
  S.set('seVolume', 5);
  S.data.tutorial.basicCompleted = true;
  S.data.customDecks.push({ id: 'x', name: 'x', mainDeck: [] });
  S.save();

  S.reset();
  check('設定が戻る', S.get('seVolume') === 60);
  check('チュートリアルの記録が消える', S.data.tutorial.basicCompleted === false);
  check('自作デッキが消える', S.data.customDecks.length === 0);
  check('所持カードが消える', Object.keys(S.data.collection).length === 0);
  check('初回配布のフラグも戻る', S.data.initialGrantCompleted === false);

  // 設定だけの初期化では、他を消さない
  const { S: S3, C: C3 } = boot(makeStore());
  S3.load(); C3.grantInitialIfNeeded();
  S3.set('seVolume', 5);
  S3.data.tutorial.basicCompleted = true;
  S3.resetSettings();
  check('設定だけの初期化では所持カードを消さない', C3.countOf('village_rin') === 4);
  check('設定だけの初期化ではチュートリアル記録を消さない',
    S3.data.tutorial.basicCompleted === true);
}

console.log('\n' + (fail === 0
  ? '===== 保存基盤：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
