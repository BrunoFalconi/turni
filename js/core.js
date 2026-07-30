'use strict';

const STORAGE_KEY='turni-app-stabile-v1';
const MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAYS=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const WEEKDAY_CODE=['D','L','M','M','G','V','S'];
const TYPES={
  mattina:{label:'Mattina',start:'08:00',end:'16:00',color:'var(--m)',work:true},
  pomeriggio:{label:'Pomeriggio',start:'16:00',end:'00:00',color:'var(--p)',work:true},
  notte:{label:'Notte',start:'00:00',end:'08:00',color:'var(--n)',work:true},
  deas:{label:'DEAS',start:'09:00',end:'18:00',color:'var(--deas)',work:true,brk:60},
  riposo:{label:'Riposo',start:'',end:'',color:'var(--muted)',work:false},
  ferie:{label:'Ferie',start:'',end:'',color:'var(--f)',work:false},
  malattia:{label:'Malattia',start:'',end:'',color:'var(--mal)',work:false}
};
const DEFAULT_STATE={
  shifts:{},
  settings:{
    excelName:'',
    gross:2538.46,
    divisor:173,
    nightPct:50,
    holidayPct:50,
    holidayNightPct:55,
    deductionPct:31.34,
    nightStart:'22:00',
    nightEnd:'06:00'
  }
};

let state=loadState();
let view=new Date(); view.setDate(1);
let editingKey=null;
let draft=null;
let pending=[];

function clone(v){return JSON.parse(JSON.stringify(v))}
function pad(n){return String(n).padStart(2,'0')}
function ymd(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function toMin(t){const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m}
function fmtMin(min){const h=Math.floor(min/60),m=min%60;return m?`${h}h ${pad(m)}`:`${h}h`}
function euro(n){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n)||0)}
function norm(s){return String(s??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}

function normalizeState(raw){
  const s=raw&&typeof raw==='object'?raw:{};
  return {shifts:s.shifts&&typeof s.shifts==='object'?s.shifts:{},settings:{...DEFAULT_STATE.settings,...(s.settings||{})}};
}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    return raw?normalizeState(JSON.parse(raw)):clone(DEFAULT_STATE);
  }catch(e){
    console.error('Errore caricamento',e);
    return clone(DEFAULT_STATE);
  }
}
function saveState(){
  try{
    const payload=JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY,payload);
    const ok=localStorage.getItem(STORAGE_KEY)===payload;
    document.getElementById('status').textContent=ok?`Salvato sul dispositivo · ${Object.keys(state.shifts).length} giorni`:'Salvataggio non riuscito.';
    return ok;
  }catch(e){
    console.error('Errore salvataggio',e);
    document.getElementById('status').textContent='Il browser ha bloccato il salvataggio.';
    return false;
  }
}

function span(s){let a=toMin(s.start),b=toMin(s.end);if(b<=a)b+=1440;return{a,b,gross:b-a}}
function worked(s){if(!TYPES[s.type]?.work)return 0;return Math.max(0,span(s).gross-(Number(s.break)||0))}
function nightMinutes(s){
  if(!TYPES[s.type]?.work)return 0;
  const {a,b}=span(s),n1=toMin(state.settings.nightStart),n2=toMin(state.settings.nightEnd);
  let tot=0;
  for(let d=-1;d<=1;d++){const x=n1+d*1440,y=(n2>n1?n2:n2+1440)+d*1440;tot+=Math.max(0,Math.min(b,y)-Math.max(a,x))}
  return Math.min(tot,b-a);
}
function easterSunday(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31)-1,day=(h+l-7*m+114)%31+1;
  return new Date(y,mo,day);
}
function isHoliday(d){
  if(d.getDay()===0)return true;
  const md=pad(d.getMonth()+1)+'-'+pad(d.getDate());
  if(['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'].includes(md))return true;
  const e=easterSunday(d.getFullYear()),em=new Date(e);em.setDate(e.getDate()+1);
  return ymd(d)===ymd(em);
}
function minuteBuckets(key,s){
  const out={night:0,holiday:0,holidayNight:0};
  if(!TYPES[s.type]?.work)return out;
  const {a,b}=span(s),end=Math.max(a,b-(Number(s.break)||0));
  const n1=toMin(state.settings.nightStart),n2=toMin(state.settings.nightEnd);
  const isNight=min=>{const local=((min%1440)+1440)%1440;return n2>n1?(local>=n1&&local<n2):(local>=n1||local<n2)};
  for(let min=a;min<end;min++){
    const off=Math.floor(min/1440),d=new Date(key+'T00:00:00');d.setDate(d.getDate()+off);
    const h=isHoliday(d),n=isNight(min);
    if(h&&n)out.holidayNight++;else if(h)out.holiday++;else if(n)out.night++;
  }
  return out;
}
function payroll(y,m){
  const mins={night:0,holiday:0,holidayNight:0},days=new Date(y,m+1,0).getDate();
  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`,s=state.shifts[key];if(!s)continue;
    const b=minuteBuckets(key,s);Object.keys(mins).forEach(k=>mins[k]+=b[k]);
  }
  const hourly=Number(state.settings.gross)/(Number(state.settings.divisor)||173);
  const amounts={
    night:mins.night/60*hourly*Number(state.settings.nightPct)/100,
    holiday:mins.holiday/60*hourly*Number(state.settings.holidayPct)/100,
    holidayNight:mins.holidayNight/60*hourly*Number(state.settings.holidayNightPct)/100
  };
  const extras=amounts.night+amounts.holiday+amounts.holidayNight,gross=Number(state.settings.gross)+extras,deductions=gross*Number(state.settings.deductionPct)/100;
  return{mins,amounts,gross,deductions,net:gross-deductions};
}

function render(){
  const y=view.getFullYear(),m=view.getMonth();
  document.getElementById('month').innerHTML=`${MONTHS[m]} <span>${y}</span>`;
  const cal=document.getElementById('calendar');cal.innerHTML='';
  const first=new Date(y,m,1),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),today=ymd(new Date());
  for(let i=0;i<offset;i++){const e=document.createElement('div');e.className='day empty';cal.appendChild(e)}
  let total=0,night=0,rests=0;const list=[];
  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`,s=state.shifts[key],b=document.createElement('button');
    b.className='day'+(key===today?' today':'');b.innerHTML=`<div class="num">${d}</div>`;
    if(s){
      const t=TYPES[s.type]||TYPES.riposo;
      if(t.work){total+=worked(s);night+=nightMinutes(s);b.innerHTML+=`<div class="tag" style="color:${t.color}">${t.label}</div><div class="hours">${fmtMin(worked(s))}</div>`}
      else{rests++;b.innerHTML+=`<div class="tag" style="color:${t.color}">${t.label}</div>`}
      list.push([key,s]);
    }
    b.onclick=()=>openShift(key);cal.appendChild(b);
  }
  document.getElementById('totHours').textContent=fmtMin(total);
  document.getElementById('totNight').textContent=fmtMin(night);
  document.getElementById('totRest').textContent=rests;
  document.getElementById('status').textContent=`Salvato sul dispositivo · ${Object.keys(state.shifts).length} giorni`;

  if(typeof renderStats==='function')renderStats(y,m);

  const p=payroll(y,m);
  document.getElementById('pay').innerHTML=`
    <div class="payrow"><span>Lordo fisso</span><span>${euro(state.settings.gross)}</span></div>
    <div class="payrow"><span>Notturne ${fmtMin(p.mins.night)} · ${state.settings.nightPct}%</span><span>+ ${euro(p.amounts.night)}</span></div>
    <div class="payrow"><span>Festivi ${fmtMin(p.mins.holiday)} · ${state.settings.holidayPct}%</span><span>+ ${euro(p.amounts.holiday)}</span></div>
    <div class="payrow"><span>Festivi notturni ${fmtMin(p.mins.holidayNight)} · ${state.settings.holidayNightPct}%</span><span>+ ${euro(p.amounts.holidayNight)}</span></div>
    <div class="payrow"><strong>Netto stimato</strong><strong>${euro(p.net)}</strong></div>`;

  const listBox=document.getElementById('list');listBox.innerHTML='';
  for(const [key,s] of list){
    const d=new Date(key+'T00:00:00'),t=TYPES[s.type]||TYPES.riposo,row=document.createElement('button');
    row.className='row';row.innerHTML=`<span class="dot" style="background:${t.color}"></span><span>${DAYS[d.getDay()]} ${d.getDate()}</span><span class="grow">${t.label}<div class="small">${t.work?`${s.start}–${s.end}`:''}</div></span><span>${t.work?fmtMin(worked(s)):'—'}</span>`;
    row.onclick=()=>openShift(key);listBox.appendChild(row);
  }
}

function openShift(key){
  editingKey=key;
  const old=state.shifts[key];
  draft=old?clone(old):{type:'mattina',start:TYPES.mattina.start,end:TYPES.mattina.end,break:0,note:''};
  const d=new Date(key+'T00:00:00');
  document.getElementById('shiftTitle').textContent=`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  renderTypes();syncShiftFields();
  document.getElementById('deleteShift').style.display=old?'':'none';
  document.getElementById('shiftDialog').showModal();
}
function renderTypes(){
  const box=document.getElementById('types');box.innerHTML='';
  for(const [id,t] of Object.entries(TYPES)){
    const b=document.createElement('button');b.className='type'+(draft.type===id?' on':'');b.textContent=t.label;
    b.onclick=()=>{draft.type=id;draft.start=t.start;draft.end=t.end;draft.break=t.brk||0;renderTypes();syncShiftFields()};box.appendChild(b);
  }
}
function syncShiftFields(){
  document.getElementById('start').value=draft.start||'';
  document.getElementById('end').value=draft.end||'';
  document.getElementById('break').value=draft.break||0;
  document.getElementById('note').value=draft.note||'';
}
['start','end','break','note'].forEach(id=>document.getElementById(id).addEventListener('input',e=>{
  draft[id==='break'?'break':id]=id==='break'?Number(e.target.value)||0:e.target.value;
}));
document.getElementById('saveShift').onclick=()=>{state.shifts[editingKey]=clone(draft);saveState();render();document.getElementById('shiftDialog').close()};
document.getElementById('deleteShift').onclick=()=>{delete state.shifts[editingKey];saveState();render();document.getElementById('shiftDialog').close()};
document.getElementById('closeShift').onclick=()=>document.getElementById('shiftDialog').close();

document.getElementById('prev').onclick=()=>{view.setMonth(view.getMonth()-1);render()};
document.getElementById('next').onclick=()=>{view.setMonth(view.getMonth()+1);render()};
document.getElementById('addBtn').onclick=()=>{
  const now=new Date(),key=(now.getFullYear()===view.getFullYear()&&now.getMonth()===view.getMonth())?ymd(now):ymd(new Date(view.getFullYear(),view.getMonth(),1));
  openShift(key);
};
document.getElementById('settings').onclick=()=>{
  for(const id of ['excelName','gross','divisor','nightPct','holidayPct','holidayNightPct','deductionPct'])document.getElementById(id).value=state.settings[id];
  document.getElementById('settingsDialog').showModal();
};
document.getElementById('saveSettings').onclick=()=>{
  for(const id of ['excelName','gross','divisor','nightPct','holidayPct','holidayNightPct','deductionPct'])state.settings[id]=id==='excelName'?document.getElementById(id).value:(Number(document.getElementById(id).value)||0);
  saveState();render();document.getElementById('settingsDialog').close();
};
document.getElementById('closeSettings').onclick=()=>document.getElementById('settingsDialog').close();
document.getElementById('wipeAll').onclick=()=>{if(confirm('Cancellare tutti i dati?')){state=clone(DEFAULT_STATE);saveState();render();document.getElementById('settingsDialog').close()}};
document.getElementById('clearMonthBtn').onclick=()=>{
  const y=view.getFullYear(),m=view.getMonth();if(!confirm(`Cancellare tutti i turni di ${MONTHS[m]} ${y}?`))return;
  Object.keys(state.shifts).forEach(k=>{const d=new Date(k+'T00:00:00');if(d.getFullYear()===y&&d.getMonth()===m)delete state.shifts[k]});
  saveState();render();
};
