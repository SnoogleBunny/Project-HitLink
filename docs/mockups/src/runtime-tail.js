const views={...adminViews,...memberViews,...coachingViews,...pricingViews,...publicViews,...workspaceViews,...visitorViews,...classEditorViews};
const actions={...adminActions,...ownerRecordActions,...memberActions,...coachingActions,...pricingActions,...visitorActions,...classEditorActions,...coachAssignmentActions,'close-dialog':closeDialog};
const roleRoutes=prefix=>Object.keys(views).filter(page=>page.startsWith(prefix));
const roles={owner:{title:'Gym workspace',name:'Alex Morgan',initials:'AM',start:'a-today',pages:roleRoutes('a-')},member:{title:'Member portal',name:'Maya Chen',initials:'MC',start:'m-schedule',pages:roleRoutes('m-')},coach:{title:'Coaching workspace',name:'Jordan Lee',initials:'JL',start:'c-clients',pages:roleRoutes('c-')},client:{title:'Client portal',name:'Maya Chen',initials:'MC',start:'p-notes',pages:roleRoutes('p-')},prospect:{title:'Northstar website',name:'Guest',initials:'AV',start:'v-pricing',pages:Object.keys(publicRoutes)}};
function navigationGroups(role){
 if(role==='owner')return [['Daily work',['a-today','a-timetable','a-people','a-billing']],['Management',['a-plans','a-waivers','a-website','a-settings']]];
 if(role==='member')return [['Member portal',['m-schedule','m-membership','m-billing','m-account']]];
 if(role==='coach')return [['Coaching',['c-clients']]];
 if(role==='client')return [['Client portal',['p-notes','p-program',...(coachingState.notesOnly?[]:['p-session'])]]];
 if(role==='prospect')return [['Northstar website',['v-pricing','v-trial']]];
 return [[roles[role].title,roles[role].pages]];
}
const flowMap=[
 ['CF-01','Trial → paid member','v-trial'],['CF-02','Class series & exceptions','a-timetable'],['CF-03','Capacity & waitlist','m-schedule'],['CF-04','Check-in & correction','a-roster'],['CF-05','Membership & first payment','v-enroll'],['CF-06','Notice & billing stop','a-membership'],['CF-07','Freeze & resume','a-membership'],['CF-08','Payment recovery','m-billing'],['CF-09','Punch use & reversal','m-membership'],['CF-10','Refund & account credit','a-billing'],['CF-11','Guardian waiver','m-family'],['CF-12','Migration rehearsal','a-migration'],['CF-13','Cutover & rollback','a-cutover'],['CF-14','Offboarding & export','a-exports'],['CF-15','Incident response','a-support'],['CF-16','Inquiry → coaching program','c-clients'],['CF-17','Appointment → delivery','c-sessions'],['CF-18','Appointment changes & recovery','p-session'],['CF-19','Program & daily notes','c-notes'],['CF-20','Pause & coach handoff','c-continuity'],['CF-21','Program closure & records','c-close'],['CF-22','Member booking & allowance','m-schedule']
];
flowMap.push(['CF-23','Public pricing & highlighted plan','a-website'],['CF-24','Legal pages, search & sharing','a-discovery']);
const map=document.createElement('details');map.className='hl-design-map';map.innerHTML=`<summary>Browse ${flowMap.length} workflows <span>Owner · member · guardian · coach · client</span></summary><div class="hl-flow-map">${flowMap.map(([id,title,page])=>`<button type="button" data-page="${page}"><span>${id}</span>${title}${icon('arrow-up-right')}</button>`).join('')}</div>`;root.appendChild(map);
function roleFor(page){return Object.keys(roles).find(role=>roles[role].pages.includes(canonicalPage(page)))||'owner';}
function navigate(page,options={}){page=contextualPage(page);if(!views[page])page='v-not-found';if(uiState.page==='a-class-editor'&&page!==uiState.page&&classEditorRequestLeave(page,options)){root.querySelector('#hl-role').value=uiState.role;return;}preparePublicNavigation(page);if(page==='v-pricing'&&!options.pricingPreview)websiteState.view='published';const fromMenu=mobileMenuOpen;setMobileMenu(false,{restoreFocus:false,focusDestination:fromMenu});uiState.page=page;uiState.role=roleFor(page);closeDialog({restoreFocus:false,immediate:true});render();if(fromMenu&&compactNavigationMedia.matches&&!mobileMenuClosing)focusPhoneDestination();saveSelection();}
let renderedPage=null;
function render(options={}){
 uiState.page=contextualPage(uiState.page);uiState.role=roleFor(uiState.page);
 if(uiState.role==='prospect'&&(mobileMenuOpen||mobileMenuClosing))setMobileMenu(false,{immediate:true,restoreFocus:false});
 const view=views[uiState.page];if(!view)return;
 const pageTitle=viewValue(view.title),pageSubtitle=viewValue(view.subtitle)||'';
 const routeChanged=renderedPage!==null&&renderedPage!==uiState.page;
 const needsLoading=renderedPage===null||routeChanged||options.memberChanged;
 loadingCleanup();cancelLoading();
 const main=root.querySelector('#hl-main'),nav=root.querySelector('#hl-nav');
 const focused=document.activeElement;
 const focusRecord=rememberFocus(focused),previousValues=needsLoading?null:motionValues(main);
 const mainScroll=main.scrollTop;
 const role=roles[uiState.role];root.dataset.page=uiState.page;root.dataset.role=uiState.role;
 root.querySelector('#hl-role').value=uiState.role;
 root.querySelector('#hl-scenario-wrap').hidden=uiState.role!=='member';
 root.querySelector('#hl-scenario-wrap').inert=uiState.role!=='member';
 root.querySelector('#hl-scenario').value=uiState.scenario;
 const parent=workspaceParent(uiState.page);
 root.querySelector('#hl-breadcrumb').textContent=role.title+' / '+(parent!==uiState.page?viewValue(views[parent].navLabel)+' / ':'')+viewValue(view.navLabel);
 root.querySelector('#hl-user-avatar').textContent=role.initials;
 const groups=navigationGroups(uiState.role),navKey=JSON.stringify(groups);
 if(nav.dataset.key!==navKey){nav.innerHTML=groups.map(([label,pages])=>`<div class="hl-nav-label">${esc(label)}</div>`+pages.map(id=>`<button type="button" class="hl-nav-button cursor-interaction" data-page="${id}">${icon(views[id].icon||'circle')}<span>${esc(viewValue(views[id].navLabel))}</span></button>`).join('')).join('');nav.dataset.role=uiState.role;nav.dataset.key=navKey;}
 nav.querySelectorAll('[data-page]').forEach(button=>{if(button.dataset.page===parent)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
 main.innerHTML=`<div class="hl-route-frame"><div class="hl-route"><div class="hl-pagehead"><div>${['member','prospect'].includes(uiState.role)?'':`<div class="hl-kicker">${esc(view.group)} · ${esc(role.name)}</div>`}<h1>${esc(pageTitle)}</h1><p>${esc(pageSubtitle)}</p></div>${view.headerActions?`<div class="hl-row">${view.headerActions()}</div>`:''}</div><div class="hl-screen-content">${view.html()}</div></div></div>`;
 prepareCardLayouts(main);
 main.scrollTop=routeChanged||options.memberChanged?0:mainScroll;
 syncMemberSwitcher();
 syncPublicChrome();
 syncMobileNavigation();
 syncPublicFooter();
 syncPageMetadata();
 if(routeChanged&&focused&&(!focused.isConnected||!focused.getClientRects().length)){if(uiState.role==='prospect')focusPublicDestination();else if(compactNavigationMedia.matches)focusPhoneDestination();else nav.querySelector('[aria-current="page"]')?.focus({preventScroll:true});}
 else if(!needsLoading&&focused&&!focused.isConnected)restoreMotionFocus(focusRecord,false);
 renderedPage=uiState.page;
 root.querySelectorAll('button').forEach(b=>b.classList.add('cursor-interaction'));
 refreshIcons();if(needsLoading)startLoading(main.querySelector('.hl-route'),memberPageScoped()?pageTitle+' for '+memberName():pageTitle);else animateChangedValues(previousValues,main);root.dataset.ready='true';
}
function applyDesign(){applyTypography();applyTheme();root.dataset.density=designState.density;root.dataset.navigation=designState.navigation;root.style.setProperty('--hl-radius',designState.radius+'px');}
root.addEventListener('click',event=>{
 const target=event.target.closest('button[data-page],button[data-action]');if(!target||target.disabled)return;
 if(target.closest('[data-closing=true]')||mobileMenuClosing&&target.closest('#hl-sidebar'))return;
 if(target.dataset.page){const page=canonicalPage(target.dataset.page);if(page!==uiState.page||page==='v-pricing'&&websiteState.view==='draft')navigate(page);else if(mobileMenuOpen)setMobileMenu(false);return;}
 const action=actions[target.dataset.action];if(action){try{action(target);saveSelection();refreshIcons();}catch(error){toast('Could not complete this action: '+error.message);console.error(error);}}else{toast('This action is unavailable in the preview.');console.error('Unknown action',target.dataset.action);}
});
root.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='hl-role')navigate(roles[el.value].start);
 if(el.id==='hl-scenario'){
  uiState.scenario=el.value;
  if(el.value==='forms'){if(memberState.profile==='child')memberState.childWaiver=false;else memberState.waiverSigned=false;}
  else if(memberState.profile==='adult')memberState.waiverSigned=true;
  if(el.value==='debt'){memberState.payment='current';navigate('m-billing');}
  else {if(el.value==='late'&&!memberState.booked){memberState.booked=true;memberState.bookingDate='fri';memberState.funding='membership';}render();saveSelection();}
 }
 if(el.id==='m-program'){memberState.program=el.value;render();}
});
root.addEventListener('keydown',event=>{
 const overlay=root.querySelector('#hl-overlay');if(overlay.hidden)return;
 if(overlay.dataset.closing==='true'){if(event.key==='Tab'||event.key==='Escape')event.preventDefault();return;}
 // Let the native picker consume Escape before dismissing its parent dialog.
 if(event.key==='Escape'&&CSS.supports('selector(select:open)')&&root.querySelector('select:open'))return;
 if(event.key==='Escape'){closeDialog();event.preventDefault();}
 if(event.key==='Tab'){const nodes=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}
});
function restore(saved){
 const m=saved?.modelContent,p=saved?.privateContent,requestedPage=contextualPage(m?.screen),page=classEditorDirty()?'a-class-editor':requestedPage==='a-class-editor'&&!classEditorState?'a-timetable':requestedPage;
 if(!classEditorDirty())restoreOwnerContext(p?.ownerContext);
 if(m?.product==='HitLink'&&views[page]){uiState.page=page;uiState.role=roleFor(page);if(['ready','limit','monthly','pending','forms','debt','late','weekly-only','monthly-only','unlimited'].includes(m.scenario))uiState.scenario=m.scenario;}
 if(['adult','child'].includes(p?.memberProfile))memberState.profile=p.memberProfile;
 if(p?.websiteState&&JSON.stringify(p.websiteState)!==JSON.stringify(websiteSnapshot()))restoreWebsiteState(p.websiteState);
 if(Object.hasOwn(publicRoutes,p?.discoveryPage))discoveryState.page=p.discoveryPage;
 if(p?.design){if(['system','light','dark'].includes(p.design.theme))designState.theme=p.design.theme;if(Object.hasOwn(fontPairs,p.design.typography))designState.typography=p.design.typography;if(['comfortable','compact'].includes(p.design.density))designState.density=p.design.density;if(['rail','top'].includes(p.design.navigation))designState.navigation=p.design.navigation;if(Number.isFinite(p.design.radius))designState.radius=Math.min(22,Math.max(4,p.design.radius));}
}
restore(window.openai?.widgetState);applyDesign();render();
function stateSignature(){return JSON.stringify({uiState,designState,memberProfile:memberState.profile,ownerContext:ownerContextSnapshot(),coachingNotesOnly:coachingState.notesOnly,websiteState:websiteSnapshot(),discoveryState});}
window.addEventListener('openai:set_globals',event=>{if(event.detail?.globals?.widgetState){const previous=stateSignature(),previousMember=memberState.profile,previousPage=uiState.page;restore(event.detail.globals.widgetState);if(previous!==stateSignature()){if(previousPage!==uiState.page){closeDialog({immediate:true,restoreFocus:false});setMobileMenu(false,{immediate:true,restoreFocus:false});}const memberChanged=previousMember!==memberState.profile;if(memberChanged){closeDialog({immediate:true,restoreFocus:false});memberState.program='all';}applyDesign();render({memberChanged});}}});
if(globalThis.Tweak){const tweak=new Tweak({container:root,onChange:()=>{applyDesign();saveSelection();}});tweak.addSelect(designState,'density',{label:'Spacing',options:[{label:'Comfortable',value:'comfortable'},{label:'Compact',value:'compact'}]});tweak.addSelect(designState,'navigation',{label:'Navigation',options:[{label:'Side rail',value:'rail'},{label:'Top navigation',value:'top'}]});tweak.addSelect(designState,'typography',{label:'Font pairing',options:[{label:'Barlow + Source Sans 3',value:'barlow-source'},{label:'IBM Plex Sans + Condensed',value:'plex'},{label:'Manrope + Source Sans 3',value:'manrope-source'}]});tweak.addSlider(designState,'radius',{label:'Corner radius',min:4,max:22,step:2,unit:'px'});}
})();
