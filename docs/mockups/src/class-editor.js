/* Owner class drafts are local until their reviewed change is saved. */
let classEditorState=null;
const ceMinDate='2026-10-09',ceMaxDate='2026-11-08';
const ceKeys=['title','program','coach','coachAssignmentMode','space','capacity','start','end','level','repeat','weekdays','startDate','endDate'];
const ceDays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const cePrograms={muay:'Muay Thai',padwork:'Padwork',hiit:'HIIT / Hyrox',bjj:'Jiu-jitsu',tkd:'Taekwondo'};
const ceClone=value=>JSON.parse(JSON.stringify(value));
const ceDateLabel=value=>value?new Date(value+'T12:00:00Z').toLocaleDateString('en-CA',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'—';
const ceFingerprint=draft=>JSON.stringify(ceKeys.map(key=>draft[key]));
function ceDraft(source,date,scope){
 const draft={title:source?.title||'',program:source?.program||'muay',coach:source?.coach??'',space:source?.space||'Mat 1',capacity:source?.capacity??20,start:source?.start||'12:00',end:source?.end||'13:00',level:source?.level??0,repeat:source?.repeat||'once',weekdays:ceClone(source?.weekdays||[new Date(date+'T12:00:00Z').getUTCDay()]),startDate:date,endDate:source?.endDate||date};
 if(scope==='occurrence'){draft.repeat='once';draft.endDate=date;draft.coachAssignmentMode=source?.coachAssignmentMode||'inherit';draft.defaultCoach=source?.defaultCoach??source?.coach??'';}
 if(draft.repeat==='once')draft.endDate=draft.startDate;
 return draft;
}
function ceBaseline(context){
 const source=context.id?(context.scope==='future'?csSeries(context.id,context.date):csOccurrence(context.id,context.date)):null;
 return ceDraft(source,context.date,context.id?context.scope:null);
}
function classEditorDirty(){return !!classEditorState&&!classEditorState.finished&&ceFingerprint(classEditorState.draft)!==ceFingerprint(classEditorState.baseline);}
function classEditorReset(){classEditorState=null;}
function classEditorOpen(id,date){
 date=csDate(date)||ceMinDate;
 if(id&&!csOccurrence(id,date)){toast('This class is no longer on the schedule.');return;}
 const context={id:id||null,date,scope:id?'occurrence':'future'},draft=ceBaseline(context);
 classEditorState={context,draft,baseline:ceClone(draft),step:'edit',review:null,errors:[],conflicts:[],pendingScope:null,exit:null,saving:false,finished:false};
 navigate('a-class-editor');
}
function classEditorRequestLeave(page,options={}){
 if(!classEditorDirty()){classEditorReset();return false;}
 classEditorState.exit={page,options};
 showDialog('Discard class changes?','<p>Your class changes have not been saved.</p>',act('Keep editing','class-editor-stay')+act('Discard changes','class-editor-discard','danger'));
 return true;
}
function ceInput(name,type='text',attrs=''){
 const state=classEditorState,error=state.errors.find(item=>item.field===name);
 return `<input class="hl-input" id="ce-${name}" data-class-field="${name}" type="${type}" value="${esc(state.draft[name])}" ${error?'aria-invalid="true" aria-describedby="ce-errors"':''} ${attrs}>`;
}
function ceSelect(name,options,attrs=''){
 const state=classEditorState,error=state.errors.find(item=>item.field===name);
 return `<select class="hl-select" id="ce-${name}" data-class-field="${name}" ${error?'aria-invalid="true" aria-describedby="ce-errors"':''} ${attrs}>${Object.entries(options).map(([value,label])=>`<option value="${esc(value)}" ${String(state.draft[name])===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
}
function ceErrorHtml(errors){
 if(!errors?.length)return '';
 return `<div class="hl-notice danger" id="ce-errors" role="alert">${icon('circle-alert')}<div class="hl-notice-content"><strong>Check these details</strong><ul>${errors.map(error=>`<li>${esc(error.message||error)}${error.date?' · '+esc(ceDateLabel(error.date)):''}</li>`).join('')}</ul></div></div>`;
}
function ceScopeHtml(){
 const state=classEditorState;if(!state.context.id)return '';
 return `<fieldset class="ce-scope"><legend>Apply changes to</legend><div class="hl-row"><label class="hl-check"><input type="radio" name="ce-scope" data-class-scope="occurrence" ${state.context.scope==='occurrence'?'checked':''}> This class only</label><label class="hl-check"><input type="radio" name="ce-scope" data-class-scope="future" ${state.context.scope==='future'?'checked':''}> This and future classes</label></div><p class="hl-small hl-muted">${state.context.scope==='occurrence'?'Only '+esc(ceDateLabel(state.context.date))+' changes.':'Starts '+esc(ceDateLabel(state.context.date))+'. Earlier records and date-specific schedule changes stay unchanged. Coach assignments stay separate.'}</p></fieldset>`;
}
function ceCoachHtml(one){
 const draft=classEditorState.draft,options=coachStaffOptions(draft.coach);
 if(!one)return field('Default coach (optional)',ceSelect('coach',{'':'No default coach',...options}))+'<p class="hl-small hl-muted">Assign a coach to any date. If a date has no coach, members see “Coach to be confirmed.”</p>';
 const choice=ceSelect('coachAssignmentMode',{inherit:'Use default coach'+(draft.defaultCoach?' · '+draft.defaultCoach:' · none set'),assigned:'Choose a coach',unassigned:'Leave unassigned'});
 return '<div class="'+(draft.coachAssignmentMode==='assigned'?'hl-grid':'hl-stack')+'">'+field('Coach for this class',choice)+(draft.coachAssignmentMode==='assigned'?field('Coach',ceSelect('coach',{'':'Select coach',...options})):'')+'</div><p class="hl-small hl-muted">'+(draft.coachAssignmentMode==='inherit'?'Follows the default if it changes.':'Applies only to this date, even if the default changes.')+'</p>';
}
function ceFormHtml(){
 const state=classEditorState,draft=state.draft,one=!!state.context.id&&state.context.scope==='occurrence',editing=!!state.context.id;
 const programOptions={...cePrograms};if(!Object.hasOwn(programOptions,draft.program))programOptions[draft.program]=draft.program;
 const dateFields=one?details([['Class date',esc(ceDateLabel(state.context.date))]]):`<div class="hl-grid">${field(editing?'Changes start':'Start date',ceInput('startDate','date',`min="${ceMinDate}" max="${ceMaxDate}" ${editing?'readonly':''}`))}${field('Repeat',ceSelect('repeat',{once:'Does not repeat',daily:'Every day',weekly:'Every week'}))}</div>${draft.repeat==='weekly'?`<fieldset class="ce-weekdays"><legend>Repeat on</legend><div class="hl-row">${[1,2,3,4,5,6,0].map(day=>`<label class="hl-check"><input type="checkbox" data-class-weekday="${day}" ${draft.weekdays.includes(day)?'checked':''}> ${ceDays[day]}</label>`).join('')}</div></fieldset>`:''}${draft.repeat!=='once'?field('Repeat until',ceInput('endDate','date',`min="${draft.startDate||ceMinDate}" max="${ceMaxDate}"`)):''}`;
 return `<div class="ce-editor hl-stack">${ceErrorHtml(state.errors)}${ceScopeHtml()}${section('Class details',`<div class="hl-stack">${field('Class name',ceInput('title','text','maxlength="80" autocomplete="off" required'))}<div class="hl-grid">${field('Program',ceSelect('program',programOptions))}${field('Level',ceSelect('level',{'0':'All levels / beginner','1':'Advanced · approval required'}))}${field('Room',ceInput('space','text','maxlength="60" autocomplete="off" required'))}${field('Capacity',ceInput('capacity','number','min="1" max="200" step="1" inputmode="numeric" required'))}</div><div class="hl-stack ce-coach-fields">${ceCoachHtml(one)}</div></div>`)}${section('Date & time',`<div class="hl-stack">${dateFields}<div class="hl-grid">${field('Starts',ceInput('start','time','required'))}${field('Ends',ceInput('end','time','required'))}</div><p class="hl-small hl-muted">Times use the gym’s Vancouver time zone. This preview covers 9 October–8 November 2026.</p></div>`)}<div class="hl-row ce-actions">${act('Review '+(editing?'changes':'class'),'class-editor-review','primary')}${act('Cancel','class-editor-cancel','ghost')}</div></div>`;
}
function ceDisplay(key,value){
 if(key==='coach')return value||'Unassigned';
 if(key==='coachAssignmentMode')return {inherit:'Use default coach',assigned:'Assigned for this date',unassigned:'Leave unassigned'}[value]||'Use default coach';
 if(value===undefined||value===null||value==='')return '—';
 if(key==='program')return cePrograms[value]||value;
 if(key==='level')return Number(value)?'Advanced · approval required':'All levels / beginner';
 if(key==='start'||key==='end')return demoTimeLabel(String(value));
 if(key==='repeat')return {once:'Does not repeat',daily:'Every day',weekly:'Every week'}[value]||value;
 if(key==='weekdays')return value.map(day=>ceDays[day]).join(', ');
 if(key==='startDate'||key==='endDate')return ceDateLabel(value);
 return String(value);
}
function ceReviewRows(review){
 const labels={title:'Class name',program:'Program',coach:classEditorState.context.id&&classEditorState.context.scope==='occurrence'?'Coach':'Default coach',coachAssignmentMode:'Coach assignment',space:'Room',capacity:'Capacity',start:'Starts',end:'Ends',level:'Level',repeat:'Repeat',weekdays:'Repeat on',startDate:'Start date',endDate:'Repeat until'};
 const state=classEditorState,before=state.baseline,after=review.draft||state.draft,editing=!!state.context.id;
 return ceKeys.filter(key=>!(key==='coachAssignmentMode'&&(!editing||state.context.scope!=='occurrence'))&&!(key==='weekdays'&&after.repeat!=='weekly')&&!(key==='endDate'&&after.repeat==='once')&&(!editing||JSON.stringify(before[key])!==JSON.stringify(after[key]))).map(key=>editing?[esc(labels[key]),esc(ceDisplay(key,before[key])),esc(ceDisplay(key,after[key]))]:[esc(labels[key]),esc(ceDisplay(key,after[key]))]);
}
function ceDateList(label,dates){return dates?.length?`<p class="ce-dates"><strong>${esc(label)}</strong><br>${dates.map(date=>esc(ceDateLabel(date))).join(' · ')}</p>`:'';}
function ceReviewHtml(){
 const state=classEditorState,review=state.review,editing=!!state.context.id;
 if(!review){state.step='edit';return ceFormHtml();}
 const rows=ceReviewRows(review),affected=review.affectedCount??review.affectedDates?.length??0,booked=review.bookedCount||0,waitlist=review.waitlistCount||0;
 const noticeBookings=review.notificationBookedCount||0,noticeWaitlist=review.notificationWaitlistCount||0,noticeNeeded=editing&&(noticeBookings+noticeWaitlist)>0;
 const scopeLabel=editing?(state.context.scope==='occurrence'?'This class only · '+ceDateLabel(state.context.date):'This and future classes from '+ceDateLabel(state.context.date)):'New class'+(state.draft.repeat==='once'?'':' series');
 let html=`<div class="ce-editor hl-stack">${ceErrorHtml(review.errors)}${section(editing?'Review changes':'Review new class',`${details([['Applies to',esc(scopeLabel)],['Classes affected',String(affected)],...(editing?[['Bookings in affected classes',String(booked)],['Waitlist entries',String(waitlist)]]:[])])}${rows.length?(editing?table(['Detail','Current','After saving'],rows):details(rows)):'<p>No class details have changed.</p>'}`)}`;
 if(review.conflicts?.length)html+=section('Scheduling conflicts',`${notice('Resolve conflicts before saving','A coach or room is already assigned at these times.','danger')}${table(['Date','Conflicting class','Conflict'],review.conflicts.map(conflict=>[esc(ceDateLabel(conflict.date)),esc(conflict.title)+'<p class="hl-small hl-muted">'+esc(demoTimeLabel(conflict.start)+'–'+demoTimeLabel(conflict.end))+'</p>',esc((conflict.kind==='room'?'Room: ':'Coach: ')+conflict.resource)]))}`);
 if(noticeNeeded)html+=notice('Notify members',`${noticeBookings} ${noticeBookings===1?'booking':'bookings'}${noticeWaitlist?' and '+noticeWaitlist+' '+(noticeWaitlist===1?'waitlist entry':'waitlist entries'):''} affected. Saving queues a class-change notice in this simulation. No messages are sent.`,'warning');
 if(review.preservedOverrideDates?.length)html+=notice('Separately edited dates stay unchanged',review.preservedOverrideDates.map(date=>esc(ceDateLabel(date))).join(' · '));
 if(review.stateChanged&&!affected)html+='<p class="hl-small hl-muted">The saved settings change, but published class details stay the same. No member notice is needed.</p>';
 html+=`<details class="hl-disclosure"><summary>Review affected dates</summary><div class="hl-stack">${ceDateList('Added',review.addedDates)}${ceDateList('Changed',review.changedDates)}${ceDateList('Coach assignment updated',review.assignmentChangedDates)}${!affected?ceDateList('Default coach updated',review.defaultCoachChangedDates):''}${ceDateList('Removed',review.removedDates)}${!review.addedDates?.length&&!review.changedDates?.length&&!review.removedDates?.length?ceDateList('Dates',review.affectedDates):''}</div></details><p class="hl-small hl-muted">Past attendance records stay unchanged. Nothing is saved until you confirm below.</p><div class="hl-row ce-actions">${act(editing?'Save changes':'Add class','class-editor-save','primary',!review.ok||!(review.stateChanged??affected)||state.saving?'disabled':'')}${act('Back to edit','class-editor-back')}${act('Cancel','class-editor-cancel','ghost')}</div></div>`;
 return html;
}
function ceRefresh(){render();}
function ceCapture(event){
 const input=event.target;if(uiState.page!=='a-class-editor'||!classEditorState||classEditorState.step!=='edit')return;
 const state=classEditorState,key=input.dataset.classField;
 if(key&&ceKeys.includes(key)){
  const previous=state.draft[key];state.draft[key]=['capacity','level'].includes(key)?(input.value===''?'':Number(input.value)):input.value;
  if(previous===state.draft[key])return;
  if(key==='coachAssignmentMode')state.draft.coach=state.draft.coachAssignmentMode==='inherit'?state.draft.defaultCoach:state.draft.coachAssignmentMode==='unassigned'?'':state.draft.coach;
  if(key==='repeat'&&state.draft.repeat!=='once'&&state.draft.endDate===state.draft.startDate)state.draft.endDate=ceMaxDate;
  if(state.draft.repeat==='once')state.draft.endDate=state.draft.startDate;
  state.review=null;state.errors=[];
  if(key==='repeat'||key==='coachAssignmentMode'){ceRefresh();root.querySelector('#ce-'+key)?.focus();}
 }
 if(input.dataset.classWeekday!==undefined){const day=Number(input.dataset.classWeekday);state.draft.weekdays=input.checked?[...new Set([...state.draft.weekdays,day])].sort((a,b)=>a-b):state.draft.weekdays.filter(value=>value!==day);state.review=null;state.errors=[];}
 if(input.dataset.classScope&&event.type==='change')ceRequestScope(input.dataset.classScope);
}
root.addEventListener('input',ceCapture);
root.addEventListener('change',ceCapture);
function ceApplyScope(scope){
 const state=classEditorState;if(!state||!state.context.id||!['occurrence','future'].includes(scope))return;
 state.context.scope=scope;state.draft=ceBaseline(state.context);state.baseline=ceClone(state.draft);state.step='edit';state.review=null;state.errors=[];state.pendingScope=null;closeDialog({immediate:true});ceRefresh();
}
function ceRequestScope(scope){
 const state=classEditorState;if(!state||scope===state.context.scope)return;
 if(classEditorDirty()){
  state.pendingScope=scope;ceRefresh();
  showDialog('Change which classes you’re editing?','<p>This resets the unsaved fields to the selected class or series. Review the new scope before saving.</p>',act('Keep current scope','class-editor-scope-stay')+act('Discard edits & change scope','class-editor-scope-confirm','danger'));
 }else ceApplyScope(scope);
}
function ceReview(){
 const state=classEditorState;if(!state||state.step!=='edit')return;
 const review=csReview(ceClone(state.draft),ceClone(state.context));
 if(review.errors?.length&&!review.conflicts?.length){state.errors=review.errors;ceRefresh();root.querySelector('#ce-'+review.errors[0].field)?.focus();return;}
 state.review=review;state.reviewFingerprint=ceFingerprint(state.draft);state.step='review';state.errors=[];ceRefresh();root.querySelector('#hl-main').scrollTop=0;
}
function ceSave(){
 const state=classEditorState;if(!state||state.step!=='review'||state.saving||state.finished||!state.review?.ok||!(state.review.stateChanged??state.review.affectedCount)||state.reviewFingerprint!==ceFingerprint(state.draft))return;
 state.saving=true;
 const result=csCommit(ceClone(state.draft),ceClone(state.context),state.review.revision);
 state.saving=false;
 if(!result.ok){state.step='edit';state.review=null;state.errors=result.errors?.length?result.errors:[{field:'',message:'The schedule changed while you were reviewing. Review your changes again.'}];ceRefresh();root.querySelector('#hl-main').scrollTop=0;return;}
 const id=result.id,date=result.review?.affectedDates?.find(value=>value>=state.draft.startDate&&csOccurrence(id,value))||(state.context.id&&csOccurrence(id,state.context.date)?state.context.date:null);
 state.finished=true;classEditorReset();
 if(date)aOpenRoster(id,date);else{adminState.timetableDay=Math.round((Date.parse(state.draft.startDate+'T00:00:00Z')-Date.UTC(2026,9,1))/86400000)+1;navigate('a-timetable');}
 toast('Class '+(state.context.id?'changes saved.':'added.'));
}
const classEditorViews={
 'a-class-editor':{group:'Classes',navLabel:()=>classEditorState?.step==='review'?'Review class':classEditorState?.context.id?'Edit class':'Add class',icon:'calendar-plus',title:()=>classEditorState?.step==='review'?'Review class '+(classEditorState.context.id?'changes':'details'):classEditorState?.context.id?'Edit class':'Add class',subtitle:()=>classEditorState?.context.id?(csOccurrence(classEditorState.context.id,classEditorState.context.date)?.title||'Class')+' · '+ceDateLabel(classEditorState.context.date):'Set the class details, then review the schedule before saving.',html:()=>classEditorState?(classEditorState.step==='review'?ceReviewHtml():ceFormHtml()):notice('No class draft is open','Start from Classes to add a class or choose a class to edit.','info',go('Back to Classes','a-timetable'))}
};
const classEditorActions={
 'class-add':button=>classEditorOpen(null,button?.dataset.date||button?.dataset.day||adminState.timetableDate||adminState.timetableDay),
 'class-edit':button=>classEditorOpen(button?.dataset.class||adminState.selectedClassId,button?.dataset.date||button?.dataset.day||adminState.rosterDate||adminState.rosterDay),
 'class-editor-review':ceReview,
 'class-editor-back':()=>{if(classEditorState){classEditorState.step='edit';classEditorState.review=null;ceRefresh();}},
 'class-editor-save':ceSave,
 'class-editor-cancel':()=>{const destination=classEditorState?.context.id?'a-roster':'a-timetable';if(!classEditorRequestLeave(destination)){navigate(destination);}},
 'class-editor-stay':()=>{if(classEditorState)classEditorState.exit=null;closeDialog();},
 'class-editor-discard':()=>{const destination=classEditorState?.exit||{page:'a-timetable',options:{}};classEditorReset();closeDialog({immediate:true});navigate(destination.page,destination.options);},
 'class-editor-scope-stay':()=>{if(classEditorState)classEditorState.pendingScope=null;closeDialog();},
 'class-editor-scope-confirm':()=>ceApplyScope(classEditorState?.pendingScope)
};
