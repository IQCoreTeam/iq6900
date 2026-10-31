import React from 'react';
import { createRoot } from 'react-dom/client';
import { CardPack, customTheme } from '@react-cards-opening/ui';
import '@react-cards-opening/ui/styles.css';
import { TIER_COLORS } from '../../../assets/packs-rarity.mjs';

const theme = { ...customTheme('#00ef00','dark'), bg:'#0a0c09', card:'#141310', fg:'#e8e4d6', rarity:TIER_COLORS };
const tiers = [
  {id:'common',label:'Common',weight:1,effect:'quiet'},
  {id:'rare',label:'Rare',weight:1,effect:'quiet'},
  {id:'epic',label:'Epic',weight:1,effect:'loud'},
  {id:'legendary',label:'Legendary',weight:1,effect:'legendary'}
];
const unknownCards=Array.from({length:4},(_,id)=>({id:'unrevealed-'+id,name:'Unrevealed trait',rarity:'common'}));

let nextDetailId=0;
function createCardDetail(ownerDocument){
  const dialog=ownerDocument.createElement('dialog');dialog.className='iq-card-detail';
  const header=ownerDocument.createElement('header'),close=ownerDocument.createElement('button');
  close.type='button';close.className='iq-card-detail__close';close.textContent='Close';close.setAttribute('aria-label','Close trait details');
  header.append(close);
  const content=ownerDocument.createElement('div');content.className='iq-card-detail__content';
  const art=ownerDocument.createElement('div');art.className='iq-card-detail__art';
  const image=ownerDocument.createElement('img');art.append(image);
  const details=ownerDocument.createElement('section');details.className='iq-card-detail__copy';
  const title=ownerDocument.createElement('h2');title.id='iq-trait-detail-'+(++nextDetailId);dialog.setAttribute('aria-labelledby',title.id);
  const category=ownerDocument.createElement('p');category.className='iq-card-detail__category';
  const rarity=ownerDocument.createElement('p');rarity.className='iq-card-detail__rarity';
  details.append(title,category,rarity);content.append(art,details);dialog.append(header,content);ownerDocument.body.append(dialog);
  let opener=null,activeId=null;
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{activeId=null;if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();});
  return {
    get activeId(){return activeId;},
    open(card,trigger){
      if(typeof dialog.showModal!=='function')return false;
      title.textContent=card.name;category.textContent=card.category||'Trait';image.src=card.image;image.alt=card.name;
      const known=Object.hasOwn(TIER_COLORS,card.creatorTier);rarity.hidden=!known;rarity.textContent=known?card.creatorTier.charAt(0).toUpperCase()+card.creatorTier.slice(1):'';
      rarity.style.color=known?TIER_COLORS[card.creatorTier]:'';
      opener=trigger;activeId=card.id;if(!dialog.open)dialog.showModal();close.focus({preventScroll:true});return true;
    },
    close(){if(dialog.open)dialog.close();},
    dispose(){if(dialog.open)dialog.close();dialog.remove();}
  };
}

// One presentation island before and after confirmation. Unknown cards are
// inert placeholders, never a roll or receipt. It never signs or mints.
export function createPackOpening(element,onReveal,onProceed) {
  const root=createRoot(element);
  const detail=createCardDetail(element.ownerDocument);
  let currentCards=new Map(),currentOpened=new Set(),canInspect=false;
  let inView=true,disposed=false,lastUpdate='',cardsKey='',stableCards=[];
  const pause=()=>element.toggleAttribute('data-paused',document.hidden||!inView);
  const visibility=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;pause();});
  visibility.observe(element);document.addEventListener('visibilitychange',pause);
  const observer=new MutationObserver(()=>{if(!element.isConnected)dispose();});
  observer.observe(element.closest('#main_section'),{childList:true});
  function update({cards,opened,packId,interactive}){
    const updateKey=JSON.stringify({cards,opened,packId,interactive});if(updateKey===lastUpdate)return;lastUpdate=updateKey;
    const nextCardsKey=JSON.stringify(cards);if(nextCardsKey!==cardsKey){cardsKey=nextCardsKey;stableCards=cards;}
    const confirmed=cards.length===4;
    if(cards.length!==0&&!confirmed||confirmed&&new Set(cards.map(card=>card.id)).size!==4)throw Error('Four confirmed unique trait assets are required');
    const allowed=new Set(cards.map(card=>card.id));
    const seen=opened.filter(id=>allowed.has(id));
    currentCards=new Map(cards.map(card=>[card.id,card]));currentOpened=new Set(seen);canInspect=confirmed&&interactive;
    if(detail.activeId&&(!canInspect||!currentCards.has(detail.activeId)||!currentOpened.has(detail.activeId)))detail.close();
    root.render(<div onClickCapture={event=>{
      const trigger=event.target?.closest?.('.rco-pack-press'),seat=trigger?.closest('.rco-pack-seat');
      if(!seat?.hasAttribute('data-up'))return;
      event.preventDefault();event.stopPropagation();
      const id=trigger.querySelector('[data-trait-id]')?.getAttribute('data-trait-id'),card=currentCards.get(id);
      if(canInspect&&card&&currentOpened.has(id))detail.open(card,trigger);
    }} inert={!confirmed||!interactive} data-awaiting={!confirmed?'':undefined}><CardPack key={(confirmed?'confirmed:':'sealed:')+(packId??'new')} cards={confirmed?stableCards:unknownCards} opened={seen} theme={theme} rarities={tiers}
      className="iq-confirmed-pack" classNames={{sealed:'iq-confirmed-seal'}}
      labels={{tear:confirmed&&interactive?'Reveal confirmed pack':confirmed?'Preparing confirmed reveal':'Pack opens after confirmation',flip:'Reveal confirmed trait',done:'Proceed',replay:'',hint:({stage,left})=>!confirmed?'Four cosmetic traits. Sealed until the transaction confirms.':stage==='sealed'?'Confirmed. Tap the pack to reveal.':left?`${left} ${left===1?'trait':'traits'} to reveal`:'Your four traits.'}}
      onOpen={id=>{if(confirmed&&interactive&&allowed.has(id))onReveal(id);}}
      onDone={onProceed}
      renderFace={card=><span className="iq-reveal-face" data-trait-id={card.id} aria-hidden={!seen.includes(card.id)}><img src={card.image} alt={seen.includes(card.id)?card.name:''}/></span>}
      renderBack={()=><span className="iq-reveal-back" aria-hidden="true"><img src="/img/green_logo.webp" alt="IQ Labs"/><span>REVEAL</span><small lang="ko">열어봐요</small></span>}
      readingOf={card=>[card.name,card.category,card.creatorTier?`${card.creatorTier} creator tier`:'Confirmed trait']}
    /></div>);
  }
  function dispose(){if(disposed)return;disposed=true;observer.disconnect();visibility.disconnect();document.removeEventListener('visibilitychange',pause);detail.dispose();root.unmount();}
  return {update,dispose};
}
