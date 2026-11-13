const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');

const assets = path.resolve(__dirname, '../assets');
const source = (file) => fs.readFileSync(path.join(assets, file), 'utf8');

async function viewer(t, row, extra) {
  const dom = new JSDOM('<div id="main_section"></div>', {
    url: 'http://localhost/?menu=codein', runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.$ = w.jQuery = jquery(w);
  w.TextEncoder = TextEncoder;
  w.iqCodein = {
    imgUrl:s=>'https://gateway.iqlabs.dev/img/'+s,renderUrl:s=>'https://gateway.iqlabs.dev/render/'+s,market:{enrich:async()=>[]},
    hasOwnRpc: () => false,
    estimateCost: () => ({ chunks: 1, total: 1 }),
    readBoard: async () => ({ rows: [row], nextCursor: null }),
    readOne: async () => row,
    ...extra,
  };
  w.$.ajax = ({ success }) => success(source('html/sections/code_in_v2.html'));
  w.eval(source('js/sections/pages/code_in_v2.js'));
  w.$.code_in_v2.init('synthetic-signature');
  await new Promise(setImmediate);
  return w;
}

test('feed treats record metadata as text, not HTML', async (t) => {
  const kind = '<img src=x onerror="window.injected=true">';
  const w = await viewer(t, { kind, body: 'synthetic', who: '<svg' });
  assert.equal(w.document.querySelector('#ci2_grid .tag').textContent, kind);
  assert.equal(w.document.querySelectorAll('#ci2_grid .m img, #ci2_grid .m svg').length, 0);
});

test('file records cannot create executable download links', async (t) => {
  const w = await viewer(t, { kind: 'file', body: 'javascript:window.injected=true' });
  assert.equal(w.document.querySelector('#ci2_view_body a'), null);
});

for (const [mime, tag] of [['image/png', 'img'], ['audio/wav', 'audio'], ['application/octet-stream', 'a']]) {
  test(`preserves ${mime} media rendering`, async (t) => {
    const body = `data:${mime};base64,AA==`;
    const w = await viewer(t, { kind: 'file', body });
    const el = w.document.querySelector(`#ci2_view_body ${tag}`);
    assert.ok(el);
    assert.equal(el.getAttribute(tag === 'a' ? 'href' : 'src'), body);
    if (tag === 'a') assert.equal(el.getAttribute('download'), 'codein-file');
  });
}

test('text inscriptions remain inert text', async (t) => {
  const body = '<script>window.injected=true</script>';
  const w = await viewer(t, { kind: 'text', body });
  assert.equal(w.document.querySelector('#ci2_view_body pre').textContent, body);
  assert.equal(w.document.querySelector('#ci2_view_body script'), null);
});

test('check-profile links to the author wallet when the adapter supports it', async (t) => {
  const profileUrl = (wallet) => 'https://browser.iqlabs.dev/' + wallet;
  const w = await viewer(t, { kind: 'text', body: 'hi', who: 'ownerWallet123' }, { profileUrl });
  const btn = w.document.querySelector('#ci2_view_profile');
  assert.equal(btn.classList.contains('hide'), false);
  assert.equal(btn.getAttribute('href'), 'https://browser.iqlabs.dev/ownerWallet123');
});

test('check-profile stays hidden without an owner or a profile-capable adapter', async (t) => {
  const profileUrl = (wallet) => 'https://browser.iqlabs.dev/' + wallet;
  // owner present but adapter has no profileUrl (e.g. hood-in / EVM)
  const noProfile = await viewer(t, { kind: 'text', body: 'hi', who: 'ownerWallet123' });
  assert.equal(noProfile.document.querySelector('#ci2_view_profile').classList.contains('hide'), true);
  // profileUrl present but the row has no owner
  const noOwner = await viewer(t, { kind: 'text', body: 'hi' }, { profileUrl });
  assert.equal(noOwner.document.querySelector('#ci2_view_profile').classList.contains('hide'), true);
});

test('legacy music does not request chain data on unrelated pages', async (t) => {
  const dom = new JSDOM('<div id="main_section"></div>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.$ = w.jQuery = jquery(w);
  let reads = 0;
  w.bringCode = () => { reads++; return new Promise(() => {}); };
  w.eval(source('js/decoder/mp3_decoder.js'));
  await new Promise(setImmediate);
  void w.fetchMusicFromBlockchain();
  assert.equal(reads, 0);
});

test('legacy demo still fetches when its controls are mounted', async (t) => {
  const dom = new JSDOM('<audio id="mp3"></audio><button id="playbtn"></button><div class="mv_console_div"></div>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.$ = w.jQuery = jquery(w);
  let reads = 0;
  w.bringCode = async () => { reads++; return { base64Str: 'AA==' }; };
  w.URL.createObjectURL = () => 'blob:synthetic-audio';
  w.eval(source('js/decoder/mp3_decoder.js'));
  await new Promise(setImmediate);
  assert.equal(reads, 0);
  await w.fetchMusicFromBlockchain();
  assert.equal(reads, 1);
  assert.equal(w.document.querySelector('#mp3 source').src, 'blob:synthetic-audio');
  assert.equal(w.document.querySelector('#playbtn').innerText, 'Start');
});
