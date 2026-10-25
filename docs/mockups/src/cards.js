// Cards use relevant record content and balanced spacing, without filler footers.
function metricIconFor(label){
 if(/refund|credit|fee|invoice|payment|settlement/i.test(label))return 'wallet-cards';
 if(/form|authority/i.test(label))return 'shield-check';
 if(/checked|delivered|reconciled/i.test(label))return 'circle-check';
 if(/client|member|people|payer/i.test(label))return 'users';
 if(/inquiry|export/i.test(label))return 'inbox';
 if(/response/i.test(label))return 'clock-3';
 return 'calendar-days';
}
const balancedCards=new Set(['a-today|This evening','a-exports|Leaving HitLink','c-program|Milestones agreed with Maya']);
function cardLayoutFor(title){
 const key=uiState.page+'|'+title;
 return {className:(balancedCards.has(key)?' hl-panel-balanced':'')+(key==='c-close|Service decision'?' hl-panel-writing':''),footer:''};
}

// A card's final decision belongs at its bottom edge. Keep record actions in
// their rows, and keep any short explanation attached to the final decision.
function prepareCardLayouts(scope){
 const isAction=element=>element?.matches('.hl-button')||element?.matches('.hl-row')&&element.children.length>0&&[...element.children].every(child=>child.matches('.hl-button'));
 scope.querySelectorAll('.hl-panel').forEach(panel=>{
  let action=panel.lastElementChild;const notes=[];
  while(action?.matches('p.hl-small,.hl-notice')){notes.unshift(action);action=action.previousElementSibling;}
  if(!isAction(action))return;
  const footer=document.createElement('div');footer.className='hl-panel-actions';
  panel.classList.add('hl-panel-with-actions');panel.appendChild(footer);
  footer.append(action,...notes);
 });
}
