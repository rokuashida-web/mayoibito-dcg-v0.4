/* =====================================================================
   card-update-tests.js ―― カード3枚の更新（v0.3.1）
   ・クロード：フィールド条件つきの気力回復
   ・アネット：テキストのみ（処理は据え置き）
   ・シルヴィ：グッズ/イベント1枚＋イザベラ1枚の合計2枚まで
   ===================================================================== */
const { loadGame } = require('./test-harness.js');
const G = loadGame('.');
const { Game, CARD_MASTER } = G;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

/** その席が持っているカードの総数（どこにあっても数える） */
function totalCards(p) {
  return p.deck.length + p.hand.length + p.humans.length + p.youkai.length +
         p.trash.length + p.lost.length;
}

function newGame(seed) {
  Game.hiddenSide = null;
  Game.start('mansion', seed || 'CARD-1', {
    decks: { village: 'village', mansion: 'mansion' },
    labels: { village: 'あなた', mansion: 'CPU' },
  });
  Game.confirmMulligan('village', []);
  Game.confirmMulligan('mansion', []);
  Game.beginTurn('mansion');
  Game.turnStartResources('mansion');
  return Game.state.players.mansion;
}

/** 待機している効果を、渡した答えで解決する */
function resolveAll(answers) {
  const asked = [];
  let guard = 0;
  while (guard++ < 30) {
    const item = Game.takeNextPending();
    if (!item) break;
    Game.runEffect(item, {
      confirmYesNo: (t, m, cb) => cb(true),
      pickCards: (o, cb) => {
        asked.push(o);
        const a = answers.shift();
        cb(typeof a === 'function' ? a(o) : (a || []));
      },
      pickBoardTarget: (o, cb) => cb(o.candidates[0] || null),
    }, function () {});
  }
  return asked;
}

console.log('■ カードテキストが画像と一致しているか');
{
  const c = CARD_MASTER.mansion_claude;
  check('クロード：印刷どおりの一文',
    c.effect === '【離れた時】自分のフィールドが特徴〔洋館〕を持つなら、自分の気力を1回復する。',
    c.effect);
  check('クロードは 1コスト 2/2', c.cost === 1 && c.speed === 2 && c.hp === 2);

  const a = CARD_MASTER.mansion_annette.effect;
  check('アネット：シャッフルして戻すと書いてある', a.indexOf('シャッフルしてデッキの下に戻す') !== -1);
  check('アネット：仕様メモが本文に混ざっていない', a.indexOf('・') === -1);

  const sv = CARD_MASTER.mansion_sylvie.effect;
  check('シルヴィ：グッズ/イベント1枚とイザベラ1枚と書いてある',
    sv.indexOf('グッズ/イベント1枚と、「企む貴婦人 イザベラ」1枚') !== -1);
  check('シルヴィ：シャッフルして戻すと書いてある', sv.indexOf('シャッフルしてデッキの下に戻す') !== -1);
}

console.log('\n■ 全カードのテキストが印刷どおりの形になっているか');
{
  const ids = Object.keys(CARD_MASTER);
  const noteLeft = ids.filter(function (id) {
    const t = CARD_MASTER[id].effect || '';
    return t.indexOf('・') !== -1 || t.indexOf('  1.') !== -1 || t.indexOf('\n  ') !== -1;
  });
  check('仕様メモが本文に混ざっていない', noteLeft.length === 0, noteLeft.join('／'));

  const nushi = CARD_MASTER.village_nushi.effect;
  check('ヌシ様：相手のスピードを-1する',
    nushi.indexOf('相手の人間/怪異カード全てのスピードを-1する') !== -1, nushi);

  const rin = CARD_MASTER.village_rin.effect;
  check('リン：1ターンに1回の制限が書いてある',
    rin.indexOf('1ターンに1回しか使えない') !== -1);

  const luna = CARD_MASTER.village_luna.effect;
  check('ルナ：デッキの上から2枚（画像・実装とも2枚で確定）',
    luna.indexOf('上から2枚をトラッシュに置く') !== -1, luna);

  const key = CARD_MASTER.mansion_key.effect;
  check('小さな鍵：2軽減／イザベラなら4軽減',
    key.indexOf('2軽減') !== -1 && key.indexOf('かわりに4軽減') !== -1);

  const isa = CARD_MASTER.mansion_isabella.effect;
  check('イザベラ：ゲーム中に1回と書いてある', isa.indexOf('【ゲーム中に1回】') !== -1);

  // 「好きな順番で戻す」など、DCGに向かないテキストが残っていないか
  const bad = ids.filter(function (id) {
    const t = CARD_MASTER[id].effect || '';
    return t.indexOf('好きな順番') !== -1 || t.indexOf('任意の順') !== -1;
  });
  check('「好きな順番で戻す」が残っていない', bad.length === 0, bad.join('／'));
}

console.log('\n■ 特徴が印刷されたカードどおりか');
{
  const WANT = {
    field_village: '村,自然,信仰', village_rin: '村,制服,リーダー',
    village_luna: '村,制服', village_kaede: '村,制服',
    village_haruka: '村,大人', village_sumire: '村,大人',
    village_kakashi: '村,呪い', village_kohaku: '村,子ども',
    village_nushi: '村,自然,神秘', village_ichimatsu: '村,人形',
    village_flashlight: '', village_ofuda: '村,呪い',
    event_kyoukaisen: '神秘', village_sashinoberu: '村,神秘',
    field_mansion: '洋館,悪魔,迷子', mansion_elise: '洋館,屋敷の主',
    mansion_emma: '洋館,使用人', mansion_sylvie: '洋館,使用人,案内人',
    mansion_lily: '洋館,客人', mansion_annette: '洋館,客人,迷子',
    mansion_armor: '洋館,亡霊', mansion_isabella: '洋館,屋敷の主,黒幕',
    mansion_chimera: '洋館,異形', mansion_claude: '洋館,執事',
    mansion_key: '洋館', mansion_ring: '洋館,魔力',
    mansion_sakuryaku: '洋館,黒幕',
  };
  const wrong = Object.keys(WANT).filter(function (id) {
    return (CARD_MASTER[id].traits || []).join(',') !== WANT[id];
  });
  check('27枚すべて画像どおり', wrong.length === 0,
    wrong.map(function (id) {
      return CARD_MASTER[id].name + '（' + (CARD_MASTER[id].traits || []).join('・') + '）';
    }).join('／'));

  // 特徴を変えてもルール処理が変わっていないこと
  const ids = Object.keys(CARD_MASTER);
  const has = function (id, t) { return (CARD_MASTER[id].traits || []).indexOf(t) !== -1; };
  check('〔村〕を持つのは12枚のまま', ids.filter(function (i) { return has(i, '村'); }).length === 12,
    String(ids.filter(function (i) { return has(i, '村'); }).length));
  check('〔洋館〕を持つのは13枚のまま', ids.filter(function (i) { return has(i, '洋館'); }).length === 13,
    String(ids.filter(function (i) { return has(i, '洋館'); }).length));
  check('特徴が空でも壊れないカードがある（懐中電灯）',
    (CARD_MASTER.village_flashlight.traits || []).length === 0);
}

console.log('\n■ 特徴の括弧が〔〕になっている');
{
  let old = 0, neu = 0;
  Object.keys(CARD_MASTER).forEach(function (k) {
    const t = CARD_MASTER[k].effect || '';
    old += (t.match(/〈/g) || []).length;
    neu += (t.match(/〔/g) || []).length;
  });
  check('〈〉が1つも残っていない', old === 0, old + '個');
  check('〔〕が使われている', neu > 0, neu + '個');

  const claude = CARD_MASTER.mansion_claude.effect;
  check('「離れた時」に統一されている',
    claude.indexOf('【離れた時】') !== -1 && claude.indexOf('場を離れた時') === -1);
}

console.log('\n■ クロード：フィールド条件');
{
  const p = newGame('CLAUDE-1');
  const claude = p.deck.find(c => c.cardId === 'mansion_claude');
  p.deck = p.deck.filter(c => c !== claude);
  p.hand.push(claude);
  p.energy = 5;
  Game.playUnit('mansion', claude);
  resolveAll([]);
  const before = p.energy;
  Game._leaveField(claude);
  resolveAll([]);
  check('フィールドが〔洋館〕なら気力+1', p.energy === before + 1,
    before + ' → ' + p.energy);

  // 上限10では増えない
  p.energy = 10;
  const claude2 = p.deck.find(c => c.cardId === 'mansion_claude');
  if (claude2) {
    p.deck = p.deck.filter(c => c !== claude2);
    p.hand.push(claude2);
    Game.playUnit('mansion', claude2);
    resolveAll([]);
    p.energy = 10;
    Game._leaveField(claude2);
    resolveAll([]);
    check('気力の上限10を超えない', p.energy === 10, String(p.energy));
  }

  // フィールドから〔洋館〕を外すと不発になる
  const p2 = newGame('CLAUDE-2');
  const c3 = p2.deck.find(c => c.cardId === 'mansion_claude');
  p2.deck = p2.deck.filter(c => c !== c3);
  p2.hand.push(c3);
  p2.energy = 5;
  Game.playUnit('mansion', c3);
  resolveAll([]);
  const saved = p2.field.master.traits;
  p2.field.master = Object.assign({}, p2.field.master, { traits: [] });
  const e = p2.energy;
  Game._leaveField(c3);
  resolveAll([]);
  check('フィールドが〔洋館〕でなければ不発', p2.energy === e, e + ' → ' + p2.energy);
  check('不発をログに残す',
    Game.state.log.some(l => l.indexOf('効果不発') !== -1 && l.indexOf('クロード') !== -1));
}

console.log('\n■ シルヴィ：2枚まで手札に加えられる');
{
  function setupSylvie(topFive) {
    const p = newGame('SYLVIE-1');
    const sylvie = p.deck.find(c => c.cardId === 'mansion_sylvie') ||
                   p.hand.find(c => c.cardId === 'mansion_sylvie');
    p.deck = p.deck.filter(c => c !== sylvie);
    p.hand = p.hand.filter(c => c !== sylvie);
    p.hand.push(sylvie);
    // 山札の上5枚を指定の顔ぶれにする
    const picked = [];
    topFive.forEach(function (id) {
      const c = p.deck.find(x => x.cardId === id && picked.indexOf(x) === -1);
      if (c) picked.push(c);
    });
    p.deck = p.deck.filter(c => picked.indexOf(c) === -1);
    p.deck = picked.concat(p.deck);
    p.energy = 5;
    return { p: p, sylvie: sylvie };
  }

  // グッズとイザベラの両方がある → 2枚取れる
  {
    const { p, sylvie } = setupSylvie(
      ['mansion_key', 'mansion_isabella', 'mansion_chimera', 'mansion_armor', 'mansion_claude']);
    const handBefore = p.hand.length;
    const totalBefore = totalCards(p);
    Game.playUnit('mansion', sylvie);
    const asked = resolveAll([
      o => [o.selectable[0]],   // グッズ
      o => [o.selectable[0]],   // イザベラ
    ]);
    check('選択が2回に分かれる', asked.length === 2, asked.map(a => a.title).join(' / '));
    check('1回目はグッズ/イベントだけ選べる',
      asked[0].selectable.every(c => ['goods', 'event'].indexOf(c.master.type) !== -1),
      asked[0].selectable.map(c => c.master.name).join('、'));
    check('2回目はイザベラだけ選べる',
      asked[1].selectable.every(c => c.cardId === 'mansion_isabella'),
      asked[1].selectable.map(c => c.master.name).join('、'));

    const added = p.hand.length - (handBefore - 1);   // シルヴィが手札から出た分
    check('手札が2枚増える', added === 2, added + '枚');
    check('鍵とイザベラが手札にある',
      p.hand.some(c => c.cardId === 'mansion_key') &&
      p.hand.some(c => c.cardId === 'mansion_isabella'));
    check('カードの総数が変わらない（増えても消えてもいない）',
      totalCards(p) === totalBefore, totalBefore + ' → ' + totalCards(p));
  }

  // 片方だけある → 1回だけ聞く
  {
    const { p, sylvie } = setupSylvie(
      ['mansion_isabella', 'mansion_chimera', 'mansion_armor', 'mansion_claude', 'mansion_elise']);
    Game.playUnit('mansion', sylvie);
    const asked = resolveAll([o => [o.selectable[0]]]);
    check('グッズが無ければイザベラだけ聞く', asked.length === 1 &&
      asked[0].selectable.every(c => c.cardId === 'mansion_isabella'));
  }

  // どちらも無い → 見るだけ
  {
    const { p, sylvie } = setupSylvie(
      ['mansion_chimera', 'mansion_armor', 'mansion_claude', 'mansion_elise', 'mansion_annette']);
    const handBefore = p.hand.length;
    Game.playUnit('mansion', sylvie);
    const asked = resolveAll([[]]);
    check('候補が無ければ「加えられません」を1回だけ出す', asked.length === 1 &&
      asked[0].selectable.length === 0);
    check('手札は増えない', p.hand.length === handBefore - 1);
  }

  // 0枚を選んでもよい
  {
    const { p, sylvie } = setupSylvie(
      ['mansion_key', 'mansion_isabella', 'mansion_chimera', 'mansion_armor', 'mansion_claude']);
    const handBefore = p.hand.length;
    Game.playUnit('mansion', sylvie);
    resolveAll([[], []]);
    check('両方とも取らないこともできる', p.hand.length === handBefore - 1);
    check('見た5枚は山札に残っている', p.deck.length >= 5);
  }
}

console.log('\n' + (fail === 0
  ? '===== カードの更新：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
