window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){state=loadState();render()}});
window.addEventListener('pagehide',saveState);

render();

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));
}
