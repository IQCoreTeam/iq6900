const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'assets/html/sections/nft_launch.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/js/sections/pages/nft_launch.js'), 'utf8');
async function fixture(search = '?menu=nft', health = { status: 200, json: { shareCards: true } }) {
  const dom = new JSDOM(template, { url: 'https://iqlabs.dev/' + search, runScripts: 'outside-only' });
  const { window } = dom;
  const $ = jquery(window);
  window.jQuery = window.$ = $;
  window.console.log = () => {};
  window.console.error = () => {};
  let calls = 0;
  const copied = [], shared = [];
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (url) => copied.push(url) } });
  window.iqNft = {
    api: async (route) => { assert.equal(route, '/health'); calls++; if (health instanceof Error) throw health; return health; },
    nftApi: () => 'https://nft.iqlabs.dev',
    getAsset: async (address) => ({ asset: address, name: 'Known NFT', slug: 'known', inscriptionSig: 'C', metaSig: 'M' }),
    gatewayMeta: async () => ({}),
    metaUrl: (sig) => 'https://gateway.iqlabs.dev/token-meta/' + sig,
    imgUrl: (sig) => 'https://gateway.iqlabs.dev/img/' + sig,
    explorerCluster: () => '', viewUrl: (sig) => 'https://gateway.iqlabs.dev/view/' + sig,
  };
  window.eval(script);
  const page = $.nft_launch;
  await page.wireShares();
  return { dom, window, $, page, copied, shared, calls: () => calls, close: () => dom.window.close() };
}
test('NFT share links follow cached capability and native/manual copy flows', async () => {
  for (const [route, expected] of [
    ['?menu=nft', 'https://nft.iqlabs.dev/share'],
    ['?menu=nft&nft=space%20%26%20slash%2Fslug', 'https://nft.iqlabs.dev/share/c/space%20%26%20slash%2Fslug'],
    ['?menu=nft&asset=KnownAddress&nft=collection', 'https://nft.iqlabs.dev/share/asset/KnownAddress'],
  ]) {
    const f = await fixture(route);
    if (route.includes('asset=')) await f.page.loadAsset('KnownAddress', 'collection');
    assert.equal(f.page.shareUrl(), expected);
    assert.equal(f.$('#nftl_share_actions').css('display'), 'flex');
    const before = f.window.location.href;
    const button = route.includes('asset=') ? f.$('#nftl_vlinks .nftl-share') : f.$('#nftl_share_actions button');
    assert.equal(button.length, 1);
    button.trigger('click');
    await new Promise(setImmediate);
    assert.deepEqual(f.copied, [expected]);
    assert.equal(button.text(), 'Link copied');
    assert.equal(f.window.location.href, before, 'sharing never changes the NFT query route');
    await f.page.wireShares(); await f.page.wireShares();
    assert.equal(f.calls(), 1, 'capability is memoized across repeated UI setup');
    f.close();
  }
  for (const health of [{ status: 200, json: {} }, { status: 503, json: { shareCards: true } }, new Error('offline')]) {
    const f = await fixture('?menu=nft', health);
    assert.equal(f.$('#nftl_share_actions').css('display'), 'none');
    assert.equal(f.page.shareUrl(), null);
    await f.page.shareCurrent(f.$('.nftl-share')[0]);
    assert.deepEqual(f.copied, []);
    f.close();
  }
  const cancel = await fixture();
  cancel.window.navigator.share = async (payload) => { cancel.shared.push(payload); const e = new Error('canceled'); e.name = 'AbortError'; throw e; };
  await cancel.page.shareCurrent(cancel.$('.nftl-share')[0]);
  assert.deepEqual(cancel.shared.map((x) => x.url), ['https://nft.iqlabs.dev/share']);
  assert.deepEqual(cancel.copied, []);
  assert.equal(cancel.$('.nftl-share-link').length, 0, 'native cancellation adds no fallback UI');
  assert.equal(cancel.$('.nftl-share').first().text(), 'Share');
  cancel.close();
  const native = await fixture();
  native.window.navigator.share = async (payload) => native.shared.push(payload);
  await native.page.shareCurrent(native.$('.nftl-share')[0]);
  assert.deepEqual(native.shared.map((x) => x.url), ['https://nft.iqlabs.dev/share']);
  assert.deepEqual(native.copied, []);
  native.close();
  const fallback = await fixture();
  fallback.window.navigator.share = async () => { throw new Error('native share unavailable'); };
  await fallback.page.shareCurrent(fallback.$('.nftl-share')[0]);
  assert.deepEqual(fallback.copied, ['https://nft.iqlabs.dev/share']);
  fallback.window.iqNft.nftApi = () => 'https://different-backend.example';
  assert.equal(fallback.page.shareUrl(), null, 'a runtime backend change cannot reuse another backend capability');
  fallback.close();
  for (const mode of ['denied', 'unavailable', 'asset-denied']) {
    const denied = await fixture(mode === 'asset-denied' ? '?menu=nft&asset=KnownAddress' : '?menu=nft');
    if (mode === 'asset-denied') await denied.page.loadAsset('KnownAddress');
    if (mode === 'unavailable') Object.defineProperty(denied.window.navigator, 'clipboard', { value: undefined });
    else denied.window.navigator.clipboard.writeText = async () => { throw new Error('permission denied'); };
    const button = mode === 'asset-denied' ? denied.$('#nftl_vlinks .nftl-share')[0] : denied.$('#nftl_share_actions .nftl-share')[0];
    await denied.page.shareCurrent(button);
    await denied.page.shareCurrent(button);
    const input = denied.$(button).siblings('.nftl-share-link');
    assert.equal(input.length, 1, 'repeated fallback does not duplicate inputs');
    assert.equal(input.val(), mode === 'asset-denied' ? 'https://nft.iqlabs.dev/share/asset/KnownAddress' : 'https://nft.iqlabs.dev/share');
    assert.equal(input.prop('readOnly'), true);
    assert.equal(input.attr('aria-label'), 'Share link');
    assert.equal(denied.window.document.activeElement, input[0]);
    assert.equal(input[0].selectionStart, 0);
    assert.equal(input[0].selectionEnd, input.val().length);
    assert.equal(input[0].style.minWidth, '0');
    assert.equal(input[0].style.gridColumn, '1 / -1');
    assert.equal(denied.$(button).text(), 'Share');
    denied.close();
  }
  const single = await fixture('?menu=nft&single=Inscription');
  assert.equal(single.page.shareUrl(), null);
  single.close();
  const unmirrored = await fixture('?menu=nft&asset=Unmirrored');
  unmirrored.window.iqNft.getAsset = async () => ({ error: 'unknown' });
  unmirrored.window.iqNft.viewAsset = async () => ({ name: 'Chain-only NFT', attributes: {}, metadata: {} });
  await unmirrored.page.loadAsset('Unmirrored');
  assert.equal(unmirrored.page.shareUrl(), null);
  assert.equal(unmirrored.$('#nftl_vlinks .nftl-share').length, 0);
  unmirrored.close();
  const geometry = await fixture();
  assert.equal(geometry.$('.nav .nftl-share').length, 0, 'header density stays unchanged');
  assert.equal(geometry.$('#nftl_share_actions')[0].style.flexWrap, 'wrap');
  assert.equal(geometry.$('#nftl_share_actions')[0].style.minWidth, '0');
  assert.match(template, /\.vbtns\{display:grid;grid-template-columns:1fr 1fr;gap:6px\}/, 'asset Share uses incumbent two-column mobile-safe actions');
  assert.match(script, /this\.wireShares\(\)/, 'entry point wires capability and action');
  geometry.close();
  console.log('PASS exact home/collection/asset URLs; actual viewer + delegated action; memoized capability; old/offline backend; native/canceled share; clipboard/manual copy; unknown/single suppression; mobile geometry source');
});
