/* Coach assignments belong to individual dates, separately from timetable edits. */
let coachAssignmentState=null;
function coachStaffOptions(current=''){
 const names=[...demoClasses.map(item=>item.coach),'Jordan Lee','Asha Singh','Alex Park',current].map(name=>String(name||'').trim()).filter(Boolean);
 return Object.fromEntries([...new Set(names)].sort((a,b)=>a.localeCompare(b)).map(name=>[name,name]));
}
function coachAssignmentButton(item,day){
 const occurrence=csOccurrence(item.id,day);
 if(!occurrence)return '';
 const label=occurrence.coach?'Change coach':'Assign coach';
 return act(label,'class-coach','ghost',`data-class="${esc(item.id)}" data-date="${esc(csDate(day))}" aria-label="${esc(label+' for '+occurrence.title+' on '+ceDateLabel(csDate(day)))}"`);
}
function caCoachLabel(value){return value||'Unassigned';}
function caModeLabel(mode,defaultCoach){
 return mode==='inherit'?'Use default coach'+(defaultCoach?' · '+defaultCoach:' · none set'):mode==='assigned'?'Assigned for this date':'Leave unassigned';
}
function caSelect(id,options,value){
 return `<select class="hl-select" id="${id}">${Object.entries(options).map(([key,label])=>`<option value="${esc(key)}" ${key===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
}
function caBody(){
 const state=coachAssignmentState,item=csOccurrence(state.id,state.date),review=state.review;
 if(!item)return notice('Class no longer scheduled','Close this window and choose another class.','danger');
 const before=review.before||item,after=review.after;
 let body=`<div class="ca-assignment hl-stack"><p class="hl-small hl-muted">${esc(item.title)} · ${esc(ceDateLabel(state.date))}<br>${esc(demoClassRange(item))} · ${esc(item.space)}</p>${field('Coach for this class',caSelect('ca-mode',{inherit:caModeLabel('inherit',item.defaultCoach),assigned:'Choose a coach',unassigned:'Leave unassigned'},state.mode))}${state.mode==='assigned'?field('Coach',caSelect('ca-coach',{'':'Select coach',...coachStaffOptions(state.coach)},state.coach)):''}<p class="hl-small hl-muted">${state.mode==='inherit'?'Follows the default coach if it changes.':'Applies only to this date. Later timetable changes still apply.'}</p>`;
 if(state.saveError)body+=notice('Review the latest details',esc(state.saveError),'warning');
 if(review.errors?.length)body+=`<div class="hl-notice danger" role="alert">${icon('circle-alert')}<div class="hl-notice-content"><strong>Cannot save this assignment</strong><ul>${review.errors.map(error=>`<li>${esc(error.message)}</li>`).join('')}</ul></div></div>`;
 if(review.conflicts?.length)body+=`${notice('Scheduling conflict','Choose another coach or leave this class unassigned.','danger')}${table(['Class','Time','Conflict'],review.conflicts.map(conflict=>[esc(conflict.title),esc(demoTimeLabel(conflict.start)+'–'+demoTimeLabel(conflict.end)),esc(conflict.resource)]))}`;
 if(after){
  body+=`<div class="ca-review" aria-live="polite">${details([['Current coach',esc(caCoachLabel(before.coach))],['After saving',esc(caCoachLabel(after.coach))]])}`;
  if(after.coach&&review.ok)body+='<p class="hl-small hl-muted">No new scheduling conflicts. Confirm this coach can teach before saving.</p>';
  if(!after.coach)body+='<p class="hl-small hl-muted">Members will see “Coach to be confirmed.”</p>';
  const booked=review.notificationBookedCount||0,waitlist=review.notificationWaitlistCount||0;
  if(booked+waitlist)body+=notice('Notify members',`Saving queues a coach-change notice for ${booked} ${booked===1?'booking':'bookings'}${waitlist?' and '+waitlist+' '+(waitlist===1?'waitlist entry':'waitlist entries'):''}. No messages are sent in this preview.`,'warning');
  else if(review.stateChanged&&before.coach===after.coach)body+='<p class="hl-small hl-muted">The published coach stays the same. No member notice is needed.</p>';
  body+='</div>';
 }
 body+='<p class="hl-small hl-muted">Bookings, capacity and attendance records stay unchanged.</p></div>';
 return body;
}
function caFooter(){
 const state=coachAssignmentState,review=state.review;
 return act('Cancel','class-coach-cancel')+act('Save coach','class-coach-save','primary',!review.ok||!review.stateChanged||state.saving?'disabled':'');
}
function caRender(initial=false){
 const state=coachAssignmentState;if(!state)return;
 state.review=csCoachReview(state.id,state.date,state.mode,state.coach);
 const title=csOccurrence(state.id,state.date)?.coach?'Change coach':'Assign coach';
 if(initial){showDialog(title,caBody(),caFooter(),{kind:'coach-assignment'});return;}
 const overlay=root.querySelector('#hl-overlay');if(overlay.hidden||overlay.dataset.kind!=='coach-assignment')return;
 const focusId=overlay.contains(document.activeElement)?document.activeElement.id:null;
 overlay.querySelector('#hl-dialog-title').textContent=title;
 overlay.querySelector('.hl-dialog-body').innerHTML=caBody();
 overlay.querySelector('.hl-dialog-foot').innerHTML=caFooter();
 refreshIcons();
 if(focusId)root.querySelector('#'+focusId)?.focus({preventScroll:true});
}
function coachAssignmentOpen(id,date){
 date=csDate(date);const item=csOccurrence(id,date);
 if(!item){toast('This class is no longer on the schedule.');return;}
 coachAssignmentState={id,date,mode:item.coachAssignmentMode||'inherit',coach:item.coach||'',review:null,saveError:'',saving:false};
 caRender(true);
}
function caSave(){
 const state=coachAssignmentState,overlay=root.querySelector('#hl-overlay');
 if(!state||state.saving||overlay.hidden||overlay.dataset.kind!=='coach-assignment'||!state.review?.ok||!state.review.stateChanged)return;
 state.saving=true;
 const result=csCoachCommit(state.id,state.date,state.mode,state.coach,state.review.revision);
 state.saving=false;
 if(!result.ok){state.saveError=result.errors?.[0]?.message||'The schedule changed. Review the latest details before saving.';caRender();return;}
 const assigned=csOccurrence(state.id,state.date)?.coach;
 coachAssignmentState=null;closeDialog({immediate:true});render();saveSelection();
 toast(assigned?'Coach assignment saved.':'Class left unassigned.');
}
root.addEventListener('change',event=>{
 const input=event.target,state=coachAssignmentState,overlay=root.querySelector('#hl-overlay');
 if(!state||overlay.hidden||overlay.dataset.kind!=='coach-assignment'||!['ca-mode','ca-coach'].includes(input.id))return;
 if(input.id==='ca-mode')state.mode=input.value;else state.coach=input.value;
 state.saveError='';caRender();
});
const coachAssignmentActions={
 'class-coach':button=>coachAssignmentOpen(button?.dataset.class||adminState.selectedClassId,button?.dataset.date||button?.dataset.day||adminState.rosterDay),
 'class-coach-save':caSave,
 'class-coach-cancel':()=>{coachAssignmentState=null;closeDialog();}
};
