/* ---------- inserimento da sequenza ---------- */
function lastKey(){const k=Object.keys(state.shifts).sort();return k.length?k[k.length-1]:null}
function parseSeq(startKey,text){
  const toks=String(text||'').trim().split(/[\s,;|\/]+/).filter(Boolean);
  const out=[],bad=[];
  toks.forEach((tk,i)=>{
    const t=toType(tk), key=dayAdd(startKey,i);   /* ogni codice consuma un giorno, anche se non lo riconosco */
    if(!t){bad.push(tk);return}
    if(!typeOf(t).work){out.push({key,shift:{type:t,start:'',end:'',break:0,note:''}});return}
    const pr=presetOf(t);
    out.push({key,shift:{type:t,start:pr[0],end:pr[1],break:typeOf(t).brk??state.settings.defaultBreak??0,note:''}});
  });
  return {out,bad,n:toks.length};
}
const SEQ_HELP='Codici: M mattina · P pomeriggio · N notte · DEAS · R riposo · F ferie · MAL malattia';
function seqInfo(){
  const d=document.getElementById('q-date').value, txt=document.getElementById('q-text').value;
  const el=document.getElementById('q-info');
  if(!d||!txt.trim()){el.textContent=SEQ_HELP;return null}
  const r=parseSeq(d,txt);
  const lab=k=>{const x=new Date(k+'T00:00:00');return `${GIORNI[x.getDay()].toLowerCase()} ${x.getDate()}/${x.getMonth()+1}`};
  el.innerHTML=`<b>${r.n}</b> codici · da <b>${lab(d)}</b> a <b>${lab(dayAdd(d,r.n-1))}</b>`+
    (r.bad.length?`<span class="issue">Non riconosciuti: ${[...new Set(r.bad)].join(', ')} — quei giorni restano vuoti.</span>`:'');
  return r;
}
document.getElementById('seq').onclick=()=>{
  const l=lastKey();
  document.getElementById('q-date').value=l?dayAdd(l,1):ymd(new Date());
  document.getElementById('q-text').value='';
  seqInfo(); closeSheets(); showSheet('sheet-seq');
};
['q-date','q-text'].forEach(id=>document.getElementById(id).addEventListener('input',seqInfo));
document.getElementById('q-cancel').onclick=()=>{pending=[];closeSheets()};
document.getElementById('q-go').onclick=()=>{
  const r=seqInfo();
  if(!r||!r.out.length){toast('Servono la data di partenza e la sequenza');return}
  pending=r.out;
  openPreview('sequenza incollata',r.bad.length);
};


if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Modalità offline non attiva',err)));
}

load();

/* Avvio dell'app dopo il caricamento di tutti gli script */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => load(), { once: true });
} else {
  load();
}
