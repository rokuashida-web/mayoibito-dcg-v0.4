/* =====================================================================
   screens.js  ―  v0.3 の画面遷移（仕様書 5〜7）
   ---------------------------------------------------------------------
   タイトル・モード選択・各設定画面・遊び方・設定を切り替えます。

   考え方:
     ・画面はすべて index.html の #start-screen の中に置いてあり、
       いま出したい1枚だけに is-open を付けます。
     ・「戻る」で1つ前へ返れるように、通ってきた画面を履歴として
       積んでいきます（stack）。
     ・対戦そのものは preview.js の startGame() が受け持ちます。
       このファイルはゲームのルールに一切触れません。

   対戦そのものは preview.js が、CPUの操作は cpu-driver.js が受け持ちます。
   ===================================================================== */

'use strict';

/* 開発用の調整パネルを出すかどうか。
   配布版では隠すため false。開発中に触りたいときだけ true にします。
   （仕様書 33：配布版に開発用UIを残さない） */
const DEV_PANEL = false;

const Screens = {

  /* 通ってきた画面の履歴。いちばん後ろが「いま出ている画面」 */
  stack: [],

  /* どの画面から対戦へ入ったか。リザルトの戻り先に使います */
  lastSetup: null,

  /* =============================================================
     起動時に1回だけ呼ぶ
     ============================================================= */
  /* CPU対戦の設定。ここが既定値で、前回の選択があれば _restore が上書きします */
  cpu: {
    playerDeck: 'village',   // 'village' / 'mansion'
    cpuDeck: 'mansion',      // 'village' / 'mansion' / 'random'
    difficulty: 'normal',    // weak / normal / strong / expert / unfair
    firstPlayer: 'player',   // 'player' / 'cpu' / 'random'
    seedMode: 'random',      // 'random' / 'fixed'
  },

  /* ひとり回しの設定（仕様書 19.2） */
  solo: {
    deck1: 'village',        // プレイヤー1のデッキ
    deck2: 'mansion',        // プレイヤー2のデッキ
    firstPlayer: 'deck1',    // 'deck1' / 'deck2' / 'random'
    seedMode: 'random',      // 'random' / 'fixed'
  },

  /* 設定画面の値（仕様書 22）。ON/OFF も文字列で持ちます */
  settings: {
    cpuActionSpeed: 'normal',
    animationSpeed: 'normal',
    seEnabled: 'on',
    mirrorLanes: 'on',
  },

  /* CPU観戦の設定（仕様書 20.2） */
  watch: {
    deck1: 'village', diff1: 'strong',
    deck2: 'mansion', diff2: 'strong',
    firstPlayer: 'cpu1',     // 'cpu1' / 'cpu2' / 'random'
    seedMode: 'random',
    speed: 'normal',         // 'normal' / 'fast' / 'veryfast'
  },

  /* 直前の対戦の中身（リザルトと再戦で使います） */
  lastMatch: null,

  init: function () {
    const self = this;

    // data-go="◯◯" のボタンは、その画面へ進む
    document.querySelectorAll('[data-go]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.go(btn.dataset.go);
      });
    });

    // data-back のボタンは、1つ前の画面へ戻る
    document.querySelectorAll('[data-back]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.back(); });
    });

    this.setupStartScreen();     // タップしてスタート（仕様書 5.2）
    this.setupComingSoon();      // まだ作っていない項目

    this._setupOptionGroups();
    this._setupSolo();
    this._setupCpu();
    this._setupWatch();
    this._setupSettings();
    this._hideDevPanel();
    this._restore();
  },

  /* =============================================================
     data-opt / data-val の選択ボタンをまとめて配線する
     -------------------------------------------------------------
       <div class="menu__choices" data-opt="difficulty">
         <button data-val="weak">弱</button> ...
     と書いておけば、押したときに this.cpu.difficulty が変わります。
     Stage D・E の設定画面でも同じ仕組みを使います。
     ============================================================= */
  _setupOptionGroups: function () {
    const self = this;
    document.querySelectorAll('[data-opt]').forEach(function (group) {
      const store = group.dataset.store || 'cpu';   // どの設定に書き込むか
      const key = group.dataset.opt;
      group.querySelectorAll('[data-val]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self[store][key] = btn.dataset.val;
          self._renderOptions();
          if (store === 'cpu') self._renderCpu();
          if (store === 'solo') self._renderSolo();
          if (store === 'watch') self._renderWatch();
          if (store === 'settings') self._applySettings();
        });
      });
    });
  },

  /** 選ばれているボタンの見た目を合わせ直す（全画面ぶん） */
  _renderOptions: function () {
    const self = this;
    document.querySelectorAll('[data-opt]').forEach(function (group) {
      const store = group.dataset.store || 'cpu';
      const key = group.dataset.opt;
      group.querySelectorAll('[data-val]').forEach(function (btn) {
        btn.classList.toggle('is-on', self[store][key] === btn.dataset.val);
      });
    });
  },

  /* =============================================================
     画面を切り替える
     ------------------------------------------------------------- 
     go()   … 履歴に積んで進む
     back() … 1つ戻る（履歴が空ならタイトルへ）
     reset()… 履歴を捨てて、その画面から始め直す
     ============================================================= */

  /* =============================================================
     スタート画面（v0.4 仕様書 5.2）
     -------------------------------------------------------------
     画面のどこを押しても始まります。PCではEnterとSpaceでも。
     二重に進まないよう、進み始めたら受付を止めます。
     ============================================================= */
  _startLocked: false,

  setupStartScreen: function () {
    const self = this;
    const screen = document.getElementById('screen-start');
    if (!screen) return;

    const begin = function () {
      if (self._startLocked) return;
      if (self.current() !== 'start') return;
      self._startLocked = true;
      Se.play('button');
      self.go('mode');
      // 戻ってきたときにまた押せるようにする
      setTimeout(function () { self._startLocked = false; }, 400);
    };

    screen.addEventListener('click', begin);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (self.current() !== 'start') return;
      e.preventDefault();
      begin();
    });
  },

  /** まだ作っていない項目を押されたとき（v0.4 の途中段階でだけ出ます） */
  setupComingSoon: function () {
    document.querySelectorAll('[data-soon]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showToast('この機能はまだ準備中です。');
      });
    });
  },

  go: function (name) {
    this.stack.push(name);
    this._render();
  },

  back: function () {
    this.stack.pop();
    if (this.stack.length === 0) this.stack.push('start');
    this._render();
  },

  reset: function (name) {
    this.stack = [name || 'start'];
    this._render();
  },

  /** メニュー全体を閉じる（対戦画面へ入るとき） */
  close: function () {
    const layer = document.getElementById('start-screen');
    if (layer) layer.classList.remove('is-open');
  },

  /** いま出ている画面の名前（出ていなければ null） */
  current: function () {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  },

  _render: function () {
    const layer = document.getElementById('start-screen');
    const name = this.current();

    layer.classList.add('is-open');
    layer.querySelectorAll('.menu').forEach(function (sec) {
      sec.classList.toggle('is-open', sec.dataset.screen === name);
    });

    // 設定画面へ入るたびに、選ばれている項目の見た目を合わせ直す
    if (name === 'solo-setup') this._renderSolo();
    if (name === 'cpu-setup') this._renderCpu();
    if (name === 'watch-setup') this._renderWatch();
    if (name === 'options') this._renderSettings();
    if (name === 'card-list') CardListUI.render();
    if (name === 'deck-list') DeckListUI.renderList();
    if (name === 'deck-view') DeckListUI.renderView();

    // メニューが出ている間は盤面を操作させない
    if (typeof view !== 'undefined') view.locked = true;
  },

  /* =============================================================
     ひとり回しの設定（仕様書 19.2）
     -------------------------------------------------------------
     デッキ2つ・先攻・シード。同じデッキを選べばミラー対戦になります。
     ============================================================= */

  _setupSolo: function () {
    const self = this;
    const goBtn = document.getElementById('solo-start');
    if (!goBtn) return;

    goBtn.addEventListener('click', function () {
      if (goBtn.disabled) return;          // 連打よけ（仕様書 28）
      goBtn.disabled = true;
      const ok = self._startSoloMatch();
      if (!ok) goBtn.disabled = false;
      else setTimeout(function () { goBtn.disabled = false; }, 800);
    });
  },

  /** ひとり回しの設定画面を描き直す */
  _renderSolo: function () {
    const s = this.solo;
    this._renderOptions();

    // ミラー対戦になるときの案内
    const hint = document.getElementById('solo-mirror-hint');
    if (hint) {
      hint.textContent = (s.deck1 === s.deck2)
        ? '同じデッキ同士のミラー対戦になります。呼び名は「プレイヤー1／2」になります。'
        : '';
    }

    const input = document.getElementById('seed-input');
    if (input) input.disabled = (s.seedMode !== 'fixed');

    this._soloError('');
  },

  _soloError: function (msg) {
    const el = document.getElementById('solo-setup-error');
    if (el) { el.textContent = msg || ''; el.classList.toggle('is-on', !!msg); }
  },

  /** ひとり回しを始める */
  _startSoloMatch: function () {
    const s = this.solo;

    // --- シード ---
    let seed;
    if (s.seedMode === 'fixed') {
      const input = document.getElementById('seed-input');
      seed = input ? input.value.trim() : '';
      if (seed === '') { this._soloError('シードを入力してください。'); return false; }
      if (seed.length > 32) { this._soloError('シードは32文字までにしてください。'); return false; }
    } else {
      seed = autoGenerateSeed();
    }

    // --- 先攻（ランダムはシードから決める） ---
    let firstIsP1;
    if (s.firstPlayer === 'random') firstIsP1 = createRng(seed + ':setup').int(2) === 0;
    else firstIsP1 = (s.firstPlayer === 'deck1');

    // --- 席の割り当て：プレイヤー1＝席village／プレイヤー2＝席mansion ---
    const decks = { village: s.deck1, mansion: s.deck2 };

    // デッキが違えばデッキ名のほうが分かりやすいので、そのまま使う。
    // 同じデッキ（ミラー）だと見分けがつかないので、プレイヤー1／2 と呼びます。
    const labels = (s.deck1 === s.deck2)
      ? { village: 'プレイヤー1', mansion: 'プレイヤー2' }
      : null;

    this.lastMatch = {
      mode: 'solo',
      deck1: s.deck1, deck2: s.deck2,
      firstIsP1: firstIsP1,
      seed: seed, seedMode: s.seedMode,
      mirror: (s.deck1 === s.deck2),
    };

    this.lastSetup = 'solo-setup';
    this.close();
    this.startWithLoading([s.deck1, s.deck2], function () {
      startGame(firstIsP1 ? 'village' : 'mansion', seed,
        labels ? { decks: decks, labels: labels } : { decks: decks });
    });
    return true;
  },

  /* =============================================================
     CPU対戦の設定（仕様書 8〜13）
     ============================================================= */

  /* 難易度の説明（仕様書 10.1） */
  DIFF_TEXT: {
    weak:   'カードゲームに不慣れな人向け。判断ミスも多めです。',
    normal: '基本的な行動を行う、標準的なCPUです。',
    strong: '盤面や手札を考え、より効率的に行動します。',
    expert: '高度な判断を行う、本気の対戦用CPUです。',
    unfair: 'CPUがこっそりイカサマしてきます。公平な勝負ではない、おまけ難易度です。',
  },

  DECK_LABEL: { village: 'ヨマモリ村', mansion: '黒薔薇の館' },
  DIFF_LABEL: { weak: '弱', normal: '中', strong: '強',
                expert: 'エキスパート', unfair: '理不尽（特殊難易度）' },

  _setupCpu: function () {
    const self = this;
    const goBtn = document.getElementById('cpu-start');
    if (!goBtn) return;

    goBtn.addEventListener('click', function () {
      if (goBtn.disabled) return;          // 連打よけ（仕様書 28）
      goBtn.disabled = true;
      const ok = self._startCpuMatch();
      if (!ok) goBtn.disabled = false;     // 入力エラーなら押し直せるように
      else setTimeout(function () { goBtn.disabled = false; }, 800);
    });
  },

  /** 選ばれている項目の見た目と説明文を合わせ直す */
  _renderCpu: function () {
    const c = this.cpu;
    this._renderOptions();

    // 難易度の説明
    const desc = document.getElementById('cpu-diff-desc');
    if (desc) desc.textContent = this.DIFF_TEXT[c.difficulty] || '';

    // ミラー対戦になるときの案内（仕様書 9.3）
    const hint = document.getElementById('cpu-mirror-hint');
    if (hint) {
      if (c.cpuDeck === 'random') {
        hint.textContent = '対戦開始時に抽選します（自分と同じデッキになることもあります）。';
      } else if (c.cpuDeck === c.playerDeck) {
        hint.textContent = '同じデッキ同士のミラー対戦になります。';
      } else {
        hint.textContent = '';
      }
    }

    // シードの入力欄は「指定する」のときだけ使う
    const input = document.getElementById('cpu-seed-input');
    if (input) input.disabled = (c.seedMode !== 'fixed');

    this._cpuError('');
  },

  _cpuError: function (msg) {
    const el = document.getElementById('cpu-setup-error');
    if (el) { el.textContent = msg || ''; el.classList.toggle('is-on', !!msg); }
  },

  /* =============================================================
     入力を確かめて対戦を始める
     -------------------------------------------------------------
     ランダムの項目（CPUデッキ・先攻）は、シードから作った乱数で
     決めます。Math.random() は使いません（仕様書 12.4・33-9）。
     ============================================================= */
  _startCpuMatch: function () {
    const c = this.cpu;

    // --- 0. CPUが使えるか（仕様書 30） ---
    if (!this.aiReady()) {
      this._cpuError('CPUの読み込みに失敗しています。ページを再読み込みしてください。');
      return false;
    }

    // --- 1. シードを決める（仕様書 12.2・12.3） ---
    let seed;
    if (c.seedMode === 'fixed') {
      const input = document.getElementById('cpu-seed-input');
      seed = input ? input.value.trim() : '';
      if (seed === '') {
        this._cpuError('シードを入力してください。');
        return false;
      }
      if (seed.length > 32) {
        this._cpuError('シードは32文字までにしてください。');
        return false;
      }
    } else {
      seed = autoGenerateSeed();     // random.js の自動生成
    }

    // --- 2. ランダムの項目を、シードから決める ---
    const pick = createRng(seed + ':setup');

    let cpuDeck = c.cpuDeck;
    if (cpuDeck === 'random') cpuDeck = pick.int(2) === 0 ? 'village' : 'mansion';

    let playerFirst;
    if (c.firstPlayer === 'random') playerFirst = pick.int(2) === 0;
    else playerFirst = (c.firstPlayer === 'player');

    // --- 3. 席にデッキを割り当てる ---
    //   席 village ＝ あなた／席 mansion ＝ CPU（CPU対戦では固定）
    const decks  = { village: c.playerDeck, mansion: cpuDeck };
    const labels = { village: 'あなた',     mansion: 'CPU' };
    const firstSide = playerFirst ? 'village' : 'mansion';

    // --- 4. あとで使う情報を控える（リザルト・再戦・結果コピー） ---
    this.lastMatch = {
      mode: 'cpu',
      playerDeck: c.playerDeck,
      cpuDeck: cpuDeck,
      difficulty: c.difficulty,
      playerFirst: playerFirst,
      seed: seed,
      seedMode: c.seedMode,
      mirror: (c.playerDeck === cpuDeck),
    };

    // 次に開いたときのために、選んだ内容を覚えておく（仕様書 24）
    Storage.remember({
      cpuDifficulty: c.difficulty,
      playerDeck: c.playerDeck,
      cpuDeck: c.cpuDeck,
      firstPlayerSetting: c.firstPlayer,
      seedMode: c.seedMode,
    });

    this.lastSetup = 'cpu-setup';
    this.close();
    this.startWithLoading([c.playerDeck, cpuDeck], function () {
      startGame(firstSide, seed, {
        decks: decks,
        labels: labels,
        cpu: { side: 'mansion', difficulty: c.difficulty, mode: 'cpu' },
        });
    });
    return true;
  },

  /* =============================================================
     CPU観戦（仕様書 20）
     ============================================================= */
  _setupWatch: function () {
    const self = this;
    const goBtn = document.getElementById('watch-start');
    if (!goBtn) return;

    goBtn.addEventListener('click', function () {
      if (goBtn.disabled) return;
      goBtn.disabled = true;
      const ok = self._startWatchMatch();
      if (!ok) goBtn.disabled = false;
      else setTimeout(function () { goBtn.disabled = false; }, 800);
    });
  },

  _renderWatch: function () {
    this._renderOptions();
    const input = document.getElementById('watch-seed-input');
    if (input) input.disabled = (this.watch.seedMode !== 'fixed');
    this._watchError('');
  },

  _watchError: function (msg) {
    const el = document.getElementById('watch-setup-error');
    if (el) { el.textContent = msg || ''; el.classList.toggle('is-on', !!msg); }
  },

  _startWatchMatch: function () {
    const w = this.watch;

    // --- シード ---
    let seed;
    if (w.seedMode === 'fixed') {
      const input = document.getElementById('watch-seed-input');
      seed = input ? input.value.trim() : '';
      if (seed === '') { this._watchError('シードを入力してください。'); return false; }
      if (seed.length > 32) { this._watchError('シードは32文字までにしてください。'); return false; }
    } else {
      seed = autoGenerateSeed();
    }

    // --- 先攻 ---
    let firstIsCpu1;
    if (w.firstPlayer === 'random') firstIsCpu1 = createRng(seed + ':setup').int(2) === 0;
    else firstIsCpu1 = (w.firstPlayer === 'cpu1');

    // --- 席の割り当て：CPU 1＝席village／CPU 2＝席mansion ---
    const decks  = { village: w.deck1, mansion: w.deck2 };
    const labels = { village: 'CPU 1', mansion: 'CPU 2' };

    this.lastMatch = {
      mode: 'watch',
      deck1: w.deck1, diff1: w.diff1,
      deck2: w.deck2, diff2: w.diff2,
      firstIsCpu1: firstIsCpu1,
      seed: seed, seedMode: w.seedMode,
    };

    if (!this.aiReady()) {
      this._watchError('CPUの読み込みに失敗しています。ページを再読み込みしてください。');
      return false;
    }

    CpuDriver.speed = w.speed;
    this.lastSetup = 'watch-setup';
    this.close();
    this.startWithLoading([w.deck1, w.deck2], function () {
      startGame(firstIsCpu1 ? 'village' : 'mansion', seed, {
        decks: decks,
        labels: labels,
        watch: { village: w.diff1, mansion: w.diff2 },
      });
    });
    return true;
  },

  /* =============================================================
     設定（仕様書 22）
     ============================================================= */
  _setupSettings: function () {
    const self = this;

    const vol = document.getElementById('se-volume');
    if (vol) {
      vol.addEventListener('input', function () {
        const v = parseInt(vol.value, 10) || 0;
        Se.volume = v / 100;
        const label = document.getElementById('se-volume-value');
        if (label) label.textContent = String(v);
        Storage.set('seVolume', v);
      });
      // 指を離したときだけ試聴音を鳴らす（動かすたびだと鳴りすぎるため）
      vol.addEventListener('change', function () { Se.preview(); });
    }

    const resetBtn = document.getElementById('opt-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        Storage.resetSettings();
        self._restore();
        self._renderSettings();
        self._done('設定を最初の状態へ戻しました。');
      });
    }
  },

  _done: function (msg) {
    const el = document.getElementById('opt-done');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(this._doneTimer);
    this._doneTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2200);
  },

  _renderSettings: function () {
    this._renderOptions();
    const v = Storage.get('seVolume');
    const vol = document.getElementById('se-volume');
    if (vol) vol.value = String(v);
    const label = document.getElementById('se-volume-value');
    if (label) label.textContent = String(v);
    this._done('');
    const el = document.getElementById('opt-done');
    if (el) el.classList.remove('is-on');
  },

  /** 設定をゲーム側へ反映し、端末へ保存する */
  _applySettings: function () {
    const s = this.settings;

    CpuDriver.speed = s.cpuActionSpeed;
    speedScale = (s.animationSpeed === 'fast') ? 0.7 : 1;
    Se.enabled = (s.seEnabled === 'on');
    mirrorLanes = (s.mirrorLanes === 'on');
    document.body.classList.toggle('mirror-lanes', mirrorLanes);

    Storage.set('cpuActionSpeed', s.cpuActionSpeed);
    Storage.set('animationSpeed', s.animationSpeed);
    Storage.set('seEnabled', s.seEnabled === 'on');
    Storage.set('mirrorLanes', s.mirrorLanes === 'on');
  },

  /** 端末に保存された設定と、前回の選択を読み戻す */
  _restore: function () {
    Storage.load();

    this.settings.cpuActionSpeed = Storage.get('cpuActionSpeed');
    this.settings.animationSpeed = Storage.get('animationSpeed');
    this.settings.seEnabled = Storage.get('seEnabled') ? 'on' : 'off';
    this.settings.mirrorLanes = Storage.get('mirrorLanes') ? 'on' : 'off';
    Se.volume = (Storage.get('seVolume') || 0) / 100;

    // 前回のCPU対戦の選択（あれば）
    const last = ['cpuDifficulty', 'playerDeck', 'cpuDeck', 'firstPlayerSetting', 'seedMode'];
    const map = { cpuDifficulty: 'difficulty', playerDeck: 'playerDeck',
                  cpuDeck: 'cpuDeck', firstPlayerSetting: 'firstPlayer', seedMode: 'seedMode' };
    const self = this;
    last.forEach(function (k) {
      const v = Storage.lastOf(k);
      if (v) self.cpu[map[k]] = v;
    });

    this._applySettings();
    this._renderOptions();
  },

  /* =============================================================
     対戦を始める前の読み込み（仕様書 30）
     -------------------------------------------------------------
     使うデッキのカード画像を先に読み込みます。
     読めない画像があっても、v0.2の代わりの見た目で対戦は始めます。
     ============================================================= */
  startWithLoading: function (deckIds, go) {
    const box = document.getElementById('loading');
    const fill = box ? box.querySelector('.loading__fill') : null;
    const count = box ? box.querySelector('.loading__count') : null;

    if (box) {
      if (fill) fill.style.width = '0%';
      if (count) count.textContent = '';
      box.classList.add('is-on');
    }

    Assets.preloadDecks(deckIds, function (done, total) {
      if (fill) fill.style.width = Math.round(done / total * 100) + '%';
      if (count) count.textContent = done + ' / ' + total;
    }, function () {
      if (box) box.classList.remove('is-on');
      go();
    });
  },

  /**
   * CPUが使えるかを確かめる（仕様書 30）。
   * 読み込みに失敗しているのに始めると、相手が動かないまま止まります。
   */
  aiReady: function () {
    return (typeof AiPlayer !== 'undefined') && (typeof AiCore !== 'undefined') &&
           (typeof AiHeuristic !== 'undefined') && (typeof AiUiOps !== 'undefined') &&
           (typeof CpuDriver !== 'undefined');
  },

  /* =============================================================
     同じ設定でもう一度（仕様書 25.4）
     -------------------------------------------------------------
     「同じ対戦をなぞる」のではなく「同じ設定でやり直す」ので、
     ランダムを選んでいる項目は選び直されます。
       ・指定シード → 同じシード
       ・ランダムシード → 新しいシードを作る
       ・ランダムのCPUデッキ・先攻 → もう一度抽選
     ============================================================= */
  restartLast: function () {
    const mode = (this.lastMatch && this.lastMatch.mode) || 'solo';
    if (mode === 'cpu') return this._startCpuMatch();
    if (mode === 'watch') return this._startWatchMatch();
    return this._startSoloMatch();
  },

  /* =============================================================
     開発用の調整パネルを隠す（仕様書 33）
     ============================================================= */
  _hideDevPanel: function () {
    if (DEV_PANEL) return;
    ['panel', 'panel-toggle'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  },
};
