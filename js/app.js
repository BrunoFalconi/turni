(window.__MODULE_VERSIONS=window.__MODULE_VERSIONS||{})['app']='3.5';
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

/* Controllo di coerenza fra i moduli.
   Se il browser o il service worker servono una versione vecchia di un
   file, l'app funziona a metà e i numeri risultano sbagliati senza che
   sia evidente il motivo. Meglio dirlo subito e a chiare lettere. */
(function checkModuleVersions(){
  const expected=typeof APP_VERSION!=='undefined'?APP_VERSION:null;
  if(!expected)return;

  const required=['logger','core','excel','backup','stats','payslip','app'];
  const found=window.__MODULE_VERSIONS||{};
  const stale=required.filter(name=>found[name]!==expected);

  if(!stale.length)return;

  const banner=document.createElement('div');
  banner.className='version-warning';
  banner.innerHTML=
    `<b>File non aggiornati</b><br>`+
    `L'app è alla versione ${expected}, ma questi moduli sono vecchi o mancanti: `+
    `<b>${stale.join(', ')}</b>.<br>`+
    `I calcoli non sono affidabili finché non li sostituisci.`+
    `<button id="versionFix">Svuota cache e ricarica</button>`;
  document.body.prepend(banner);

  document.getElementById('versionFix').onclick=async()=>{
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.unregister()));
      }
      if(window.caches){
        const keys=await caches.keys();
        await Promise.all(keys.map(k=>caches.delete(k)));
      }
    }catch(e){}
    location.reload(true);
  };

  if(window.Logger)Logger.error('Moduli non allineati',{expected,found});
})();
