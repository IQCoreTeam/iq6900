const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');
function setup(t) {
  const dom = new JSDOM('<div id="nfts_status" class="err">old error</div>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.$ = w.jQuery = jquery(w);
  w.createImageBitmap = async f => { if (f.bad) throw Error('bad image'); return { width: 10, height: 10 }; };
  w.URL.createObjectURL = () => 'blob:test';
  w.eval(fs.readFileSync(path.join(__dirname, '../assets/js/sections/pages/nft_studio.js'), 'utf8'));
  const studio = w.$.nft_studio;
  studio.renderUpload = studio.updateNext = studio.dbg = studio.err = studio.renderSummary = () => {};
  return { w, studio };
}
for (const names of [['2-1', '2-2', '3_a', 'apple'], ['0', '1', '2'], ['1', '2', '3'], ['1', '3', '10'], ['01', '1', '2']]) {
  test(`upload assigns contiguous indices and preserves metadata: ${names}`, async t => {
    const { studio } = setup(t);
    studio.state = { name: 'Test', upImgs: Object.fromEntries(names.map(n => [n, {}])), upJsons: Object.fromEntries(names.map(n => [n, { name: n, attributes: [{ trait_type: 'source', value: n }] }])) };
    await studio.repairUpload();
    assert.deepEqual(Array.from(studio.state.items, i => i.index), names.map((_, i) => i + 1));
    for (const it of studio.state.items) assert.equal(it.template.attributes[0].value, it.name);
  });
}
test('failed decode does not leave a hole in item numbers', async t => {
  const { studio } = setup(t);
  studio.state = { name: 'Test', upImgs: { '1': {}, '2': { bad: true }, '3': {} }, upJsons: {} };
  await studio.repairUpload();
  assert.deepEqual(Array.from(studio.state.items, i => i.index), [1, 2]);
  assert.equal(studio.state._up.errs, 1);
});
test('retry clears the previous error before the engine runs', async t => {
  const { w, studio } = setup(t);
  studio.state = { items: [{}] };
  studio.specFromState = () => ({ slug: 'test', price: 0, deposit: 0 });
  let statusAtStart;
  w.iqNft = { deploy: async () => {
    statusAtStart = { text: w.$('#nfts_status').text(), error: w.$('#nfts_status').hasClass('err') };
    throw Error('new error');
  } };
  await studio.deploy();
  assert.deepEqual(statusAtStart, { text: '', error: false });
  assert.equal(w.$('#nfts_status').text(), 'new error');
  assert.equal(studio.state.deploying, false);
});
