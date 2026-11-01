// Shared pack presentation. Configured mode uses Wallet Standard and a pinned
// confirmed-state API; the isolated legacy preview remains a separate branch.
// Cards reveal only after all four settled trait accounts are returned.
import { normalizePackAppearance, applyPackAppearance } from '/packs-appearance.mjs';
import { solanaMarketUrl } from '/nft-market-links.mjs';
import { TIER_COLORS, initialPoolShares } from '/packs-rarity.mjs';
const categories = ['Hair', 'Clothing', 'Background'];

export function packRewards(snapshot, pack) {
  if (pack?.status !== 'settled') return [];
  const addresses = pack.traitAddresses;
  if (!Array.isArray(addresses) || addresses.length !== 4 || new Set(addresses).size !== 4) {
    throw Error('The pack confirmed, but its four traits could not be read. Refresh state to try again.');
  }
  return addresses.map(address => {
    const trait = snapshot.traits.find(item => item.address === address);
    if (!trait) throw Error('A confirmed trait is missing from this read. Refresh state to try again.');
    return trait;
  });
}

export async function mountPacks() {
  if(window.iqPackBootstrap)await window.iqPackBootstrap;
  if(!window.iqPackConfig)throw Error('Packs are not configured for this network.');
  const main = document.querySelector('#main_section');
  if (!main) throw Error('NFT page container is missing.');
  const fragment = await fetch('./html/sections/nft_packs.html');
  if (!fragment.ok) throw Error('Could not load the pack page.');
  main.innerHTML = await fragment.text();
  main.style.display = '';
  const root = main.querySelector('#nftp');
  const ui = Object.fromEntries([...root.querySelectorAll('[id^="nftp-"]')].map(node => [node.id.slice(5), node]));
  let state, selectedId = null, busy = false, rewardsKey = '', pageBefore=null;
  const revealed=new Map();
  function restoreSettledRewards() {
    for (const pack of state?.packs ?? []) if (pack.status === 'settled')
      revealed.set(pack.address, new Set(packRewards(state, pack).map(trait => trait.address)));
  }
  const liveConfig=window.iqPackConfig;
  const transport=(await import('./pack-transport.mjs')).createPackPageTransport(liveConfig,location.href);
  if(!root.isConnected)return;
  let liveWallet=null,liveAccount=null,liveClient=null,walletDispose=null,disposed=false,openingView=null,readyForNextPack=false,walletRevision=0;
  const owner=()=>liveAccount?.address??null;
  let settlementTimer=null,settlementKey=null,settlementReads=0,settlementStarted=0;
  const stop=()=>{if(disposed)return;disposed=true;window.clearTimeout(settlementTimer);walletDispose?.();openingView?.dispose();pageObserver.disconnect();};
  const pageObserver=new MutationObserver(()=>{if(!root.isConnected)stop();});
  pageObserver.observe(main,{childList:true});
  root.classList.add('packs-live');
    ui['pack-selector'].setAttribute('aria-label','Your openings');
    root.querySelector('.preview-note').textContent=liveConfig.chain==='solana:localnet'?'LOCAL · TEST SOL':liveConfig.chain==='solana:devnet'?'SOLANA DEVNET · TEST SOL':'SOLANA MAINNET';
    ui.owner.textContent='Connect a wallet to see your packs and traits.';
    const walletRoot=document.createElement('section');walletRoot.id='nftp-wallet-controls';walletRoot.className='pack-wallet-controls';walletRoot.setAttribute('aria-label','Pack wallet');root.querySelector('.packs-nav').append(walletRoot);
    walletRoot.addEventListener('iqpacks:wallet',async event=>{const revision=++walletRevision;pageBefore=null;liveWallet=event.detail.wallet;liveAccount=event.detail.account;selectedId=null;readyForNextPack=false;revealed.clear();ui.error.hidden=true;if(state){state={...state,packs:[],traits:[],receipts:[],avatar:{exists:null,owner:null,definitions:[]}};render();}ui.owner.textContent=liveAccount?'Loading your confirmed packs and traits…':'Connect a wallet to see your packs and traits.';try{await request();if(revision!==walletRevision)return;restoreSettledRewards();choosePack();readyForNextPack=selectedPack()?.status==='settled';render();say(selectedPack()?.status==='settled'?'Your confirmed finds are ready.':liveAccount?'Ready for another pack.':'Connect a wallet to see your packs and traits.');}catch(error){fail(error);}});
    walletRoot.addEventListener('iqpacks:purchase',async event=>{const revision=walletRevision;try{pageBefore=null;const previous=new Set(state?.packs.map(pack=>pack.address)??[]);await request({afterSignature:event.detail.signature});if(revision!==walletRevision)return;const added=state.packs.find(pack=>!previous.has(pack.address)&&pack.owner===owner());selectedId=added?.id??null;readyForNextPack=false;choosePack();render();say('Preparing your pack. This can take a moment.');}catch(error){fail(error);}});
    const moduleURL=new URL(liveConfig.clientModule??'/pack-client.js',location.href);if(moduleURL.origin!==location.origin)throw Error('Pack client must use this site');
    const clientModule=await import(moduleURL.href);
    if(!root.isConnected||disposed)return;
    liveClient=clientModule.createPackClient({connection:liveConfig.connection??new clientModule.Connection(liveConfig.rpc,'confirmed'),program:liveConfig.program,collection:liveConfig.collection,chain:liveConfig.chain,localGenesis:liveConfig.localGenesis,pendingPurchases:liveConfig.pendingPurchases});
    walletDispose=clientModule.mountPackWalletUI(walletRoot,{registry:liveConfig.registry,client:liveClient,chain:liveConfig.chain,purchaseRoot:ui.checkout,requestWindow:liveConfig.windowRequests?((wallet,account)=>clientModule.requestPackWindow({wallet,account,chain:liveConfig.chain,program:liveConfig.program,collection:liveConfig.collection,endpoint:transport.windowEndpoint})):null});
    const refreshPrice=ui.checkout.querySelector('.text-button');
    if(refreshPrice)refreshPrice.hidden=true;


  const category = trait => (state?.slotLabels || categories)[trait.slot] || 'Trait';
  function say(text) { ui.status.textContent = text; }
  function fail(error) {
    if(error.staleWalletRead)return;
    ui.error.textContent = error.message || 'The request did not finish. Refresh confirmed state before trying again.';
    ui.error.hidden = false;
  }
  function selectedPack() { return state?.packs.find(pack => pack.id === selectedId && pack.owner === owner()); }
  function choosePack() {
    const owned = state.packs.filter(pack => pack.owner === owner());
    if (!owned.some(pack => pack.id === selectedId)) selectedId = (owned.find(pack => pack.status !== 'settled') || owned.at(-1))?.id ?? null;
  }
  async function request(body) {
    const revision=walletRevision,holder=owner(),stale=Object.assign(Error('Wallet changed; read its current confirmed state.'),{staleWalletRead:true});let signature=body?.afterSignature;
    if(body?.action){
      if(!liveAccount||!liveWallet)throw Error('Connect a wallet before changing an outfit');
      if(!['equip','unequip'].includes(body.action))throw Error('Pack settlement is handled by the operator; refresh confirmed state');
      if(!state.avatar.address)throw Error('Choose a compatible NFT');
      const receipt=await liveClient.changeEquipment({wallet:liveWallet,account:liveAccount,avatar:state.avatar.address,trait:body.trait,remove:body.action==='unequip'});signature=receipt.signature;
    }
    if(revision!==walletRevision||disposed)throw stale;
    const before=Object.hasOwn(body??{},'before')?body.before:pageBefore;
    const next=await transport.read(holder,signature,before);
    if(revision!==walletRevision||disposed)throw stale;
    if(state)for(const pack of next.packs)if(pack.status==='settled'&&!revealed.has(pack.address))revealed.set(pack.address,new Set());
    state=next;pageBefore=next.pagination?.before??null;
  }
  function canContinue() {
    if (root.isConnected) return true;
    throw Error('The page changed. Reopen packs to continue from the confirmed state.');
  }
  function makeImage(trait) {
    const image = document.createElement('img');
    image.src = transport.media(trait.image);
    image.alt = trait.name;
    image.loading = 'eager';
    image.addEventListener('error', () => { image.hidden = true; image.parentElement.classList.add('missing-art'); });
    return image;
  }
  function revealCard(button, address) {
    if (busy) return;
    const pack = selectedPack();
    if (!pack || pack.status !== 'settled') return;
    revealed.get(pack.address).add(address);
    button.classList.add('is-revealed');
    button.setAttribute('aria-expanded', 'true');
    const trait = state.traits.find(item => item.address === address);
    button.setAttribute('aria-label', trait.name + ', ' + category(trait));
    ui.caption.textContent = revealed.get(pack.address).size === 4 ? 'Four traits. Confirmed on-chain.' : 'Pick a card. See what you found.';
    ui['reveal-all'].hidden = revealed.get(pack.address).size === 4;
  }
  function renderRewards(pack) {
    const rewards = packRewards(state, pack);
    const key = rewards.length ? pack.address + ':' + rewards.map(item => item.address).join(',') : '';
    if (key !== rewardsKey) {
      ui.rewards.replaceChildren(); rewardsKey = key;
      if (rewards.length && !revealed.has(pack.address)) revealed.set(pack.address, new Set(rewards.map(item => item.address)));
      rewards.forEach((trait, index) => {
        const button = document.createElement('button');
        button.className = 'reward-card'; button.type = 'button'; button.style.setProperty('--card-index', index);
        button.dataset.address = trait.address;
        const inner = document.createElement('span'); inner.className = 'reward-card-inner';
        const back = document.createElement('span'); back.className = 'card-back'; back.setAttribute('aria-hidden', 'true');
        const logo = document.createElement('img'); logo.src = './img/green_logo.webp'; logo.alt = '';
        const korean = document.createElement('span'); korean.lang = 'ko'; korean.textContent = '열어봐요';
        const prompt = document.createElement('small'); prompt.textContent = 'CLICK TO REVEAL'; back.append(logo, prompt, korean);
        const front = document.createElement('span'); front.className = 'card-front'; front.setAttribute('aria-hidden', 'true');
        const categoryLabel = document.createElement('small'); categoryLabel.textContent = trait.burned ? 'Burned · ' + category(trait) : category(trait);
        const pack=selectedPack(),mystery=Boolean(openingView)&&pack?.traitAddresses?.includes(trait.address)&&!revealed.get(pack.address)?.has(trait.address);
      const name = document.createElement('strong'); name.textContent = mystery?'Unrevealed trait':trait.name;
        const unavailable = document.createElement('span'); unavailable.className = 'art-unavailable'; unavailable.textContent = 'Artwork unavailable';
        front.append(makeImage(trait), unavailable, categoryLabel, name); inner.append(back, front); button.append(inner);
        button.addEventListener('click', () => revealCard(button, trait.address));
        ui.rewards.append(button);
      });
    }
    for (const button of ui.rewards.children) {
      const isRevealed = revealed.get(pack.address)?.has(button.dataset.address);
      const trait = rewards.find(item => item.address === button.dataset.address);
      button.classList.toggle('is-revealed', Boolean(isRevealed)); button.disabled = busy;
      button.setAttribute('aria-expanded', String(Boolean(isRevealed)));
      button.setAttribute('aria-label', isRevealed ? trait.name + ', ' + category(trait) : 'Reveal trait ' + (rewards.indexOf(trait) + 1));
    }
    if(openingView){
      const stock=new Map(state.stock.map(definition=>[definition.id,definition]));
      const cards=rewards.map(trait=>{const tier=stock.get(trait.definition)?.creatorTier,known=Object.hasOwn(TIER_COLORS,tier);return {id:trait.address,name:trait.name,category:category(trait),image:transport.media(trait.image),rarity:known?tier:'common',creatorTier:known?tier:null};});
      openingView.update({cards,opened:rewards.length?[...revealed.get(pack.address)]:[],packId:pack?.address??null,interactive:!busy});
    }
    ui.rewards.hidden = !rewards.length || Boolean(openingView);
    ui.caption.hidden = Boolean(openingView);
    ui.pack.hidden = Boolean(openingView) || rewards.length > 0;
    ui['reveal-all'].hidden = Boolean(openingView) || !rewards.length || revealed.get(pack.address)?.size === 4;
    ui['reveal-all'].disabled = busy;
    ui.caption.textContent = rewards.length ? (revealed.get(pack.address)?.size === 4 ? 'Four traits. Confirmed on-chain.' : 'Pick a card. See what you found.') : 'Four finds. One sealed pack.';
  }
  function renderInventory() {
    const supply = ui['pool-supply'];
    if(supply){
      supply.replaceChildren();
      if(state.stock.every(definition=>Number.isInteger(definition.initialSupply))){
        const shares = new Map(initialPoolShares(state.stock).map(row=>[row.id,row]));
        for(const definition of state.stock){
          const row=document.createElement('li'),info=document.createElement('div'),name=document.createElement('span'),tier=document.createElement('small'),share=document.createElement('span');
          name.textContent=definition.name;
          const known=Object.hasOwn(TIER_COLORS,definition.creatorTier);
          tier.textContent=(known?definition.creatorTier:'Unspecified')+' · '+definition.initialSupply+' copies'; if(known)tier.style.color=TIER_COLORS[definition.creatorTier];
          share.textContent=(shares.get(definition.id).perDrawShare*100).toLocaleString(undefined,{maximumFractionDigits:2})+'%';
          info.append(name,tier);row.append(info,share);supply.append(row);
        }
      }
    }

    const currentOwner=owner(),ownsAvatar=!!currentOwner&&state.avatar.owner===currentOwner;
    const traits = state.traits.filter(trait => !trait.burned && ((!trait.avatar && trait.freeOwner === currentOwner) || (trait.avatar === state.avatar.address && ownsAvatar)));
    const definitions = new Map(state.stock.map(item => [item.id, item]));
    const equipped = state.traits.filter(item => item.avatar === state.avatar.address);
    const occupiedSlots = new Set(equipped.map(item => item.slot));
    const dependentKeys = new Set();
    for (const item of equipped) {
      const rule = definitions.get(item.definition);
      if (Number.isInteger(rule?.requiredSlot) && rule.requiredSlot !== 255) dependentKeys.add(rule.requiredSlot + ':' + rule.requiredDefinition);
    }
    const outfit=state.avatar.definitions?.some(id=>id!==255)?state.avatar.outfitURL:null;
    ui['avatar-preview'].hidden=!outfit;
    if(outfit&&ui['avatar-image'].getAttribute('src')!==outfit)ui['avatar-image'].src=outfit;
    if(!outfit)ui['avatar-image'].removeAttribute('src');
    ui.count.textContent = traits.length;
    const holder='another holder';
    if(ui['restore-original']){ui['restore-original'].hidden=!ownsAvatar||!state.avatar.outfitsEnabled;ui['restore-original'].disabled=busy||equipped.length>0;}
    if(ui['enable-outfits']){ui['outfit-approval'].hidden=state.avatar.exists===false||state.avatar.outfitsEnabled!==false||!ownsAvatar;ui['enable-outfits'].disabled=busy;}
    if(ui['mint-base']){ui['mint-base'].hidden=state.avatar.exists!==false;ui['mint-base'].href='?menu=nft&nft='+encodeURIComponent(state.collectionSlug??'');}
    ui.owner.textContent = !owner()?'Connect a wallet to see your packs and traits.':state.avatar.exists===null?'Loading your confirmed packs and traits…':state.avatar.exists===false ? 'Mint a compatible collection NFT to equip your traits.' : state.avatar.outfitsEnabled===false&&ownsAvatar ? 'Enable outfits before equipping traits on this NFT.' : ownsAvatar ? 'Equip a trait to your NFT.' : 'This NFT is held by ' + holder + '. Connect its current holder to change outfits.';
    let tradeSlot = root.querySelector('#nftp-trade-nft');
    if (!tradeSlot) {
      tradeSlot = document.createElement('div'); tradeSlot.id = 'nftp-trade-nft';
      ui.owner.after(tradeSlot);
    }
    tradeSlot.hidden = !ownsAvatar;
    tradeSlot.replaceChildren();
    if (ownsAvatar) {
      const market = solanaMarketUrl(state.avatar.address, liveConfig.chain);
      const trade = document.createElement(market ? 'a' : 'button'); trade.className = 'text-button';
      trade.textContent = 'Trade NFT ↗';
      if (market) { trade.href = market; trade.target = '_blank'; trade.rel = 'noopener noreferrer'; }
      else { trade.type = 'button'; trade.disabled = true; trade.title = 'Trading opens on mainnet'; }
      tradeSlot.append(trade);
    }
    if (outfit) root.querySelector('.avatar-preview figcaption').textContent = 'Equipped traits travel with this NFT.';
    ui.inventory.replaceChildren();
    if (!traits.length) {
      const empty = document.createElement('p'); empty.className = 'inventory-empty'; empty.textContent = 'Your finds will appear here. Every opening adds four.'; ui.inventory.append(empty);
    }
    for (const trait of traits) {
      const row = document.createElement('div'); row.className = 'inventory-trait';
      const copy = document.createElement('div'); copy.className = 'trait-copy';
      const pack=selectedPack(),mystery=Boolean(openingView)&&pack?.traitAddresses?.includes(trait.address)&&!revealed.get(pack.address)?.has(trait.address);
      const name = document.createElement('strong'); name.textContent = mystery?'Unrevealed trait':trait.name;
      const definition = definitions.get(trait.definition);
      const requires = Number.isInteger(definition?.requiredSlot) && definition.requiredSlot !== 255;
      const prerequisiteName = requires ? definitions.get(definition.requiredDefinition)?.name || 'another trait' : '';
      const requirementMet = !requires || state.avatar.definitions?.[definition.requiredSlot] === definition.requiredDefinition;
      const bodyFits = !Number.isInteger(definition?.bodyMask) || !Number.isInteger(state.avatar.bodyClass) || Boolean(definition.bodyMask & (1 << state.avatar.bodyClass));
      const dependent = Boolean(trait.avatar) && dependentKeys.has(trait.slot + ':' + trait.definition);
      const detail = document.createElement('span'); detail.textContent = category(trait) + (trait.avatar ? ' · equipped' : requires ? ' · needs ' + prerequisiteName : ''); copy.append(name, detail);
      if(!mystery&&Object.hasOwn(TIER_COLORS,definition?.creatorTier)){const tier=document.createElement('span');tier.textContent=definition.creatorTier;tier.style.color=TIER_COLORS[definition.creatorTier];copy.append(tier);}
      const occupied = occupiedSlots.has(trait.slot);
      const button = document.createElement('button'); button.type = 'button';
      if(state.avatar.exists===false)button.textContent='Mint an NFT first';
      else if(ownsAvatar&&state.avatar.outfitsEnabled===false)button.textContent='Enable outfits first';
      else if (trait.avatar) button.textContent = dependent ? 'Remove dependent first' : 'Unequip';
      else if (!ownsAvatar) button.textContent = 'Other holder';
      else if (occupied) button.textContent = 'Slot in use';
      else if (!bodyFits) button.textContent = 'Does not fit';
      else button.textContent = requirementMet ? 'Equip' : 'Needs ' + prerequisiteName;
      button.disabled = busy || state.avatar.outfitsEnabled===false || !ownsAvatar || (trait.avatar ? dependent : occupied || !bodyFits || !requirementMet);
      button.disabled ||= mystery;if(mystery)button.textContent='Reveal first';
      if(mystery)detail.textContent='Reveal the card to discover it';
      const image=mystery?document.createElement('img'):makeImage(trait);if(mystery){image.src='/img/green_logo.webp';image.alt='Unrevealed trait';}
      button.addEventListener('click', () => changeEquipment(trait));
      if (!mystery && !trait.avatar) {
        const market = solanaMarketUrl(trait.address, liveConfig.chain);
        const trade = document.createElement(market ? 'a' : 'button'); trade.className = 'text-button'; trade.textContent = 'Trade trait ↗';
        if (market) { trade.href = market; trade.target = '_blank'; trade.rel = 'noopener noreferrer'; }
        else { trade.type = 'button'; trade.disabled = true; trade.title = 'Trading opens on mainnet'; }
        copy.append(trade);
      } else if (trait.avatar && !mystery) {
        const note = document.createElement('span'); note.textContent = 'Unequip to trade separately.'; copy.append(note);
      }
      row.append(image, copy, button); ui.inventory.append(row);
    }
  }
  function followSettlement(pack) {
    const key=pack&&pack.status!=='settled'?walletRevision+':'+pack.address:null;
    if(key!==settlementKey){window.clearTimeout(settlementTimer);settlementTimer=null;settlementKey=key;settlementReads=0;settlementStarted=Date.now();}
    if(!key||settlementTimer!==null||settlementReads>=24||Date.now()-settlementStarted>=120000)return;
    settlementTimer=window.setTimeout(async()=>{
      settlementTimer=null;
      if(disposed||settlementKey!==key)return;
      if(!document.hidden&&!busy){
        settlementReads++;
        try{
          await request();
          if(settlementKey!==key)return;
          if(selectedPack()?.status==='settled')say('Your pack is ready. Click the pack to open it.');
        }catch(error){
          if(error.staleWalletRead)return;
          settlementReads=24;fail(error);
        }
      }
      if(settlementKey===key)render();
    },5000);
  }
  function render() {
    try{applyPackAppearance(root,normalizePackAppearance(state.appearance??(new URL(location.href).searchParams.has('collection')?null:{title:root.dataset.packTitle,subtitle:root.dataset.packSubtitle,collectionName:root.dataset.packSeries,cover:root.dataset.packCover,logo:root.dataset.packLogo}),location.origin));}catch{applyPackAppearance(root,normalizePackAppearance(null,location.origin));}
    if (!state || !root.isConnected) return;
    if(state.appearance?.collectionName)ui.title.textContent=state.appearance.collectionName;
    choosePack();
    const pack = readyForNextPack ? null : selectedPack(), owned = state.packs.filter(item => item.owner === owner());
    const stock = state.stock.reduce((sum, item) => sum + item.remaining, 0);
    const reserved = state.packs.filter(item => item.status !== 'settled').length * 4;
    const available = Number.isSafeInteger(state.availablePacks) ? state.availablePacks : Math.max(0, Math.floor((stock - reserved) / 4));
    ui.workspace.setAttribute('aria-busy', String(busy)); ui.refresh.disabled = busy;
    if(ui['history-older']){ui['history-older'].hidden=state.pagination?.nextBefore==null;ui['history-older'].disabled=busy;}
    if(ui['history-latest']){ui['history-latest'].hidden=pageBefore==null;ui['history-latest'].disabled=busy;}
    if(ui['history-note']){ui['history-note'].hidden=pageBefore==null&&state.pagination?.nextBefore==null;ui['history-note'].textContent=pageBefore==null?'Use Older activity to find earlier packs and traits.':'Viewing earlier activity. Equipped traits remain available.';}
    const labels = { sealed: 'UNOPENED', requested: 'OPENING REQUESTED', fulfilled: 'READY TO SETTLE', settled: 'OPENED' };
    ui['pack-state'].textContent = pack ? (pack.status==='settled'&&revealed.get(pack.address)?.size!==4?'READY TO OPEN':labels[pack.status]) : available + ' PACKS AVAILABLE';
    ui['pack-label'].textContent = pack ? 'PACK ' + String(pack.id + 1).padStart(3, '0') : 'COSMETIC PACK';
    followSettlement(pack);
    const waiting=!!pack&&pack.status!=='settled';
    const autoWaiting=waiting&&settlementReads<24&&Date.now()-settlementStarted<120000;
    ui.primary.textContent=busy?'Checking…':autoWaiting?'Preparing randomness…':'Check status';
    ui.checkout.hidden=Boolean(pack);
    ui.primary.hidden=!pack||pack.status==='settled';
    ui.primary.disabled=busy||autoWaiting;
    ui['selector-label'].hidden = owned.length < 1;
    ui['pack-selector'].replaceChildren(...owned.map(item => {
      const button = document.createElement('button'); button.type='button'; button.dataset.packId=String(item.id); button.className='opening-row'; button.disabled=busy;
      button.setAttribute('aria-pressed',String(!readyForNextPack&&item.id===selectedId));
      const name=document.createElement('span'),status=document.createElement('span');name.textContent='Pack '+(item.id+1);status.textContent=labels[item.status];button.append(name,status);return button;
    }));
    try { renderRewards(pack); }
    catch (error) {
      fail(error); ui.rewards.hidden = true; ui.pack.hidden = false;
      ui['reveal-all'].hidden = true; ui.primary.disabled = true;
      ui.caption.textContent = 'The confirmed traits need a fresh read.';
    }
    renderInventory();
    const receipt = state.receipts.at(-1);
    ui.receipt.textContent = receipt ? 'CONFIRMED RECEIPT · ' + receipt.signature.slice(0, 13) + '…' + receipt.signature.slice(-10) : '';
  }
  async function recover(error) {
    if(error.staleWalletRead)return;
    try { await request(); choosePack(); } catch { /* Keep the last known state; do not replay an ambiguous write. */ }
    if (root.isConnected) { fail(error); say('Read the latest state before retrying. Your last action may already have confirmed.'); }
  }
  async function primaryAction() {
    if(busy||!state)return;
    busy=true;ui.error.hidden=true;render();
    try{
      await request();canContinue();choosePack();const current=selectedPack();
      if(current?.status==='settled'){revealed.set(current.address,new Set());readyForNextPack=false;say('Confirmed. Tap the pack to reveal your four traits.');}
      else {settlementReads=0;settlementStarted=Date.now();say('Preparing randomness…');}
    }catch(error){await recover(error);}finally{busy=false;render();}
  }
  async function changeEquipment(trait) {
    if (busy) return;
    busy = true; ui.error.hidden = true; say(trait.avatar ? 'Confirming unequip…' : 'Confirming equip…'); render();
    try { await request({action: trait.avatar ? 'unequip' : 'equip', trait: trait.address }); canContinue(); say(trait.avatar?'Trait unequipped.':'Trait equipped.'); }
    catch (error) { await recover(error); }
    finally { busy = false; render(); }
  }
  ui['restore-original']?.addEventListener('click',async()=>{
    if(busy||!liveAccount||!state.avatar.address)return;busy=true;render();
    const revision=walletRevision;try{const receipt=await liveClient.restoreOriginal({wallet:liveWallet,account:liveAccount,avatar:state.avatar.address});if(revision!==walletRevision)return;await request({afterSignature:receipt.signature});if(revision===walletRevision)say('Original metadata restored. The burn-safety hook remains.');}catch(error){if(revision===walletRevision)await recover(error);}finally{busy=false;render();}
  });
  ui['enable-outfits']?.addEventListener('click',async()=>{
    if(busy||state.avatar.owner!==owner()||!state.collectionAddress)return;
    busy=true;render();say('Confirming creator and holder approval…');
    const revision=walletRevision;try{if(typeof liveConfig.enableOutfits!=='function')throw Error('The creator has not enabled the holder approval flow on this site');const signature=await liveConfig.enableOutfits({wallet:liveWallet,account:liveAccount,asset:state.avatar.address});if(revision!==walletRevision)return;await request({afterSignature:signature});if(revision===walletRevision)say('Outfits enabled. Choose a trait to equip.');}catch(error){if(revision===walletRevision)await recover(error);}finally{busy=false;render();}
  });
  for(const [id,cursor] of [['history-older',()=>state.pagination.nextBefore],['history-latest',()=>null]])ui[id]?.addEventListener('click',async()=>{
    if(busy)return;busy=true;ui.error.hidden=true;render();
    try{await request({before:cursor()});selectedId=null;readyForNextPack=false;choosePack();say('Showing confirmed collection activity. Equipped traits stay available on every page.');}
    catch(error){fail(error);}finally{busy=false;render();}
  });
  ui.primary.addEventListener('click',primaryAction);
  ui['pack-selector'].addEventListener('click', event => {
    const button=event.target.closest('button[data-pack-id]');if(!button||busy)return;
    selectedId=Number(button.dataset.packId);readyForNextPack=false;render();say('Showing your selected pack.');
  });
  ui['reveal-all'].addEventListener('click', () => { for (const button of ui.rewards.children) revealCard(button, button.dataset.address); ui.rewards.firstElementChild?.focus(); });
  ui.refresh.addEventListener('click', async () => {
    if (busy) return; busy = true; ui.error.hidden = true;
    if (state) render();
    try { await request(); choosePack(); walletRoot.dispatchEvent(new CustomEvent('iqpacks:refresh-sale')); say('Confirmed state refreshed.'); }
    catch (error) { if(!error.staleWalletRead){fail(error); say('Could not refresh confirmed state. Try again.');} }
    finally { busy = false; render(); }
  });
  try { await request(); restoreSettledRewards(); choosePack(); readyForNextPack=selectedPack()?.status==='settled'; render(); if (ui.error.hidden) say(selectedPack()?.status === 'settled' ? 'Your confirmed finds are ready.' : 'A sealed pack is waiting to happen.'); }
  catch (error) { if(!error.staleWalletRead){fail(error); say('Confirmed pack state is unavailable. Refresh to try again.');ui.primary.textContent='Unavailable';} }
  if(state&&root.isConnected){
    try{
      const {createPackOpening}=await import('/packs-reveal.js');
      if(!root.isConnected)return;
      const host=document.createElement('div');host.className='library-opening';ui.workspace.insertBefore(host,ui.caption);
      openingView=createPackOpening(host,address=>{
        const pack=selectedPack();if(!pack||!packRewards(state,pack).some(trait=>trait.address===address))return false;
        revealed.get(pack.address).add(address);say(revealed.get(pack.address).size===4?'All four traits revealed. Equip them or open another pack.':'Choose another card to reveal.');render();return true;
      },()=>{readyForNextPack=true;walletRoot.dispatchEvent(new Event('iqpacks:refresh-sale'));say('Your traits are below.');render();});
      render();
    }catch{say('Use the standard pack controls. Your confirmed traits remain available.');}
  }
}
