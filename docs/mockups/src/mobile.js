const phoneMedia=window.matchMedia('(max-width: 767px)');
const compactNavigationMedia=window.matchMedia('(max-width: 1023px)');
const phoneTabs={
 owner:[['a-today','Today'],['a-timetable','Classes'],['a-people','Members']],
 member:[['m-schedule','Classes'],['m-membership','Membership']],
 coach:[['c-clients','Clients']],
 client:[['p-notes','My day'],['p-program','Program'],['p-session','Session']],
 prospect:[]
};
let mobileMenuOpen=false,mobileMenuClosing=false,mobileMenuRevision=0,mobileMenuReturnFocus=null;
function syncInteractionLayers(){
 syncMemberPickerExpanded();
 const compactNavigation=compactNavigationMedia.matches,dialogOpen=!root.querySelector('#hl-overlay').hidden,menuVisible=mobileMenuOpen||mobileMenuClosing;
 const sidebar=root.querySelector('#hl-sidebar'),header=root.querySelector('.hl-mobile-header');
 sidebar.inert=uiState.role==='prospect'||dialogOpen||(compactNavigation&&!menuVisible);
 root.querySelector('.hl-stage').inert=dialogOpen||menuVisible;
 header.inert=dialogOpen||menuVisible;
 root.querySelector('.hl-public-header').inert=uiState.role!=='prospect'||dialogOpen||menuVisible;
 root.querySelector('.hl-reviewbar').inert=dialogOpen||menuVisible;
 root.querySelector('#hl-feedback').inert=dialogOpen||menuVisible;
 const journeyMap=root.querySelector('.hl-design-map');if(journeyMap)journeyMap.inert=dialogOpen||menuVisible;
 root.dataset.menuOpen=String(menuVisible);root.dataset.menuClosing=String(mobileMenuClosing);
 root.querySelector('#hl-menu-backdrop').hidden=!menuVisible;
 root.querySelectorAll('[data-mobile-menu=open]').forEach(button=>button.setAttribute('aria-expanded',String(mobileMenuOpen)));
 if(compactNavigation){sidebar.setAttribute('aria-hidden',String(!menuVisible));}
 else sidebar.removeAttribute('aria-hidden');
 if(compactNavigation&&menuVisible){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');sidebar.setAttribute('aria-labelledby','hl-mobile-menu-title');}
 else ['role','aria-modal','aria-labelledby'].forEach(name=>sidebar.removeAttribute(name));
}
function setMobileMenu(open,options={}){
 open=Boolean(open&&uiState.role!=='prospect'&&compactNavigationMedia.matches&&root.querySelector('#hl-overlay').hidden);
 if(open===mobileMenuOpen&&!mobileMenuClosing){syncInteractionLayers();return;}
 if(!open&&mobileMenuClosing&&!options.immediate)return;
 const sidebar=root.querySelector('#hl-sidebar'),scrim=root.querySelector('#hl-menu-backdrop');
 const from=getComputedStyle(sidebar).transform,opacity=getComputedStyle(scrim).opacity,wasVisible=mobileMenuOpen||mobileMenuClosing;
 const revision=++mobileMenuRevision;
 cancelMotionWithin(sidebar);cancelMotionWithin(scrim);
 if(open){
  if(!wasVisible)mobileMenuReturnFocus=rememberFocus(document.activeElement);
  mobileMenuOpen=true;mobileMenuClosing=false;syncInteractionLayers();sidebar.scrollTop=0;
  root.querySelector('#hl-mobile-menu-close').focus({preventScroll:true});
  animateElement(sidebar,[{transform:wasVisible?from:'translateX(-100%)'},{transform:'translateX(0)'}],240,'drawer-enter');
  animateElement(scrim,[{opacity:wasVisible?opacity:0},{opacity:1}],200,'drawer-scrim-enter');
 }else{
  mobileMenuOpen=false;mobileMenuClosing=wasVisible;syncInteractionLayers();
  const finish=()=>{if(revision!==mobileMenuRevision)return;cancelMotionWithin(sidebar);cancelMotionWithin(scrim);mobileMenuClosing=false;const focus=mobileMenuReturnFocus;mobileMenuReturnFocus=null;syncInteractionLayers();if(options.focusDestination)focusPhoneDestination();else if(options.restoreFocus!==false)restoreMotionFocus(focus);};
  if(options.immediate||!compactNavigationMedia.matches||motionPreference.matches){finish();return;}
  animateElement(scrim,[{opacity},{opacity:0}],160,'drawer-scrim-exit');
  finishMotion(animateElement(sidebar,[{transform:from},{transform:'translateX(-100%)'}],180,'drawer-exit','cubic-bezier(.4,0,1,1)'),finish);
 }
}
function focusPhoneDestination(){
 if(uiState.role==='prospect'){focusPublicDestination();return;}
 if(!compactNavigationMedia.matches){root.querySelector('#hl-nav [aria-current=page]')?.focus({preventScroll:true});return;}
 if(!phoneMedia.matches){root.querySelector('#hl-mobile-menu').focus({preventScroll:true});return;}
 const nav=root.querySelector('#hl-mobile-nav');
 (uiState.role==='coach'?root.querySelector('#hl-mobile-menu'):(nav.querySelector('[aria-current=page]')||root.querySelector('#hl-mobile-menu'))).focus({preventScroll:true});
}
function syncMobileNavigation(){
 const nav=root.querySelector('#hl-mobile-nav'),tabs=phoneTabs[uiState.role].filter(([page])=>!(uiState.role==='client'&&coachingState.notesOnly&&page==='p-session')),key=JSON.stringify(tabs),parent=workspaceParent(uiState.page);
 if(nav.dataset.key!==key){
  nav.innerHTML=uiState.role==='prospect'?'':tabs.map(([id,label])=>`<button type="button" class="hl-mobile-tab cursor-interaction" data-page="${id}" aria-label="${esc(views[id].navLabel)}">${icon(views[id].icon||'circle')}<span>${label}</span></button>`).join('')+`<button type="button" class="hl-mobile-tab cursor-interaction" id="hl-mobile-more" data-mobile-menu="open" aria-label="More workspace options" aria-controls="hl-sidebar" aria-expanded="false">${icon('menu')}<span>More</span></button>`;
  nav.dataset.role=uiState.role;nav.dataset.key=key;
 }
 nav.querySelectorAll('[data-page]').forEach(button=>{if(button.dataset.page===parent)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
 const more=root.querySelector('#hl-mobile-more');
 if(more){if(tabs.some(([id])=>id===parent))more.removeAttribute('aria-current');else more.setAttribute('aria-current','page');}
 root.querySelector('#hl-mobile-context').textContent=roles[uiState.role].title;
 root.querySelector('#hl-mobile-menu-title').textContent=roles[uiState.role].title;
 const feedback=root.querySelector('#hl-feedback'),stage=root.querySelector('.hl-stage');
 if(phoneMedia.matches&&feedback.parentElement!==stage)stage.insertBefore(feedback,nav);
 else if(!phoneMedia.matches&&feedback.parentElement!==root)root.insertBefore(feedback,root.querySelector('.hl-design-map'));
 feedback.style.colorScheme=phoneMedia.matches?(root.dataset.resolvedTheme||inheritedAppearance()):inheritedAppearance();
 syncInteractionLayers();
}
root.addEventListener('click',event=>{const control=event.target.closest('[data-mobile-menu]');if(control)setMobileMenu(control.dataset.mobileMenu==='open');});
root.addEventListener('click',event=>{if(event.target.closest('[data-feedback-dismiss]'))dismissFeedback();});
root.addEventListener('keydown',event=>{
 if(!mobileMenuOpen&&!mobileMenuClosing)return;
 if(mobileMenuClosing){if(event.key==='Tab'||event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();}return;}
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setMobileMenu(false);return;}
 if(event.key==='Tab'){
  const nodes=[...root.querySelectorAll('#hl-sidebar button:not(:disabled)')].filter(node=>node.getClientRects().length);
  const first=nodes[0],last=nodes[nodes.length-1];
  if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}
  else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
 }
});
function handleNavigationLayoutChange(){
 const focused=document.activeElement,wasMenuOpen=mobileMenuOpen||mobileMenuClosing;
 const overlay=root.querySelector('#hl-overlay'),pickerOpen=!overlay.hidden&&overlay.dataset.kind==='member-picker';
 if(pickerOpen)closeDialog({immediate:true,restoreFocus:false});
 setMobileMenu(false,{restoreFocus:false,immediate:true});syncMobileNavigation();
 if(!overlay.hidden)return;
 if(pickerOpen){[...root.querySelectorAll('[data-member-switch]')].find(button=>button.getClientRects().length)?.focus({preventScroll:true});return;}
 if(uiState.role==='prospect'){if(focused&&!focused.getClientRects().length)focusPublicDestination();return;}
 if(compactNavigationMedia.matches&&(wasMenuOpen||focused?.closest('#hl-sidebar')||!phoneMedia.matches&&focused?.closest('.hl-mobile-nav')))focusPhoneDestination();
 else if(!compactNavigationMedia.matches&&(wasMenuOpen||focused?.closest('.hl-mobile-header,.hl-mobile-nav')))root.querySelector('#hl-nav [aria-current=page]')?.focus({preventScroll:true});
}
phoneMedia.addEventListener('change',handleNavigationLayoutChange);
compactNavigationMedia.addEventListener('change',handleNavigationLayoutChange);
