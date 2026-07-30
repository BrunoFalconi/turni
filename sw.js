const CACHE='turni-app-colonne-zucchetti-v28';
const CORE=['./','./index.html','./css/style.css','./js/core.js','./js/excel.js','./js/backup.js','./js/stats.js','./js/payslip.js','./js/app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith((async()=>{
    try{
      const fresh=await fetch(event.request);
      const cache=await caches.open(CACHE);
      cache.put(event.request,fresh.clone());
      return fresh;
    }catch(err){
      return (await caches.match(event.request)) || (event.request.mode==='navigate' ? await caches.match('./index.html') : Response.error());
    }
  })());
});
