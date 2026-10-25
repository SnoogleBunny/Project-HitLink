const systemAppearance=window.matchMedia('(prefers-color-scheme: dark)');
function inheritedAppearance(){
 const scheme=getComputedStyle(root.parentElement).colorScheme;
 return scheme==='dark'?'dark':scheme==='light'?'light':systemAppearance.matches?'dark':'light';
}
function applyTheme(){
 const preference=designState.theme,resolved=preference==='system'?inheritedAppearance():preference;
 root.dataset.theme=preference;root.dataset.resolvedTheme=resolved;
 root.style.colorScheme=resolved;
 root.querySelectorAll('.hl-reviewbar,.hl-design-map').forEach(element=>{element.style.colorScheme=inheritedAppearance();});
 const feedback=root.querySelector('#hl-feedback');if(feedback.parentElement===root)feedback.style.colorScheme=inheritedAppearance();else feedback.style.removeProperty('color-scheme');
 const next=resolved==='dark'?'light':'dark';
 root.querySelectorAll('[data-theme-toggle]').forEach(button=>{
  button.setAttribute('aria-label',`Switch to ${next} mode`);
  button.innerHTML=`${icon(next==='dark'?'moon':'sun')}<span>${next==='dark'?'Dark':'Light'} mode</span>`;
 });
 refreshIcons();
}
root.addEventListener('click',event=>{
 const button=event.target.closest('[data-theme-toggle]');if(!button)return;
 designState.theme=root.dataset.resolvedTheme==='dark'?'light':'dark';
 applyTheme();saveSelection();
 animateElement(button.querySelector('svg'),[{opacity:.5,transform:'rotate(-45deg) scale(.8)'},{opacity:1,transform:'rotate(0) scale(1)'}],220,'theme-choice');
});
systemAppearance.addEventListener('change',applyTheme);
// Product overrides stay explicit; surrounding preview controls still follow the host.
const appearanceObserver=new MutationObserver(applyTheme);
new Set([document.documentElement,root.parentElement]).forEach(element=>appearanceObserver.observe(element,{attributes:true,attributeFilter:['class','style','data-theme']}));
