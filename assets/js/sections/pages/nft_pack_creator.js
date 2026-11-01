export function parsePackPrice(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^(?:\d+(?:\.\d{0,9})?|\.\d{1,9})$/.test(value.trim())) throw Error('Enter a positive SOL price with up to 9 decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const lamports = BigInt(whole || '0') * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (lamports <= 0n || lamports > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Pack price must be positive and within the supported exact amount.');
  return Number(lamports);
}

const MAX_FILE = 20_000_000;
const BATCH = 8_000_000;
const safePath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !/[\x00-\x1f]/.test(value) && value.split('/').every(part => part && !part.startsWith('.') && !['__proto__', 'constructor', 'prototype'].includes(part));

function referencedFiles(manifest) {
  if (!manifest || manifest.schema !== 'iq-trait-kit/1' || !Array.isArray(manifest.config?.groups) || !Array.isArray(manifest.items)) throw Error('Choose an iq-trait-kit/1 recipe file.');
  const names = new Set();
  for (const group of manifest.config.groups) for (const asset of group.assets || []) {
    if (asset.file !== null) names.add(asset.file);
    if (asset.occlusion) names.add(asset.occlusion.maskFile);
  }
  for (const item of manifest.items) names.add(item.file);
  for (const key of ['coverFile', 'logoFile']) if (manifest.appearance?.[key]) names.add(manifest.appearance[key]);
  if (names.size > 11000) throw Error('This kit has too many referenced files.');
  for (const name of names) if (!safePath(name) || !/\.(png|webp)$/i.test(name)) throw Error('Recipe images must use plain relative PNG or WebP paths.');
  return names;
}

function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

export function createPackDraft(root, { onChange }) {
  const ui = Object.fromEntries([...root.querySelectorAll('[id^="nfts_pack_"]')].map(node => [node.id.slice(10), node]));
  if (window.iqNft?.localOnly === true) ui.price.value = '0.10';
  ui.price_hint.textContent = window.iqNft?.localOnly === true ? 'Creator price. Buyers pay an additional 5% IQ fee, plus network costs. Local test SOL only.' : 'Choose the creator price per pack. Buyers pay an additional 5% IQ fee plus network costs. NFT mint price is separate.';
  let files = new Map(), manifest = null, verifiedKit = null, draftId = null, summary = null, cost = null, normal = null, published = null, fundingRefundPending = false, busy = false, controller = null, activeSlug = '', coverURL = null, publicationProgress = null;
  const supportsSealed=window.iqPackCreatorConfig?.sealedPacks===true;
  if(ui.sealed_options)ui.sealed_options.hidden=!supportsSealed;
  function sealedSettings(){
    if(!supportsSealed||!ui.sealed?.checked)return undefined;
    const supply=Number(ui.sealed_supply.value),name=ui.sealed_name.value.trim(),uri=ui.sealed_uri.value.trim(),gateway=new URL(window.iqPackCreatorConfig.gateway);
    if(!Number.isSafeInteger(supply)||supply<1||supply>250000||summary&&supply>summary.packCount)throw Error('Choose a fixed supply covered by the trait inventory.');
    if(!name||new TextEncoder().encode(name).length>32)throw Error('Pack name must fit 32 UTF-8 bytes.');
    const parsed=new URL(uri);if(parsed.origin!==gateway.origin||!/^\/token-meta\/[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(parsed.pathname)||parsed.search||parsed.hash)throw Error('Use confirmed pack metadata on the configured IQ gateway.');
    return{supply,name,uri};
  }
  if(ui.sealed)for(const node of [ui.sealed,ui.sealed_supply,ui.sealed_name,ui.sealed_uri])node.addEventListener('change',()=>{ui.sealed_fields.hidden=!ui.sealed.checked;const supply=Number(ui.sealed_supply.value);ui.sealed_cost.textContent=Number.isSafeInteger(supply)&&supply>0?'Operations reserve target: '+((supply*48000000+100000000)/1e9).toFixed(3)+' SOL, plus metadata and account rent. This is collateral, not all spent fees.':'Choose a fixed supply to review the reserve target.';save();});
  const refundNotice = document.createElement('p');refundNotice.id='nfts_pack_refund_notice';refundNotice.className='note';refundNotice.setAttribute('role','status');refundNotice.hidden=true;
  const refundCopy = document.createElement('span'),refundRetry = document.createElement('button');refundRetry.type='button';refundRetry.className='btn2';refundRetry.textContent='retry funding refund';refundRetry.id='nfts_pack_refund_retry';
  refundNotice.append(refundCopy,refundRetry);root.querySelector('#nfts_funding_note')?.after(refundNotice);
  const enabled = () => root.querySelector('#nfts_pack_on').checked;
  const message = (text, error = false) => { ui.status.textContent = text; ui.status.classList.toggle('err', error); if(publicationProgress){try{Promise.resolve(publicationProgress(text)).catch(()=>{});}catch{/* A display observer cannot interrupt publication. */}} };
  const save = () => {
    if (!activeSlug) return;
    try { localStorage.setItem('iqstudio:pack-recovery:' + activeSlug, JSON.stringify({ enabled: enabled(), draftId, summary, cost, normal, published, fundingRefundPending, priceSol: ui.price.value, sealedRelease:ui.sealed?.checked?{supply:ui.sealed_supply.value,name:ui.sealed_name.value,uri:ui.sealed_uri.value}:null })); }
    catch { ui.storage_warning.hidden = false; ui.storage_warning.textContent = 'Recovery details could not be saved in this browser. Keep this tab open and copy the collection address below.'; }
  };
  const render = () => {
    ui.setup.hidden = !enabled();
    ui.validate.disabled = busy || !!published || !manifest && !draftId;
    ui.price.disabled = busy || !!published;
    ui.accept.disabled = !!published;
    ui.pick_manifest.disabled = ui.pick_files.disabled = ui.pick_folder.disabled = busy || !!published;
    ui.manifest.disabled = ui.files.disabled = ui.folder.disabled = busy || !!published;
    ui.use.disabled = busy || !!published || !draftId || !manifest || !files.size || !!normal;
    ui.summary.textContent = summary ? `${summary.itemCount} collection items · ${summary.eligibleCount} support outfits · ${summary.definitionCount} trait types · ${summary.packCount} packs · ${ui.price.value.trim()} ${window.iqNft?.localOnly === true ? 'test SOL' : 'SOL'}/pack` : 'Choose a recipe file and its images, then check the kit.';
    ui.cost.textContent = cost ? `${cost.description || ''}${cost.mediaFundingLamports?' Media funding cap: '+(Math.ceil(cost.mediaFundingLamports/1000)/1e6).toFixed(6)+' SOL; unused balance returns after setup.':''}${cost.operationsReserveLamports?' Operations reserve: '+(cost.operationsReserveLamports/1e9)+' SOL.':''}${Number.isInteger(cost.catalogSetupSignatures ?? cost.signatureCount) ? ' Catalog setup: ' + (cost.catalogSetupSignatures ?? cost.signatureCount) + ' transactions, plus image and recipe inscriptions.' : ''}` : '';
    ui.recovery.hidden = !normal;
    ui.collection.textContent = normal?.collection || '';
    ui.result.textContent = published ? 'Pack setup confirmed. Pool: ' + published.pool + (fundingRefundPending?' · unused funding refund pending.':'') : normal ? 'Collection deployed. Continue pack setup; do not deploy the collection again.' : '';
    refundNotice.hidden=!published||!fundingRefundPending;
    refundCopy.textContent=busy?'Pack setup confirmed. Returning unused funding… ':'Pack setup confirmed. Unused funding refund is pending. ';
    refundRetry.disabled=busy||typeof window.iqNft?.sweepPackFunding!=='function';
    onChange();
  };
  async function returnUnusedFunding() {
    if(!published)return;
    const sweep=window.iqNft?.sweepPackFunding;
    if(typeof sweep!=='function'){if(fundingRefundPending)message('Pack setup confirmed. Reconnect the creator wallet to return unused funding.');return;}
    fundingRefundPending=true;save();render();
    try{await sweep();fundingRefundPending=false;message('Pack setup confirmed. Unused funding returned.');}
    catch{message('Pack setup confirmed. Unused funding refund is pending; retry it below.');}
    save();render();
  }
  refundRetry.addEventListener('click',async()=>{
    if(busy||!published||!fundingRefundPending)return;
    busy=true;render();try{await returnUnusedFunding();}finally{busy=false;render();}
  });
  async function request(path, body) {
    const configured = window.iqPackCreatorConfig?.apiBase || location.origin;
    const base = new URL(configured, location.href);
    const loopback = host => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
    if (base.origin !== location.origin && base.origin !== new URL(window.iqNft?.nftApi?.()??location.origin).origin && !(loopback(location.hostname) && loopback(base.hostname))) throw Error('The pack publisher must use this site.');
    const prefix=window.iqPackCreatorConfig?.apiPath??'/creator/packs';
    path=path.replace('/creator/packs',prefix);
    let owner=window.iqNft?.connected?.();if(!owner&&window.iqNft?.connect)owner=await window.iqNft.connect();if(owner)body={...body,owner,sourceConsent:ui.accept.checked};
    if(typeof window.iqNft?.authorizePackCreator!=='function')throw Error('Creator wallet authentication is unavailable');
    const authorization=await window.iqNft.authorizePackCreator();
    if(window.iqNft.connected()!==owner)throw Error('Creator wallet changed; reconnect');
    const response = await fetch(new URL(path, base), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorization }, credentials: 'omit', redirect: 'error', signal: controller?.signal, body: JSON.stringify(body) });
    let result; try { result = await response.json(); } catch { throw Error('The pack publisher returned an unreadable response.'); }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('The pack publisher returned an unreadable response.');
    if (!response.ok) throw Object.assign(Error(typeof result.error === 'string' ? result.error : (response.status === 404 ? 'This draft expired. Reselect the kit files and check them again; your collection remains deployed.' : 'Pack setup could not complete. Your files and collection are kept.')), {status:response.status});
    return result;
  }
  function refreshPreview() {
    if (coverURL) URL.revokeObjectURL(coverURL);
    const cover = manifest && files.get(manifest.appearance?.coverFile);
    coverURL = cover ? URL.createObjectURL(cover) : null; ui.preview.hidden = !coverURL;
    if (coverURL) ui.preview.src = coverURL; else ui.preview.removeAttribute('src');
  }
  ui.pick_manifest.addEventListener('click', () => ui.manifest.click());
  ui.pick_files.addEventListener('click', () => ui.files.click());
  ui.pick_folder.addEventListener('click', () => ui.folder.click());
  function invalidate(resetId=false) { if(published)return; verifiedKit=null; if(resetId)draftId=null; summary = null; cost = null; ui.accept.checked = false; save(); render(); }
  async function chooseFiles(list, folder) {
    if (busy) return;
    const selected = [...list];
    const prefix = folder && selected.length ? selected[0].webkitRelativePath.split('/')[0] + '/' : '';
    const next = new Map();
    for (const file of selected) {
      const name = prefix ? file.webkitRelativePath.slice(prefix.length) : file.name;
      // Unreferenced files are never opened or included in the upload.
      if (!safePath(name)) continue;
      if (next.has(name)) throw Error('Two files have the same kit path: ' + name);
      next.set(name, file);
    }
    files = next; invalidate(); ui.filecount.textContent = files.size + ' files selected; only recipe images will be uploaded.';
    refreshPreview();
  }
  ui.manifest.addEventListener('change', async () => {
    const file = ui.manifest.files[0]; if (!file) return;
    try { if (file.size > 2_000_000) throw Error('The recipe file exceeds 2 MB.'); const next = JSON.parse(await file.text()); referencedFiles(next); const changed=manifest!==null&&JSON.stringify(next)!==JSON.stringify(manifest); manifest = next; invalidate(changed); refreshPreview(); message('Recipe loaded. Choose its images, then check the kit.'); }
    catch (error) { manifest = null; invalidate(true); message(error.message, true); }
  });
  ui.files.addEventListener('change', () => chooseFiles(ui.files.files, false).catch(error => message(error.message, true)));
  ui.folder.addEventListener('change', () => chooseFiles(ui.folder.files, true).catch(error => message(error.message, true)));
  for (const input of root.querySelectorAll('input[name="nfts_pack_mode"]')) input.addEventListener('change', () => { if (busy) controller?.abort(); save(); render(); });
  ui.accept.addEventListener('change', render);
  ui.price.addEventListener('input', () => { if (!busy) invalidate(true); });
  ui.validate.addEventListener('click', async () => {
    if (busy) return;
    busy = true; controller = new AbortController(); render();
    try {
      const settings = { priceLamports: parsePackPrice(ui.price.value) };let result;
      if (!manifest && draftId) {
        result = await request('/creator/packs/validate', { draftId, files: [], final: true, settings }); summary = result.summary; cost = result.cost;
      } else {
        const names = referencedFiles(manifest); let totalBytes = 0;
        for (const name of names) { const file = files.get(name); if (!file) throw Error('Choose the missing image: ' + name); if (file.size > MAX_FILE) throw Error(name + ' exceeds 20 MB.'); totalBytes += file.size; }
        if (totalBytes > 2_000_000_000) throw Error('This kit exceeds the local 2 GB staging limit.');
        result = await request('/creator/packs/validate', { ...(draftId?{draftId}:{}), manifest, files: [], final: false, settings }); draftId = result.draftId;
        let batch = [], bytes = 0, sent = 0;
        const send = async () => { if (!batch.length) return; result = await request('/creator/packs/validate', { draftId, files: batch, final: false, settings }); sent += batch.length; batch = []; bytes = 0; message(`Checking images: ${sent.toLocaleString()} / ${names.size.toLocaleString()}`); save(); };
        for (const name of names) { const file = files.get(name); if (batch.length && bytes + file.size > BATCH) await send(); batch.push({ name, base64: base64(new Uint8Array(await file.arrayBuffer())) }); bytes += file.size; }
        await send(); result = await request('/creator/packs/validate', { draftId, files: [], final: true, settings }); summary = result.summary; cost = result.cost;
      }
      if(result?.publicationKit)verifiedKit=result.publicationKit;
      if(result?.publicationKit&&window.iqNft?.quotePackMedia)cost={...cost,...await window.iqNft.quotePackMedia({kit:result.publicationKit})};
      if (!draftId || !summary || !Number.isInteger(summary.itemCount)) throw Error('The kit did not receive a validation receipt.');
      if (normal && normal.itemCount !== summary.itemCount) throw Error('This kit has a different item count from the deployed collection.');
      message('Kit checked. Review the source-layer notice before publishing.'); save();
    } catch (error) {
      const changed=error.status===409&&/^(Start a new draft after changing its kit or price|An uploaded source image changed|Staged source does not match this draft|Pack draft expired)$/.test(error.message);
      const missing=error.status===404&&/^(Pack draft not found|This draft expired\.)/.test(error.message);
      if(changed||missing){invalidate(true);message(error.message+'. Check again to review a new draft. Previous publication receipts remain saved.',true);}
      else message(error.name === 'AbortError' ? 'Check cancelled. No collection was published.' : error.message, true);
    }
    finally { busy = false; controller = null; render(); }
  });
  return {
    get enabled() { return enabled(); }, get draftId() { return draftId; }, get normal() { return normal; }, get published() { return published; }, get summary() { return summary; },
    setSlug(slug) {
      if (slug === activeSlug) return; activeSlug = slug; normal = null; published = null; fundingRefundPending=false;
      try { const saved = JSON.parse(localStorage.getItem('iqstudio:pack-recovery:' + slug) || 'null'); if (saved) { draftId = saved.draftId; summary = saved.summary; cost = saved.cost; normal = saved.normal; published = saved.published; fundingRefundPending=!!saved.fundingRefundPending; if(supportsSealed&&saved.sealedRelease){ui.sealed.checked=true;ui.sealed_supply.value=saved.sealedRelease.supply;ui.sealed_name.value=saved.sealedRelease.name;ui.sealed_uri.value=saved.sealedRelease.uri;ui.sealed_fields.hidden=false;} if (typeof saved.priceSol === 'string') ui.price.value = saved.priceSol; if (saved.enabled) root.querySelector('#nfts_pack_on').checked = true; } } catch { /* Keep the in-memory draft if recovery storage is unavailable. */ }
      render();
    },
    blockingReason() { if (!enabled() || published) return null; try { parsePackPrice(ui.price.value); } catch (error) { return error.message; } if (busy) return 'Wait for the kit check to finish.'; if (!draftId || !summary) return 'Check a trait kit before publishing.'; if (!ui.accept.checked) return 'Review and accept the source-layer notice.'; if ((!manifest || !files.size) && window.iqNft?.publishPackMedia) return 'Reselect the reviewed recipe and kit images before publishing.'; if (!normal && (!manifest || !files.size)) return 'Reselect the kit images to prepare the collection items.'; return null; },
    async collectionItems() {
      if (!manifest) throw Error('Reselect the recipe file and images.');sealedSettings();
      return manifest.items.map(item => ({ index: item.index, name: item.name || 'Item #' + item.index, sourceBytes: async()=>{const file=files.get(item.file);if(!file)throw Error('Reselect the reviewed kit image: '+item.file);return {bytes:new Uint8Array(await file.arrayBuffer()),mime:verifiedKit?.files.find(entry=>entry.file===item.file)?.mime??(item.file.toLowerCase().endsWith('.webp')?'image/webp':'image/png')};}, template: { attributes: Array.isArray(item.sourceDna) ? manifest.config.groups.flatMap((group, index) => { const asset = group.assets.find(asset => asset.id === item.sourceDna[index]); return [...(group.emitTrait === false || !asset ? [] : [{ trait_type: group.name, value: asset.label }]), ...(asset?.fixedAttributes || [])]; }) : [] }, imageData: async () => { const file = files.get(item.file); if (!file) throw Error('Missing kit image: ' + item.file); const bitmap = await createImageBitmap(file); try { const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); return context.getImageData(0, 0, canvas.width, canvas.height); } finally { bitmap.close(); } } }));
    },
    rememberCollection(result, spec) { normal = { spec: {name:spec.name,slug:spec.slug,symbol:spec.symbol,description:spec.description,price:spec.price,deposit:spec.deposit,royaltyBps:spec.royaltyBps,sequential:spec.sequential}, slug: result.slug, collection: result.collection, registry: result.registry, deploySig: result.deploySig, itemCount: result.itemCount, normalId: result.normalId, localOnly: result.localOnly === true }; save(); render(); },
    async publish({onProgress}={}) {
      if(published)return published;
      const why = this.blockingReason(); if (why) throw Error(why); if (!normal?.collection) throw Error('Deploy the collection before publishing its pack setup.');
      busy = true; controller = new AbortController(); publicationProgress=typeof onProgress==='function'?onProgress:null; render(); message('Publishing pack setup. The existing collection will be reused.');
      try { const settings = {priceLamports: parsePackPrice(ui.price.value)}; const checked = await request('/creator/packs/validate', { draftId, files: [], final: true, settings }); if (checked.summary?.itemCount !== normal.itemCount) throw Error('The checked kit does not match the deployed item count.'); let publicationCheckpoint;
        const publishMedia=window.iqNft?.publishPackMedia;
        if(publishMedia){
          if(!checked.publicationKit||!manifest)throw Error('Reselect and check the reviewed recipe and images');
          const moduleURL=new URL(window.iqPackCreatorConfig?.clientModule??'/pack-client.js',location.href);if(moduleURL.origin!==location.origin)throw Error('Pack client must use this site');
          const {assertReviewedKit}=await import(moduleURL.href);assertReviewedKit(manifest,checked.publicationKit);
          const allowed=referencedFiles(manifest);
          publicationCheckpoint=await publishMedia({kit:checked.publicationKit,draftId,collection:normal.collection,maxFundingLamports:cost.mediaFundingLamports,onProgress:progress=>message(progress.phase==='checking-gateway-copy'?'Checking the gateway copy… This can take up to 2 minutes.':'Inscribing '+(progress.file??progress.name)+' · '+progress.percent+'%'),readSource:async name=>{if(!allowed.has(name))throw Error('This image was not in the reviewed recipe');const file=files.get(name);if(!file)throw Error('Reselect the reviewed kit image: '+name);return new Uint8Array(await file.arrayBuffer());}});
        }
        message('Confirming pack setup…');
        const publishBody={ draftId, collection: normal.collection, registry: normal.registry, collectionReceipt: normal.deploySig, normalId: normal.normalId, settings,...(publicationCheckpoint?{publicationCheckpoint}:{}) };
        let result=await request('/creator/packs/publish',publishBody);
        if(result.stage==='setup'){
          if(!window.iqNft?.publishPackSetup)throw Error('Creator setup signing is not configured');
          await window.iqNft.publishPackSetup({setup:result,collection:normal.collection,operationsReserveLamports:checked.cost.operationsReserveLamports,sealedRelease:sealedSettings()});
          result=await request('/creator/packs/finalize',publishBody);
        }
        if (typeof result.pool !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(result.pool) || typeof result.renderKit !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(result.renderKit)) throw Error('No confirmed pack setup receipt was returned.'); published = result; fundingRefundPending=typeof window.iqNft?.sweepPackFunding==='function';save();message('Pack setup confirmed.');await returnUnusedFunding();return result; }
      finally { busy = false; controller = null; publicationProgress = null; render(); }
    },
    onUse(callback) { ui.use.addEventListener('click', () => callback().catch(error => message(error.message, true))); },
    dispose() { controller?.abort();refundNotice.remove(); if (coverURL) URL.revokeObjectURL(coverURL); },
  };
}
