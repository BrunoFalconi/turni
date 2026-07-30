const KEY='turni:app:v2';
const LEGACY_KEYS=['turni:app','turni:v5','turni:v4','turni:v3','turni:v2','turni:v1'];

/* Archivio persistente: IndexedDB come archivio principale e localStorage come copia di sicurezza. */
const mem={};
function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)) return reject(new Error('IndexedDB non disponibile'));
    const req=indexedDB.open('TurniAppDB',1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains('data')) req.result.createObjectStore('data'); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Apertura IndexedDB fallita'));
  });
}
async function idbGet(k){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction('data','readonly');const r=tx.objectStore('data').get(k);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error);});
}
async function idbSet(k,v){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(v,k);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
async function idbDel(k){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').delete(k);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
const store={
  mode:'persistente',
  async get(k){
    /* localStorage è letto per primo: è sincrono e contiene sempre l'ultimo salvataggio.
       IndexedDB rimane una copia di sicurezza, evitando che una vecchia copia IDB vuota
       sovrascriva i turni appena importati. */
    try{const v=localStorage.getItem(k);if(v!=null)return {key:k,value:v}}catch(e){}
    try{const v=await idbGet(k);if(v!=null)return {key:k,value:v}}catch(e){}
    return mem[k]?{key:k,value:mem[k]}:null;
  },
  async set(k,v){
    let ok=false;
    try{await idbSet(k,v);ok=true}catch(e){}
    try{localStorage.setItem(k,v);ok=true}catch(e){}
    mem[k]=v;
    if(!ok)throw new Error('Nessun archivio persistente disponibile');
    return {key:k,value:v};
  },
  async del(k){
    try{await idbDel(k)}catch(e){}
    try{localStorage.removeItem(k)}catch(e){}
    delete mem[k];
  }
};
const TYPES=[
  {id:'mattina',    label:'Mattina',    color:'var(--mattina)',    work:true},
  {id:'pomeriggio', label:'Pomeriggio', color:'var(--pomeriggio)', work:true},
  {id:'notte',      label:'Notte',      color:'var(--notte)',      work:true},
  {id:'deas',       label:'DEAS',       color:'var(--deas)',       work:true, brk:60},
  {id:'riposo',     label:'Riposo',     color:'var(--muted)',      work:false},
  {id:'ferie',      label:'Ferie',      color:'var(--ferie)',      work:false},
  {id:'malattia',   label:'Malattia',   color:'var(--malattia)',   work:false},
];
/* turni ammessi il giorno prima di una notte */
const BEFORE_NIGHT=['notte','deas'];
const MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GIORNI=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

const DEFAULTS={
  weekHours:40, dayThreshold:8, night1:'22:00', night2:'06:00', defaultBreak:0, presetsV:3,
  workDays:5, restDays:2,
  payroll:{ratesV:2,monthlyGross:2538.46,monthlyDivisor:173,nightPct:50,holidayPct:50,holidayNightPct:55,overtimePct:0,deductionPct:31.34,excelName:''},
  presets:{mattina:['08:00','16:00'],pomeriggio:['16:00','00:00'],notte:['00:00','08:00'],deas:['09:00','18:00']}
};

let state={shifts:{},settings:{...DEFAULTS}};
let view=new Date(); view.setDate(1);
let editing=null;   // stringa data 'YYYY-MM-DD'
let draft=null;

/* ---------- utilità ---------- */
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toMin=t=>{const[h,m]=t.split(':').map(Number);return h*60+m};
const fmt=m=>{if(!m)return'0<small>h</small>';const h=Math.floor(m/60),r=m%60;return r?`${h}<small>h</small>${pad(r)}`:`${h}<small>h</small>`};
const fmtPlain=m=>{const h=Math.floor(m/60),r=m%60;return r?`${h}h ${pad(r)}`:`${h}h`};

function span(s){ // minuti lordi e confini in minuti dall'inizio del giorno
  let a=toMin(s.start), b=toMin(s.end);
  if(b<=a) b+=1440;
  return {a,b,gross:b-a};
}
function worked(s){
  if(!isWork(s)) return 0;
  return Math.max(0, span(s).gross - (Number(s.break)||0));
}
function isWork(s){const t=TYPES.find(t=>t.id===s.type);return t&&t.work}
function nightMin(s){
  if(!isWork(s)) return 0;
  const {a,b}=span(s);
  const n1=toMin(state.settings.night1), n2=toMin(state.settings.night2);
  let tot=0;
  for(let d=-1;d<=1;d++){
    let s1=n1+d*1440, s2=(n2>n1?n2:n2+1440)+d*1440;
    tot+=Math.max(0,Math.min(b,s2)-Math.max(a,s1));
  }
  return Math.min(tot, b-a);
}
function overtime(s){
  const w=worked(s);
  return Math.max(0, w - state.settings.dayThreshold*60);
}
function typeOf(id){return TYPES.find(t=>t.id===id)||TYPES[0]}
function presetOf(id){
  const p=state.settings.presets[id];
  return (Array.isArray(p)&&p[0]&&p[1])?p:(DEFAULTS.presets[id]||['08:00','16:00']);
}

const eur=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
function easterSunday(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31)-1,day=(h+l-7*m+114)%31+1;
  return new Date(y,mo,day);
}
function isItalianHoliday(d){
  if(d.getDay()===0)return true;
  const md=pad(d.getMonth()+1)+'-'+pad(d.getDate());
  if(['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'].includes(md))return true;
  const e=easterSunday(d.getFullYear()), em=new Date(e); em.setDate(e.getDate()+1);
  return ymd(d)===ymd(em);
}
function payrollMinutesFor(key,s){
  const out={ordinary:0,night:0,holiday:0,holidayNight:0,overtime:0};
  if(!isWork(s))return out;
  const {a,b}=span(s), breakMin=Math.max(0,Number(s.break)||0), endWork=Math.max(a,b-breakMin);
  const n1=toMin(state.settings.night1),n2=toMin(state.settings.night2);
  const isNightAbs=min=>{const day=Math.floor(min/1440),local=((min%1440)+1440)%1440;return n2>n1?(local>=n1&&local<n2):(local>=n1||local<n2)};
  for(let min=a;min<endWork;min++){
    const off=Math.floor(min/1440), dt=new Date(key+'T00:00:00');dt.setDate(dt.getDate()+off);
    const hol=isItalianHoliday(dt),ng=isNightAbs(min);
    if(hol&&ng)out.holidayNight++;else if(hol)out.holiday++;else if(ng)out.night++;else out.ordinary++;
  }
  out.overtime=Math.max(0,(endWork-a)-state.settings.dayThreshold*60);
  return out;
}
function monthlyPayroll(y,m){
  const p=state.settings.payroll||DEFAULTS.payroll,hourly=(Number(p.monthlyGross)||0)/(Number(p.monthlyDivisor)||173);
  const mins={ordinary:0,night:0,holiday:0,holidayNight:0,overtime:0};
  const days=new Date(y,m+1,0).getDate();
  for(let d=1;d<=days;d++){const k=`${y}-${pad(m+1)}-${pad(d)}`,s=state.shifts[k];if(!s)continue;const q=payrollMinutesFor(k,s);Object.keys(mins).forEach(x=>mins[x]+=q[x]);}
  const amounts={night:mins.night/60*hourly*(p.nightPct||0)/100,holiday:mins.holiday/60*hourly*(p.holidayPct||0)/100,holidayNight:mins.holidayNight/60*hourly*(p.holidayNightPct||0)/100,overtime:mins.overtime/60*hourly*(p.overtimePct||0)/100};
  const extras=Object.values(amounts).reduce((a,b)=>a+b,0),gross=(Number(p.monthlyGross)||0)+extras,deductions=gross*(Number(p.deductionPct)||0)/100;
  return {hourly,mins,amounts,extras,gross,deductions,net:gross-deductions};
}
function renderPayroll(y,m){
  const r=monthlyPayroll(y,m), p=state.settings.payroll||DEFAULTS.payroll, h=x=>fmtPlain(r.mins[x]);
  document.getElementById('pay-lines').innerHTML=`
    <div class="pay-row"><span>Lordo fisso</span><span>${eur(p.monthlyGross)}</span></div>
    <div class="pay-row muted"><span>Notturne ${h('night')} · ${p.nightPct}%</span><span>+ ${eur(r.amounts.night)}</span></div>
    <div class="pay-row muted"><span>Festivi/domeniche ${h('holiday')} · ${p.holidayPct}%</span><span>+ ${eur(r.amounts.holiday)}</span></div>
    <div class="pay-row muted"><span>Festive notturne ${h('holidayNight')} · ${p.holidayNightPct}%</span><span>+ ${eur(r.amounts.holidayNight)}</span></div>
    ${p.overtimePct?`<div class="pay-row muted"><span>Straordinari ${h('overtime')} · ${p.overtimePct}%</span><span>+ ${eur(r.amounts.overtime)}</span></div>`:''}
    <div class="pay-row total"><span>Lordo stimato</span><span>${eur(r.gross)}</span></div>
    <div class="pay-row muted"><span>Trattenute stimate · ${p.deductionPct}%</span><span>− ${eur(r.deductions)}</span></div>
    <div class="pay-row net"><span>Netto stimato</span><span>${eur(r.net)}</span></div>`;
}

/* ---------- regole del ciclo ---------- */
function dayAdd(key,n){const d=new Date(key+'T00:00:00');d.setDate(d.getDate()+n);return ymd(d)}
/* prima di una notte può esserci solo un'altra notte o un riposo */
function issuesFor(key,override){
  const s=override||state.shifts[key]; if(!s) return [];
  const out=[];
  if(s.type==='notte'){
    const p=state.shifts[dayAdd(key,-1)];
    if(p&&isWork(p)&&!BEFORE_NIGHT.includes(p.type))
      out.push({kind:'prev',text:`Il giorno prima c'è ${typeOf(p.type).label.toLowerCase()}: prima di una notte serve un riposo, un'altra notte o un DEAS.`});
  }
  if(isWork(s)&&!BEFORE_NIGHT.includes(s.type)){
    const n=state.shifts[dayAdd(key,1)];
    if(n&&n.type==='notte')
      out.push({kind:'next',text:`Il giorno dopo c'è una notte: prima serve un riposo, un'altra notte o un DEAS.`});
  }
  return out;
}
function weekStart(d){const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));x.setHours(0,0,0,0);return x}
function weekStats(start){
  const days=[];let work=0,rest=0,mins=0,filled=0;
  for(let i=0;i<7;i++){
    const k=ymd(new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
    const s=state.shifts[k];
    days.push(s||null);
    if(!s) continue;
    filled++;
    if(isWork(s)){work++;mins+=worked(s)}else rest++;
  }
  return {days,work,rest,mins,complete:filled===7};
}

/* ---------- archivio ---------- */
async function load(){
  try{
    let r=await store.get(KEY);
    let migratedFrom=null;
    if(!r){
      for(const oldKey of LEGACY_KEYS){
        const old=await store.get(oldKey);
        if(old){r=old;migratedFrom=oldKey;break}
      }
    }
    if(r&&r.value){
      const d=JSON.parse(r.value);
      const saved=d.settings||{};
      state.shifts=d.shifts||{};
      state.settings={...DEFAULTS,...saved,payroll:{...DEFAULTS.payroll,...(saved.payroll||{})}};
      let changed=!!migratedFrom;
      if(((saved.payroll||{}).ratesV||0)<DEFAULTS.payroll.ratesV){
        state.settings.payroll.nightPct=50;
        state.settings.payroll.holidayPct=50;
        state.settings.payroll.holidayNightPct=55;
        state.settings.payroll.ratesV=DEFAULTS.payroll.ratesV;
        changed=true;
      }
      if((saved.presetsV||0)<DEFAULTS.presetsV){
        state.settings.presets={...DEFAULTS.presets};
        state.settings.presetsV=DEFAULTS.presetsV;
        changed=true;
      }
      for(const k in DEFAULTS.presets){
        const p=state.settings.presets[k];
        if(!Array.isArray(p)||p.length<2||!p[0]||!p[1]){
          state.settings.presets[k]=[...DEFAULTS.presets[k]];
          changed=true;
        }
      }
      if(changed) saveNow();
    }
  }catch(e){console.error('Caricamento dati non riuscito',e)}
  render();
  const b=document.getElementById('boot'); if(b) b.remove();
}
async function saveNow(){
  const payload=JSON.stringify(state);
  let localOk=false;
  try{
    localStorage.setItem(KEY,payload);
    localOk=localStorage.getItem(KEY)===payload;
  }catch(e){console.warn('localStorage non disponibile',e)}
  try{
    await idbSet(KEY,payload);
  }catch(e){console.warn('Copia IndexedDB non riuscita',e)}
  mem[KEY]=payload;
  if(!localOk && !('indexedDB' in window)){
    console.error('Nessun archivio persistente disponibile');
    return false;
  }
  return true;
}
function save(){
  saveNow().then(ok=>{if(!ok)toast('Salvataggio non riuscito: memoria del browser non disponibile')});
}
window.addEventListener('pagehide',()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save()});
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),1900)}

/* ---------- calendario ---------- */
function render(){
  const y=view.getFullYear(), m=view.getMonth();
  document.getElementById('mname').innerHTML=`${MESI[m]} <span>${y}</span>`;

  const first=new Date(y,m,1), days=new Date(y,m+1,0).getDate();
  const offset=(first.getDay()+6)%7;
  const grid=document.getElementById('grid'); grid.innerHTML='';
  const todayS=ymd(new Date());

  for(let i=0;i<offset;i++){const e=document.createElement('div');e.className='cell empty';grid.appendChild(e)}

  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`;
    const s=state.shifts[key];
    const cell=document.createElement('button');
    cell.className='cell'+(s?'':' off')+(key===todayS?' today':'');
    let inner=`<span class="num">${d}</span>`;
    if(s&&isWork(s)){
      const {a,gross}=span(s);
      const c=typeOf(s.type).color;
      const w1=Math.min(gross,1440-a);
      let bars=`<i style="left:${a/14.4}%;width:${w1/14.4}%;background:${c}"></i>`;
      if(gross>w1) bars+=`<i style="left:0;width:${(gross-w1)/14.4}%;background:${c};opacity:.5"></i>`;
      inner+=`<span class="hrs">${fmtPlain(worked(s))}</span><span class="strip">${bars}</span>`;
    }else if(s){
      inner+=`<span class="tag" style="color:${typeOf(s.type).color}">${s.type.slice(0,3).toUpperCase()}</span>`;
    }
    if(s&&issuesFor(key).length) inner+='<span class="warn"></span>';
    cell.innerHTML=inner;
    cell.onclick=()=>openEditor(key);
    grid.appendChild(cell);
  }

  /* riepilogo */
  let tot=0,ex=0,nt=0,worked_days=0,rest_days=0;
  const rows=[];
  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`, s=state.shifts[key];
    if(!s) continue;
    rows.push([key,s]);
    if(!isWork(s)){rest_days++;continue}
    tot+=worked(s); ex+=overtime(s); nt+=nightMin(s); worked_days++;
  }
  document.getElementById('tot-h').innerHTML=fmt(tot);
  document.getElementById('tot-x').innerHTML=fmt(ex);
  document.getElementById('tot-n').innerHTML=fmt(nt);

  const target=Math.round(state.settings.weekHours*60*days/7);
  const base=Math.min(tot,target), over=Math.max(0,tot-target);
  document.getElementById('bar-1').style.width=(target?base/target*100:0)+'%';
  document.getElementById('bar-2').style.width=(target?Math.min(over/target*100,100-base/target*100):0)+'%';
  document.getElementById('bar-left').textContent=`${worked_days} lavorati · ${rest_days} riposi`;
  document.getElementById('bar-right').textContent=`obiettivo ${fmtPlain(target)}`;
  renderWeeks(y,m); renderAlerts(y,m); renderPayroll(y,m);

  const list=document.getElementById('list'); list.innerHTML='';
  if(!rows.length){
    list.innerHTML=`<div class="empty-state">Nessun turno registrato in ${MESI[m].toLowerCase()}.<br>Tocca un giorno del calendario per iniziare.</div>`;
  }else{
    rows.forEach(([key,s])=>{
      const dt=new Date(key+'T00:00:00');
      const t=typeOf(s.type);
      const b=document.createElement('button'); b.className='row';
      b.innerHTML=`<span class="dot" style="background:${t.color}"></span>
        <span class="d">${GIORNI[dt.getDay()]} ${dt.getDate()}</span>
        <span class="t">${t.label}${isWork(s)?`<em>${s.start}–${s.end}${s.break?` · pausa ${s.break}′`:''}${s.note?` · ${s.note}`:''}</em>`:''}</span>
        <span class="h">${isWork(s)?fmtPlain(worked(s)):'—'}</span>`;
      b.onclick=()=>openEditor(key);
      list.appendChild(b);
    });
  }
}

/* ---------- settimane e avvisi ---------- */
function eachWeek(y,m,fn){
  const last=new Date(y,m+1,0);
  let cur=weekStart(new Date(y,m,1));
  while(cur<=last){ fn(cur,weekStats(cur)); cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+7); }
}
function weekOff(w){
  return w.complete && (w.work!==state.settings.workDays || w.rest<state.settings.restDays);
}
function renderWeeks(y,m){
  const box=document.getElementById('weeks'); box.innerHTML='';
  eachWeek(y,m,(start,w)=>{
    const pips=w.days.map(s=>{
      if(!s) return '<i></i>';
      return `<i style="background:${isWork(s)?typeOf(s.type).color:'#ffffff30'}"></i>`;
    }).join('');
    const el=document.createElement('div'); el.className='wk';
    el.innerHTML=`<span class="lb">${start.getDate()}/${start.getMonth()+1}</span>
      <span class="pips">${pips}</span>
      <span class="cnt ${w.complete?(weekOff(w)?'bad':'ok'):''}">${w.work}L ${w.rest}R</span>`;
    box.appendChild(el);
  });
}
function renderAlerts(y,m){
  const box=document.getElementById('alerts'); box.innerHTML='';
  const items=[], days=new Date(y,m+1,0).getDate();
  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`;
    const dt=new Date(key+'T00:00:00');
    issuesFor(key).forEach(i=>{
      if(i.kind==='next'&&new Date(dayAdd(key,1)+'T00:00:00').getMonth()===m) return;
      items.push({key,label:`${GIORNI[dt.getDay()]} ${d} ${MESI[m].toLowerCase()}`,text:i.text});
    });
  }
  eachWeek(y,m,(start,w)=>{
    if(!weekOff(w)) return;
    items.push({key:ymd(start),label:`Settimana del ${start.getDate()}/${start.getMonth()+1}`,
      text:`${w.work} giorni di lavoro e ${w.rest} riposi, invece di ${state.settings.workDays} e ${state.settings.restDays}.`});
  });
  if(!items.length) return;
  const h=document.createElement('div'); h.className='list-title';
  h.style.marginTop='0'; h.textContent=items.length===1?'1 avviso':`${items.length} avvisi`;
  box.appendChild(h);
  items.forEach(it=>{
    const b=document.createElement('button'); b.className='alert';
    b.innerHTML=`<b>${it.label}</b>${it.text}`;
    b.onclick=()=>openEditor(it.key);
    box.appendChild(b);
  });
}

/* ---------- editor ---------- */
function openEditor(key){
  editing=key;
  const s=state.shifts[key];
  draft=s?{...s}:{type:'mattina',start:presetOf('mattina')[0],end:presetOf('mattina')[1],break:state.settings.defaultBreak??0,note:''};
  const dt=new Date(key+'T00:00:00');
  document.getElementById('sheet-title').innerHTML=`${GIORNI[dt.getDay()]} ${dt.getDate()} <span>${MESI[dt.getMonth()].toLowerCase()}</span>`;
  document.getElementById('del').style.display=s?'':'none';
  document.getElementById('f-repeat').value='1';
  paintTypes(); syncFields(); showSheet('sheet');
}
function paintTypes(){
  const c=document.getElementById('types'); c.innerHTML='';
  TYPES.forEach(t=>{
    const b=document.createElement('button');
    b.className='type'+(draft.type===t.id?' on':'');
    b.style.color=t.color;
    b.textContent=t.label;
    b.onclick=()=>{
      draft.type=t.id;
      if(DEFAULTS.presets[t.id]){const pr=presetOf(t.id);draft.start=pr[0];draft.end=pr[1]}
      draft.break=t.brk??(state.settings.defaultBreak||0);
      paintTypes(); syncFields();
    };
    c.appendChild(b);
  });
}
function syncFields(){
  const work=isWork(draft);
  document.getElementById('work-fields').style.display=work?'':'none';
  if(!work) return;
  document.getElementById('f-start').value=draft.start;
  document.getElementById('f-end').value=draft.end;
  document.getElementById('f-break').value=draft.break??0;
  document.getElementById('f-note').value=draft.note||'';
  const w=worked(draft), x=overtime(draft), n=nightMin(draft);
  const iss=issuesFor(editing,draft);
  document.getElementById('calc').innerHTML=
    `Ore conteggiate <b>${fmtPlain(w)}</b><br>`+
    `Di cui straordinario <b class="${x?'x':''}">${fmtPlain(x)}</b> · notturne <b>${fmtPlain(n)}</b>`+
    iss.map(i=>`<span class="issue">${i.text}</span>`).join('');
}
['f-start','f-end','f-break','f-note'].forEach(id=>{
  document.getElementById(id).addEventListener('input',e=>{
    const k={'f-start':'start','f-end':'end','f-break':'break','f-note':'note'}[id];
    draft[k]=k==='break'?Math.max(0,Number(e.target.value)||0):e.target.value;
    if(k!=='note') syncFields();
  });
});
document.getElementById('save').onclick=()=>{
  if(isWork(draft)&&(!draft.start||!draft.end)){toast('Inserisci orario di inizio e fine');return}
  const n=Number(document.getElementById('f-repeat').value)||1;
  const base=new Date(editing+'T00:00:00');
  for(let i=0;i<(isWork(draft)?n:1);i++){
    const d=new Date(base); d.setDate(base.getDate()+i);
    state.shifts[ymd(d)]={...draft};
  }
  save(); closeSheets(); render();
  toast(n>1?`${n} turni salvati`:'Turno salvato');
};
document.getElementById('del').onclick=()=>{delete state.shifts[editing];save();closeSheets();render();toast('Turno eliminato')};

/* ---------- pannelli ---------- */
function showSheet(id){document.getElementById(id).classList.add('on');document.getElementById('scrim').classList.add('on')}
function closeSheets(){document.querySelectorAll('.sheet').forEach(s=>s.classList.remove('on'));document.getElementById('scrim').classList.remove('on')}
document.getElementById('scrim').onclick=closeSheets;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheets()});
document.getElementById('fab').onclick=()=>{
  const t=new Date(), k=(t.getMonth()===view.getMonth()&&t.getFullYear()===view.getFullYear())?ymd(t):ymd(new Date(view.getFullYear(),view.getMonth(),1));
  openEditor(k);
};
document.getElementById('quick-add').onclick=()=>document.getElementById('fab').click();
document.getElementById('quick-import').onclick=()=>{
  const name=state.settings.payroll?.excelName||'';
  if(!name){document.getElementById('settings').click();toast('Inserisci prima il nome usato nel foglio Excel');return}
  document.getElementById('file').click();
};
document.getElementById('prev').onclick=()=>{view.setMonth(view.getMonth()-1);render()};
document.getElementById('next').onclick=()=>{view.setMonth(view.getMonth()+1);render()};

/* ---------- impostazioni ---------- */
const setMap={'s-week':['weekHours','num'],'s-day':['dayThreshold','num'],'s-n1':['night1','str'],'s-n2':['night2','str'],'s-break':['defaultBreak','num'],'s-wd':['workDays','num'],'s-rd':['restDays','num']};
const paySetMap={'s-gross':['monthlyGross','num'],'s-div':['monthlyDivisor','num'],'s-nightp':['nightPct','num'],'s-holp':['holidayPct','num'],'s-holnp':['holidayNightPct','num'],'s-otp':['overtimePct','num'],'s-ded':['deductionPct','num'],'s-xname':['excelName','str']};
document.getElementById('settings').onclick=()=>{
  const s=state.settings;
  document.getElementById('s-week').value=s.weekHours;
  document.getElementById('s-wd').value=s.workDays;
  document.getElementById('s-rd').value=s.restDays;
  document.getElementById('s-day').value=s.dayThreshold;
  document.getElementById('s-n1').value=s.night1;
  document.getElementById('s-n2').value=s.night2;
  document.getElementById('s-break').value=s.defaultBreak??0;
  Object.entries(paySetMap).forEach(([id,[key]])=>{document.getElementById(id).value=s.payroll?.[key]??DEFAULTS.payroll[key]});
    ['m','p','n','d'].forEach((k,i)=>{
    const id=['mattina','pomeriggio','notte','deas'][i];
    const pr=presetOf(id);
    document.getElementById('p-'+k+'1').value=pr[0];
    document.getElementById('p-'+k+'2').value=pr[1];
  });
  document.getElementById('store-info').innerHTML={
    claude:'Archivio: <b>Claude</b><br>I turni ti seguono su tutti i dispositivi.',
    persistente:'Archivio: <b>salvato sul dispositivo</b><br>I turni restano disponibili dopo la ricarica e anche offline.'
  }[store.mode];
  showSheet('sheet-set');
};
Object.entries(setMap).forEach(([id,[key,kind]])=>{
  document.getElementById(id).addEventListener('input',e=>{
    state.settings[key]=kind==='num'?(Number(e.target.value)||0):e.target.value;
    save(); render();
  });
});
Object.entries(paySetMap).forEach(([id,[key,kind]])=>{
  document.getElementById(id).addEventListener('input',e=>{
    if(!state.settings.payroll)state.settings.payroll={...DEFAULTS.payroll};
    state.settings.payroll[key]=kind==='num'?(Number(String(e.target.value).replace(',','.'))||0):e.target.value;
    save(); render();
  });
});
['m','p','n','d'].forEach((k,i)=>{
  const id=['mattina','pomeriggio','notte','deas'][i];
  [0,1].forEach(j=>{
    document.getElementById('p-'+k+(j+1)).addEventListener('input',e=>{
      if(!Array.isArray(state.settings.presets[id])) state.settings.presets[id]=[...DEFAULTS.presets[id]];
      state.settings.presets[id][j]=e.target.value; save();
    });
  });
});
document.getElementById('set-close').onclick=closeSheets;
document.getElementById('wipe').onclick=async()=>{
  if(!confirm('Cancellare tutti i turni salvati? L\u2019operazione non si può annullare.'))return;
  state={shifts:{},settings:{...DEFAULTS}};
  try{await store.del(KEY)}catch(e){}
  closeSheets(); render(); toast('Dati cancellati');
};
document.getElementById('copy').onclick=async()=>{
  const y=view.getFullYear(), m=view.getMonth(), days=new Date(y,m+1,0).getDate();
  let tot=0,ex=0,nt=0,lines=[];
  for(let d=1;d<=days;d++){
    const k=`${y}-${pad(m+1)}-${pad(d)}`, s=state.shifts[k]; if(!s)continue;
    if(isWork(s)){tot+=worked(s);ex+=overtime(s);nt+=nightMin(s);
      lines.push(`${pad(d)} ${typeOf(s.type).label} ${s.start}-${s.end} → ${fmtPlain(worked(s))}`);}
    else lines.push(`${pad(d)} ${typeOf(s.type).label}`);
  }
  const txt=`${MESI[m]} ${y}\n${lines.join('\n')}\n\nTotale ${fmtPlain(tot)} · straordinari ${fmtPlain(ex)} · notturne ${fmtPlain(nt)}`;
  try{await navigator.clipboard.writeText(txt);toast('Riepilogo copiato')}catch(e){toast('Copia non riuscita')}
};
