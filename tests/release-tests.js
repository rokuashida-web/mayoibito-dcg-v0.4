/* =====================================================================
   release-tests.js ―― 配布前の点検（v0.3 Stage J）
   ---------------------------------------------------------------------
   人の目では見落とすところを、機械的に確かめます。
   ===================================================================== */
const fs = require('fs'), path = require('path');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('[○] ' + label + (extra ? ' … ' + extra : '')); }
  else { fail++; console.log('[×] ' + label + (extra ? ' … ' + extra : '')); }
}

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/layout.css', 'utf8');
const jsFiles = fs.readdirSync('js').filter(f => f.endsWith('.js'));
const allJs = jsFiles.map(f => fs.readFileSync('js/' + f, 'utf8')).join('\n');

console.log('■ 版の番号がそろっている（仕様書 31・32.9）');
{
  const ver = fs.readFileSync('js/version.js', 'utf8').match(/APP_VERSION = '([\d.]+)'/)[1];
  check('version.js に版がある', !!ver, ver);

  const tags = html.match(/\?v=([\d.]+)/g) || [];
  const bad = tags.filter(t => t !== '?v=' + ver);
  check('読み込みの ?v= が全部そろっている', tags.length > 0 && bad.length === 0,
    tags.length + '個 / ずれ' + bad.length + '個');

  check('CSSにも付いている', /href="css\/layout\.css\?v=/.test(html));
  check('画面に版を直書きしていない', html.indexOf('>v0.3<') === -1);
}

console.log('\n■ 読み込みの取りこぼしがない');
{
  const loaded = (html.match(/src="js\/([a-z\-]+\.js)/g) || [])
    .map(s => s.replace('src="js/', ''));
  const missing = jsFiles.filter(f => loaded.indexOf(f) === -1);
  check('js/ の全ファイルが読み込まれている', missing.length === 0, missing.join('／'));

  const notFound = loaded.filter(f => jsFiles.indexOf(f) === -1);
  check('存在しないファイルを読んでいない', notFound.length === 0, notFound.join('／'));

  // version.js は他より先に読む必要がある
  check('version.js を最初に読む',
    html.indexOf('js/version.js') < html.indexOf('js/preview.js'));
}

console.log('\n■ 開発用のものが残っていない（仕様書 33）');
{
  check('調整パネルは既定で隠れている',
    /const DEV_PANEL = false;/.test(fs.readFileSync('js/screens.js', 'utf8')));
  check('console 出力が残っていない', !/console\.(log|warn|debug)\(/.test(allJs));
  check('debugger が残っていない', allJs.indexOf('debugger') === -1);
  // 「Stage B で削除します」のように、これから手を入れる予定を書いた注記は許す。
  // 禁止したいのは「未完成のまま置き去りになっている」ことを示す書き方。
  const leftover = /Stage [A-J] (で本実装|で本物|に置き換え|の時点では)/;
  check('やり残しを示す注記が残っていない',
    !leftover.test(allJs) && !leftover.test(css));
}

console.log('\n■ HTMLとCSSとJSの食い違い');
{
  const ids = [...new Set((html.match(/id="([^"]+)"/g) || [])
    .map(s => s.slice(4, -1)))];
  const missing = ids.filter(i =>
    allJs.indexOf("'" + i + "'") === -1 && allJs.indexOf('"' + i + '"') === -1 &&
    allJs.indexOf('#' + i) === -1 && css.indexOf('#' + i) === -1);
  // 画面の節は data-screen で引くので、id が使われなくてよい
  const ok = missing.filter(i => !/^screen-/.test(i));
  check('使われていない id が無い', ok.length === 0, ok.join('／'));

  const classes = new Set();
  (html.match(/class="([^"]+)"/g) || []).forEach(c =>
    c.slice(7, -1).split(/\s+/).forEach(x => classes.add(x)));
  const noCss = [...classes].filter(c => css.indexOf('.' + c) === -1);
  check('CSSに定義の無いクラスが無い', noCss.length === 0, noCss.join('／'));
}

console.log('\n■ 画像がそろっている（仕様書 30）');
{
  const imgs = fs.readdirSync('images');
  // コメントの中の「例：」まで拾わないよう、注釈を落としてから探す
  const cardImages = fs.readFileSync('js/card-images.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const refs = [...new Set((cardImages.match(/[\w\-]+\.(webp|png|jpg)/g) || []))];
  const missing = refs.filter(r => imgs.indexOf(r) === -1);
  check('参照している画像がすべて存在する', missing.length === 0, missing.join('／'));
  // 一覧用サムネイル（v0.4 Stage C）
  const thumbs = fs.existsSync('images/thumb')
    ? fs.readdirSync('images/thumb').filter(f => f.endsWith('.webp')) : [];
  const origs = imgs.filter(f => f.endsWith('.webp'));
  check('サムネイルが元画像と同じ枚数ある', thumbs.length === origs.length,
    thumbs.length + '枚 / ' + origs.length + '枚');
  const heavy = thumbs.filter(f => fs.statSync('images/thumb/' + f).size > 40 * 1024);
  check('サムネイルが十分に軽い（1枚40KB未満）', heavy.length === 0, heavy.join('／'));

  check('画像の名前がすべて小文字（配信サーバは大文字小文字を区別する）',
    imgs.every(f => f === f.toLowerCase()),
    imgs.filter(f => f !== f.toLowerCase()).join('／'));
}

console.log('\n■ 配布物に要らないものが混ざっていない');
{
  const junk = [];
  function walk(dir) {
    fs.readdirSync(dir).forEach(function (f) {
      const p = path.join(dir, f);
      if (f === '.DS_Store' || f === 'Thumbs.db' || /~$/.test(f)) junk.push(p);
      if (fs.statSync(p).isDirectory()) walk(p);
    });
  }
  walk('.');
  check('ゴミファイルが無い', junk.length === 0, junk.join('／'));
  check('READMEがある', fs.existsSync('README.md'));
  check('テスト手順書がある', fs.existsSync('TESTING.md'));
}

console.log('\n■ 遊べないモードが無いか（画面の行き先）');
{
  const gos = [...new Set((html.match(/data-go="([^"]+)"/g) || []).map(s => s.slice(9, -1)))];
  const screens = [...new Set((html.match(/data-screen="([^"]+)"/g) || []).map(s => s.slice(13, -1)))];
  check('行き先の画面がすべて存在する',
    gos.every(g => screens.indexOf(g) !== -1), gos.filter(g => screens.indexOf(g) === -1).join('／'));
  // data-go を持たず、JS から進む画面。
  //   start     … 起動時
  //   mode      … スタート画面のタップ
  //   deck-view … デッキ一覧でデッキを押したとき（押す対象が動的に作られる）
  const ROOTS = ['start', 'mode', 'deck-view', 'deck-edit', 'field-select'];
  const unreachable = screens.filter(s => ROOTS.indexOf(s) === -1 && gos.indexOf(s) === -1);
  check('たどり着けない画面が無い', unreachable.length === 0, unreachable.join('／'));

  // JS から進む画面は、実際にその呼び出しがコードにあるか確かめる
  check('デッキ確認へ進む処理がある', /Screens\.go\('deck-view'\)/.test(allJs));
}

console.log('\n' + (fail === 0
  ? '===== 配布前の点検：' + pass + '/' + pass + ' 通過 ====='
  : '===== 失敗 ' + fail + '件 ====='));
process.exit(fail === 0 ? 0 : 1);
