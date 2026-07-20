/* =====================================================================
   ai-heuristic.js  ―― 対戦AIの「考え方」（Stage 3・強モードの中身）
   ---------------------------------------------------------------------
   シミュレーター（Python版）で作り込んだ評価関数を、そのまま移植した
   ものです。制作者の実戦知見がここに詰まっています。

   仕組みはとても単純で、

     ・いまできる行動それぞれに点数をつける
     ・いちばん点数の高い行動を選ぶ

   これだけです。「点数のつけ方」に、勝つための考え方が入っています。

   判断の優先順位（Python版と同じ）:
     1. 即座の勝敗（勝てる／負けを避ける）が最優先
     2. 追跡の結果を予測する（相手には1ターンの防御猶予がある）
     3. 人間は「効果が強いから」ではなく「負けを避けるのに要るか」で出す
     4. 怪異は相打ちや削りも、有利な取引として評価する
     5. グッズは「結果が変わるか」で判断（無駄打ちしない）
     6. 気力の計画（切り札の着地を遅らせない）
     7. 山札切れの管理

   【見てよい情報のルール】
   このAIが見るのは公開情報だけです。
   相手の手札の中身と、山札の並び順は絶対に見ません。
   （見ているのは：両者の場・フィールド・トラッシュ・ロスト・山札の残り
     枚数・相手の手札の枚数・気力・追跡の状況・蓄積ダメージ・自分の手札）

   読み込み順： cards → decks → random → effects → game → ai-core →
                ai-heuristic → ui
   ===================================================================== */

/* カードIDをまとめて名前で呼べるようにする（打ち間違い防止） */
const AI_CARD = {
  ISABELLA: 'mansion_isabella',
  ELISE: 'mansion_elise',
  SYLVIE: 'mansion_sylvie',
  ANNETTE: 'mansion_annette',
  KEY: 'mansion_key',
  SAKURYAKU: 'mansion_sakuryaku',
  NUSHI: 'village_nushi',
  KAKASHI: 'village_kakashi',
  KOHAKU: 'village_kohaku',
  LUNA: 'village_luna',
  KAEDE: 'village_kaede',
  RIN: 'village_rin',
  KYOUKAISEN: 'event_kyoukaisen',
  SASHINOBERU: 'village_sashinoberu',
  FIELD_VILLAGE: 'field_village',
  FIELD_MANSION: 'field_mansion',
};

/* 数ターン先の気力計画で守るべき切り札 */
const AI_KEY_CARDS = [AI_CARD.ISABELLA, AI_CARD.NUSHI];


/* シミュレーターでの測定にもとづく調整値
   （数字を変えるとAIの好みが変わります。根拠はコメントに書いてあります） */
const AI_TUNE = {
  // 効果が空振りするコハクを出し渋る強さ。
  // 実測: 相手怪異0体でのコハクが全体の43%もあり、登場時1点が無駄になっていた。
  // この減点で空振り率18%まで下がり、村の勝率が61%→67%に上がった。
  kohakuHold: 28,
  // 安い怪異で高い人間を倒す価値。
  // 倒された枠を埋め直すために、相手は高い気力を払わされる（横並べの強要）。
  // 実測: 洋館の勝率が+3ポイント。
  killTempo: 12,
};

/* 難易度の既定値。強モードは知見をすべて使う */
const AI_PROF_FULL = { deckPlan: true };


const AiHeuristic = {

  /* =============================================================
     道具（盤面を読むための小さな関数）
     ============================================================= */

  _other: function (side) {
    return (side === 'village') ? 'mansion' : 'village';
  },

  /** 場のカード全部（人間＋怪異） */
  _units: function (side) {
    const p = Game.state.players[side];
    return p.humans.concat(p.youkai);
  },

  /** トラッシュにある、指定した特徴を持つカードの枚数 */
  _trashTraitCount: function (side, trait) {
    return AiCore.countTrait(side, 'trash', trait);
  },

  /** ロストにある、指定した特徴を持つカードの枚数 */
  _lostTraitCount: function (side, trait) {
    return AiCore.countTrait(side, 'lost', trait);
  },

  /* -------------------------------------------------------------
     相手が「まだ持っているか」を、公開情報だけから見積もる
     -------------------------------------------------------------
     デッキの中身は固定なので、相手のデッキに各カードが何枚入っているかは
     お互いに分かっています。そこから、すでに見えた枚数（トラッシュ・
     ロスト・場）を引けば、相手の手札か山札に何枚残っているかが分かります。

     例: コハクは4枚。3枚がトラッシュに見えていれば、残りは1枚だけ。
     覗き見ではなく、人間なら当然やっている数え上げです。
     ------------------------------------------------------------- */

  /** そのデッキに、そのカードが元々何枚入っているか */
  _deckTotal: function (side, cardId) {
    // v0.3：席が使っているデッキを見る（ミラー対戦に対応するため）
    const def = Game.deckOf(side);
    if (!def) return 0;
    let n = 0;
    def.mainDeck.forEach(function (e) {
      if (e.id === cardId) n += e.count;
    });
    return n;
  },

  /** 相手の手札か山札に、そのカードがまだ何枚眠っているか */
  _oppUnseenCopies: function (side, cardId) {
    const other = this._other(side);
    const o = Game.state.players[other];
    let seen = 0;
    const count = function (list) {
      list.forEach(function (c) { if (c.cardId === cardId) seen++; });
    };
    count(o.trash); count(o.lost); count(o.humans); count(o.youkai);
    o.humans.concat(o.youkai).forEach(function (u) {
      if (u.equippedGoods && u.equippedGoods.cardId === cardId) seen++;
    });
    return Math.max(0, this._deckTotal(other, cardId) - seen);
  },

  /** 相手が今それを手札に持っている確率のおおよその値 */
  _oppHoldsProb: function (side, cardId) {
    const o = Game.state.players[this._other(side)];
    const unseen = this._oppUnseenCopies(side, cardId);
    if (unseen <= 0) return 0;
    const hidden = o.hand.length + o.deck.length;
    if (hidden <= 0) return 0;
    const miss = 1 - (o.hand.length / hidden);
    return 1 - Math.pow(miss, unseen);
  },

  /** 相手がこの人間を守るために足せる体力の見込み
      村の防御札は《懐中電灯》で体力+1・コスト0。持っていれば必ず使えるが、
      増えるのは体力1だけ。すでにグッズを着けた人間には重ねられない。
      → 残り体力1の人間は、懐中電灯では守り切れない。 */
  _oppDefenseHp: function (side, dfn) {
    if (dfn.equippedGoods) return 0;          // 1体にグッズは1枚まで
    const o = Game.state.players[this._other(side)];
    if (o.field.cardId !== AI_CARD.FIELD_VILLAGE) return 0;
    return this._oppHoldsProb(side, 'village_flashlight');
  },

  /** 襲撃の予測（AiCoreのものをそのまま使う） */
  _forecast: function (youkai, human, defenseMargin) {
    return AiCore.forecast(youkai, human, defenseMargin);
  },

  /** 自分に向いている追跡（相手が予約している襲撃） */
  _incoming: function (side) {
    return AiCore.incomingPursuit(side);
  },

  /* -------------------------------------------------------------
     あと何ターンで気力がneedに届くか
     -------------------------------------------------------------
     黒薔薇の館の「ロスト3枚目で気力+1」も見込みに入れます。
     イザベラを何ターン後に出せるかを数えるのに使います。
     ------------------------------------------------------------- */
  _turnsToAfford: function (side, energy, need) {
    if (energy >= need) return 0;
    const p = Game.state.players[side];
    let bonus = 0;

    if (p.field.cardId === AI_CARD.FIELD_MANSION && p.lost.length === 2) {
      const allMansion = p.lost.every(function (c) {
        return (c.master.traits || []).indexOf('洋館') !== -1;
      });
      if (allMansion) {
        const inc = this._incoming(side);
        if (inc && inc.forecast && inc.forecast.killsHuman &&
            (inc.human.master.traits || []).indexOf('洋館') !== -1) {
          bonus = 1;   // 次の襲撃で3枚目のロスト → 館の効果で気力+1が見込める
        }
      }
    }

    let t = 0;
    let e = energy;
    while (e < need && t < 10) {
      t += 1;
      e += 2 + ((t === 1) ? bonus : 0);
    }
    return t;
  },

  /* -------------------------------------------------------------
     このカードを今使うと、切り札の着地が何ターン遅れるか
     -------------------------------------------------------------
     手札にイザベラやヌシ様を抱えているとき、安いカードに気力を使って
     着地が遅れるなら、その分を減点します。
     ------------------------------------------------------------- */
  _delayPenalty: function (side, inst) {
    const p = Game.state.players[side];
    let pen = 0;
    const self = this;
    p.hand.forEach(function (k) {
      if (k === inst) return;
      if (AI_KEY_CARDS.indexOf(k.cardId) === -1) return;
      // 切り札のために早くから気力を貯めるのは、実測では大きな損だった。
      // ・イザベラ … ロスト〔洋館〕が2枚になるまでは気にしない
      // ・ヌシ様   … 4コストは自然に届くので、そもそも貯める必要がない
      if (k.cardId === AI_CARD.ISABELLA) {
        if (self._lostTraitCount(side, '洋館') < 2) return;
      } else if (k.cardId === AI_CARD.NUSHI) {
        return;
      }
      const need = k.master.cost || 0;
      const cost = inst.master.cost || 0;
      const now = self._turnsToAfford(side, p.energy, need);
      const after = self._turnsToAfford(side, p.energy - cost, need);
      pen += (after - now) * 12;
    });
    return pen;
  },

  /* =============================================================
     メインステップの行動に点数をつける
     -------------------------------------------------------------
     legalMainActions() が返した行動ひとつを受け取り、点数を返します。
     ============================================================= */
  scoreMain: function (side, a, prof) {
    // prof.deckPlan が false のときは「デッキ固有の知見」を使わない。
    // ゲームの基本（勝敗の読み・襲撃の予測）は残るので、中モードは
    // 「セオリーは知らないが、盤面はきちんと読める人」になる。
    prof = prof || AI_PROF_FULL;
    const st = Game.state;
    const other = this._other(side);
    const p = st.players[side];
    const o = st.players[other];
    const self = this;

    if (a.kind === 'PASS') return 0;

    const c = a.inst;
    const id = c.cardId;
    const cost = c.master.cost || 0;
    let s = 0;

    /* ---------- 怪異を出す ---------- */
    if (a.kind === 'PLAY_YOUKAI') {
      s = 6 + (c.master.speed * 1.5) + (c.master.hp * 0.5);

      // 盤面プレッシャー：
      // このゲームは「攻撃を与え続けて相手に人間の維持を強요する」のが根幹。
      // 攻撃役の怪異が少ないほど、安い怪異でも並べて追跡を絶やさない価値が高い。
      // ただし切り札の着地を遅らせてまでは並べない。
      if (id !== AI_CARD.ISABELLA && o.humans.length > 0 &&
          this._delayPenalty(side, c) === 0) {
        const gap = Math.max(0, 2 - p.youkai.length);
        s += gap * 8;             // 怪異0体なら+16、1体なら+8
      }

      // イザベラを手札に抱えているときの気力の守り方：
      // 理想は「ロスト3枚・最後の人間が倒される直前・気力2」を作ること。
      // ビートダウンは続けたいので、着地が目前のときだけ強く抑える。
      if (prof.deckPlan && id !== AI_CARD.ISABELLA) {
        const holdsIsa = p.hand.some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        // 制作者の指摘(実測で確認): イザベラを引いた瞬間から気力を守ると、
        // 殴るべき序盤に殴れず、着地しても点が取れていない状態になる。
        // ロストが2枚(=3枚目が目前)になってから初めて守り始めるのが最も強い。
        if (holdsIsa && this._lostTraitCount(side, '洋館') >= 2) {
          if (p.energy - cost < 3) s -= 22;
        }
      }

      /* --- カードごとの上乗せ --- */
      if (id === AI_CARD.ISABELLA && prof.deckPlan) {
        s = 4;   // バフ条件を満たさない早出しは基本待つ
        const lostMansion = this._lostTraitCount(side, '洋館');
        const eliseInLost = p.lost.some(function (x) {
          return x.cardId === AI_CARD.ELISE;
        });
        const reviveUsed = Game.isEffectUsed(
          Game.gameUseKey(side, AI_CARD.ISABELLA));
        const willRevive = eliseInLost && !reviveUsed &&
                           p.humans.length < MAX_HUMANS;
        const lostAfter = lostMansion - (willRevive ? 1 : 0);

        if (lostAfter >= 3) {
          // 着地後もバフが有効。場の〔洋館〕怪異が多いほど効果が大きい
          const mansionYoukai = p.youkai.filter(function (u) {
            return (u.master.traits || []).indexOf('洋館') !== -1;
          }).length;
          s += 24 + 4 * mansionYoukai;
        }
        if (willRevive) {
          s += 10;   // ロストを1枚戻せる
          // 制作者想定の最強ムーブ：
          // 次の襲撃で負けが確定する場面を、蘇生でロストを減らして回避する
          const inc = this._incoming(side);
          const limit = p.field.master.lostLimit;
          if (inc && (p.lost.length + 1) >= limit &&
              inc.forecast && inc.forecast.killsHuman) {
            s += 2000;   // 敗北回避は最優先
          }
          if ((p.lost.length + 1) >= limit) {
            s += 30;     // 敗北ライン際でのロスト回復は常に高価値
          }
        }
      } else if (id === AI_CARD.NUSHI && prof.deckPlan) {
        s += 4 + ((this._trashTraitCount(side, '村') >= 7) ? 8 : 0);
      } else if (id === AI_CARD.KAKASHI && prof.deckPlan) {
        s += 6;   // 墓地を肥やしつつ回収もできるエンジン役
      } else if (id === AI_CARD.KOHAKU && prof.deckPlan) {
        // コハクは登場時に相手怪異へ1点。傷んだ怪異を落とせると非常に強い。
        // 特にカエデ等で削れた甲冑を倒す動きが強力。
        const canFinish = o.youkai.some(function (u) {
          const stt = Game.getStats(u);
          return (u.accumulatedDamage + 1) >= stt.maxHp;
        });
        if (canFinish) {
          s += 16;
          // その怪異が自分の人間を追跡中なら、予約された襲撃ごと消せる
          const inc = this._incoming(side);
          if (inc) {
            const stt = Game.getStats(inc.youkai);
            if ((inc.youkai.accumulatedDamage + 1) >= stt.maxHp) s += 12;
          }
        } else if (o.youkai.length > 0) {
          s += 4;   // 削っておく価値（次のコハク／カエデにつながる）
        } else {
          // 相手の怪異が0体なら、登場時の1点は完全に無駄になる。
          // コハクは攻撃役でもあるので出す価値自体はあるが、
          // 待てば効果を活かせるぶんは割り引く。
          s -= AI_TUNE.kohakuHold;
        }
      }
      if (prof.deckPlan) s -= this._delayPenalty(side, c);

    /* ---------- 人間を出す ---------- */
    } else if (a.kind === 'PLAY_HUMAN') {
      // 人間は「効果が強いから」ではなく「負けを避けるのに要るか」で出す。
      // 効果はあくまで必要性が立った上でのおまけ。
      s = -4;
      const inc = this._incoming(side);
      const lostDefeatNext =
        (p.lost.length + 1) >= p.field.master.lostLimit;
      let need = 0;

      if (p.humans.length === 1) {
        const lone = p.humans[0];
        let threatKill = false;
        if (inc && inc.human === lone && inc.forecast) {
          threatKill = inc.forecast.killsHuman;
        }
        const oneShot = o.youkai.some(function (m) {
          const f = self._forecast(m, lone);
          return f && f.killsHuman;
        });
        if (threatKill) need = 40;        // 次の襲撃で人間0体の負け
        else if (oneShot) need = 18;      // 一撃で落ちる圏内の唯一の人間
        if (need > 0 && lostDefeatNext) {
          need = 2;   // 横に並べてもロスト敗北は防げない
        }
      }
      s += need;

      /* --- 登場時効果のおまけ --- */
      let bonus = 1;
      if (!prof.deckPlan) {
        bonus = 1;   // 知見なしなら効果の中身までは踏み込まない
      } else if (id === AI_CARD.LUNA) {
        bonus = (p.deck.length > 10) ? 5 : 1;
      } else if (id === AI_CARD.KAEDE) {
        bonus = 4;   // 体力4で2ターン残りやすい
      } else if (id === AI_CARD.SYLVIE) {
        const holdsIsa = p.hand.some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        bonus = holdsIsa ? 2 : 6;
        // シルヴィは体力4で相手怪異2ターン分の時間を稼ぎ、
        // 登場時に鍵／策略／イザベラを探せる洋館の要。
        // 負けを避ける必要がない平時でも、盤面にいなければ出す価値がある。
        const onBoard = p.humans.some(function (u) {
          return u.cardId === AI_CARD.SYLVIE;
        });
        if (p.field.cardId === AI_CARD.FIELD_MANSION && !onBoard &&
            p.humans.length < MAX_HUMANS) {
          const haveDefense = p.hand.some(function (x) {
            return x.cardId === AI_CARD.KEY || x.cardId === AI_CARD.SAKURYAKU;
          });
          need = Math.max(need, haveDefense ? 8 : 14);
        }
      } else if (id === AI_CARD.ANNETTE) {
        bonus = 3;
      } else if (id === AI_CARD.RIN) {
        bonus = 1;
        if (this._trashTraitCount(side, '村') >= 5 && o.youkai.length > 0) {
          const canRemove = o.youkai.some(function (u) {
            return (u.accumulatedDamage + 2) >= Game.getStats(u).maxHp;
          });
          if (canRemove) {
            bonus += 12;   // 2点で除去が取れる
          } else if (inc) {
            // 追跡中の怪異に2点入れると、襲撃が相打ちに変わるか
            const before = this._forecast(inc.youkai, inc.human);
            inc.youkai.accumulatedDamage += 2;
            const after = this._forecast(inc.youkai, inc.human);
            inc.youkai.accumulatedDamage -= 2;
            if (after && before && after.killsYoukai && !before.killsYoukai) {
              bonus += 10;   // 予定された襲撃を相打ちに変える
            }
          }
        }
      }
      s += (need > 2) ? bonus : (bonus - 8);
      if (prof.deckPlan) s -= this._delayPenalty(side, c);

    /* ---------- グッズを装備する ---------- */
    } else if (a.kind === 'EQUIP_GOODS') {
      // 結果が変わらない装備はしない
      const u = a.target;
      s = -5;
      const inc = this._incoming(side);
      let savesLife = false;

      if (inc && inc.human === u) {
        const before = this._forecast(inc.youkai, inc.human);
        const keep = u.equippedGoods;
        u.equippedGoods = c;                       // 装備した場合を試算
        const after = this._forecast(inc.youkai, inc.human);
        u.equippedGoods = keep;                    // 元に戻す
        if (before && after && before.killsHuman && !after.killsHuman) {
          s = 45;             // 使えば生き残る防御グッズ
          savesLife = true;
        }
      }

      // 鍵の使い方（制作者の運用）：
      // イザベラが場に出るまでは基本的に温存する。
      // 着地後はエリーゼに貼って超耐久にする。
      // 着地前に使うのは「このままだと負ける」事故のときだけ。
      if (id === AI_CARD.KEY && prof.deckPlan) {
        const isaOnField = this._units(side).some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        const isElise = (u.cardId === AI_CARD.ELISE);
        if (isaOnField) {
          if (isElise) {
            s = Math.max(s, 30);           // エリーゼ最優先
            if (savesLife) s = 60;         // 追跡中のエリーゼを守るのは最重要
          } else if (savesLife) {
            s = Math.max(s, 20);
          } else {
            s = -5;                        // 平時の無駄貼りはしない
          }
        } else {
          const emergency = savesLife && (
            p.humans.length === 1 ||
            (p.lost.length + 1) >= p.field.master.lostLimit);
          s = emergency ? 40 : -25;        // 温存を強く優先
        }
      }

      // 攻撃用グッズ：装備すると倒せるようになる相手がいるか
      if (u.master.type === 'youkai' && o.humans.length > 0) {
        o.humans.forEach(function (d) {
          const before = self._forecast(u, d);
          const keep = u.equippedGoods;
          u.equippedGoods = c;
          const after = self._forecast(u, d);
          u.equippedGoods = keep;
          if (after && before && after.killsHuman && !before.killsHuman) {
            s = Math.max(s, 28);
          }
        });
      }
      if (prof.deckPlan) s -= this._delayPenalty(side, c);

    /* ---------- イベントを使う ---------- */
    } else if (a.kind === 'PLAY_EVENT') {
      if (id === AI_CARD.KYOUKAISEN) {
        s = (p.hand.length >= 4) ? 3 : -3;
        const others = p.hand.filter(function (x) { return x !== c; });
        if (others.length) {
          const minKeep = Math.min.apply(null, others.map(function (x) {
            return self._cardKeepValue(side, x);
          }));
          if (minKeep > 15) s -= 10;   // 捨てられるのが命綱の人間だけ
        }
        if (p.deck.length <= 4) s = -20;  // 山札切れの管理

      } else if (id === AI_CARD.SASHINOBERU) {
        const cands = p.trash.filter(function (x) {
          const t = x.master.traits || [];
          return t.indexOf('村') !== -1 &&
                 ['human', 'youkai', 'goods'].indexOf(x.master.type) !== -1;
        });
        if (!cands.length) {
          s = -8;
        } else {
          const best = Math.max.apply(null, cands.map(function (x) {
            return x.master.cost || 0;
          }));
          s = 2 + best * 2;
        }

      } else if (id === AI_CARD.SAKURYAKU) {
        s = -5;
        const isaOnField = this._units(side).some(function (x) {
          return x.cardId === AI_CARD.ISABELLA;
        });
        if (isaOnField && !prof.deckPlan) {
          s = (o.youkai.length > 0) ? 15 : -5;   // 撃てるなら撃つだけ
        } else if (isaOnField) {
          const inc = this._incoming(side);
          // いちばん大切な考え方：いかにエリーゼを長生きさせるか。
          // エリーゼを追跡している怪異への対処を最優先する。
          let elisePursuer = null;
          if (inc && inc.human.cardId === AI_CARD.ELISE) {
            elisePursuer = inc.youkai;
          }
          o.youkai.forEach(function (u) {
            const stt = Game.getStats(u);
            const canKill = (u.accumulatedDamage + 2) >= stt.maxHp;
            if (canKill) {
              s = Math.max(s, 24);                       // 除去が取れる
              if (inc && inc.youkai === u) s = Math.max(s, 40);
              if (u === elisePursuer) s = Math.max(s, 55);
            } else if (u === elisePursuer) {
              // 倒しきれなくても、エリーゼの反撃で落とせる圏内まで削れるなら強い
              const eliseSpeed = Game.getStats(inc.human).curSpeed;
              if ((u.accumulatedDamage + 2 + eliseSpeed) >= stt.maxHp) {
                s = Math.max(s, 45);   // 策略2点＋反撃で撃破
              } else {
                s = Math.max(s, 20);
              }
            } else if (inc && inc.youkai === u) {
              s = Math.max(s, 8);
            }
          });
          // 効果が働いているヌシ様は最大の脅威
          if (o.youkai.some(function (u) { return u.cardId === AI_CARD.NUSHI; })) {
            s = Math.max(s, 18);
          }
        }
      }
    }

    /* ---------- 人間0体で負けないための保険 ----------
       最後の人間が実際に狙われているときだけ、補充用の気力を残します。
       危険がないときまで温存すると、怪異を出せず点が取れなくなるためです。 */
    if ((a.kind === 'PLAY_YOUKAI' || a.kind === 'EQUIP_GOODS' ||
         a.kind === 'PLAY_EVENT') && p.humans.length <= 1) {
      const handHumans = p.hand.filter(function (x) {
        return x.master.type === 'human' && x !== c;
      });
      if (handHumans.length) {
        const cheapest = Math.min.apply(null, handHumans.map(function (x) {
          return x.master.cost || 0;
        }));
        if (p.energy - cost < cheapest) {
          let threatened = false;
          if (p.humans.length === 1) {
            const lone = p.humans[0];
            const inc = this._incoming(side);
            if (inc && inc.human === lone) {
              threatened = true;
            } else if (o.youkai.some(function (m) {
              const f = self._forecast(m, lone);
              return f && f.killsHuman;
            })) {
              threatened = true;
            }
          } else {
            threatened = true;   // すでに人間0体
          }
          if (threatened) s -= 15;
        }
      }
    }

    return s;
  },

  /* =============================================================
     追跡の候補に点数をつける
     -------------------------------------------------------------
     「攻めない」を0点の基準にして、それを上回る攻撃だけを行います。
     ============================================================= */
  pursuitScore: function (side, opt, prof) {
    prof = prof || AI_PROF_FULL;
    if (!opt || opt.kind === 'NO_PURSUE') return 0;

    const st = Game.state;
    const other = this._other(side);
    const p = st.players[side];
    const o = st.players[other];

    const atk = opt.youkai;
    const dfn = opt.human;
    const f = this._forecast(atk, dfn);
    if (!f) return 0;
    // 「相手が1ターンの猶予で守ってきても倒せるか」を、
    // 決め打ちではなく相手の残り札から見積もって判定する。
    const dStatsNow = Game.getStats(dfn);
    const killsEvenIfDefended =
      (dfn.accumulatedDamage + f.toHuman) >=
      (dStatsNow.maxHp + this._oppDefenseHp(side, dfn));
    const atkCost = atk.master.cost || 0;
    const dfnCost = dfn.master.cost || 0;
    let s = 0;

    if (f.killsHuman) {
      s += 40 + 8 * o.lost.length;
      if ((o.lost.length + 1) >= o.field.master.lostLimit) {
        s += 1000;      // ロスト規定枚数に達して勝ち
      }
      if (o.humans.length === 1) {
        s += 1000;      // 人間0体にして勝ち
      }
      if (!killsEvenIfDefended) {
        s -= 12;        // 守られて生き残る見込みがあるぶんを割り引く
      }
      // 安い怪異で高い人間を倒すと、相手は倒された枠を埋め直すために
      // 高い気力を払わされる（横並べの強要）。実質0コストのクロードなら特に得。
      s += AI_TUNE.killTempo * Math.max(0, dfnCost - atkCost);
    } else {
      // 倒せなくても、攻撃を与え続けることで相手に人間の維持を強要できる。
      // 蓄積ダメージは次の撃破につながる資産なので、常に「攻めない」より高く見る。
      s += 5 + 3 * f.toHuman;
      s += 2 * Math.max(0, dfnCost - atkCost);   // 安い怪異で高い人間を削る
      const dStats = Game.getStats(dfn);
      if ((dfn.accumulatedDamage + f.toHuman) >= (dStats.maxHp - 2)) {
        s += 6;   // 次の襲撃で倒せる圏内まで削れる
      }
    }

    if (f.killsYoukai) {
      // 相打ちの代償。ただし安い怪異なら軽い（相打ちは失敗とは限らない）
      s -= 2 + 1.5 * atkCost;
      if (f.killsHuman) {
        s += 8 + 4 * dfnCost;   // 倒せる相打ちは有利な取引になりうる
      } else if (atkCost <= 1) {
        s += 3;                 // 1コスト怪異の相打ちは十分な交換
      }
    }

    // イザベラはバフの源。倒れると自軍の〔洋館〕怪異とエリーゼの強化が
    // 一斉に消えるので、体力を無駄に減らさない。
    // 反撃を受ける攻撃は「勝ちに直結する」か「反撃で死なない」ときだけ。
    if (atk.cardId === AI_CARD.ISABELLA && prof.deckPlan) {
      const aStats = Game.getStats(atk);
      const lethal = f.killsHuman &&
        ((o.lost.length + 1) >= o.field.master.lostLimit ||
         o.humans.length === 1);
      if (!lethal) {
        const counter = f.toYoukai;
        if ((atk.accumulatedDamage + counter) >= aStats.maxHp) {
          s -= 300;     // この攻撃でイザベラが落ちる：ほぼ禁止
        } else if (counter > 0) {
          s -= 15 + counter * 8;   // 他の怪異での攻撃を優先させる
        }
        if (this._lostTraitCount(side, '洋館') >= 3 && counter > 0) {
          s -= 12;      // バフが働いている間はさらに慎重に
        }
      }
    }

    return s;
  },

  /* =============================================================
     カードを手札に残す価値（捨てるカードを選ぶときに使う）
     ============================================================= */
  _cardKeepValue: function (side, c) {
    const p = Game.state.players[side];
    const id = c.cardId;
    if (AI_KEY_CARDS.indexOf(id) !== -1) return 100;
    // 鍵と策略はイザベラ着地後の生命線。基本的にキープする。
    if (id === AI_CARD.KEY || id === AI_CARD.SAKURYAKU) return 40;

    let v = (c.master.cost || 0) * 3 + 4;
    if (c.master.type === 'goods') v -= 3;
    if (c.master.type === 'human') {
      const handHumans = p.hand.filter(function (x) {
        return x.master.type === 'human';
      }).length;
      if (p.humans.length <= 1 && handHumans <= 2) {
        v += 25;   // 場が薄いとき、手札の人間は命綱
      } else if (handHumans <= 1) {
        v += 10;
      }
    }
    const sameName = p.hand.filter(function (x) {
      return x.cardId === id;
    }).length;
    if (sameName >= 2) v -= 4;   // ダブっているものから捨てる
    return v;
  },

  /** サーチ・回収で手札に加える価値 */
  _pickValue: function (c) {
    const id = c.cardId;
    if (AI_KEY_CARDS.indexOf(id) !== -1) return 30;
    if (id === AI_CARD.KAKASHI) return 10;
    if (id === AI_CARD.SAKURYAKU) return 8;
    if (id === AI_CARD.KEY) return 6;
    return 2 + (c.master.cost || 0);
  },

  /* =============================================================
     いちばん良い行動を選ぶ（強モードの入り口）
     ============================================================= */

  /** メインステップ：点数がいちばん高い行動。全部0点以下なら何もしない */
  chooseMainAction: function (side, prof) {
    const acts = AiCore.legalMainActions(side);
    const self = this;
    let best = null;
    let bestScore = -Infinity;
    acts.forEach(function (a) {
      const sc = self.scoreMain(side, a, prof);
      if (sc > bestScore) { bestScore = sc; best = a; }
    });
    if (bestScore > 0) return best;
    return acts[acts.length - 1];   // PASS（列挙の最後に必ず入っている）
  },

  /** 追跡：点数がいちばん高い候補 */
  choosePursuit: function (side, prof) {
    const opts = AiCore.legalPursuits(side);
    const self = this;
    let best = null;
    let bestScore = -Infinity;
    opts.forEach(function (o) {
      const sc = self.pursuitScore(side, o, prof);
      if (sc > bestScore) { bestScore = sc; best = o; }
    });
    return best;
  },

  /** 手札を1枚捨てる：残す価値がいちばん低いもの */
  chooseDiscard: function (side, options) {
    const self = this;
    let best = options[0];
    let low = Infinity;
    options.forEach(function (c) {
      const v = self._cardKeepValue(side, c);
      if (v < low) { low = v; best = c; }
    });
    return best;
  },

  /** 回収・サーチ：加える価値がいちばん高いもの（低すぎるなら見送る） */
  choosePick: function (side, options, canSkip) {
    const self = this;
    let best = null;
    let high = -Infinity;
    options.forEach(function (c) {
      if (!c) return;
      const v = self._pickValue(c);
      if (v > high) { high = v; best = c; }
    });
    if (!best) return null;
    if (canSkip && high < 3) return null;
    return best;
  },

  /** 効果ダメージの対象：倒せる／脅威の怪異を優先 */
  chooseDamageTarget: function (side, options, amount) {
    const self = this;
    const dmg = amount || 1;
    const inc = this._incoming(side);
    let best = options[0];
    let bestRank = Infinity;
    options.forEach(function (u) {
      const stt = Game.getStats(u);
      const remain = stt.maxHp - u.accumulatedDamage;
      const kills = (remain <= dmg) ? 1 : 0;
      const threat = (inc && inc.youkai === u) ? 1 : 0;
      // 小さいほど優先。倒せる＞脅威＞スピードが高い＞残り体力が少ない
      const rank = -(kills * 100) - (threat * 30) - stt.curSpeed + remain * 0.1;
      if (rank < bestRank) { bestRank = rank; best = u; }
    });
    return best;
  },

  /** マリガンするか：軽いカード（コスト2以下の人間・怪異）が2枚未満なら引き直す */
  shouldMulligan: function (side) {
    const p = Game.state.players[side];
    const early = p.hand.filter(function (c) {
      return (c.master.type === 'human' || c.master.type === 'youkai') &&
             (c.master.cost || 0) <= 2;
    }).length;
    return early < 2;
  },

  /** 任意効果を使うか */
  shouldUseOptional: function (side, cardId) {
    const p = Game.state.players[side];
    if (cardId === AI_CARD.FIELD_VILLAGE) return p.deck.length > 8;  // 墓地肥やし
    if (cardId === AI_CARD.KAEDE) return p.deck.length > 6;          // 2引き2捨て
    return true;
  },
};

/* Node.jsでのヘッドレステスト用（ブラウザでは無視されます） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AiHeuristic;
}
