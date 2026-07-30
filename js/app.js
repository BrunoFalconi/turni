window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){state=loadState();render()}});
window.addEventListener('pagehide',saveState);

render();

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));
}


window.addEventListener('load',async()=>{
  if(!('serviceWorker' in navigator))return;
  try{
    const registration=await navigator.serviceWorker.ready;
    const status=document.getElementById('status');
    if(status){
      status.classList.add('offline-ready');
      status.textContent+= ' · Offline disponibile';
    }
  }catch(e){}
});
