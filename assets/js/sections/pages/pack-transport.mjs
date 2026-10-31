// Production pack reads use the site or an explicitly configured network API. Signing stays in the
// existing Wallet Standard client; this module has no action/signer endpoint.
export function createPackPageTransport(config,baseUrl) {
  if(!['solana:localnet','solana:devnet','solana:mainnet'].includes(config.chain))throw Error('Unsupported pack network');
  const apiOrigins=new Set([new URL(baseUrl).origin]);
  for(const value of config.apiOrigins??[]){const allowed=new URL(value);if(allowed.href!==allowed.origin+'/'||allowed.username||allowed.password||!['https:','http:'].includes(allowed.protocol)||(allowed.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(allowed.hostname)))throw Error('Invalid configured pack API origin');apiOrigins.add(allowed.origin);}
  const base=new URL(config.apiBase??new URL(baseUrl).origin,baseUrl);
  if(!apiOrigins.has(base.origin)||base.username||base.password||base.search||base.hash)
    throw Error('Pack API must use this site or an explicitly configured network origin');
  const pubkey=value=>typeof value==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  const pageURL=new URL(baseUrl),selectedAsset=pageURL.searchParams.get('asset');
  if(selectedAsset&&!pubkey(selectedAsset))throw Error('Invalid selected NFT');
  const requested=pageURL.searchParams.get('collection');
  if(requested&&requested!==config.collection)throw Error('This collection does not match the configured pack');
  if(!pubkey(config.collection)||!pubkey(config.program))throw Error('Invalid configured pack identity');
  const mediaOrigins=new Set([base.origin,...(config.mediaOrigins??[])]);
  function media(value){
    if(!value)return null;
    const url=new URL(value,baseUrl);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!mediaOrigins.has(url.origin))
      throw Error('Unverified pack media origin');
    return url.href;
  }
  return {
    media,
    windowEndpoint:new URL('/packs/'+config.collection+'/window',base).href,
    async read(owner,afterSignature,before) {
      if(owner&&!pubkey(owner))throw Error('Invalid connected holder');
      const url=new URL('/packs/'+config.collection+'/state',base);
      if(owner)url.searchParams.set('owner',owner);
      if(owner&&selectedAsset)url.searchParams.set('asset',selectedAsset);
      if(before!==undefined&&before!==null){if(!Number.isSafeInteger(before)||before<1)throw Error('Invalid pack history cursor');url.searchParams.set('before',String(before));}
      if(afterSignature){if(typeof afterSignature!=='string'||!(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/).test(afterSignature))throw Error('Invalid confirmed pack receipt');url.searchParams.set('after',afterSignature);}
      const response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
      const next=await response.json();
      if(!response.ok)throw Error(typeof next.error==='string'?next.error:'Confirmed pack state is unavailable');
      if(next.collectionAddress!==config.collection||next.program!==config.program||next.chain!==config.chain)
        throw Error('Pack response does not match the configured network and collection');
      if(!Array.isArray(next.packs)||next.packs.length>64||!Array.isArray(next.traits)||next.traits.length>262||!Array.isArray(next.stock)||next.stock.length<1||next.stock.length>16||!Array.isArray(next.receipts)||next.receipts.length>64||!next.avatar)
        throw Error('Invalid bounded pack state');
      if(!next.pagination||next.pagination.before!==(before??null)||(next.pagination.nextBefore!==null&&(!Number.isSafeInteger(next.pagination.nextBefore)||next.pagination.nextBefore<1||before!=null&&next.pagination.nextBefore>=before)))throw Error('Invalid pack history page');
      for(const pack of next.packs)if(!pubkey(pack.owner)||!Number.isSafeInteger(pack.id)||pack.id<0||typeof pack.address!=='string'||pack.address.length>100||!['sealed','requested','fulfilled','settled'].includes(pack.status))throw Error('Invalid confirmed pack record');
      for(const trait of next.traits){if(!pubkey(trait.address)||!Number.isInteger(trait.definition)||trait.definition<0||trait.definition>15||!Number.isInteger(trait.slot)||trait.slot<0||trait.slot>5)throw Error('Invalid confirmed trait record');trait.image=media(trait.image);if(!trait.image)throw Error('Confirmed trait artwork is not available yet');}
      for(const trait of next.stock)if(!Number.isInteger(trait.id)||trait.id<0||trait.id>15||!Number.isSafeInteger(trait.remaining)||trait.remaining<0)throw Error('Invalid confirmed stock');
      if(owner&&selectedAsset&&(next.avatar.address!==selectedAsset||next.avatar.owner!==owner))throw Error('Selected NFT ownership or identity changed');
      if(next.avatar.outfitURL)next.avatar.outfitURL=media(next.avatar.outfitURL);
      return next;
    },
  };
}
