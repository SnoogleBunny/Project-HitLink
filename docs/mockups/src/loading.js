// This standalone mockup simulates a data read. Production should resolve the
// same loading state from its request, without a minimum artificial delay.
const previewLoadingMs=450;
let loadingTimer=null,loadingRevision=0;
const loadingStatus=document.createElement('div');
loadingStatus.className='hl-loading-status';loadingStatus.setAttribute('role','status');loadingStatus.setAttribute('aria-live','polite');root.appendChild(loadingStatus);
function cancelLoading(){
 clearTimeout(loadingTimer);loadingTimer=null;loadingRevision++;
 root.querySelector('#hl-main').setAttribute('aria-busy','false');root.dataset.loading='false';loadingStatus.textContent='';
}
function skeletonFor(route){
 const skeleton=document.createElement('div');skeleton.className='hl-skeleton';skeleton.setAttribute('aria-hidden','true');
 const origin=route.getBoundingClientRect();
 function shape(element,type){
  const rect=element.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
  const node=document.createElement('span');let width=rect.width,height=rect.height,top=rect.top-origin.top;
  if(type==='line'){height=Math.min(height,element.matches('h1,.hl-metric-value,.hl-allowance-value')?26:12);top+=(rect.height-height)/2;width=Math.min(width,Math.max(32,width*.78));}
  node.className=type==='surface'?'hl-skeleton-surface'+(element.classList.contains('hl-hero')?' hero':''):'hl-skeleton-shape'+(type==='avatar'?' avatar':'');
  node.style.cssText=`left:${rect.left-origin.left}px;top:${top}px;width:${width}px;height:${height}px`;
  skeleton.appendChild(node);
 }
 route.querySelectorAll('.hl-panel,.hl-metric,.hl-hero,.hl-notice,.hl-empty,.hl-card-context-row,.hl-card-steps').forEach(element=>shape(element,'surface'));
 const selector='h1,h2,h3,p,.hl-kicker,.hl-metric-label,.hl-metric-value,.hl-metric-detail,.hl-metric-icon,.hl-card-context-icon,.hl-card-context strong,.hl-tag,.hl-avatar,.hl-button,.hl-field>span,input:not([type=checkbox]):not([type=radio]),select,textarea,th,td,dt,dd,.hl-summary-number,.hl-allowance-num,.hl-person strong,.hl-class-time,.hl-day,.hl-step,.hl-check';
 route.querySelectorAll(selector).forEach(element=>{
  if(element.parentElement.closest(selector)&&element.parentElement.closest(selector)!==route)return;
  shape(element,element.matches('.hl-avatar')?'avatar':element.matches('input,select,textarea,.hl-button,.hl-day')?'control':'line');
 });
 return skeleton;
}
function startLoading(route,title){
 const main=root.querySelector('#hl-main'),frame=route.parentElement,revision=loadingRevision;
 main.setAttribute('aria-busy','true');root.dataset.loading='true';loadingStatus.textContent='Loading '+title;
 const skeleton=skeletonFor(route);frame.appendChild(skeleton);frame.classList.add('is-loading');route.inert=true;route.setAttribute('aria-hidden','true');
 const observer=new ResizeObserver(()=>{if(revision!==loadingRevision)return;const next=skeletonFor(route);frame.querySelector('.hl-skeleton')?.replaceWith(next);});observer.observe(route);
 const previewReady=new Promise(resolve=>{loadingTimer=setTimeout(resolve,previewLoadingMs);});
 Promise.all([previewReady,typographyReady]).then(()=>{
  observer.disconnect();if(revision!==loadingRevision||!route.isConnected)return;
  const visibleSkeleton=frame.querySelector('.hl-skeleton');frame.classList.remove('is-loading');route.inert=false;route.removeAttribute('aria-hidden');main.setAttribute('aria-busy','false');root.dataset.loading='false';loadingStatus.textContent=title+' ready';loadingTimer=null;
  // The whole destination arrives together; controls are already usable.
  // A visible lateral arrival distinguishes navigation from a same-page update.
  finishMotion(animateElement(visibleSkeleton,[{opacity:1},{opacity:0}],180,'skeleton-exit'),()=>visibleSkeleton?.remove());
  animateElement(route,[{opacity:.15,transform:'translateX(20px)'},{opacity:1,transform:'translateX(0)'}],340,'route-ready');
 });
 // Disconnect immediately if a newer route replaces this one.
 const currentCancel=()=>observer.disconnect();loadingCleanup=currentCancel;
}
let loadingCleanup=()=>{};
