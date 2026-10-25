// Choosing a member changes the records in view, never the signed-in account.
const memberProfiles=[
 {id:'adult',name:'Maya Chen',short:'Maya (you)',detail:'You · Striking + Grappling',authorized:true},
 {id:'child',name:'Eli Chen',short:'Eli',detail:'Your child · Taekwondo juniors',authorized:true}
];
const memberScopedPages=new Set(['m-schedule','m-membership','m-forms']);
const availableMemberProfiles=()=>memberProfiles.filter(member=>member.authorized);
const memberPageScoped=()=>uiState.role==='member'&&memberScopedPages.has(uiState.page);
function syncMemberSwitcher(){
 const scoped=memberPageScoped(),profile=availableMemberProfiles().find(member=>member.id===memberState.profile)||availableMemberProfiles()[0];
 root.dataset.memberScoped=String(scoped);
 for(const slot of root.querySelectorAll('[data-member-slot]')){
  const id='hl-member-switch-'+slot.dataset.memberSlot;
  slot.hidden=uiState.role!=='member';
  if(!scoped){slot.innerHTML=`<span class="hl-account-scope">Your account</span>`;continue;}
  const label=`<span class="hl-member-label">Member</span><span class="hl-member-name">${esc(profile.short)}</span>`;
  slot.innerHTML=availableMemberProfiles().length>1?`<button type="button" id="${id}" class="hl-button secondary hl-member-trigger cursor-interaction" data-member-switch aria-label="Member: ${esc(profile.name)}${profile.id==='adult'?' (you)':''}. Choose member" aria-haspopup="dialog" aria-expanded="false" aria-controls="hl-overlay">${label}${icon('chevron-down')}</button>`:`<span class="hl-member-static">${label}</span>`;
 }
 syncMemberPickerExpanded();
}
function syncMemberPickerExpanded(){
 const overlay=root.querySelector('#hl-overlay'),open=!overlay.hidden&&overlay.dataset.kind==='member-picker'&&overlay.dataset.closing!=='true';
 root.querySelectorAll('[data-member-switch]').forEach(button=>button.setAttribute('aria-expanded',String(open)));
}
function positionMemberPicker(){
 const overlay=root.querySelector('#hl-overlay');if(overlay.hidden||overlay.dataset.kind!=='member-picker'||phoneMedia.matches)return;
 const anchor=[...root.querySelectorAll('[data-member-switch]')].find(button=>button.getClientRects().length);if(!anchor)return;
 const app=root.querySelector('.hl-app').getBoundingClientRect(),rect=anchor.getBoundingClientRect(),width=Math.min(300,app.width-24);
 overlay.style.setProperty('--hl-picker-left',Math.max(12,Math.min(rect.right-app.left-width,app.width-width-12))+'px');
 overlay.style.setProperty('--hl-picker-top',rect.bottom-app.top+8+'px');
 overlay.style.setProperty('--hl-picker-width',width+'px');
}
function openMemberPicker(){
 if(!memberPageScoped()||availableMemberProfiles().length<2)return;
 const options=availableMemberProfiles().map(member=>`<button type="button" class="hl-button secondary hl-member-option cursor-interaction" data-member-profile="${member.id}" aria-pressed="${member.id===memberState.profile}"><span><strong>${esc(member.name)}</strong><span>${esc(member.detail)}</span></span>${member.id===memberState.profile?icon('check'):''}</button>`).join('');
 showDialog('Choose member',`<div class="hl-member-options">${options}</div>`,'',{kind:'member-picker'});
 positionMemberPicker();
 root.querySelector('[data-member-profile][aria-pressed=true]')?.focus({preventScroll:true});
}
function hasMemberFormDraft(){return uiState.page==='m-forms'&&Boolean(root.querySelector('#m-sign-name')?.value.trim()||root.querySelector('#m-sign-consent')?.checked||root.querySelector('#m-marketing')?.checked);}
function switchMember(profile,options={}){
 const next=availableMemberProfiles().find(member=>member.id===profile);if(!next)return;
 if(profile===memberState.profile){closeDialog();return;}
 if(hasMemberFormDraft()&&!options.discardDraft){
  showDialog(`Switch to ${esc(next.name)}?`,`<p>Your unsigned form for ${esc(memberName())} will be cleared. Nothing has been submitted.</p>`,act('Keep editing','close-dialog')+`<button type="button" class="hl-button primary cursor-interaction" data-member-profile="${next.id}" data-discard-member-draft>Discard & switch</button>`);
  return;
 }
 closeDialog({immediate:true,restoreFocus:false});
 memberState.profile=profile;memberState.program='all';
 render({memberChanged:true});saveSelection();
 const trigger=[...root.querySelectorAll('[data-member-switch]')].find(button=>button.getClientRects().length);
 trigger?.focus({preventScroll:true});
}
root.addEventListener('click',event=>{
 if(event.target.closest('[data-member-switch]')){openMemberPicker();return;}
 const choice=event.target.closest('[data-member-profile]');
 if(choice&&!choice.closest('[data-closing=true]')){switchMember(choice.dataset.memberProfile,{discardDraft:choice.hasAttribute('data-discard-member-draft')});return;}
 const overlay=root.querySelector('#hl-overlay');if(event.target===overlay&&overlay.dataset.kind==='member-picker')closeDialog();
});
window.addEventListener('resize',positionMemberPicker);
