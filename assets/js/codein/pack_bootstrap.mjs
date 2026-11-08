// Native optional-feature configuration. Ordinary NFT mode does not import a
// pack bundle, create a wallet registry or issue any RPC request when off.
export function createPackPendingStorage(getStorage,prefix='') {
  return {
    load:async key=>JSON.parse(getStorage().getItem(prefix+key)||'null'),
    save:async(key,value)=>getStorage().setItem(prefix+key,JSON.stringify(value)),
    clear:async(key,signature)=>{
      const current=JSON.parse(getStorage().getItem(prefix+key)||'null');
      if(current?.signature===signature)getStorage().removeItem(prefix+key);
    },
  };
}

export function createPackBootstrap({target,getPreset,getNetwork,getRpc,getApi,getHealth,loadClient,getStorage,enableOutfits}) {
  let clientWork,registry,nativeCreator,nativePack;
  const chain=()=>getNetwork()==='devnet'?'solana:devnet':getNetwork()==='mainnet'?'solana:mainnet':null;
  function origin(value){
    const url=new URL(value,target.location.href);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Invalid pack network origin');
    return url.origin;
  }
  return async function bootstrapPacks(){
    if(target.iqPackCreatorConfig===nativeCreator)delete target.iqPackCreatorConfig;
    if(target.iqPackConfig===nativePack)delete target.iqPackConfig;
    nativeCreator=null;nativePack=null;
    const preset=getPreset(),configured=preset.packs;
    if(!configured)return {enabled:false};
    const selectedChain=chain();if(!selectedChain)throw Error('Unsupported configured NFT network');
    for(const field of ['program','nftProgram','provider','providerTreasury'])if(typeof configured[field]!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(configured[field]))throw Error('Pack deployment pins are incomplete');
    if(typeof configured.windowRequests!=='boolean')throw Error('Configure the sale-window policy explicitly');
    const apiOrigins=new Set([origin(preset.api)]);
    for(const value of configured.apiOrigins??[]){if(new URL(value).href!==origin(value)+'/')throw Error('Pack API overrides require an exact preset origin');apiOrigins.add(origin(value));}
    const apiBase=origin(getApi());if(!apiOrigins.has(apiBase))throw Error('Pack backend override is not in this network preset');
    const health=await getHealth();
    if(!health?.ok||health.cluster!==getNetwork()||health.programId!==configured.nftProgram)throw Error('Pack backend network or NFT program does not match the selected preset');
    const gateway=origin(preset.gateway),rpc=getRpc(),rpcUrl=new URL(rpc);
    if(!['https:','http:'].includes(rpcUrl.protocol)||rpcUrl.username||rpcUrl.password||rpcUrl.hash||(rpcUrl.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(rpcUrl.hostname)))throw Error('Invalid configured pack RPC');
    clientWork??=loadClient().catch(error=>{clientWork=null;throw error;});
    const client=await clientWork;
    if(chain()!==selectedChain)throw Error('NFT network changed; reload before using packs');
    const deployment=Object.fromEntries(['program','nftProgram','provider','providerTreasury'].map(field=>[field,new client.PublicKey(configured[field]).toBase58()]));
    registry??=client.getWallets();
    const common={...deployment,chain:selectedChain,rpc,gateway,apiBase,apiOrigins:[...apiOrigins],mediaOrigins:[gateway],registry,sealedPacks:configured.sealedPacks===true,clientModule:'/pack-client.js',deployment,windowRequests:configured.windowRequests};
    nativeCreator={...common,apiPath:'/creator/packs'};target.iqPackCreatorConfig=nativeCreator;
    const collection=new URL(target.location.href).searchParams.get('collection');
    if(collection){
      const canonical=new client.PublicKey(collection).toBase58();
      nativePack={...common,collection:canonical,pendingPurchases:createPackPendingStorage(getStorage,'iq-pack-purchase:'),enableOutfits:({wallet,account,asset})=>enableOutfits({wallet,account,asset,collection:canonical,registry})};target.iqPackConfig=nativePack;
    }else delete target.iqPackConfig;
    return {enabled:true,collection:collection??null};
  };
}

// Financial pack methods retain this exact runtime context across wallet/RPC
// waits. Localnet is allowed only for an explicit loopback acceptance host.
export function assertPackRuntime(config,current) {
  if(!config?.deployment||!['program','nftProgram','provider','providerTreasury'].every(field=>typeof config.deployment[field]==='string'))throw Error('Verified pack deployment configuration is required');
  const loopback=hostname=>['127.0.0.1','localhost','[::1]'].includes(hostname);
  const rpc=new URL(config.rpc),api=new URL(config.apiBase),gateway=new URL(config.gateway);
  for(const endpoint of [rpc,api,gateway])if(!['https:','http:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.hash)throw Error('Invalid pinned pack endpoint');
  if(api.search||gateway.search)throw Error('Invalid pinned pack API or gateway');
  if(config.chain==='solana:localnet'){
    if(!loopback(current.hostname)||!loopback(rpc.hostname)||!loopback(api.hostname)||!loopback(gateway.hostname)||typeof config.localGenesis!=='string'||!config.localGenesis)throw Error('Local pack acceptance requires loopback endpoints and a pinned genesis');
  }else{
    const expected=current.network==='devnet'?'solana:devnet':current.network==='mainnet'?'solana:mainnet':null;
    if(config.chain!==expected||config.rpc!==current.rpc||api.origin!==new URL(current.api).origin||gateway.origin!==new URL(current.gateway).origin)throw Error('Reload after configuring or changing the NFT pack network');
  }
  return config;
}
