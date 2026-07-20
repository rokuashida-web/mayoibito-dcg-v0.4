/* =====================================================================
   menu-tests.js ―― メニュー再構成と旧ガイド削除（v0.4 Stage B）
   仕様書 5〜8・18・30.1・30.2
   ===================================================================== */
const fs = require('fs');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/layout.css', 'utf8');
const jsFiles = fs.readdirSync('js').filter(f => f.endsWith('.js'));
const allJs = jsFiles.map(f => fs.readFileSync('js/' + f, 'utf8')).join('\n');

function screenBlock(name) {
  const i = html.indexOf('data-screen="' + name + '"');
  if (i === -1) return '';
  const end = html.indexOf('</section>', i);
  return html.slice(i, end);
}

console.log('■ スタート画面（仕様書 5・30.1）');
{
  const b = screenBlock('start');
  check('スタート画面がある', b.length > 0);
  check('タイトルが出る', b.indexOf('マヨイビト') !== -1);
  check('版が出る', b.indexOf('title-version') !== -1);
  check('「タップしてスタート」が出る', b.indexOf('タップしてスタート') !== -1);
  check('対戦・カード・設定のメニューを出さない',
    b.indexOf('data-go="cpu-setup"') === -1 && b.indexOf('data-go="card-mode"') === -1 &&
    b.indexOf('data-go="options"') === -1);

  const s = fs.readFileSync('js/screens.js', 'utf8');
  check('EnterとSpaceでも始められる（仕様書 5.2）',
    /e\.key !== 'Enter' && e\.key !== ' '/.test(s));
  check('連続入力で二重に進まない', /_startLocked/.test(s));
}

console.log('\n■ モード選択（仕様書 6・30.1）');
{
  const b = screenBlock('mode');
  ['battle-mode', 'card-mode'].forEach(function (go) {
    check('「' + go + '」へ進める', b.indexOf('data-go="' + go + '"') !== -1);
  });
  check('設定が端の固定位置にある（仕様書 6.1）',
    b.indexOf('menu__corner') !== -1 && b.indexOf('data-go="options"') !== -1);
  check('戻るがある', b.indexOf('data-back') !== -1);
  check('対戦の説明文が仕様どおり',
    b.indexOf('CPU対戦や、ひとり回しができます。') !== -1);
  check('カードの説明文が仕様どおり',
    b.indexOf('デッキ編成や所持カードの確認ができます。') !== -1);
}

console.log('\n■ 対戦モード選択（仕様書 7・30.1）');
{
  const b = screenBlock('battle-mode');
  check('4項目ある（チュートリアル・CPU対戦・ひとり回し・開発者用）',
    b.indexOf('チュートリアル') !== -1 && b.indexOf('data-go="cpu-setup"') !== -1 &&
    b.indexOf('data-go="solo-setup"') !== -1 && b.indexOf('data-go="dev-mode"') !== -1);
  check('チュートリアルに若葉マークが付く（仕様書 7.2）', b.indexOf('menu__leaf') !== -1);
  check('チュートリアルはv0.5と分かる', b.indexOf('v0.5で追加') !== -1);
  check('戻るがある', b.indexOf('data-back') !== -1);
}

console.log('\n■ カードモード選択（仕様書 8・30.1）');
{
  const b = screenBlock('card-mode');
  check('デッキ一覧とカード一覧がある',
    b.indexOf('デッキ一覧') !== -1 && b.indexOf('カード一覧') !== -1);
  check('「デッキ編成」ではなく「デッキ一覧」（仕様書 8.1）',
    b.indexOf('デッキ一覧') !== -1);
  check('説明文が仕様どおり',
    b.indexOf('デッキの作成・確認・編集ができます。') !== -1 &&
    b.indexOf('所持しているカードを一覧で確認できます。') !== -1);
  check('カード一覧は使えるようになった（Stage C）',
    b.indexOf('data-go="card-list"') !== -1);
  check('デッキ一覧も使えるようになった（Stage D）',
    b.indexOf('data-go="deck-list"') !== -1);
}

console.log('\n■ 開発者用モード（仕様書 7.3）');
{
  const b = screenBlock('dev-mode');
  check('CPU観戦を内包している', b.indexOf('data-go="watch-setup"') !== -1);
}

console.log('\n■ 旧初心者ガイドの削除（仕様書 18・30.2）');
{
  check('guide.js が無い', jsFiles.indexOf('guide.js') === -1, jsFiles.join('／'));
  check('guide.js を読み込んでいない', html.indexOf('js/guide.js') === -1);
  check('ガイド用のDOMが無い', html.indexOf('id="guide"') === -1);
  check('CPU対戦設定にガイドのON/OFFが無い',
    html.indexOf('data-opt="guide"') === -1);
  check('設定画面にガイド再表示が無い',
    html.indexOf('opt-guide-reset') === -1 && html.indexOf('初心者ガイドを再表示') === -1);
  check('コードにGuideの呼び出しが残っていない', !/\bGuide\.[a-zA-Z]/.test(allJs));
  check('ガイド用のCSSが残っていない', css.indexOf('.guide__') === -1);
  check('対戦開始時にガイドを設定していない', allJs.indexOf('setupGuide') === -1);

  // Storage 側は Stage A で no-op 化済み。保存もされない
  const st = fs.readFileSync('js/storage.js', 'utf8');
  check('ガイドの記録を保存しない',
    /isGuideDone: function \(\) \{ return false; \}/.test(st));
}

console.log('\n■ 起動したときに出る画面（今回の不具合の再発防止）');
{
  const pv = fs.readFileSync('js/preview.js', 'utf8');
  const fn = pv.slice(pv.indexOf('function openStartScreen()'),
                      pv.indexOf('function openStartScreen()') + 500);
  check('起動時はスタート画面を出す', /Screens\.reset\('start'\)/.test(fn), 
    (fn.match(/Screens\.reset\('[a-z-]+'\)/) || ['見つからない'])[0]);
  check('起動時にモード選択を直接出さない', fn.indexOf("Screens.reset('mode')") === -1);
}

console.log('\n■ 対戦から戻る先');
{
  const pv = fs.readFileSync('js/preview.js', 'utf8');
  check('スタート画面まで戻さず、対戦の階層へ戻す',
    /Screens\.reset\('mode'\);\s*\n\s*Screens\.go\('battle-mode'\);/.test(pv));
  check('観戦から戻ると開発者用モードを経由する',
    /Screens\.go\('dev-mode'\);\s*\n\s*Screens\.go\('watch-setup'\);/.test(pv));
}

console.log('\n' + (fail === 0
  ? '===== メニュー再構成：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
