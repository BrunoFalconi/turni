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

/* Forza il ricaricamento del codice: elimina il service worker e tutte
   le cache, poi ricarica. Serve quando il browser continua a servire una
   versione vecchia dei file nonostante il deploy. I dati dei turni non
   vengono toccati: stanno in localStorage, non nella cache. */
const forceUpdateBtn=document.getElementById('forceUpdate');
if(forceUpdateBtn){
  forceUpdateBtn.onclick=async()=>{
    const status=document.getElementById('status');
    status.textContent='Aggiornamento in corso…';
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.unregister()));
      }
      if(window.caches){
        const keys=await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }
      location.reload(true);
    }catch(e){
      status.textContent='Aggiornamento non riuscito: ricarica a mano.';
    }
  };
}
