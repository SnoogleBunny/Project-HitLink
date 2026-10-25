// A route may remain available without being a primary navigation destination.
const workspaceParents={
 'a-class-editor':'a-timetable','a-roster':'a-timetable','a-member':'a-people','a-membership':'a-people',
 'a-discovery':'a-website','a-migration':'a-settings','a-cutover':'a-settings',
 'a-exports':'a-settings','a-support':'a-settings','m-forms':'m-membership',
 'c-program':'c-clients','c-notes':'c-clients','c-sessions':'c-clients',
 'c-continuity':'c-clients','c-close':'c-clients'
};
function workspaceParent(page){return workspaceParents[canonicalPage(page)]||canonicalPage(page);}
function contextualPage(page){
 page=canonicalPage(page);
 if(coachingState.notesOnly&&page==='c-sessions')return 'c-program';
 if(coachingState.notesOnly&&page==='p-session')return 'p-program';
 return page;
}
function viewValue(value){return typeof value==='function'?value():value;}
function workspaceBack(label,page){return `<div class="hl-context-back">${go(icon('arrow-left')+`<span>${esc(label)}</span>`,page,'ghost')}</div>`;}
function workspaceTabs(items,current,label='Section navigation'){
 return `<nav class="hl-context-tabs" aria-label="${esc(label)}">${items.map(([page,name])=>`<button type="button" class="hl-button ${page===current?'primary':'secondary'} cursor-interaction" data-page="${esc(page)}" ${page===current?'aria-current="page"':''}>${esc(name)}</button>`).join('')}</nav>`;
}
const workspaceViews={
 'a-settings':{title:'Settings',subtitle:'Manage program rules, records and workspace access.',icon:'settings',navLabel:'Settings',group:'Gym workspace',html:()=>`<div class="hl-stack">${section('Gym settings',`
 <div class="hl-list-row"><div><h3>Program rules</h3><p class="hl-muted hl-small">Set how Taekwondo ranks affect booking. Individual promotions stay on the member’s record.</p></div>${act('Manage rules','a-rank-settings')}</div>
 <div class="hl-list-row"><div><h3>Import & switch systems</h3><p class="hl-muted hl-small">Review the import, resolve differences and confirm the billing handover.</p></div>${go(adminState.activated?'Review import':'Open setup','a-migration')}</div>
 <div class="hl-list-row"><div><h3>Records & account closure</h3><p class="hl-muted hl-small">Export permitted records and review the steps for leaving HitLink.</p></div>${go('Manage records','a-exports')}</div>
 <div class="hl-list-row"><div><h3>Support & audit</h3><p class="hl-muted hl-small">Review incidents, temporary support access and recorded changes.</p></div>${go('Open support','a-support')}</div>
 `)}</div>`}
};
const websiteTabs=[['a-website','Pricing'],['a-discovery','Search & sharing']];
const pricingEditor=pricingViews['a-website'].html;
pricingViews['a-website']={...pricingViews['a-website'],title:'Website',navLabel:'Website',subtitle:'Manage public pricing and review your website pages.',html:()=>workspaceTabs(websiteTabs,'a-website','Website sections')+pricingEditor()};
const discoveryPreview=publicViews['a-discovery'].html;
publicViews['a-discovery']={...publicViews['a-discovery'],title:'Website',subtitle:'Review page titles, descriptions and sharing previews.',html:()=>workspaceTabs(websiteTabs,'a-discovery','Website sections')+discoveryPreview()};
const importSteps=[['a-migration','1. Review import'],['a-cutover','2. Switch systems']];
for(const page of ['a-migration','a-cutover']){
 const content=adminViews[page].html;
 adminViews[page]={...adminViews[page],title:'Import & switch systems',html:()=>workspaceBack('Settings','a-settings')+workspaceTabs(importSteps,page,'Import stages')+content()};
}
for(const page of ['a-exports','a-support']){
 const content=adminViews[page].html;
 adminViews[page]={...adminViews[page],html:()=>workspaceBack('Settings','a-settings')+content()};
}
function ownerContextSnapshot(){
 const {selectedClassId,rosterDay,selectedMemberId,timetableDay}=adminState;
 return {selectedClassId,rosterDay,selectedMemberId,timetableDay};
}
function restoreOwnerContext(context){
 if(!context)return;
 if(csSeries(context.selectedClassId))adminState.selectedClassId=context.selectedClassId;
 for(const key of ['rosterDay','timetableDay'])if(Number.isInteger(context[key])&&context[key]>=9&&context[key]<=39)adminState[key]=context[key];
 if(aDirectoryMembers().some(member=>member.id===context.selectedMemberId))adminState.selectedMemberId=context.selectedMemberId;
}
