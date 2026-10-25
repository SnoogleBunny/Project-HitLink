/* In-memory schedule model. Templates and historical dates are never edited. */
const csWindow=Object.freeze({start:'2026-10-09',end:'2026-11-08',historyStart:'2026-10-05'});
const csClone=value=>JSON.parse(JSON.stringify(value));
const csCoreFields=['title','program','coach','space','capacity','start','end','level'];
const csTemplates=Object.freeze(Object.fromEntries(demoClasses.map(item=>[item.id,Object.freeze({...item,repeat:'daily',weekdays:Object.freeze([0,1,2,3,4,5,6]),startDate:csWindow.start,endDate:csWindow.end})])));
const csState={revision:0,nextId:1,notifications:[],lastChange:null,series:Object.fromEntries(Object.values(csTemplates).map(item=>[item.id,{id:item.id,template:true,segments:[{from:csWindow.start,to:csWindow.end,definition:csClone(item)}],overrides:{},coachAssignments:{}}]))};
function csDate(value){
 if(typeof value==='string'&&/^\d+$/.test(value))value=Number(value);
 if(Number.isInteger(value)&&value>=1&&value<=39)return new Date(Date.UTC(2026,9,value)).toISOString().slice(0,10);
 if(typeof value!=='string')return null;
 const key={mon:5,tue:6,wed:7,thu:8,fri:9,sat:10,sun:11,'next-mon':12}[value];
 if(key)return csDate(key);
 if(!/^2026-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:null;
}
const csNextDate=(date,offset=1)=>new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
const csDates=(start=csWindow.start,end=csWindow.end)=>{const dates=[];for(let date=start;date<=end;date=csNextDate(date))dates.push(date);return dates;};
const csMinutes=time=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))?Number(time.slice(0,2))*60+Number(time.slice(3)):NaN;
const csBookingDate=value=>csDate(value==='mon'?'next-mon':value);
const csLegacyCancelled=(id,date)=>id==='beginner-muay'&&date==='2026-10-16'&&typeof adminState!=='undefined'&&adminState.occurrenceCancelled;
const csLegacyChanged=(id,date)=>id==='beginner-muay'&&date==='2026-10-16'&&typeof adminState!=='undefined'&&adminState.scheduleChanged;
const csMatches=(definition,date)=>date>=definition.startDate&&date<=definition.endDate&&(definition.repeat==='daily'||definition.repeat==='once'&&date===definition.startDate||definition.repeat==='weekly'&&definition.weekdays.includes(new Date(date+'T00:00:00Z').getUTCDay()));
function csDefinition(record,date){
 if(!record)return null;
 if(date<csWindow.start&&date>=csWindow.historyStart&&record.template)return csTemplates[record.id];
 return record.segments.find(segment=>date>=segment.from&&date<=segment.to)?.definition||null;
}
function csSeries(id,value){
 const record=csState.series[id];if(!record)return null;
 const date=value===undefined?null:csDate(value);
 const definition=date?csDefinition(record,date):record.segments.at(-1)?.definition;
 return definition?{...csClone(definition),id,template:record.template}:null;
}
function csRawOccurrence(record,date){
 if(!record||!date||date<csWindow.historyStart||date>csWindow.end||csLegacyCancelled(record.id,date))return null;
 const historical=date<csWindow.start;
 const explicit=Object.hasOwn(record.overrides,date);
 const definition=explicit?record.overrides[date]:csDefinition(record,date);
 if(!definition||!historical&&!explicit&&!csMatches(definition,date))return null;
 const defaultCoach=String(csDefinition(record,date)?.coach??'');
 const assigned=!historical&&Object.hasOwn(record.coachAssignments||{},date);
 const legacy=!explicit&&csLegacyChanged(record.id,date);
 const coach=assigned?record.coachAssignments[date]:legacy?csTemplates['advanced-muay'].coach:defaultCoach;
 const result={...csClone(definition),id:record.id,date,isOverride:explicit,historical,coach,defaultCoach,coachAssignmentMode:assigned?(coach?'assigned':'unassigned'):legacy?'assigned':'inherit',isCoachOverride:assigned||legacy};
 if(legacy){result.start='19:30';result.end='20:30';result.isOverride=true;}
 result.duration=csMinutes(result.end)-csMinutes(result.start);
 return result;
}
function csSeedBooked(id,date){
 if(!csTemplates[id])return 0;
 if(id==='padwork'&&date==='2026-10-10'||id==='beginner-muay'&&date==='2026-10-16')return 20;
 return csTemplates[id].capacity-csTemplates[id].places;
}
function csBooked(id,value){
 const date=csDate(value);if(!date||!csRawOccurrence(csState.series[id],date))return 0;
 const maya=typeof memberState!=='undefined'&&memberState.booked&&(memberState.bookingClassId||'beginner-muay')===id&&csBookingDate(memberState.bookingDate)===date?1:0;
 return csSeedBooked(id,date)+maya;
}
function csWaitlisted(id,value){
 const date=csDate(value);if(!date||!csRawOccurrence(csState.series[id],date))return 0;
 const seed=id==='beginner-muay'&&date==='2026-10-16'?2:id==='padwork'&&date==='2026-10-10'?1:0;
 const selection=typeof memberState!=='undefined'&&memberState.waitlisted?memberState.waitlistSelection:null;
 return seed+(selection?.classId===id&&csBookingDate(selection.day)===date?1:0);
}
function csOccurrence(id,value){
 const date=csDate(value),item=csRawOccurrence(csState.series[id],date);if(!item)return null;
 const booked=csBooked(id,date);
 return {...item,booked,places:Math.max(0,item.capacity-booked),waitlist:csWaitlisted(id,date)};
}
function csClassesOn(value){
 const date=csDate(value);if(!date)return [];
 return Object.keys(csState.series).map(id=>csOccurrence(id,date)).filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
function csContext(options={}){
 const scope=options.scope==='future'||options.scope==='series'?'future':'occurrence';
 return {id:options.id||null,date:csDate(options.date),scope};
}
function csDraft(draft,context){
 const base=context.id?(context.scope==='future'?csSeries(context.id,context.date):csOccurrence(context.id,context.date)):null;
 const combined={...(base||{}),...draft};
 return {title:String(combined.title??'').trim(),program:String(combined.program??'').trim(),coach:String(combined.coach??'').trim(),...(Object.hasOwn(draft||{},'coachAssignmentMode')?{coachAssignmentMode:draft.coachAssignmentMode}:{}),space:String(combined.space??'').trim(),capacity:Number(combined.capacity),start:String(combined.start??''),end:String(combined.end??''),level:Number(combined.level),repeat:combined.repeat||'once',weekdays:Array.isArray(combined.weekdays)?[...new Set(combined.weekdays.map(Number))].sort((a,b)=>a-b):[],startDate:csDate(combined.startDate??context.date),endDate:csDate(combined.endDate??combined.startDate??context.date)};
}
const csChanged=(before,after)=>!before!==!after||!!before&&!!after&&csCoreFields.some(field=>before[field]!==after[field]);
function csAssignmentMode(draft,old){
 if(Object.hasOwn(draft,'coachAssignmentMode'))return draft.coachAssignmentMode;
 return draft.coach===old.coach?old.coachAssignmentMode:(draft.coach?'assigned':'unassigned');
}
function csSetCoach(record,date,mode,coach){
 record.coachAssignments=record.coachAssignments||{};
 if(mode==='inherit')delete record.coachAssignments[date];
 else record.coachAssignments[date]=mode==='unassigned'?'':String(coach||'').trim();
}
function csMaterializeLegacy(record){
 const legacy=csRawOccurrence(record,'2026-10-16');
 if(legacy?.isOverride&&!Object.hasOwn(record.overrides,'2026-10-16')){record.overrides['2026-10-16']=legacy;csSetCoach(record,'2026-10-16',legacy.coachAssignmentMode,legacy.coach);}
}
function csCandidate(draft,context){
 const id=context.id||'class-'+csState.nextId;
 const record=context.id?csClone(csState.series[id]):{id,template:false,segments:[],overrides:{},coachAssignments:{}};
 if(!context.id)record.segments=[{from:csWindow.start,to:csWindow.end,definition:{...draft,id}}];
 else if(context.scope==='occurrence'){
  const old=csRawOccurrence(record,context.date);
  csMaterializeLegacy(record);
  const scheduleFields=csCoreFields.filter(field=>field!=='coach');
  if(scheduleFields.some(field=>old[field]!==draft[field]))record.overrides[context.date]={...old,...Object.fromEntries(scheduleFields.map(field=>[field,draft[field]]))};
  const mode=csAssignmentMode(draft,old);
  if(mode!==old.coachAssignmentMode||draft.coach!==old.coach)csSetCoach(record,context.date,mode,draft.coach);
 }else{
  // Materialize the pre-existing legacy exception before segmenting the series.
  csMaterializeLegacy(record);
  record.segments=record.segments.filter(segment=>segment.from<context.date).map(segment=>({...segment,to:segment.to>=context.date?csNextDate(context.date,-1):segment.to}));
  record.segments.push({from:context.date,to:csWindow.end,definition:{...draft,id}});
 }
 return record;
}
function csValidation(draft,options={}){
 const context=csContext(options),normalized=csDraft(draft||{},context),errors=[],conflicts=[];
 const error=(field,message,date)=>errors.push({field,message,...(date?{date}:{})});
 if(context.id&&context.scope==='occurrence'){
  if(normalized.coachAssignmentMode==='inherit')normalized.coach=csOccurrence(context.id,context.date)?.defaultCoach||'';
  if(normalized.coachAssignmentMode==='unassigned')normalized.coach='';
 }
 if(context.id&&!csState.series[context.id])error('id','This class series no longer exists.');
 if(context.id&&(!context.date||context.date<csWindow.start||context.date>csWindow.end))error('date','Choose an editable class date from 9 October to 8 November 2026.');
 if(context.id&&context.date&&!csOccurrence(context.id,context.date))error('date','This occurrence is not available to edit.');
 for(const name of ['title','program','space'])if(!normalized[name])error(name,'Enter a '+({space:'room',program:'program',title:'class name'}[name])+'.');
 for(const name of ['title','coach','space'])if(normalized[name].length>100)error(name,'Keep this field to 100 characters or fewer.');
 if(context.id&&context.scope==='occurrence'&&Object.hasOwn(normalized,'coachAssignmentMode')){
  if(!['inherit','assigned','unassigned'].includes(normalized.coachAssignmentMode))error('coachAssignmentMode','Choose how to assign the coach for this date.');
  if(normalized.coachAssignmentMode==='assigned'&&!normalized.coach)error('coach','Choose a coach or leave this date unassigned.');
 }
 if(!['muay','hiit','padwork','tkd','bjj'].includes(normalized.program))error('program','Choose a supported program.');
 if(!Number.isInteger(normalized.capacity)||normalized.capacity<1||normalized.capacity>200)error('capacity','Enter a whole capacity from 1 to 200.');
 if(!Number.isFinite(csMinutes(normalized.start)))error('start','Enter a valid start time.');
 if(!Number.isFinite(csMinutes(normalized.end))||csMinutes(normalized.end)<=csMinutes(normalized.start))error('end','End time must be after start time on the same day.');
 if(![0,1].includes(normalized.level))error('level','Choose open eligibility or Level 1.');
 if(!['once','daily','weekly'].includes(normalized.repeat))error('repeat','Choose one date, daily or selected weekdays.');
 if(!normalized.startDate||!normalized.endDate||normalized.startDate<csWindow.start||normalized.endDate>csWindow.end||normalized.endDate<normalized.startDate)error('startDate','Schedule dates must fall within 9 October–8 November 2026, with the end on or after the start.');
 if(normalized.repeat==='once'&&normalized.endDate!==normalized.startDate)normalized.endDate=normalized.startDate;
 if(normalized.repeat==='weekly'&&(!normalized.weekdays.length||normalized.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)))error('weekdays','Select at least one valid weekday.');
 if(errors.length)return {ok:false,errors,conflicts,draft:normalized,context};
 return csInspectCandidate(csCandidate(normalized,context),context,normalized,errors,conflicts);
}
function csInspectCandidate(candidate,context,normalized,errors=[],conflicts=[]){
 const error=(field,message,date)=>errors.push({field,message,...(date?{date}:{})});
 const oldRecord=context.id?csState.series[context.id]:null;
 const dates=csDates(),affectedDates=[],addedDates=[],removedDates=[],changedDates=[],preservedOverrideDates=[],assignmentChangedDates=[],defaultCoachChangedDates=[];
 for(const date of dates){
  const before=csRawOccurrence(oldRecord,date),after=csRawOccurrence(candidate,date);
  if(context.id&&context.scope==='future'&&date>=context.date&&before?.isOverride)preservedOverrideDates.push(date);
  const assignmentChanged=!!before&&!!after&&(before.coachAssignmentMode!==after.coachAssignmentMode||(before.isCoachOverride&&after.isCoachOverride&&before.coach!==after.coach));
  if(assignmentChanged)assignmentChangedDates.push(date);
  if(before&&after&&before.defaultCoach!==after.defaultCoach)defaultCoachChangedDates.push(date);
  const changed=csChanged(before,after);
  if(!changed&&!assignmentChanged)continue;
  if(changed){affectedDates.push(date);if(!before)addedDates.push(date);else if(!after)removedDates.push(date);else changedDates.push(date);}
  const booked=before?csBooked(context.id,date):0;
  if(booked&&!after)error('repeat','This change removes a date with '+booked+' confirmed bookings. Keep that date or resolve those bookings first.',date);
  if(before&&!after&&csWaitlisted(context.id,date))error('repeat','This change removes a date with a waitlist. Keep that date or resolve its waitlist first.',date);
  if(after&&booked>after.capacity)error('capacity','Capacity cannot be lower than '+booked+' confirmed bookings.',date);
  if(before&&after&&booked&&(before.program!==after.program||before.level!==after.level))error('program','Program and eligibility cannot change while this date has confirmed bookings.',date);
  if(before&&context.id==='beginner-muay'&&date==='2026-10-09')error('date','Attendance is already recorded for this class. Choose a later date to change the series.',date);
  const member=typeof memberState!=='undefined'?memberState:null;
  if(before&&member?.booked&&member.attended&&(member.bookingClassId||'beginner-muay')===context.id&&csBookingDate(member.bookingDate)===date)error('date','Attendance is already recorded. Keep this occurrence unchanged.',date);
  const pending=member?.bookingPending?member.pendingOperation:null;
  if(pending?.profile==='adult'&&pending.classId===context.id&&csBookingDate(pending.day)===date)error('date','Resolve the pending booking before editing this occurrence.',date);
  if(!after||!changed)continue;
  const others=Object.values(csState.series).filter(record=>record.id!==candidate.id).map(record=>csRawOccurrence(record,date)).filter(Boolean);
  if(date==='2026-10-09'||date==='2026-10-12')others.push({id:'juniors',title:'Taekwondo juniors',coach:'Alex Park',space:'Mat 1',start:'16:30',end:'17:15'});
  const coaching=typeof coachingState!=='undefined'?coachingState:null;
  if(coaching&&!coaching.notesOnly&&coaching.session?.status==='confirmed'&&csDate(coaching.session.date)===date){
   const endMinutes=csMinutes(coaching.session.time)+50;
   others.push({id:'coaching-appointment',title:'Confirmed coaching appointment',coach:coaching.coach,space:'Northstar consultation room',start:coaching.session.time,end:String(Math.floor(endMinutes/60)).padStart(2,'0')+':'+String(endMinutes%60).padStart(2,'0')});
  }
  for(const other of others){
   if(csMinutes(after.start)>=csMinutes(other.end)||csMinutes(after.end)<=csMinutes(other.start))continue;
   for(const [field,kind] of [['space','room'],['coach','coach']]){
    if(field==='coach'&&(!after.coach||!other.coach))continue;
    if(after[field].trim().toLowerCase()!==other[field].trim().toLowerCase())continue;
    const existing=before&&before.start===after.start&&before.end===after.end&&before[field].trim().toLowerCase()===other[field].trim().toLowerCase()&&csMinutes(before.start)<csMinutes(other.end)&&csMinutes(before.end)>csMinutes(other.start);
    if(!existing)conflicts.push({date,id:other.id,title:other.title,kind,resource:after[field],start:other.start,end:other.end});
   }
  }
 }
 if(!context.id&&!addedDates.length)error('weekdays','No class dates match this recurrence within the selected range.');
 const recordExists=csDates().some(date=>csRawOccurrence(candidate,date));
 if(context.id&&!recordExists)error('repeat','Keep at least one scheduled date in this preview.');
 const previousDefinition=context.id&&context.scope==='future'?csSeries(context.id,context.date):null;
 const seriesChanged=!!previousDefinition&&[...csCoreFields,'repeat','weekdays','endDate'].some(field=>JSON.stringify(previousDefinition[field])!==JSON.stringify(normalized[field]));
 const stateChanged=affectedDates.length>0||assignmentChangedDates.length>0||defaultCoachChangedDates.length>0||seriesChanged;
 return {ok:errors.length===0&&conflicts.length===0,errors,conflicts,draft:normalized,context,candidate,stateChanged,affectedDates,addedDates,removedDates,changedDates,preservedOverrideDates,assignmentChangedDates,defaultCoachChangedDates};
}
function csValidate(draft,options={}){
 const result=csValidation(draft,options);const {candidate,...publicResult}=result;return publicResult;
}
function csReview(draft,options={}){
 return csPublicReview(csValidation(draft,options));
}
function csPublicReview(result){
 const {candidate,...publicResult}=result;
 const affectedDates=result.affectedDates||[],date=result.context.date||result.draft.startDate;
 const notificationDates=candidate&&result.context.id?affectedDates.filter(day=>{const before=csRawOccurrence(csState.series[result.context.id],day),after=csRawOccurrence(candidate,day);return before&&after&&['title','start','end','coach','space'].some(field=>before[field]!==after[field]);}):[];
 const future=result.context.id&&result.context.scope==='future';
 return {...publicResult,stateChanged:!!result.stateChanged,revision:csState.revision,before:result.context.id?(future?csSeries(result.context.id,date):csOccurrence(result.context.id,date)):null,after:candidate?(future?{...csClone(result.draft),id:result.context.id}:csRawOccurrence(candidate,date)):null,affectedDates,affectedCount:affectedDates.length,addedDates:result.addedDates||[],removedDates:result.removedDates||[],changedDates:result.changedDates||[],preservedOverrideDates:result.preservedOverrideDates||[],assignmentChangedDates:result.assignmentChangedDates||[],defaultCoachChangedDates:result.defaultCoachChangedDates||[],bookedCount:affectedDates.reduce((sum,day)=>sum+(result.context.id?csBooked(result.context.id,day):0),0),waitlistCount:affectedDates.reduce((sum,day)=>sum+(result.context.id?csWaitlisted(result.context.id,day):0),0),notificationDates,notificationBookedCount:notificationDates.reduce((sum,day)=>sum+csBooked(result.context.id,day),0),notificationWaitlistCount:notificationDates.reduce((sum,day)=>sum+csWaitlisted(result.context.id,day),0)};
}
function csCommit(draft,options={},expectedRevision){
 if(expectedRevision!==csState.revision)return {ok:false,revision:csState.revision,id:options.id||null,errors:[{field:'revision',message:'The schedule changed after this review. Review the latest schedule before saving.'}],conflicts:[]};
 const review=csReview(draft,options);
 if(!review.ok)return {ok:false,revision:csState.revision,id:options.id||null,review,errors:review.errors,conflicts:review.conflicts};
 const validated=csValidation(draft,options);
 if(!validated.ok)return {ok:false,revision:csState.revision,id:options.id||null,errors:validated.errors,conflicts:validated.conflicts};
 const id=validated.candidate.id;
 const revision=csState.revision+1;
 const notifications=review.notificationDates.map(date=>({revision,id,date,bookings:csBooked(id,date),waitlist:csWaitlisted(id,date),status:'Queued in preview'})).filter(item=>item.bookings+item.waitlist>0);
 csState.series={...csState.series,[id]:validated.candidate};
 if(!options.id)csState.nextId++;
 csState.revision=revision;
 csState.notifications.push(...notifications);
 csState.lastChange={revision,id,context:csClone(review.context),affectedDates:[...review.affectedDates],assignmentChangedDates:[...review.assignmentChangedDates],defaultCoachChangedDates:[...review.defaultCoachChangedDates],notificationDates:notifications.map(item=>item.date),notificationBookedCount:review.notificationBookedCount,notificationWaitlistCount:review.notificationWaitlistCount};
 return {ok:true,revision:csState.revision,id,review,errors:[],conflicts:[]};
}
function csCoachReview(id,date,mode,coach=''){
 const review=csReview({coach,coachAssignmentMode:mode},{id,date,scope:'occurrence'});
 return {...review,assignment:{mode,coach:review.after?.coach??String(coach||'').trim()}};
}
function csCoachCommit(id,date,mode,coach='',expectedRevision){
 const result=csCommit({coach,coachAssignmentMode:mode},{id,date,scope:'occurrence'},expectedRevision);
 if(result.review)result.review={...result.review,assignment:{mode,coach:result.review.after?.coach??String(coach||'').trim()}};
 return result;
}
