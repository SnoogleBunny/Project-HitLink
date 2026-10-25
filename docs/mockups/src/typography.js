const fontPairs={
 'barlow-source':{heading:'Barlow Semi Condensed',body:'Source Sans 3'},
 'plex':{heading:'IBM Plex Sans Condensed',body:'IBM Plex Sans'},
 'manrope-source':{heading:'Manrope',body:'Source Sans 3'}
};
let typographyReady=Promise.resolve(),requestedTypography=null,fontRevision=0;
function applyTypography(){
 const choice=designState.typography;
 if(choice===requestedTypography)return;
 requestedTypography=choice;
 const revision=++fontRevision,pair=fontPairs[choice];
 if(!document.fonts?.load)return;
 // Apply each pair together, before revealing the initial skeleton. If a font
 // service is unavailable, keep the system fallback instead of swapping late.
 const specs=[...[400,500,600,700].map(weight=>`${weight} 14px "${pair.body}"`),...[600,700].map(weight=>`${weight} 30px "${pair.heading}"`)];
 const loaded=Promise.all(specs.map(spec=>document.fonts.load(spec,'HitLink Today 0123456789'))).then(faces=>faces.every(list=>list.length>0)).catch(()=>false);
 typographyReady=new Promise(resolve=>{
  let finished=false;
  const finish=ready=>{
   if(finished)return;finished=true;clearTimeout(timeout);
   if(ready&&revision===fontRevision)root.dataset.typography=choice;
   resolve();
  };
  const timeout=setTimeout(()=>finish(false),1800);
  loaded.then(finish);
 });
}
