// One interruptible animation owner per element. Values and actions settle
// synchronously; motion only explains the already-applied result.
const motionJobs=new WeakMap();
const motionEase='cubic-bezier(0.22,0.68,0.3,1)';
function animateElement(element,frames,duration=200,name='feedback',easing=motionEase){
 if(!element)return null;
 motionJobs.get(element)?.cancel();
 if(motionPreference.matches||document.hidden||!element.animate)return null;
 const job=element.animate(frames,{duration,easing});job.id='hl-'+name;
 motionJobs.set(element,job);
 job.finished.then(()=>{if(motionJobs.get(element)===job)motionJobs.delete(element);},()=>{if(motionJobs.get(element)===job)motionJobs.delete(element);});
 return job;
}
function finishMotion(job,done){if(job)job.finished.then(done,done);else done();}
function cancelMotionWithin(element){element?.getAnimations({subtree:true}).forEach(job=>job.cancel());}
motionPreference.addEventListener('change',event=>{if(event.matches)cancelMotionWithin(root);});
document.addEventListener('visibilitychange',()=>{root.dataset.motionPaused=String(document.hidden);if(document.hidden)cancelMotionWithin(root);});

function rememberFocus(element){
 if(!element||!root.contains(element))return null;
 return {node:element,id:element.id,data:{...element.dataset}};
}
function restoreMotionFocus(saved,fallback=true){
 const usable=node=>node?.isConnected&&!node.closest('[inert],[hidden]')&&node.getClientRects().length&&!node.disabled;
 let target=saved?.node;
 if(!usable(target)&&saved?.id)target=[...root.querySelectorAll('[id]')].find(node=>node.id===saved.id);
 if(!usable(target)&&(saved?.data.action||saved?.data.page))target=[...root.querySelectorAll('button[data-action],button[data-page]')].find(node=>Object.entries(saved.data).every(([key,value])=>node.dataset[key]===value)&&usable(node));
 if(!usable(target)&&fallback)target=uiState.role==='prospect'?publicFocusTarget():phoneMedia.matches?(root.querySelector('#hl-mobile-nav [aria-current=page]')||root.querySelector('#hl-mobile-menu')):root.querySelector('#hl-nav [aria-current=page]');
 if(usable(target))target.focus({preventScroll:true});
}

function motionValues(main){
 const values=new Map(),counts=new Map();
 main.querySelectorAll('.hl-metric-value,.hl-allowance-num,.hl-tag,.hl-day').forEach(element=>{
  const panel=element.closest('.hl-panel,.hl-metric');
  const period=element.closest('.hl-allowance-period')?.dataset.period;
  const group=period?'allowance-'+period:panel?.querySelector('.hl-panel-head h2,.hl-metric-label')?.textContent||'page';
  const kind=element.classList.contains('hl-day')?'day':element.classList.contains('hl-tag')?'status':'value';
  const prefix=group+'|'+kind,index=counts.get(prefix)||0;counts.set(prefix,index+1);
  values.set(prefix+'|'+index,{element,text:element.textContent.trim(),selected:element.getAttribute('aria-pressed')});
 });
 return values;
}
function animateChangedValues(before,main){
 if(motionPreference.matches||!before)return;
 const bounds=main.getBoundingClientRect();let count=0;
 for(const [key,current] of motionValues(main)){
  const prior=before.get(key);if(!prior||prior.text===current.text&&prior.selected===current.selected)continue;
  const element=current.element,rect=element.getBoundingClientRect();
  if(rect.bottom<bounds.top||rect.top>bounds.bottom||++count>6)continue;
  if(current.selected==='true'){
   animateElement(element,[{boxShadow:'inset 0 -4px currentColor'},{boxShadow:'inset 0 -4px currentColor',offset:.25},{boxShadow:'inset 0 0 transparent'}],360,'selection');
  }else if(current.selected===null){
   // A short inset highlight makes the changed value easy to find, without
   // counting through invented intermediate numbers or moving a card.
   animateElement(element,[{boxShadow:'inset 0 -3px currentColor',opacity:.55},{boxShadow:'inset 0 -3px currentColor',opacity:1,offset:.3},{boxShadow:'inset 0 0 transparent',opacity:1}],480,'state-change');
  }
 }
}

let feedbackRevision=0;
function dismissFeedback(){
 const feedback=root.querySelector('#hl-feedback');if(!feedback.firstChild)return;
 const revision=++feedbackRevision;feedback.dataset.closing='true';
 const job=animateElement(feedback,[{opacity:getComputedStyle(feedback).opacity},{opacity:0}],120,'feedback-exit');
 finishMotion(job,()=>{if(revision!==feedbackRevision)return;const stillOwnsFocus=feedback.contains(document.activeElement);feedback.replaceChildren();delete feedback.dataset.closing;if(stillOwnsFocus&&phoneMedia.matches)focusPhoneDestination();});
}
