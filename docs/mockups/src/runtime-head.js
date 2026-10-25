(() => {
'use strict';
const root = document.getElementById('hitlink-prototype');
if (!root) return;
const esc = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<i data-lucide="${esc(name)}" aria-hidden="true"></i>`;
const badge = (text,tone='neutral') => `<span class="hl-tag ${esc(tone)}${String(text).length>20?' hl-tag-long':''}"><span class="hl-tag-label">${esc(text)}</span></span>`;
const controlClasses = (label,kind) => `hl-button ${kind}${kind==='ghost'&&String(label).replace(/<[^>]*>/g,'').trim()?' hl-text-link':''}`;
const canonicalPage = page => page==='m-home'||page==='m-bookings'?'m-schedule':page==='m-family'?'m-account':page;
const go = (label,page,kind='secondary') => `<button type="button" class="${controlClasses(label,kind)}" data-page="${esc(canonicalPage(page))}">${label}</button>`;
const act = (label,action,kind='secondary',extraAttrs='') => `<button type="button" class="${controlClasses(label,kind)}" data-action="${esc(action)}" ${extraAttrs}>${label}</button>`;
const section = (title,content,extra='') => {const layout=cardLayoutFor(title);return `<section class="hl-panel${layout.className}"><div class="hl-panel-head"><h2>${title}</h2>${extra}</div>${content}${layout.footer}</section>`;};
const notice = (title,body,tone='info',actions='') => `<div class="hl-notice ${tone}" role="${tone==='danger'?'alert':'status'}">${icon(tone==='success'?'circle-check':tone==='danger'?'circle-alert':'info')}<div class="hl-notice-content"><strong>${title}</strong><p>${body}</p>${actions?`<div class="hl-notice-actions">${actions}</div>`:''}</div></div>`;
let fieldId=0;
const field = (label,control) => `<label class="hl-field"><span>${label}</span>${control}</label>`;
const table = (headers,rows) => `<div class="hl-table-wrap"><table class="hl-table${headers.length===2?' hl-table-pairs':''}"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>`<td data-label="${esc(headers[i]||'')}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const person = (name,meta,initials) => `<div class="hl-person"><span class="hl-avatar">${esc(initials||name.split(' ').map(x=>x[0]).join(''))}</span><div><strong>${esc(name)}</strong><p>${meta}</p></div></div>`;
const metric = (value,label,detail='') => `<div class="hl-metric"><div class="hl-metric-heading"><div class="hl-metric-label">${label}</div><span class="hl-metric-icon" aria-hidden="true">${icon(metricIconFor(label))}</span></div><div class="hl-metric-value${String(value).length>10?' hl-metric-text':''}">${value}</div><div class="hl-metric-detail">${detail}</div></div>`;
const metricLink = (value,label,detail,action,{disabled=false,cta='View records'}={}) => `<button type="button" class="hl-metric hl-metric-link cursor-interaction" ${disabled?'disabled':`data-action="${esc(action)}"`} aria-label="${esc([`${value} ${label}`,detail,cta].filter(Boolean).join('. '))}"><span class="hl-metric-heading"><span class="hl-metric-label">${esc(label)}</span><span class="hl-metric-icon" aria-hidden="true">${icon(metricIconFor(label))}</span></span><span class="hl-metric-value${String(value).length>10?' hl-metric-text':''}">${esc(value)}</span><span class="hl-metric-detail"><span class="hl-metric-description">${esc(detail)}</span>${cta?`<span class="hl-metric-cta">${esc(cta)}${disabled?'':icon('chevron-right')}</span>`:''}</span></button>`;
const details = rows => `<dl class="hl-detail-list">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const uiState={page:'a-today',role:'owner',scenario:'ready'};
const designState={density:'comfortable',navigation:'rail',radius:12,typography:'barlow-source',theme:'system'};
let returnFocus=null;
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
function toast(message){const feedback=root.querySelector('#hl-feedback');feedbackRevision++;delete feedback.dataset.closing;feedback.innerHTML=`<span>${esc(message)}</span><button type="button" class="hl-feedback-dismiss cursor-interaction" data-feedback-dismiss aria-label="Dismiss notification">${icon('x')}</button>`;refreshIcons();animateElement(feedback,[{opacity:.5,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],200,'feedback-enter');}
function refreshIcons(){if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:16,height:16,'stroke-width':1.7}});}
let dialogRevision=0;
function showDialog(title,body,footerHtml='',options={}){
  setMobileMenu(false,{restoreFocus:false,immediate:true});
  const overlay=root.querySelector('#hl-overlay'),wasHidden=overlay.hidden;
  dialogRevision++;cancelMotionWithin(overlay);delete overlay.dataset.closing;overlay.dataset.kind=options.kind||'default';
  if(wasHidden)returnFocus=rememberFocus(document.activeElement);
  overlay.innerHTML=`<section class="hl-dialog" role="dialog" aria-modal="true" aria-labelledby="hl-dialog-title"><div class="hl-dialog-head"><h2 id="hl-dialog-title">${title}</h2>${act(icon('x'),'close-dialog','ghost','aria-label="Close dialog"')}</div><div class="hl-dialog-body">${body}</div>${footerHtml?`<div class="hl-dialog-foot">${footerHtml}</div>`:''}</section>`;
  overlay.hidden=false;syncInteractionLayers();if(options.kind==='member-picker')positionMemberPicker();overlay.scrollTop=0;refreshIcons();const focus=overlay.querySelector('input,select,textarea,button');if(focus)focus.focus({preventScroll:true});
  if(wasHidden)animateElement(overlay,[{opacity:0},{opacity:1}],220,'dialog-scrim-enter');
  animateElement(overlay.querySelector('.hl-dialog'),[{opacity:.3,transform:wasHidden?'translateY(24px) scale(.975)':'translateX(12px)'},{opacity:1,transform:'translate(0) scale(1)'}],wasHidden?300:220,wasHidden?'dialog-enter':'dialog-step');
}
function closeDialog(options={}){
 const overlay=root.querySelector('#hl-overlay');if(overlay.hidden||overlay.dataset.closing==='true'&&!options.immediate)return;
 const revision=++dialogRevision,focus=returnFocus;
 const finish=()=>{if(revision!==dialogRevision)return;cancelMotionWithin(overlay);overlay.hidden=true;overlay.replaceChildren();delete overlay.dataset.closing;delete overlay.dataset.kind;returnFocus=null;syncInteractionLayers();if(options.restoreFocus!==false)restoreMotionFocus(focus);};
 if(options.immediate||motionPreference.matches){finish();return;}
 overlay.dataset.closing='true';
 const dialog=overlay.querySelector('.hl-dialog'),style=getComputedStyle(dialog);
 animateElement(dialog,[{opacity:style.opacity,transform:style.transform},{opacity:0,transform:'translateY(5px) scale(.99)'}],140,'dialog-exit','cubic-bezier(.4,0,1,1)');
 finishMotion(animateElement(overlay,[{opacity:getComputedStyle(overlay).opacity},{opacity:0}],140,'dialog-scrim-exit'),finish);
}
function websiteSnapshot(){const {version,draft,published,publication,draftDirty}=websiteState;return {version,draft,published,publication,draftDirty};}
function saveSelection(){if(window.openai?.setWidgetState)window.openai.setWidgetState({modelContent:{product:'HitLink',screen:uiState.page,role:uiState.role,scenario:uiState.scenario},privateContent:{design:designState,memberProfile:memberState.profile,ownerContext:ownerContextSnapshot(),websiteState:websiteSnapshot(),discoveryPage:discoveryState.page}}).catch(()=>{});}
