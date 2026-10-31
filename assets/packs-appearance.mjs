// Presentation only. Prices, supplies and rewards never come from this record.
export function normalizePackAppearance(input,baseUrl) {
  const source=input??{},text=(value,fallback,max)=>{const result=value??fallback;if(typeof result!=='string'||[...result].length>max||/[\x00-\x1f]/.test(result))throw Error('Invalid pack text');return result.trim();};
  const image=value=>{
    if(value===null||value===undefined||value==='')return null;
    if(typeof value!=='string')throw Error('Invalid pack image');
    const url=new URL(value,baseUrl);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Use an image from the verified gateway without credentials');
    return url.href;
  };
  const accent=source.accent??'#00ef00';if(!/^#[0-9a-fA-F]{6}$/.test(accent))throw Error('Invalid pack accent');
  return {title:text(source.title,'Trait Booster',40)||'Trait Booster',subtitle:text(source.subtitle,'',80),collectionName:text(source.collectionName,'Cosmetic series',80),cover:image(source.cover),logo:image(source.logo??'/img/text_logo.webp'),accent};
}
export function applyPackAppearance(element,appearance){
  element.style.setProperty('--iq-pack-title',JSON.stringify(appearance.title.toUpperCase()));
  element.style.setProperty('--iq-pack-subtitle',JSON.stringify(appearance.subtitle));
  element.style.setProperty('--iq-pack-series',JSON.stringify(appearance.collectionName.toUpperCase()+' · COSMETIC SERIES'));
  element.style.setProperty('--iq-pack-cover',appearance.cover?'url('+JSON.stringify(appearance.cover)+')':'none');
  element.style.setProperty('--iq-pack-logo',appearance.logo?'url('+JSON.stringify(appearance.logo)+')':'none');
  element.style.setProperty('--iq-pack-accent',appearance.accent);
  const fallback=element.querySelector('.foil-symbol img');
  if(fallback){const image=appearance.cover??appearance.logo;if(image)fallback.src=image;else fallback.removeAttribute('src');}
  for(const node of element.querySelectorAll('.foil-seal span,.foil-topline span'))node.textContent=appearance.collectionName;

}
