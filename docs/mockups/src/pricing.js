/* Public pricing is fictional website content, independent of membership contracts. */
const webClone = value => JSON.parse(JSON.stringify(value));
const webPeriods = {month:'per month','four-weeks':'every 4 weeks',year:'per year',once:'one time'};
const webInitialContent = {
 title:'Membership plans',
 description:'Find a training routine that fits your week.',
 plans:[
  {id:'foundations',name:'Foundations',price:'99',period:'month',description:'A weekly class to build your fundamentals.',features:['1 group class per training week','Adult Muay Thai or jiu jitsu','Beginner classes included'],visible:true},
  {id:'striking-grappling',name:'Striking + Grappling',price:'149',period:'month',description:'Train in striking and grappling throughout the month.',features:['2 classes per training week','8 classes per billing month','Adult Muay Thai and jiu jitsu'],visible:true},
  {id:'unlimited',name:'Unlimited',price:'199',period:'month',description:'More room in your week for regular training.',features:['Unlimited eligible group classes','Adult Muay Thai and jiu jitsu','Class eligibility and capacity apply'],visible:true}
 ],
 featuredId:'striking-grappling',highlightLabel:'Featured plan'
};
const websiteState = {version:1,draft:webClone(webInitialContent),published:webClone(webInitialContent),publication:1,draftDirty:false,view:'published',selectedPlanId:null};
let webErrors=[];
const webValue = (id,fallback='') => root.querySelector('#'+id)?.value ?? fallback;
const webMoney = value => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',currencyDisplay:'code',minimumFractionDigits:Number(value)%1?2:0,maximumFractionDigits:2}).format(Number(value));
const webChanged = () => JSON.stringify(websiteState.draft)!==JSON.stringify(websiteState.published);
const webCurrentContent = () => websiteState.view==='draft'?websiteState.draft:websiteState.published;
const webPlan = (id,content=websiteState.draft) => content.plans.find(plan=>plan.id===id);
const webStateFits = (draft,published=websiteState.published) => new TextEncoder().encode(JSON.stringify({draft,published})).length<=10000;
function webValidate(content){
 const errors=[];
 if(!content.title.trim())errors.push({field:'web-page-title',message:'Add a page heading.'});
 if(!content.description.trim())errors.push({field:'web-page-description',message:'Add a short introduction.'});
 if(!content.plans.some(plan=>plan.visible))errors.push({message:'Show at least one plan on the public page.'});
 content.plans.forEach((plan,index)=>{
  const name=plan.name.trim()||`Plan ${index+1}`;
  if(!plan.name.trim())errors.push({planId:plan.id,message:`${name}: add a plan name.`});
  if(!/^\d{1,6}(\.\d{1,2})?$/.test(plan.price.trim())||!Number.isFinite(Number(plan.price))||Number(plan.price)<0)errors.push({planId:plan.id,message:`${name}: enter a CAD price of zero or more, with up to two decimal places.`});
  if(!Object.hasOwn(webPeriods,plan.period))errors.push({planId:plan.id,message:`${name}: choose a billing display.`});
  if(!plan.description.trim())errors.push({planId:plan.id,message:`${name}: add a description.`});
  if(!plan.features.length||plan.features.some(feature=>!feature.trim()))errors.push({planId:plan.id,message:`${name}: add at least one included feature.`});
 });
 if(content.featuredId&&!content.plans.some(plan=>plan.id===content.featuredId&&plan.visible))errors.push({message:'Choose a visible plan to highlight, or select no highlighted plan.'});
 if(content.featuredId&&!content.highlightLabel.trim())errors.push({field:'web-highlight-label',message:'Add a label for the highlighted plan.'});
 if(!webStateFits(content,content))errors.push({message:'Shorten the page or plan text so this preview can save both your draft and published pricing.'});
 return errors;
}
function webSanitizeContent(value){
 if(!value||!Array.isArray(value.plans)||!value.plans.length||value.plans.length>4)return null;
 const ids=new Set();
 const plans=[];
 for(const plan of value.plans){
  if(!plan||typeof plan.id!=='string'||!/^[-a-z0-9]{1,40}$/.test(plan.id)||ids.has(plan.id))return null;
  ids.add(plan.id);
  plans.push({id:plan.id,name:String(plan.name??'').slice(0,60),price:String(plan.price??'').slice(0,12),period:Object.hasOwn(webPeriods,plan.period)?plan.period:'month',description:String(plan.description??'').slice(0,160),features:Array.isArray(plan.features)?plan.features.slice(0,4).map(feature=>String(feature).slice(0,90)).filter(feature=>feature.trim()):[],visible:plan.visible!==false});
 }
 return {title:String(value.title??'').slice(0,80),description:String(value.description??'').slice(0,180),plans,featuredId:plans.some(plan=>plan.id===value.featuredId&&plan.visible)?value.featuredId:null,highlightLabel:String(value.highlightLabel??'').slice(0,32)};
}
function restoreWebsiteState(saved){
 if(!saved||saved.version!==1)return false;
 const draft=webSanitizeContent(saved.draft),published=webSanitizeContent(saved.published);
 if(!draft||!published||webValidate(published).length||!webStateFits(draft,published))return false;
 websiteState.draft=draft;websiteState.published=published;
 websiteState.publication=Number.isInteger(saved.publication)?Math.max(1,Math.min(9999,saved.publication)):1;
 websiteState.draftDirty=!!saved.draftDirty;
 websiteState.view='published';websiteState.selectedPlanId=null;
 webErrors=[];
 return true;
}
function webErrorMarkup(){
 return webErrors.length?`<div class="web-validation" id="web-validation" role="alert"><strong>Check pricing before publishing</strong><ul>${webErrors.map(error=>`<li>${esc(error.message)}${error.planId?act('Edit plan','web-edit','ghost',`data-plan="${esc(error.planId)}"`):''}</li>`).join('')}</ul></div>`:'';
}
function webCapturePageFields(){
 if(!root.querySelector('#web-owner-form'))return;
 const draft=websiteState.draft;
 const candidate={...draft,title:webValue('web-page-title',draft.title),description:webValue('web-page-description',draft.description),highlightLabel:webValue('web-highlight-label',draft.highlightLabel)};
 const selected=root.querySelector('input[name="web-featured-plan"]:checked');
 if(selected)candidate.featuredId=selected.value||null;
 if(!webStateFits(candidate)||!webStateFits(candidate,candidate)){
  [['web-page-title','title'],['web-page-description','description'],['web-highlight-label','highlightLabel']].forEach(([id,key])=>{const input=root.querySelector('#'+id);if(input)input.value=draft[key];});
  toast('Keep the page text shorter so this preview can save your pricing.');return;
 }
 Object.assign(draft,candidate);
}
function webDraftStatus(){
 return websiteState.draftDirty?'Unsaved draft edits':webChanged()?'Draft saved · unpublished changes':'Draft matches published pricing';
}
function webOwnerPlan(plan,index){
 const featured=websiteState.draft.featuredId===plan.id;
 const price=/^\d{1,6}(\.\d{1,2})?$/.test(plan.price.trim())?webMoney(plan.price):'Price needed';
 return `<article class="web-owner-plan" aria-labelledby="web-owner-${esc(plan.id)}"><div class="web-plan-summary"><div class="web-plan-heading"><h3 id="web-owner-${esc(plan.id)}">${esc(plan.name||'Untitled plan')}</h3>${badge(plan.visible?'Shown':'Hidden',plan.visible?'neutral':'warning')}${featured?badge('Highlighted','success'):''}</div><p><strong class="web-inline-price">${esc(price)}</strong><span class="hl-muted"> ${esc(webPeriods[plan.period]||'')}</span></p><p class="hl-muted">${esc(plan.description||'Add a description for visitors.')}</p><p class="hl-small hl-muted">${plan.features.length} included feature${plan.features.length===1?'':'s'}</p></div><div class="web-owner-plan-actions"><div class="web-order-actions" aria-label="Move ${esc(plan.name)}">${act(icon('arrow-up'),'web-move','secondary',`data-plan="${esc(plan.id)}" data-direction="up" aria-label="Move ${esc(plan.name)} up" ${index===0?'disabled':''}`)}${act(icon('arrow-down'),'web-move','secondary',`data-plan="${esc(plan.id)}" data-direction="down" aria-label="Move ${esc(plan.name)} down" ${index===websiteState.draft.plans.length-1?'disabled':''}`)}</div>${act(plan.visible?'Hide':'Show','web-visibility','secondary',`data-plan="${esc(plan.id)}"`)}${act('Edit plan','web-edit','secondary',`data-plan="${esc(plan.id)}"`)}</div></article>`;
}
function webOwnerHtml(){
 const draft=websiteState.draft;
 return `<div class="web-owner"><div class="web-publish-bar"><div><strong id="web-draft-status" aria-live="polite">${esc(webDraftStatus())}</strong><p class="hl-small hl-muted">Publishing updates the public page in this preview only.</p></div><div class="hl-row">${act('Save draft','web-save-draft')}${act('Preview draft','web-preview-draft')}${act('Publish pricing','web-publish-review','primary')}</div></div>${webErrorMarkup()}<form id="web-owner-form" class="web-settings" onsubmit="return false"><section class="web-settings-section" aria-labelledby="web-page-settings"><h2 id="web-page-settings">Page text</h2>${field('Page heading',`<input class="hl-input" id="web-page-title" value="${esc(draft.title)}" maxlength="80" required>`)}${field('Introduction',`<textarea class="hl-textarea web-short-textarea" id="web-page-description" maxlength="180" required>${esc(draft.description)}</textarea>`)}</section><section class="web-settings-section" aria-labelledby="web-feature-settings"><h2 id="web-feature-settings">Highlighted plan</h2><fieldset class="web-feature-options"><legend class="hl-small hl-muted">Choose one plan or none.</legend><label class="hl-check cursor-interaction"><input type="radio" name="web-featured-plan" value="" ${!draft.featuredId?'checked':''}>No highlighted plan</label>${draft.plans.map(plan=>`<label class="hl-check cursor-interaction"><input type="radio" name="web-featured-plan" value="${esc(plan.id)}" ${draft.featuredId===plan.id?'checked':''} ${!plan.visible?'disabled':''}><span>${esc(plan.name||'Untitled plan')}${!plan.visible?' <span class="hl-muted">(hidden)</span>':''}</span></label>`).join('')}</fieldset>${field('Highlight label',`<input class="hl-input" id="web-highlight-label" value="${esc(draft.highlightLabel)}" maxlength="32" placeholder="Featured plan">`)}</section></form><section class="web-plan-list-section" aria-labelledby="web-plan-list-title"><div class="web-section-heading"><div><h2 id="web-plan-list-title">Plans</h2><p class="hl-small hl-muted">Shown in this order on the public page. Prices are in CAD.</p></div><div class="hl-row">${badge(`${draft.plans.filter(plan=>plan.visible).length} shown`)}${act('Add plan','web-add','secondary',draft.plans.length>=4?'disabled aria-label="Maximum of four sample plans"':'')}</div></div><div class="web-owner-plans">${draft.plans.map(webOwnerPlan).join('')}</div></section><p class="web-scope-note hl-small hl-muted">These fictional website plans do not change existing memberships, class allowances or billing agreements.</p></div>`;
}
function webPricingCards(content){
 const plans=content.plans.filter(plan=>plan.visible),draft=websiteState.view==='draft';
 if(!plans.length)return `<div class="web-public-empty"><h2>Pricing is being updated</h2><p>Please check back for the available plans.</p></div>`;
 return `<div class="web-pricing-grid" data-plan-count="${plans.length}">${plans.map(plan=>{
  const featured=content.featuredId===plan.id;
  const validPrice=/^\d{1,6}(\.\d{1,2})?$/.test(plan.price.trim());
  return `<article class="web-pricing-card ${featured?'web-featured':''}" aria-labelledby="web-public-${esc(plan.id)}"><div class="web-card-label">${featured?badge(content.highlightLabel||'Featured plan','success'):'<span aria-hidden="true"></span>'}</div><div class="web-card-intro"><h2 id="web-public-${esc(plan.id)}">${esc(plan.name||'Untitled plan')}</h2><p class="hl-muted">${esc(plan.description)}</p></div><div class="web-card-price"><strong>${validPrice?esc(webMoney(plan.price)):'Price needed'}</strong><span>${esc(webPeriods[plan.period]||'')}</span></div><ul class="web-card-features">${plan.features.map(feature=>`<li>${icon('check')}<span>${esc(feature)}</span></li>`).join('')}</ul><div class="web-card-footer">${act('Choose '+esc(plan.name||'plan'),'web-plan-select',featured?'primary':'secondary',`data-plan="${esc(plan.id)}" ${validPrice&&!draft?'':'disabled'}`)}${draft?'<p class="hl-small hl-muted">Publish pricing before joining.</p>':''}</div></article>`;
 }).join('')}</div>`;
}
function webPublicHtml(){
 const content=webCurrentContent(),draft=websiteState.view==='draft';
 return `<div class="web-public-pricing">${draft?`<div class="web-preview-bar"><div>${badge('Draft preview','warning')}<p class="hl-small">Visitors still see the published version.</p></div><div class="hl-row">${act('Back to editor','web-back-editor')}${act('View published','web-view-published','ghost')}</div></div>`:''}<div class="web-trial-link"><div><h2>Try a class first</h2><p class="hl-muted">Choose a class and review the trial requirements.</p></div>${go('Try a class','v-trial','secondary')}</div>${webPricingCards(content)}<div class="web-public-notes"><p><strong>Fictional sample pricing.</strong> Plan details and amounts are for this preview.</p><p>Class eligibility, available places and required waivers apply. The gym would confirm taxes, fees, start dates and cancellation terms before you join.</p></div></div>`;
}
function webEditPlan(id){
 webCapturePageFields();
 const existing=webPlan(id);if(id&&!existing)return;if(!id&&websiteState.draft.plans.length>=4)return;
 let nextId=1;while(webPlan('plan-'+nextId))nextId++;
 const plan=existing||{id:'plan-'+nextId,name:'',price:'',period:'month',description:'',features:[],visible:true};
 showDialog(existing?`Edit ${esc(plan.name||'plan')}`:'Add a plan',`<form id="web-plan-form" class="web-plan-form" data-plan="${esc(plan.id)}" onsubmit="return false"><div id="web-plan-errors"></div>${field('Plan name',`<input id="web-edit-name" class="hl-input" maxlength="60" value="${esc(plan.name)}" required>`)}<div class="web-form-row">${field('Price (CAD)',`<input id="web-edit-price" class="hl-input" type="text" inputmode="decimal" maxlength="12" value="${esc(plan.price)}" placeholder="149.00" required>`)}${field('Billing display',`<select id="web-edit-period" class="hl-select">${Object.entries(webPeriods).map(([value,label])=>`<option value="${value}" ${value===plan.period?'selected':''}>${label}</option>`).join('')}</select>`)}</div>${field('Description',`<textarea id="web-edit-description" class="hl-textarea web-short-textarea" maxlength="160" required>${esc(plan.description)}</textarea>`)}${field('Included features · one per line',`<textarea id="web-edit-features" class="hl-textarea" maxlength="363" rows="5" required>${esc(plan.features.join('\n'))}</textarea>`)}<p class="hl-small hl-muted">Up to 4 features, 90 characters each.</p><label class="hl-check"><input id="web-edit-visible" type="checkbox" ${plan.visible?'checked':''}>Show this plan on the public page</label><p class="hl-small hl-muted">This edits website copy. Existing membership prices and terms stay unchanged.</p></form>`,`${act('Cancel','close-dialog','ghost')}${act('Apply to draft','web-apply-plan','primary',`data-plan="${esc(plan.id)}"`)}`);
}
function webChoosePlan(id){
 if(websiteState.view==='draft'){toast('Publish pricing before joining.');return;}
 const plan=webPlan(id,websiteState.published);
 if(!plan?.visible||!/^\d{1,6}(\.\d{1,2})?$/.test(plan.price.trim())){toast('This plan is unavailable. Choose another plan.');return;}
 visitorSelectPlan(plan.id);
}
const pricingViews = {
 'a-website':{title:'Public pricing',subtitle:'Choose which plans visitors see on Northstar’s website.',icon:'panels-top-left',navLabel:'Public pricing',group:'Gym workspace',headerActions:()=>act('Open public page','web-view-published','secondary'),html:webOwnerHtml},
 'v-pricing':{title:()=>webCurrentContent().title,subtitle:()=>webCurrentContent().description,icon:'tags',navLabel:'Memberships',group:'Northstar Martial Arts',html:webPublicHtml}
};
const pricingActions = {
 'web-add':()=>webEditPlan(null),
 'web-edit':button=>webEditPlan(button.dataset.plan),
 'web-apply-plan':button=>{
  let plan=webPlan(button.dataset.plan);const isNew=!plan;if(isNew&&websiteState.draft.plans.length>=4)return;if(!plan)plan={id:button.dataset.plan};
  const featureLines=webValue('web-edit-features').split(/\r?\n/).map(feature=>feature.trim()).filter(Boolean);
  const next={...plan,name:webValue('web-edit-name').trim(),price:webValue('web-edit-price').trim(),period:webValue('web-edit-period'),description:webValue('web-edit-description').trim(),features:featureLines,visible:!!root.querySelector('#web-edit-visible')?.checked};
  const errors=webValidate({...websiteState.draft,plans:[next],featuredId:null}).filter(error=>error.planId);
  if(featureLines.length>4||featureLines.some(feature=>feature.length>90))errors.push({message:'Use up to 4 features, with no more than 90 characters on each line.'});
  const nextDraft={...websiteState.draft,plans:isNew?[...websiteState.draft.plans,next]:websiteState.draft.plans.map(item=>item.id===next.id?next:item)};
  if(!webStateFits(nextDraft)||!webStateFits(nextDraft,nextDraft))errors.push({message:'Shorten the plan text so this preview can save your draft.'});
  if(errors.length){root.querySelector('#web-plan-errors').innerHTML=`<div class="web-validation" role="alert"><strong>Check this plan</strong><ul>${errors.map(error=>`<li>${esc(error.message)}</li>`).join('')}</ul></div>`;return;}
  Object.assign(plan,next);if(isNew)websiteState.draft.plans.push(plan);let cleared=false;
  if(!next.visible&&websiteState.draft.featuredId===plan.id){websiteState.draft.featuredId=null;cleared=true;}
  websiteState.draftDirty=true;webErrors=[];closeDialog();render();toast(cleared?'Plan updated. Its highlight was removed because the plan is hidden.':'Plan updated in the draft.');
 },
 'web-move':button=>{webCapturePageFields();const plans=websiteState.draft.plans,index=plans.findIndex(plan=>plan.id===button.dataset.plan),target=index+(button.dataset.direction==='up'?-1:1);if(index<0||target<0||target>=plans.length)return;[plans[index],plans[target]]=[plans[target],plans[index]];websiteState.draftDirty=true;render();toast('Draft plan order updated.');},
 'web-visibility':button=>{webCapturePageFields();const plan=webPlan(button.dataset.plan);if(!plan)return;plan.visible=!plan.visible;let cleared=false;if(!plan.visible&&websiteState.draft.featuredId===plan.id){websiteState.draft.featuredId=null;cleared=true;}websiteState.draftDirty=true;webErrors=[];render();toast(cleared?'Plan hidden in the draft. Its highlight was removed.':`${plan.name} ${plan.visible?'shown':'hidden'} in the draft.`);},
 'web-save-draft':()=>{webCapturePageFields();websiteState.draftDirty=false;webErrors=[];render();toast('Pricing draft saved in this preview.');},
 'web-preview-draft':()=>{webCapturePageFields();websiteState.view='draft';navigate('v-pricing',{pricingPreview:true});},
 'web-back-editor':()=>{websiteState.view='published';navigate('a-website');},
 'web-view-published':()=>{webCapturePageFields();websiteState.view='published';navigate('v-pricing');},
 'web-publish-review':()=>{webCapturePageFields();webErrors=webValidate(websiteState.draft);if(webErrors.length){render();toast('Check the highlighted pricing errors.');return;}const draft=websiteState.draft,featured=webPlan(draft.featuredId);showDialog('Publish pricing in this preview',`<div class="web-inquiry">${details([['Plans shown',String(draft.plans.filter(plan=>plan.visible).length)],['Highlighted plan',featured?esc(featured.name):'None'],['Highlight label',featured?esc(draft.highlightLabel):'None']])}<p>The public preview will use this draft’s plan names, prices, features and order.</p>${notice('Local preview only','No website is published online. Existing memberships and billing agreements stay unchanged.')}</div>`,`${act('Back','close-dialog','ghost')}${act('Publish pricing','web-publish-confirm','primary')}`);},
 'web-publish-confirm':()=>{webErrors=webValidate(websiteState.draft);if(webErrors.length){closeDialog();render();return;}websiteState.published=webClone(websiteState.draft);websiteState.publication++;websiteState.draftDirty=false;websiteState.view='published';closeDialog();render();toast('Pricing published to the public preview.');},
 'web-plan-select':button=>webChoosePlan(button.dataset.plan)
};
root.addEventListener('input',event=>{
 const target=event.target;
 if(!target.closest('#web-owner-form'))return;
 webCapturePageFields();websiteState.draftDirty=true;
 const status=root.querySelector('#web-draft-status');if(status)status.textContent=webDraftStatus();
});
root.addEventListener('change',event=>{
 if(event.target.name!=='web-featured-plan')return;
 webCapturePageFields();websiteState.draftDirty=true;webErrors=[];render();
});
