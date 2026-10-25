// Owner summaries and their destinations read the same fictional records.
function aDirectoryMembers(){
 const members=[
  {id:'maya',name:'Maya Chen',initials:'MC',description:'Adult · Striking + Grappling',detail:aMayaAvailable(),action:go('Membership','a-membership'),active:!aMember().membershipEnded&&!aMember().cancellationEffective},
  {id:'ava',name:'Ava Chen',initials:'AC',description:'Age 12 · Taekwondo',detail:'1 used · 1 reserved · 0 available this week',action:act('Guardian permissions','a-guardian'),active:true,family:true},
  {id:'leo',name:'Leo Chen',initials:'LC',description:'Age 9 · Taekwondo',detail:'0 used · 1 reserved · 1 available this week',action:act('View child record','a-child'),active:true,family:true},
  {id:'eli',name:'Eli Chen',initials:'EC',description:'Age 10 · Taekwondo juniors',detail:'2 classes per week · 8 per billing month',active:true,family:true},
  {id:'owen',name:'Owen Clarke',initials:'OC',description:'Adult · Class pack',detail:'Individual class balance',action:act('View pack history','a-unit-ledger'),active:true},
  {id:'noah',name:'Noah Reed',initials:'NR',description:'Adult · Gym membership',detail:adminState.payment==='paid'?'Renewal paid':'Payment grace ends 14 Oct at 9:00am',action:act('Review invoice','a-review-noah-payment'),active:true},
  {id:'sam',name:'Sam Nguyen',initials:'SN',description:'Adult · Gym membership',detail:'Current training waiver signed',active:true},
  {id:'miles',name:'Miles Brooks',initials:'MB',description:'Adult · Gym membership',detail:adminState.disputeResolved?'Payment dispute closed':'One payment under dispute review',action:act('View payment dispute','a-dispute'),active:true}
 ];
 if(adminState.trial==='converted')members.push({id:'alex',name:'Alex Rivera',initials:'AR',description:'Adult · Striking + Grappling',detail:'Membership started 9 Oct · payment verified',action:act('View membership','a-trial'),active:true});
 return members;
}
function aMemberDirectory(){
 const members=aDirectoryMembers().filter(member=>adminState.peopleFilter!=='family'||member.family);
 return `<div class="hl-between"><p class="hl-small hl-muted">${members.length} ${members.length===1?'member':'members'}</p><div class="hl-row">${field('Show',`<select class="hl-select" id="a-person-filter"><option value="all" ${adminState.peopleFilter==='all'?'selected':''}>All members</option><option value="family" ${adminState.peopleFilter==='family'?'selected':''}>Chen children</option></select>`)}${act('Apply filter','a-filter-people')}</div></div>${table(['Member','Membership / allowance','Action'],members.map(member=>[person(member.name,member.description,member.initials),`${badge(member.active?'Active':'Ended',member.active?'success':'neutral')}<p class="hl-small hl-muted">${esc(member.detail)}</p>`,act('Open member','a-member-record','secondary',`data-member="${member.id}" aria-label="Open ${esc(member.name)}"`)]))}`;
}
function aSelectedMember(){return aDirectoryMembers().find(member=>member.id===adminState.selectedMemberId)||aDirectoryMembers()[0];}
function aOwnerMemberHtml(){
 const member=aSelectedMember();
 const membershipAction=['ava','leo'].includes(member.id)?'':member.action||'';
 let content=section('Membership',`${details([['Status',member.active?'Active':'Ended'],['Current membership',member.description.split(' · ').slice(1).join(' · ')],['Class balance',member.detail]])}${membershipAction?'<div class="hl-row">'+membershipAction+'</div>':''}`);
 if(member.id==='maya')content+=`${section('Bookings & attendance',aMember().booked?`${details([['Class',esc((csOccurrence(aMember().bookingClassId,aBookingDay(aMember().bookingDate))||csSeries(aMember().bookingClassId)||demoClass('beginner-muay')).title)],['When',esc(aMemberBookingLabel())],['Status',aMember().attended?'Attended':'Booked']])}${act('Open class record','a-open-maya-booking')}`:aMayaBookingPending()?`${notice('Booking confirmation pending','Check the existing request before making another booking.','warning')}${act('Check booking status','a-review-pending-booking')}`:'<p>No current booking.</p>')}${section('Forms',`<div class="hl-between"><div><h3>Martial arts participation waiver</h3><p class="hl-muted hl-small">Version 3.1</p>${badge(aMember().waiverSigned?'Signed':'Signature required',aMember().waiverSigned?'success':'warning')}</div>${act('Review current form','a-maya-form')}</div>`)}`;
 if(member.id==='ava')content+=`<div class="hl-grid">${section('Authorized adults',`<div class="hl-list-row"><div>${person('Morgan Chen','Verified guardian · Ava Chen','MC')}<p class="hl-small">${badge(adminState.guardianBooking?'Booking granted':'Booking revoked',adminState.guardianBooking?'success':'warning')} ${badge('Signing granted','success')} ${badge('Billing granted','success')}</p></div>${act('Review permissions','a-guardian')}</div><div class="hl-list-row"><div>${person('Jamie Chen','Payer & emergency contact','JC')}<p class="hl-muted hl-small">Billing only · no booking, signature or coaching access</p></div>${act('View relationship','a-payer','ghost')}</div>`)}${section('Taekwondo progression',`<h3>${adminState.rankMode==='off'?'Rank tracking is off':esc(adminState.rank)}</h3><p class="hl-muted">${adminState.rankMode==='off'?'This program is not recording ranks.':adminState.rankMode==='history'?'Rank history does not restrict bookings.':'Juniors foundations requires yellow belt or higher.'}</p><div class="hl-row">${adminState.rankMode!=='off'?act('Record promotion','a-promote')+act('View progression','a-rank-history','ghost'):''}</div>`)}</div>${section('Signed forms',`<h3>Martial arts waiver · v3.1</h3><p>Signed by Morgan Chen on 2 October 2026 at 10:14 PDT.</p>${act('Inspect signed copy','a-waiver-evidence')}`)}`;
 if(member.id==='leo')content+=section('Authorized adults',`${details([['Guardian','Morgan Chen · verified booking and signing permissions'],['Emergency contact','Jamie Chen']])}<p class="hl-muted hl-small">Leo’s class balance is separate from Ava’s. Review his permissions before he gains independent control as an adult.</p>`);
 if(member.id==='owen')content+=section('Attendance',`<h3>8 October · Beginner Muay Thai</h3><p>${adminState.correction?'Present · correction saved; original no-show retained.':'No-show recorded · one pack unit used.'}</p>${act(adminState.correction?'View correction':'Correct attendance','a-correction')}`);
 if(member.id==='sam')content+=section('Attendance',`<h3>9 October · Beginner Muay Thai</h3><p>Present · membership use settled once.</p>${act('View attendance record','a-attendance-detail','secondary','data-person="sam"')}`);
 return workspaceBack('Members','a-people')+content;
}
function aOwnerRosterHtml(){
 const item=aRosterClass(),day=adminState.rosterDay,m=aMember(),booked=aRosterBooked(),sample=aRosterSample(),cancelled=aOccurrenceCancelled(item,day),exception=aTimetableException(item,day);
 const rows=[];
 if(booked)rows.push([person('Maya Chen','Adult · Striking + Grappling','MC'),`${badge(m.waiverSigned?'Current waiver signed':'Required waiver pending',m.waiverSigned?'success':'warning')}<p class="hl-muted hl-small">1 ${m.funding==='pack'?'pack unit':'membership allocation'} ${m.attended?'settled':'held'}</p>`,badge(m.attended?'Present':'Booked',m.attended?'success':'neutral'),`<div class="hl-row">${m.attended?act('View attendance','a-attendance-detail','secondary','data-person="maya"'):day===9?act('Check in','a-check-in'):act('Check-in opens on class day','a-check-in','secondary','disabled')}${act('Booking details','a-owner-booking-detail','ghost')}</div>`]);
 if(sample)rows.push(
  [person('Owen Clarke','Adult · 10-class pack','OC'),badge('1 unit reserved','neutral'),badge('Booked','neutral'),act('View pack history','a-unit-ledger','ghost')],
  [person('Noah Reed','Adult · invoice in grace','NR'),badge(adminState.payment==='paid'?'Current':'Grace until 14 Oct',adminState.payment==='paid'?'success':'warning'),badge('Booked','neutral'),act('Review invoice','a-review-noah-payment','ghost')],
  [person('Sam Nguyen','Adult · current consent','SN'),badge('Membership use settled','success'),badge('Present','success'),act('View attendance record','a-attendance-detail','ghost','data-person="sam"')]
 );
 let content=workspaceBack('Classes','a-timetable')+`<div class="hl-between"><div class="hl-row">${badge(cancelled?'Cancelled':aRosterSeats().replace(' / ',' of ')+' booked',cancelled?'danger':'neutral')}${sample?badge((12+(booked&&m.attended?1:0))+' checked in','neutral'):''}${!cancelled&&csWaitlisted(item.id,day)?badge(csWaitlisted(item.id,day)+' waitlisted','warning'):''}</div>${act('Class details','a-class-detail','ghost',`data-class="${item.id}" data-day="${day}"`)}</div>`;
 if(cancelled)content+=notice('This class was cancelled','Bookings and waitlist entries are closed. Reserved allowance was released without a late-cancellation penalty.','warning');
 const queued=csState.notifications.filter(entry=>entry.id===item.id&&entry.date===csDate(day));
 if(queued.length){const latest=queued.at(-1);content+=notice('Class-change notice queued',`${latest.bookings} ${latest.bookings===1?'booking':'bookings'}${latest.waitlist?' and '+latest.waitlist+' waitlist '+(latest.waitlist===1?'entry':'entries'):''} included in this preview. No messages are sent.`,'success');}
 content+=section('Roster',rows.length?table(['Participant','Eligibility / funding','Attendance','Action'],rows):`<p class="hl-muted">${cancelled?'No active bookings.':csBooked(item.id,day)?'Participant details are not included for this class in the demo.':'No bookings yet. Members can book this class from their portal.'}</p>`,rows.length?'<span class="hl-muted hl-small">Selected sample records shown; the booking total includes the remaining participants.</span>':'');
 if(sample&&!booked)content+=section('Book for a member',`<div class="hl-between"><div>${person('Maya Chen','Striking + Grappling','MC')}<p class="hl-muted hl-small">${m.booked?'Already booked: '+esc(aMemberBookingLabel()):aMayaBookingPending()?'Booking confirmation pending':aMayaAvailable()}</p></div>${act(m.booked?'View existing booking':aMayaBookingPending()?'Check booking status':'Book for Maya',m.booked?'a-open-maya-booking':aMayaBookingPending()?'a-review-pending-booking':'a-check-in')}</div>`);
 if(sample)content+=`<div class="hl-row">${act('Review walk-in','a-walk-in')}${act('Past attendance','a-owen-record','ghost')}</div>`;
 if(exception)content+=section('Manage this date',`<p>Changes apply only to Friday 16 October. Other dates in the daily series keep their times.</p><div class="hl-row">${act('Cancel this date','a-cancel-class','danger',cancelled?'disabled':'')}${act('Review waitlist','a-waitlist','ghost')}</div>`);
 if(csSeries(item.id,day)?.repeat!=='once'&&!cancelled)content+=`<div class="hl-row">${act('Review recurring series','a-series','ghost')}</div>`;
 return content;
}
function aPaymentsToReview(){
 const cases=[];
 if(adminState.payment!=='paid')cases.push({id:'INV-2042',person:'Noah Reed',description:'Renewal · CAD 149',status:adminState.payment==='pending'?'Payment pending':'Payment failed',detail:'Grace ends 14 Oct at 9:00am',action:'a-review-noah-payment',label:'Review invoice'});
 if(['pending','failed'].includes(adminState.refund))cases.push({id:'RF-882',person:'Owen Clarke',description:'Refund · '+aMoney(adminState.refundAmount),status:adminState.refund==='pending'?'Refund pending':'Refund failed',detail:'Original payment PAY-882',action:'a-refund',label:'Review refund'});
 if(!adminState.disputeResolved)cases.push({id:'DP-18',person:'Miles Brooks',description:'Payment dispute · PAY-776',status:adminState.disputeReviewed?'Awaiting provider outcome':'Review required',detail:adminState.disputeReviewed?'Assigned to Alex Morgan':'Reviewer needed',action:'a-dispute',label:'Review dispute'});
 if(adminState.trial==='pending')cases.push({id:'PER-331',person:'Alex Rivera',description:'First membership payment · CAD 149',status:'Payment pending',detail:'Membership starts after confirmed payment',action:'a-trial',label:'Check payment'});
 if(aMember().payment==='pending'||uiState.scenario==='debt'&&aMember().payment!=='settled')cases.push({id:'INV-1042',person:'Maya Chen',description:'Renewal · CAD 149',status:aMember().payment==='pending'?'Payment pending':'Payment failed',detail:'Grace ends 12 Oct at 11:59pm',action:'a-review-maya-payment',label:'Review invoice'});
 return cases;
}
function aBillingTabs(){
 return `<div class="hl-tabs" role="group" aria-label="Billing view">${act('All billing','a-billing-all',adminState.billingFilter==='all'?'primary':'secondary',`aria-pressed="${adminState.billingFilter==='all'}"`)}${act('Needs attention ('+aPaymentsToReview().length+')','a-billing-attention',adminState.billingFilter==='attention'?'primary':'secondary',`aria-pressed="${adminState.billingFilter==='attention'}"`)}</div>`;
}
function aPaymentAttentionView(){
 const cases=aPaymentsToReview();
 return section('Payments needing attention',cases.length?`<p class="hl-small hl-muted">${cases.length} ${cases.length===1?'case needs':'cases need'} attention. Pending payments, refunds and open disputes stay here until their outcomes are confirmed.</p>${table(['Member','Payment','Status','Action'],cases.map(item=>[esc(item.person),`${esc(item.id)}<p class="hl-small hl-muted">${esc(item.description)}</p>`,`${badge(item.status,'warning')}<p class="hl-small hl-muted">${esc(item.detail)}</p>`,act(item.label,item.action)]))}`:`<div class="hl-empty">${icon('circle-check')}<h3>No payments need attention</h3><p>There are no failed or pending payments, refunds, or open disputes to review.</p>${act('View all billing','a-billing-all')}</div>`);
}
function aTodayPaymentAttention(){
 const cases=aPaymentsToReview();
 return cases.map(item=>`<div class="hl-list-row"><div>${badge('Payment','warning')}<h3>${esc(item.person)} · ${esc(item.status.toLowerCase())}</h3><p class="hl-muted hl-small">${esc(item.id)} · ${esc(item.description)}</p></div>${act('Review',item.action)}</div>`).join('');
}
const ownerRecordActions={
 'a-open-members':()=>{adminState.peopleFilter='all';navigate('a-people');},
 'a-open-class-roster':()=>aOpenRoster('beginner-muay',9),
 'a-open-roster':button=>aOpenRoster(button.dataset.class,Number(button.dataset.day)),
 'a-open-maya-booking':()=>{if(aMember().booked)aOpenRoster(aMember().bookingClassId||'beginner-muay',aBookingDay(aMember().bookingDate));},
 'a-owner-booking-detail':()=>{if(!aRosterBooked())return;aModal('Maya Chen · booking',details([['Class',esc(aRosterClass().title)],['When',esc(aRosterSubtitle())],['Status',aMember().attended?'Attended':'Confirmed'],['Funding',aMember().funding==='pack'?'One paid pack unit':'Membership allowance'],['Amount due','CAD 0.00']]),null);},
 'a-maya-record':()=>{adminState.selectedMemberId='maya';navigate('a-member');},
 'a-owen-record':()=>{adminState.selectedMemberId='owen';navigate('a-member');},
 'a-maya-form':()=>{aMember().profile='adult';navigate('m-forms');},
 'a-open-payment-attention':()=>{if(!aPaymentsToReview().length)return;adminState.billingFilter='attention';navigate('a-billing');},
 'a-billing-attention':()=>{adminState.billingFilter='attention';render();},
 'a-billing-all':()=>{adminState.billingFilter='all';render();},
 'a-member-record':button=>{const member=aDirectoryMembers().find(item=>item.id===button.dataset.member);if(!member)return;adminState.selectedMemberId=member.id;navigate('a-member');},
 'a-review-noah-payment':()=>aModal('Noah Reed · INV-2042',`${details([['Amount','CAD 149'],['Status',adminState.payment==='paid'?'Paid':adminState.payment==='pending'?'Payment pending':'Payment failed'],['Grace deadline','14 Oct · 9:00am']])}<p>Check the existing payment request before retrying. A card update does not pay this invoice.</p>`,adminState.payment==='paid'?null:adminState.payment==='pending'?'a-payment-result':'a-payment-preview',adminState.payment==='pending'?'Check payment status':'Review retry'),
 'a-review-maya-payment':()=>aModal('Maya Chen · INV-1042',`${details([['Amount','CAD 149'],['Billing period','5 Oct–4 Nov'],['Status',aMember().payment==='settled'?'Paid':aMember().payment==='pending'?'Payment pending':'Payment failed'],['Grace deadline','12 Oct · 11:59pm']])}${notice('Sample payment result','The sample processor confirms this invoice has been paid. Apply the result to this invoice only; class limits and other memberships stay unchanged.')}`,aMember().payment==='settled'?null:'a-maya-payment-settle','Apply verified sample settlement'),
 'a-maya-payment-settle':()=>{aMember().payment='settled';aLog('Invoice settlement verified','INV-1042','Maya’s invoice only; membership terms unchanged');aDone('INV-1042 paid. Maya’s invoice is no longer in the review list.');},
 'a-dispute-result':()=>aModal('Provider outcome · DP-18',`${notice('Verified sample outcome','The sample provider has closed the dispute in the gym’s favour. No new charge or refund is created.')}<p>Release the hold on unused services covered by PAY-776 after checking current membership access. Keep the dispute history. Previously cancelled bookings must be booked again.</p>`,adminState.disputeResolved?null:'a-dispute-settle','Apply verified sample outcome'),
 'a-dispute-settle':()=>{adminState.disputeResolved=true;aLog('Dispute outcome verified','DP-18','Sample provider outcome: closed in gym’s favour; affected services reviewed');aDone('DP-18 closed. Previously cancelled bookings remain cancelled.');}
};
