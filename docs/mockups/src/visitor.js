/* Visitor drafts stay in memory, separate from the member demo and saved widget state. */
const visitorState={
 form:{participant:'adult',first:'',last:'',email:'',childFirst:'',childLast:'',childAge:'',ageConfirmed:false,guardianConsent:false,marketing:false},
 verifiedAccount:null,verifiedGuardian:null,verification:null,guardianReview:null,
 selectedPlan:null,termsAccepted:false,paymentQuote:null,trial:null,activation:null,
 waivers:{},waiverTarget:null,inquiry:null
};
const visitorLimits={foundations:{weekly:1,monthly:null},'striking-grappling':{weekly:2,monthly:8},unlimited:{weekly:null,monthly:null}};
const visitorWaiverText='I understand that martial arts training involves physical contact and a risk of injury. I agree to follow the coach’s instructions, disclose relevant participation restrictions and stop if I feel unwell. I understand the gym’s emergency process. This is sample agreement text for this preview.';
const visitorName=(first,last)=>[first.trim(),last.trim()].filter(Boolean).join(' ');
const visitorAccountKey=()=>JSON.stringify([visitorState.form.first.trim(),visitorState.form.last.trim(),visitorState.form.email.trim().toLowerCase(),visitorState.form.ageConfirmed]);
function visitorIdentity(){
 const f=visitorState.form,child=f.participant==='child',accountName=visitorName(f.first,f.last);
 const identity={kind:child?'child':'adult',name:child?visitorName(f.childFirst,f.childLast):accountName,age:child?Number(f.childAge):null,accountName,email:f.email.trim(),accountKey:visitorAccountKey()};
 identity.key=JSON.stringify([identity.kind,identity.name,identity.age,identity.accountKey]);
 identity.guardianKey=JSON.stringify([identity.key,f.guardianConsent]);
 return identity;
}
const visitorEmailVerified=()=>visitorState.verifiedAccount===visitorAccountKey();
const visitorGuardianVerified=()=>visitorState.form.participant!=='child'||visitorState.verifiedGuardian===visitorIdentity().guardianKey;
const visitorReady=()=>visitorEmailVerified()&&visitorGuardianVerified();
const visitorWaiver=identity=>visitorState.waivers[identity.key]||null;
const visitorPlanFingerprint=plan=>JSON.stringify([plan.id,plan.name,plan.price,plan.period,plan.description,plan.features,plan.visible]);
function visitorKnownPlan(plan){
 const original=webInitialContent.plans.find(item=>item.id===plan.id);
 return !!original&&visitorPlanFingerprint(original)===visitorPlanFingerprint(plan);
}
function visitorPlanCurrent(){
 const selected=visitorState.selectedPlan;
 const current=selected&&websiteState.published.plans.find(plan=>plan.id===selected.plan.id&&plan.visible);
 return !!current&&visitorPlanFingerprint(current)===selected.fingerprint;
}
function visitorRequireCurrentPlan(){
 if(visitorState.activation)return false;
 if(!visitorPlanCurrent()||websiteState.view==='draft'){
  visitorState.termsAccepted=false;visitorState.paymentQuote=null;closeDialog({immediate:true});render();
  toast('This offer changed. Choose the current published membership and review its terms.');return false;
 }
 return true;
}
function visitorSelectPlan(planId){
 if(visitorState.activation){navigate('v-enroll');toast('Your sample membership is already active. No second payment was created.');return;}
 if(websiteState.view==='draft'){toast('Publish this pricing before joining.');return;}
 const plan=websiteState.published.plans.find(item=>item.id===planId&&item.visible);
 if(!plan||!/^\d{1,6}(\.\d{1,2})?$/.test(String(plan.price).trim())||!Object.hasOwn(webPeriods,plan.period)){toast('Choose an available published membership.');return;}
 visitorState.selectedPlan={plan:webClone(plan),publication:websiteState.publication,fingerprint:visitorPlanFingerprint(plan)};
 visitorState.termsAccepted=false;visitorState.paymentQuote=null;visitorState.inquiry=null;
 navigate('v-enroll');
}
function visitorValidateIdentity(){
 const f=visitorState.form;
 if(!f.first.trim()||!f.last.trim()||!/^\S+@\S+\.\S+$/.test(f.email.trim())||!f.ageConfirmed){toast('Enter your first and last name, a valid email and confirm you are 18 or older.');return false;}
 if(f.participant==='child'&&(!f.childFirst.trim()||!f.childLast.trim()||!Number.isInteger(Number(f.childAge))||Number(f.childAge)<8||Number(f.childAge)>12)){toast('Enter the child’s name and age. This junior trial is for ages 8–12.');return false;}
 if(f.participant==='child'&&!f.guardianConsent){toast('Confirm you are the child’s parent or legal guardian. The gym must verify that authority separately.');return false;}
 return true;
}
function visitorInput(name,id,type='text',extra=''){
 return `<input class="hl-input" id="${id}" data-visitor-field="${name}" type="${type}" value="${esc(visitorState.form[name])}" ${extra}>`;
}
function visitorIdentityForm(){
 const f=visitorState.form,child=f.participant==='child';
 return `${field('Who is training?',`<select class="hl-select" id="v-person" data-visitor-field="participant"><option value="adult" ${!child?'selected':''}>Myself · adult</option><option value="child" ${child?'selected':''}>My child</option></select>`)}${child?`<div class="hl-grid">${field('Child’s first name',visitorInput('childFirst','v-child-first','text','autocomplete="off" maxlength="60"'))}${field('Child’s last name',visitorInput('childLast','v-child-last','text','autocomplete="off" maxlength="60"'))}</div>${field('Child’s age',visitorInput('childAge','v-child-age','number','min="8" max="12" inputmode="numeric"'))}<h3>Parent or legal guardian</h3>`:''}<div class="hl-grid">${field('Your first name',visitorInput('first','v-first','text','autocomplete="given-name" maxlength="60"'))}${field('Your last name',visitorInput('last','v-last','text','autocomplete="family-name" maxlength="60"'))}</div>${field('Your email',visitorInput('email','v-email','email','autocomplete="email" maxlength="160"'))}<label class="hl-check"><input id="v-confirm-age" data-visitor-field="ageConfirmed" type="checkbox" ${f.ageConfirmed?'checked':''}> I am 18 or older.</label>${child?`<label class="hl-check"><input id="v-guardian-consent" data-visitor-field="guardianConsent" type="checkbox" ${f.guardianConsent?'checked':''}> I am this child’s parent or legal guardian and request permission to book and sign for them.</label><p class="hl-small hl-muted">Email verification does not prove guardian authority. The gym reviews that separately.</p>`:''}<div id="v-identity-status" aria-live="polite">${visitorIdentityStatus()}</div>`;
}
function visitorIdentityStatus(){
 if(!visitorEmailVerified())return '<p class="hl-small hl-muted">Verify your email before reserving a trial or paying. This preview sends no email.</p>';
 return `<p class="hl-small">${badge('Email verified','success')}${visitorState.form.participant==='child'?' '+badge(visitorGuardianVerified()?'Guardian authority verified':'Guardian review needed',visitorGuardianVerified()?'success':'warning'):''}</p>`;
}
function visitorNextAction(context){
 const attrs=`data-context="${context}"`;
 if(!visitorEmailVerified())return act('Verify email','visitor-verify','primary',attrs);
 if(!visitorGuardianVerified())return act('Review guardian verification','visitor-guardian','primary',attrs);
 return context==='trial'?act('Reserve free trial','visitor-reserve','primary'):act('Review sample payment','visitor-pay','primary');
}
function visitorRefreshFormStatus(){
 const status=root.querySelector('#v-identity-status');if(status)status.innerHTML=visitorIdentityStatus();
 const actions=root.querySelector('#v-main-actions');if(actions)actions.innerHTML=visitorNextAction(actions.dataset.context);
 const terms=root.querySelector('#v-terms');if(terms)terms.checked=visitorState.termsAccepted;
}
function visitorCaptureField(event){
 const input=event.target.closest('[data-visitor-field]');if(!input)return;
 const name=input.dataset.visitorField;
 if(name==='termsAccepted'){visitorState.termsAccepted=input.checked;return;}
 if(!Object.hasOwn(visitorState.form,name))return;
 const value=input.type==='checkbox'?input.checked:input.value;
 if(visitorState.form[name]===value)return;
 visitorState.form[name]=value;
 if(name!=='marketing'){visitorState.form.marketing=false;visitorState.termsAccepted=false;visitorState.paymentQuote=null;visitorState.inquiry=null;}
 if(name==='participant'){render();return;}
 visitorRefreshFormStatus();
}
root.addEventListener('input',visitorCaptureField);
root.addEventListener('change',visitorCaptureField);
function visitorClass(identity=visitorIdentity()){
 const adultClass=csOccurrence('beginner-muay',9)||demoClass('beginner-muay');
 return identity.kind==='child'?{title:'Taekwondo juniors',when:'Fri, 9 Oct 2026 · 4:30pm–5:15pm',eligibility:'Ages 8–12',room:'Mat 1'}:{title:adultClass.title,when:'Fri, 9 Oct 2026 · '+demoClassRange(adultClass),eligibility:'Adults · beginners welcome',room:adultClass.space};
}
function visitorDialogError(message){
 const body=root.querySelector('#hl-overlay:not([hidden]) .hl-dialog-body');
 if(!body){toast(message);return;}
 let container=body.querySelector('[data-visitor-error]');
 if(!container){container=document.createElement('div');container.dataset.visitorError='';body.appendChild(container);}
 container.innerHTML=notice('Review required',esc(message),'danger');
 container.scrollIntoView({block:'nearest'});refreshIcons();
}
function visitorWaiverAction(identity,record){
 return act(visitorWaiver(identity)?'View signed waiver':'Read & sign waiver','visitor-waiver',visitorWaiver(identity)?'secondary':'primary',`data-record="${record}"`);
}
function visitorTrialPage(){
 const trial=visitorState.trial;
 if(trial)return section(esc(trial.class.title),`<div class="hl-stack">${details([['Participant',esc(trial.identity.name)],...(trial.identity.kind==='child'?[['Guardian',esc(trial.identity.accountName)+' · authority verified']]:[]),['When',esc(trial.class.when)],['Room',esc(trial.class.room)],['Paid','CAD 0 · free trial'],['Waiver',visitorWaiver(trial.identity)?'Signed · v3.1':'Required before attendance']])}<div class="hl-row">${visitorWaiverAction(trial.identity,'trial')}${go('View memberships','v-pricing')}</div><p class="hl-small hl-muted">Sample reservation only. ${visitorWaiver(trial.identity)?'Keep this confirmation for your class.':'Complete the training waiver before attending.'}</p></div>`);
 const c=visitorClass();
 return `<div class="hl-grid-wide visitor-trial-grid">${section('Your details',`${visitorIdentityForm()}<div id="v-main-actions" data-context="trial" class="hl-row">${visitorNextAction('trial')}</div>`)}${section(esc(c.title),`<div class="hl-stack">${details([['When',esc(c.when)],['Who can attend',esc(c.eligibility)],['Room',esc(c.room)],['Cost','One free trial']])}<p class="hl-small hl-muted">Reserve after verification. A signed training waiver is required before attendance.</p></div>`)}</div>`;
}
function visitorOfferSummary(plan){
 return `<div class="hl-stack"><p><strong class="hl-summary-number">${esc(webMoney(plan.price))}</strong> <span class="hl-small hl-muted">${esc(webPeriods[plan.period])}</span></p><p class="hl-small">${esc(plan.description)}</p><ul class="web-feature-list">${plan.features.map(feature=>`<li>${esc(feature)}</li>`).join('')}</ul></div>`;
}
function visitorMembershipTerms(plan){
 const limits=visitorLimits[plan.id];
 return details([['Training',limits.weekly===null?'Unlimited eligible classes':`${limits.weekly} class${limits.weekly===1?'':'es'} per training week${limits.monthly===null?' · no additional monthly cap':`; ${limits.monthly} per billing month`}`],['First cycle','9 Oct–8 Nov 2026'],['Renewal',esc(webMoney(plan.price))+' each month on the 9th'],...(limits.weekly===null?[]:[['Training weeks','9–15 Oct, then each Friday; final short week 6–8 Nov has the full weekly cap'],['Counting','A reservation holds one class; attendance uses that same class. Unused classes do not roll over.']]),['Cancellation','2 calendar months’ notice; ends at the first billing boundary on or after that notice period. Renewals remain due until then unless the owner approves an exception.'],['Waiver','Required before attendance'],['Tax','Included in this sample price']]);
}
function visitorEnrollmentPage(){
 const active=visitorState.activation;
 if(active)return section(esc(active.plan.name),`<div class="hl-stack">${details([['Member',esc(active.identity.name)],['Paid',esc(webMoney(active.plan.price))],['Billing cycle','9 Oct–8 Nov 2026'],['Next payment','9 Nov · '+esc(webMoney(active.plan.price))],['Class access',active.limits.weekly===null?'Unlimited eligible classes':`${active.limits.weekly} per training week${active.limits.monthly===null?'':`; ${active.limits.monthly} per billing month`}`],['Waiver',visitorWaiver(active.identity)?'Signed · v3.1':'Required before attendance']])}<p class="hl-small hl-muted">Sample payment confirmed once. ${visitorWaiver(active.identity)?(visitorState.trial?.identity.key===active.identity.key?'Your trial and signed waiver stay with this participant.':'Your signed waiver stays with this membership.'):'Sign the training waiver before attending.'}</p><div class="hl-row">${visitorWaiverAction(active.identity,'activation')}${go('View memberships','v-pricing')}</div></div>`);
 const selection=visitorState.selectedPlan;
 if(!selection)return section('Choose a membership',`<div class="hl-stack"><p>Choose a published plan to see its price and terms before joining.</p><div class="hl-row">${go('View memberships','v-pricing','primary')}${go('Try a class first','v-trial','ghost')}</div></div>`);
 const plan=selection.plan,current=visitorPlanCurrent(),known=visitorKnownPlan(plan),adult=visitorState.form.participant==='adult';
 let continuation;
 if(!current)continuation=notice('This offer changed','Return to memberships and review the current published offer. No payment has been taken.','warning',go('View current memberships','v-pricing','primary'));
 else if(!known||!adult)continuation=section(!adult?'Ask about a junior membership':'Confirm this plan’s terms',`<div class="hl-stack"><p>${!adult?'This published plan is for adults. Your child remains the selected participant. Ask the gym about junior options, or choose “Myself · adult” above to join for yourself.':'The published offer has changed from the sample contract. The gym must confirm class limits, billing, eligibility and cancellation terms before you accept or pay.'}</p>${visitorState.inquiry?notice('Request preview prepared',`For ${esc(visitorState.inquiry.identity.name)} · ${esc(visitorState.inquiry.plan.name)}. No request was sent and no payment was taken.`,'success'):act('Preview request for details','visitor-request-details','primary')}<p class="hl-small hl-muted">${!adult?'No junior paid plan is defined in this preview.':'The displayed price and features are preserved; they have not been converted into membership rules.'}</p></div>`);
 else continuation=section('Membership terms',`<div class="hl-stack">${visitorMembershipTerms(plan)}<label class="hl-check"><input id="v-terms" data-visitor-field="termsAccepted" type="checkbox" ${visitorState.termsAccepted?'checked':''}> I accept membership policy v2.1, including these class limits, billing and cancellation terms.</label><div id="v-main-actions" data-context="enroll" class="hl-row">${visitorNextAction('enroll')}</div><p class="hl-small hl-muted">This preview does not collect card details or charge money. Your membership activates only after a sample payment confirmation.</p></div>`);
 return `<div class="hl-stack">${workspaceBack('Memberships','v-pricing')}<div class="hl-grid-wide">${section('Participant & payer',visitorIdentityForm())}${section(esc(plan.name),visitorOfferSummary(plan))}</div>${continuation}</div>`;
}
function visitorOpenVerification(context){
 if(context==='enroll'&&!visitorRequireCurrentPlan())return;
 if(!visitorValidateIdentity())return;
 visitorState.verification={context,accountKey:visitorAccountKey(),planFingerprint:context==='enroll'?visitorState.selectedPlan?.fingerprint:null};
 showDialog('Verify your email',`<div class="hl-stack">${details([['Email',esc(visitorState.form.email.trim())],['Account holder',esc(visitorName(visitorState.form.first,visitorState.form.last))]])}<p>This simulates opening a verification link. No email is sent. Verification does not create a trial booking or take payment.</p></div>`,act('Back','close-dialog')+act('Simulate verified email','visitor-email-confirm','primary'));
}
function visitorOpenGuardian(){
 if(!visitorValidateIdentity()||!visitorEmailVerified())return toast('Verify the guardian’s email first.');
 const identity=visitorIdentity();if(identity.kind!=='child')return;
 visitorState.guardianReview=webClone(identity);
 showDialog('Review guardian authority',`<div class="hl-stack">${details([['Child',esc(identity.name)+' · age '+identity.age],['Guardian',esc(identity.accountName)],['Email','Verified'],['Requested permissions','Book this child’s trial and sign the training waiver']])}<p>The gym must verify the relationship. A shared email or payment method is not proof.</p><label class="hl-check"><input type="checkbox" id="v-guardian-checked"> In this simulation, the gym has checked the guardian’s authority for this child.</label></div>`,act('Back','close-dialog')+act('Simulate verified authority','visitor-guardian-confirm','primary'));
}
function visitorOpenWaiver(record){
 const source=record==='activation'?visitorState.activation:visitorState.trial;if(!source)return;
 const identity=source.identity,signed=visitorWaiver(identity);visitorState.waiverTarget=webClone(identity);
 showDialog(signed?'Signed training waiver · v3.1':'Read & sign training waiver',`<div class="hl-stack">${details([['Participant',esc(identity.name)],['Signer',esc(identity.accountName)],['Authority',identity.kind==='child'?'Verified parent or legal guardian':'Adult signing for self'],['Version','3.1 · effective 1 Oct 2026']])}<p class="hl-small">${esc(visitorWaiverText)}</p>${signed?`<div class="hl-signature">${esc(signed.signer)}</div><p class="hl-small hl-muted">Accepted 9 Oct 2026. Exact text and participant retained in this preview.</p>`:`<label class="hl-check"><input id="v-waiver-consent" type="checkbox"> I have read and accept version 3.1 for ${esc(identity.name)}.</label><label class="hl-check"><input id="v-marketing" data-visitor-field="marketing" type="checkbox" ${visitorState.form.marketing?'checked':''}> Send me optional gym news and offers.</label>`}</div>`,act(signed?'Done':'Back','close-dialog')+(signed?'':act('Sign sample waiver','visitor-waiver-confirm','primary')));
}
const visitorViews={
 'v-trial':{title:()=>visitorState.trial?'Trial reserved':'Try a class at Northstar',subtitle:()=>visitorState.trial?'Your class and required waiver.':'Choose who is training, then reserve a free trial.',icon:'sparkles',navLabel:'Try a class',group:'New visitor',html:visitorTrialPage},
 'v-enroll':{title:()=>visitorState.activation?'Membership activated':'Join Northstar',subtitle:()=>visitorState.activation?'Your confirmed sample membership.':'Review your selected plan, participant and terms.',icon:'wallet-cards',navLabel:'Join Northstar',group:'New visitor',html:visitorEnrollmentPage}
};
const visitorActions={
 'visitor-verify':el=>visitorOpenVerification(el?.dataset.context||'trial'),
 'visitor-email-confirm':()=>{
  const pending=visitorState.verification;if(!pending)return;
  if(pending.context==='enroll'&&(!visitorRequireCurrentPlan()||pending.planFingerprint!==visitorState.selectedPlan?.fingerprint))return;
  if(pending.accountKey!==visitorAccountKey()||!visitorValidateIdentity()){closeDialog({immediate:true});return toast('Your details changed. Verify the current email again.');}
  visitorState.verifiedAccount=pending.accountKey;visitorState.verification=null;closeDialog({immediate:true});render();toast('Sample email verified. No booking or payment was made.');
 },
 'visitor-guardian':()=>visitorOpenGuardian(),
 'visitor-guardian-confirm':()=>{
  const identity=visitorState.guardianReview;
  if(!identity||identity.guardianKey!==visitorIdentity().guardianKey||!visitorEmailVerified())return visitorDialogError('The child or guardian details changed. Review them again.');
  if(!root.querySelector('#v-guardian-checked')?.checked)return visitorDialogError('Confirm the sample authority review before continuing.');
  visitorState.verifiedGuardian=identity.guardianKey;visitorState.guardianReview=null;closeDialog({immediate:true});render();toast('Sample guardian authority verified for '+identity.name+'.');
 },
 'visitor-reserve':()=>{
  if(visitorState.trial)return;
  if(!visitorValidateIdentity()||!visitorReady())return toast('Complete email and any guardian verification before reserving.');
  const identity=webClone(visitorIdentity());visitorState.trial={identity,class:visitorClass(identity)};closeDialog({immediate:true});render();
 },
 'visitor-waiver':el=>visitorOpenWaiver(el?.dataset.record||'trial'),
 'visitor-waiver-confirm':()=>{
  const identity=visitorState.waiverTarget;if(!identity||visitorWaiver(identity))return;
  if(identity.accountKey!==visitorAccountKey()||!visitorEmailVerified()||(identity.kind==='child'&&visitorState.verifiedGuardian!==identity.guardianKey))return visitorDialogError('Verify the original signer’s account and authority before signing this participant’s waiver.');
  if(!root.querySelector('#v-waiver-consent')?.checked)return visitorDialogError('Accept the training waiver before signing. Marketing consent is optional.');
  visitorState.waivers[identity.key]={signer:identity.accountName,participant:identity.name,text:visitorWaiverText,version:'3.1'};visitorState.waiverTarget=null;closeDialog({immediate:true});render();toast('Training waiver signed for '+identity.name+'.');
 },
 'visitor-request-details':()=>{
  if(!visitorRequireCurrentPlan()||!visitorValidateIdentity())return;
  visitorState.inquiry={identity:webClone(visitorIdentity()),plan:webClone(visitorState.selectedPlan.plan)};render();
 },
 'visitor-pay':()=>{
  if(!visitorRequireCurrentPlan()||!visitorValidateIdentity())return;
  const plan=visitorState.selectedPlan.plan;
  if(!visitorKnownPlan(plan)||visitorState.form.participant!=='adult')return toast('The gym must confirm this participant’s membership terms before payment.');
  if(!visitorReady())return toast('Verify your email before payment.');
  if(!visitorState.termsAccepted)return toast('Review and accept the membership terms before payment.');
  visitorState.paymentQuote={identity:webClone(visitorIdentity()),plan:webClone(plan),fingerprint:visitorState.selectedPlan.fingerprint,publication:visitorState.selectedPlan.publication};
  showDialog('Sample first payment',`<div class="hl-stack">${details([['Member',esc(visitorState.paymentQuote.identity.name)],['Membership',esc(plan.name)],['Due today',esc(webMoney(plan.price))],['Billing',esc(webPeriods[plan.period])+' · renews on the 9th']])}<p>No card details are collected and no money is charged. The button below simulates a verified payment-provider confirmation.</p><p class="hl-small hl-muted">Until that confirmation, no membership or class allowance is active.</p></div>`,act('Back','close-dialog')+act('Simulate confirmed payment','visitor-payment-confirm','primary'));
 },
 'visitor-payment-confirm':()=>{
  if(visitorState.activation)return;
  const quote=visitorState.paymentQuote;
  if(!quote||!visitorRequireCurrentPlan())return;
  if(!visitorState.termsAccepted||quote.identity.key!==visitorIdentity().key||!visitorReady()||quote.fingerprint!==visitorState.selectedPlan?.fingerprint||!visitorKnownPlan(quote.plan)||quote.identity.kind!=='adult')return visitorDialogError('Your details or terms changed. Review the membership again.');
  visitorState.activation={identity:quote.identity,plan:quote.plan,limits:{...visitorLimits[quote.plan.id]},publication:quote.publication,termsVersion:'2.1'};visitorState.paymentQuote=null;closeDialog({immediate:true});render();
 }
};
