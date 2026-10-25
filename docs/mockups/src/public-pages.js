const publicRoutes={'v-pricing':'/pricing/','v-trial':'/trial/','v-enroll':'/join/','v-terms':'/terms/','v-privacy':'/privacy/','v-not-found':'/404.html'};
const discoveryState={page:'v-pricing'};
const publicNavigationState={returnPage:'v-pricing'};
function preparePublicNavigation(page){
 if(['v-terms','v-privacy'].includes(page)&&['v-pricing','v-trial','v-enroll'].includes(uiState.page))publicNavigationState.returnPage=uiState.page;
}
function publicFocusTarget(){return root.querySelector('.hl-public-header [aria-current="page"]')||root.querySelector('.hl-public-header [data-page="v-pricing"]');}
function focusPublicDestination(){publicFocusTarget()?.focus({preventScroll:true});}
function syncPublicChrome(){
 const isPublic=uiState.role==='prospect',header=root.querySelector('.hl-public-header');
 header.hidden=!isPublic;
 header.querySelectorAll('[data-page]').forEach(button=>{const active=button.dataset.page===uiState.page||button.dataset.page==='v-pricing'&&uiState.page==='v-enroll';if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
}
function pageMetadataFor(id){
 const publicMeta={
  'v-pricing':{title:`${websiteState.published.title} | Northstar`,description:websiteState.published.description,image:'pricing.png'},
  'v-trial':{title:'Try a martial arts class | Northstar',description:'Review a sample Muay Thai trial at Northstar, choose a participant and see the forms required before attendance.',image:'trial.png'},
  'v-enroll':{title:'Join Northstar | Membership details',description:'Review your selected Northstar membership, billing dates, class limits and joining steps.',image:'join.png'},
  'v-terms':{title:'Terms of Service | HitLink',description:'Draft terms for using HitLink, including account responsibilities, gym relationships, payments and access to the service.',image:'terms.png'},
  'v-privacy':{title:'Privacy Policy | HitLink',description:'How HitLink’s draft privacy policy covers account details, bookings, payments, family records and coaching information.',image:'privacy.png'},
  'v-not-found':{title:'Page not found | HitLink',description:'This HitLink page could not be found. Return to membership options or open the member portal.',image:'not-found.png'}
 };
 const view=views[id],role=roles[roleFor(id)];
 const result=publicMeta[id]||{title:`${viewValue(view.navLabel)} | ${role.title} | HitLink`,description:`${viewValue(view.navLabel)} in HitLink. Sign in to your ${role.title.toLowerCase()} to use this page.`,image:'hitlink.png'};
 return {...result,path:publicRoutes[id]||`/preview/${id}/`,robots:'noindex, nofollow',intendedIndexing:publicRoutes[id]&&id!=='v-not-found'?'Public after review':'Noindex',imageAlt:`${result.title}. HitLink share image.`,status:id==='v-not-found'?404:200};
}
function syncPageMetadata(){
 const meta=pageMetadataFor(uiState.page);document.title=meta.title;
 const set=(attribute,name,content)=>{let node=document.head.querySelector(`meta[${attribute}="${name}"]`);if(!node){node=document.createElement('meta');node.setAttribute(attribute,name);document.head.appendChild(node);}node.content=content;};
 set('name','description',meta.description);set('name','robots',meta.robots);
 set('property','og:title',meta.title);set('property','og:description',meta.description);set('property','og:type','website');set('property','og:site_name','HitLink');
 // Real absolute URLs belong to the website export once a public origin is set.
 set('name','twitter:card','summary_large_image');set('name','twitter:title',meta.title);set('name','twitter:description',meta.description);
}
function legalPage(kind){
 const document=legalContent[kind];
 const returnLabel={'v-pricing':'Back to memberships','v-trial':'Back to trial booking','v-enroll':'Back to signup'}[publicNavigationState.returnPage];
 return `<div class="hl-stack"><div>${go(`${icon('arrow-left')}${returnLabel}`,publicNavigationState.returnPage,'ghost')}</div>${notice('Draft for review',legalContent.draftNotice||'Business details and deployment practices still need to be confirmed. This is not a published policy.','warning')}<article class="hl-legal-document"><p class="hl-small hl-muted">Effective date: ${esc(legalContent.effectiveDate)}</p>${document.sections.map((section,index)=>`<section aria-labelledby="legal-${kind}-${index}"><h2 id="legal-${kind}-${index}">${esc(section.title)}</h2>${section.paragraphs.map(paragraph=>`<p>${esc(paragraph)}</p>`).join('')}</section>`).join('')}</article></div>`;
}
function sharePreview(meta){
 return `<img class="hl-share-image" src="${shareImages[meta.image]}" width="1200" height="630" alt="${esc(meta.imageAlt)}">`;
}
const publicViews={
 'v-terms':{title:'Terms of Service',subtitle:'HitLink software service · Draft for review',icon:'file-text',navLabel:'Terms of Service',group:'HitLink',html:()=>legalPage('terms')},
 'v-privacy':{title:'Privacy Policy',subtitle:'HitLink software service · Draft for review',icon:'shield-check',navLabel:'Privacy Policy',group:'HitLink',html:()=>legalPage('privacy')},
 'v-not-found':{title:'Page not found',subtitle:'The link may be out of date, or the address may have changed.',icon:'file-question',navLabel:'404 preview',group:'HitLink',html:()=>`<section class="hl-not-found"><span class="hl-error-code" aria-hidden="true">404</span><h2>Let’s get you back.</h2><p>View the gym’s membership options or open your member portal.</p><div class="hl-row">${go('View membership options','v-pricing','primary')}${go('Open member portal','m-schedule')}</div></section>`},
 'a-discovery':{title:'Search & sharing',subtitle:'Review page titles, descriptions and sharing cards for the website.',icon:'search',navLabel:'Search & sharing',group:'Website',html:()=>{
  const meta=pageMetadataFor(discoveryState.page);
  return `<div class="hl-stack">${field('Page',`<select class="hl-select" id="site-preview-page">${Object.keys(publicRoutes).map(id=>`<option value="${id}" ${id===discoveryState.page?'selected':''}>${esc(views[id].navLabel)}</option>`).join('')}</select>`)}<div class="hl-grid">${section('Search preview',`<div class="hl-search-preview"><span class="hl-small hl-muted">[PUBLIC DOMAIN]${meta.path}</span><h3>${esc(meta.title)}</h3><p>${esc(meta.description)}</p></div>${details([['Page title',meta.title],['Meta description',meta.description],['Preview indexing','Noindex'],['After review',meta.intendedIndexing]])}`)}${section('Social sharing',`${sharePreview(meta)}${details([['Image',`assets/social/${meta.image}`],['Dimensions','1200 × 630'],['Alt text',meta.imageAlt]])}`)}</div>${notice('Website files prepared separately','The HTML pages include their own metadata and sharing tags. Set the public domain and confirm the legal placeholders before using them on a live site.')}<div class="hl-row">${go('Open page preview',discoveryState.page,'primary')}${go('Edit public pricing','a-website')}${go('Preview 404','v-not-found','ghost')}</div></div>`;
 }}};
function syncPublicFooter(){
 const footer=root.querySelector('.hl-app-footer');
 footer.innerHTML=uiState.role==='prospect'?`<span>Northstar · Fictional gym preview</span><div class="hl-footer-links">${go('Member portal','m-schedule','ghost')}${go('HitLink terms','v-terms','ghost')}${go('Privacy','v-privacy','ghost')}</div>`:`<span>Northstar Martial Arts · Sample workspace</span><div class="hl-footer-links">${go('Memberships','v-pricing','ghost')}${go('HitLink terms','v-terms','ghost')}${go('Privacy','v-privacy','ghost')}</div>`;
}
root.addEventListener('change',event=>{if(event.target.id==='site-preview-page'&&Object.hasOwn(publicRoutes,event.target.value)){discoveryState.page=event.target.value;render();saveSelection();}});
