/* Owner and member routes share the reviewed, in-memory class schedule. */
function classCoachLabel(item,audience='member'){
 return String(item?.coach||'').trim()||(audience==='owner'?'Needs coach':'Coach to be confirmed');
}
function classIdentity(item,heading='strong'){
 const tag=heading==='h3'?'h3':'strong';
 return `<div class="hl-class-identity"><${tag}>${esc(item.title)}</${tag}>${item.space?`<p class="hl-class-room">${esc(item.space)}</p>`:''}</div>`;
}
function classOwnerCoach(item,day){
 return `<div class="hl-class-coach"><div>${item.coach?esc(item.coach):badge('Needs coach','warning')}${item.isCoachOverride?'<p class="hl-small hl-muted">For this date</p>':''}</div>${coachAssignmentButton(item,day)}</div>`;
}
function aRepeatLabel(item){
 if(item.repeat==='once')return 'One class';
 if(item.repeat==='daily')return 'Every day';
 return 'Every '+item.weekdays.map(day=>ceDays[day]).join(', ');
}
adminViews['a-timetable'].headerActions=()=>act(icon('plus')+'<span>Add class</span>','class-add','primary');
adminViews['a-timetable'].html=()=>{
 const day=adminState.timetableDay,items=csClassesOn(day);
 const rows=items.map(item=>[
  esc(demoClassRange(item)),classIdentity(item)+(item.isOverride?'<div class="hl-class-date-note">'+badge('Changed for this date','neutral')+'</div>':''),
  classOwnerCoach(item,day),aClassSeats(item,day)+(item.waitlist?' · '+item.waitlist+' waitlisted':''),
  act('Open class','a-open-roster','secondary',`data-class="${esc(item.id)}" data-day="${day}" aria-label="Open ${esc(item.title)} on ${esc(aDayLabel(day))}"`)
 ]);
 if(day===16&&adminState.occurrenceCancelled)rows.push(['—',classIdentity(adminState.cancelledClassSnapshot||csSeries('beginner-muay',day))+'<div class="hl-class-date-note">'+badge('Cancelled','danger')+'</div>','—','0 active',act('View cancelled class','a-open-roster','ghost','data-class="beginner-muay" data-day="16"')]);
 return section('Class schedule',`<div class="ce-day-control">${field('Day',`<input class="hl-input" id="a-timetable-day" type="date" min="${csWindow.start}" max="${csWindow.end}" value="${csDate(day)}">`)}</div><p class="hl-muted hl-small">All times are in Vancouver time. This preview covers 9 October–8 November 2026.</p>${rows.length?table(['Time','Class','Coach','Bookings',''],rows):`<div class="hl-class-empty"><h3>No classes on ${esc(aDayLabel(day))}</h3><p>Add a class for this date or choose another day.</p>${act('Add class','class-add','primary')}</div>`}`);
};
adminViews['a-roster'].headerActions=()=>{
 const item=aRosterClass(),day=adminState.rosterDay,cancelled=aOccurrenceCancelled(item,day);
 return (!cancelled?coachAssignmentButton(item,day):'')+act(icon('pencil')+'<span>Edit class</span>','class-edit','primary',`data-class="${esc(adminState.selectedClassId)}" data-day="${day}" ${cancelled?'disabled':''}`);
};
adminActions['a-class-detail']=button=>{
 const id=button?.dataset.class||adminState.selectedClassId,day=aDayNumber(button?.dataset.day||adminState.rosterDay),item=csOccurrence(id,day)||csSeries(id,day);
 if(!item)return toast('This class is no longer on the schedule.');
 const cancelled=aOccurrenceCancelled(item,day),series=csSeries(id,day);
 showDialog(esc(item.title),`${details([['Date',esc(aDayLabel(day))],['Time',esc(demoClassRange(item))],['Coach',esc(classCoachLabel(item,'owner'))],['Room',esc(item.space)],['Capacity',String(item.capacity)],['Program',esc(cePrograms[item.program]||item.program)],['Level',item.level?'Advanced · approval required':'All levels / beginner'],['Series',esc(aRepeatLabel(series))],['Default coach',esc(series.coach||'No default coach')],['Scheduled through',esc(ceDateLabel(series.endDate))]])}${item.isOverride?notice('Changed for this date','This class has its own schedule details. Other dates follow the recurring schedule.'):''}${item.isCoachOverride?notice('Coach set for this date','This assignment stays in place when the default coach changes. Timetable changes still apply unless this date also has its own schedule.'):''}<p class="hl-small hl-muted">Booking closes 30 minutes before class. The penalty-free cancellation cutoff is 6 hours before. Joining the waitlist does not reserve allowance.</p>`,act('Done','close-dialog')+(!cancelled?coachAssignmentButton(item,day)+act('Edit class','class-edit','primary',`data-class="${esc(id)}" data-day="${day}"`):''));
};
adminActions['a-series']=()=>{
 const id=adminState.selectedClassId,date=csDate(adminState.rosterDay),series=csSeries(id,date),dates=csDates(date,csWindow.end).filter(day=>csOccurrence(id,day));
 showDialog('Recurring schedule',`${details([['Class',esc(series.title)],['Repeats',esc(aRepeatLabel(series))],['Default coach',esc(series.coach||'No default coach')],['Scheduled through',esc(ceDateLabel(series.endDate))],['Scheduled dates from here',String(dates.length)],['Existing bookings',String(dates.reduce((sum,day)=>sum+csBooked(id,day),0))]])}<p class="hl-small hl-muted">Use Edit class to change this date or future classes. Dates with their own schedule keep those details. Coach assignments are separate. Booked dates cannot be removed from the schedule.</p>`,act('Done','close-dialog')+act('Edit class','class-edit','primary'));
};
adminActions['a-exception']=()=>classEditorOpen(adminState.selectedClassId,adminState.rosterDay);
adminActions['a-exception-save']=()=>toast('Review this class in the class editor before saving.');
adminActions['a-cancel-class']=()=>{
 const item=csOccurrence('beginner-muay',16);if(!item)return;
 aModal('Cancel this class date?',`<p>${esc(item.title)} · ${esc(aDayLabel(16))} · ${esc(demoClassRange(item))}.</p><p>${item.booked} confirmed bookings and ${item.waitlist} waitlist entries. Other dates stay unchanged.</p><p>Release reserved allowance or pack units once, close the waitlist and queue cancellation notices in this simulation. No late-cancellation penalty applies.</p>${notice('Review any refund separately','Cancellation does not automatically refund money. No messages are sent from this preview.')}`,'a-cancel-class-confirm','Cancel 16 October','danger');
};
adminActions['a-cancel-class-confirm']=()=>{
 const item=csOccurrence('beginner-muay',16);if(!item||!aTimetableException(aRosterClass(),adminState.rosterDay))return;
 adminState.cancelledClassSnapshot={...item};adminState.occurrenceCancelled=true;csState.revision++;
 aLog('Provider cancelled class','OCC-1016-MT',item.booked+' allocations released; '+item.waitlist+' waitlist entries closed');aDone('Class cancelled. Bookings and waitlist entries closed.');
};
adminActions['a-waitlist']=()=>{
 const item=csOccurrence('beginner-muay',16)||adminState.cancelledClassSnapshot||csSeries('beginner-muay',16);
 aModal('Friday 16 October · waitlist',`<p>${esc(item.title)} · ${esc(demoClassRange(item))}.</p>${adminState.occurrenceCancelled?notice('This class was cancelled','Both waitlist entries are closed. No member can be promoted into the cancelled date.'):`${table(['Position','Member','Eligibility'],[['1','Emi Tan','No available weekly use · skip with reason'],['2','Rohan Singh','Eligible · one weekly/monthly use available']])}<p>When a place opens before the cutoff, confirm the eligible member’s booking and reserve their allowance together. Direct bookings cannot bypass the waitlist. This preview does not perform automatic promotions.</p>`}`,null);
};
