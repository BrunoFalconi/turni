/* ---------- importazione da Excel ---------- */
const norm=s=>String(s??'').trim().toLowerCase()
  .replace(/[àáâ]/g,'a').replace(/[èé]/g,'e').replace(/[ìí]/g,'i').replace(/[òó]/g,'o').replace(/[ùú]/g,'u');
const COLS={
  date:['data','giorno','date'],
  type:['turno','tipo','shift','codice','sigla'],
  start:['inizio','entrata','dalle','ora inizio','start'],
  end:['fine','uscita','alle','ora fine','end'],
  brk:['pausa','break'],
  note:['note','nota','commento','reparto','sede']
};
function matchCol(h){
  const n=norm(h); if(!n) return null;
  for(const [k,names] of Object.entries(COLS)) if(names.some(x=>n===x||n.startsWith(x))) return k;
  return null;
}
function toDate(v){
  if(v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(),v.getMonth(),v.getDate());
  if(typeof v==='number' && v>20000 && v<80000){
    const d=XLSX.SSF.parse_date_code(v); return d?new Date(d.y,d.m-1,d.d):null;
  }
  const s=String(v??'').trim(); if(!s) return null;
  let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(m){let y=+m[3]; if(y<100)y+=2000; return new Date(y,+m[2]-1,+m[1]);}
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  const d=new Date(s); return isNaN(d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function toTime(v){
  if(v instanceof Date && !isNaN(v)) return pad(v.getHours())+':'+pad(v.getMinutes());
  if(typeof v==='number'){
    let f=v%1; if(f===0 && v>=1 && v<24) f=v/24;
    const mins=Math.round(f*1440)%1440;
    return pad(Math.floor(mins/60))+':'+pad(mins%60);
  }
  const s=String(v??'').trim(); if(!s) return null;
  const m=s.match(/^(\d{1,2})\s*[:.hH]?\s*(\d{2})?/); if(!m) return null;
  return pad(+m[1]%24)+':'+pad(m[2]?+m[2]:0);
}
function toType(v){
  /* Accetta anche codici come M (A), P (A), N (A), PERMESSO e LUTTO. */
  const raw=norm(v); if(!raw) return null;
  const n=raw.replace(/\s*\([^)]*\)\s*/g,'').trim();
  if(n.startsWith('deas')||n.startsWith('smart')||n==='sw'||n==='d') return 'deas';
  if(n.startsWith('mal')) return 'malattia';
  if(n.startsWith('fer')||n.startsWith('perm')||n.startsWith('lutto')||n==='f') return 'ferie';
  if(n.startsWith('rip')||n.startsWith('lib')||n==='r'||n==='l'||n==='-') return 'riposo';
  if(n.startsWith('mat')||n==='m') return 'mattina';
  if(n.startsWith('pom')||n==='p') return 'pomeriggio';
  if(n.startsWith('not')||n==='n') return 'notte';
  return null;
}
function rowToShift(cells,map){
  const d=toDate(cells[map.date]); if(!d) return null;
  let type=map.type!=null?toType(cells[map.type]):null;
  let st=map.start!=null?toTime(cells[map.start]):null;
  let en=map.end!=null?toTime(cells[map.end]):null;
  if(!type&&!st) return null;
  if(type&&!typeOf(type).work) return {key:ymd(d),shift:{type,start:'',end:'',break:0,note:''}};
  if(!st&&type&&DEFAULTS.presets[type]) [st,en]=presetOf(type);
  if(!st||!en) return null;
  if(!type){
    type=Object.keys(DEFAULTS.presets).find(k=>presetOf(k)[0]===st)||(toMin(st)<12?'mattina':toMin(st)<20?'pomeriggio':'notte');
  }
  const brk=map.brk!=null?Math.max(0,Number(String(cells[map.brk]).replace(',','.'))||0):(typeOf(type).brk??state.settings.defaultBreak??0);
  return {key:ymd(d),shift:{type,start:st,end:en,break:brk,note:map.note!=null?String(cells[map.note]??'').trim():''}};
}
let pending=[];
function openPreview(label,skipped){
  const dup=pending.filter(p=>state.shifts[p.key]).length;
  document.getElementById('imp-sum').innerHTML=
    `<b>${pending.length}</b> turni letti da <b>${label}</b><br>`+
    `Non riconosciuti <b>${skipped}</b> · già presenti in agenda <b>${dup}</b>`;
  const box=document.getElementById('imp-list'); box.innerHTML='';
  pending.forEach(p=>{
    const dt=new Date(p.key+'T00:00:00'), t=typeOf(p.shift.type);
    const row=document.createElement('div'); row.className='row';
    row.innerHTML=`<span class="dot" style="background:${t.color}"></span>
      <span class="d">${GIORNI[dt.getDay()]} ${dt.getDate()}/${dt.getMonth()+1}</span>
      <span class="t">${t.label}${isWork(p.shift)?`<em>${p.shift.start}–${p.shift.end}</em>`:''}</span>
      <span class="h">${isWork(p.shift)?fmtPlain(worked(p.shift)):'—'}</span>`;
    box.appendChild(row);
  });
  closeSheets(); showSheet('sheet-imp');
}
const MONTH_NUM={gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,settembre:8,ottobre:9,novembre:10,dicembre:11};
const WEEKDAY_CODE=['D','L','M','M','G','V','S'];

function parseSheetPeriod(sheetName,allNames,index){
  const rawName=String(sheetName||'').trim();
  const n=norm(rawName);
  const monthName=Object.keys(MONTH_NUM).find(m=>n.includes(m));
  if(!monthName)return null;

  /* Un anno tra parentesi appartiene direttamente a quel foglio:
     "Giugno (2026)" = giugno 2026, "Luglio (2026)" = luglio 2026. */
  const parenthesizedYear=rawName.match(/\((19|20)\d{2}\)/);
  if(parenthesizedYear){
    return {month:MONTH_NUM[monthName],year:Number(parenthesizedYear[1])};
  }

  /* Accetta anche nomi senza parentesi, ad esempio "Giugno 2026". */
  const explicitYear=rawName.match(/(?:19|20)\d{2}/);
  if(explicitYear){
    return {month:MONTH_NUM[monthName],year:Number(explicitYear[0])};
  }

  /* Per i fogli senza anno usa il foglio con anno esplicito più vicino
     come ancora temporale e calcola la distanza in mesi reali. */
  let best=null;
  allNames.forEach((name,i)=>{
    const candidate=String(name||'').trim();
    const nn=norm(candidate);
    const mn=Object.keys(MONTH_NUM).find(m=>nn.includes(m));
    const yy=candidate.match(/(?:19|20)\d{2}/);
    if(!mn||!yy)return;
    const dist=Math.abs(i-index);
    if(!best||dist<best.dist){
      best={i,month:MONTH_NUM[mn],year:Number(yy[0]),dist};
    }
  });

  if(!best){
    return {month:MONTH_NUM[monthName],year:new Date().getFullYear()};
  }

  /* Usa il numero del mese, non soltanto la posizione del foglio.
     Così maggio prima di "Giugno (2026)" diventa maggio 2026 e
     dicembre prima di gennaio passa correttamente all'anno precedente. */
  let year=best.year;
  const targetMonth=MONTH_NUM[monthName];
  if(index<best.i && targetMonth>best.month) year--;
  if(index>best.i && targetMonth<best.month) year++;
  return {month:targetMonth,year};
}

function findTurnisticaHeader(rows){
  for(let r=0;r<Math.min(rows.length,24);r++){
    for(let c=0;c<(rows[r]||[]).length;c++){
      const v=norm(rows[r][c]);
      if(v==='nome/turno'||v.includes('nome/turno'))return {r,c};
    }
  }
  return null;
}

function nameMatches(cell,wanted){
  const a=norm(cell).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const b=norm(wanted).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(!a||!b)return false;
  const aw=a.split(' ').filter(Boolean),bw=b.split(' ').filter(Boolean);
  return a===b||a.includes(b)||b.includes(a)||bw.every(x=>aw.includes(x));
}

function validDayNumber(v){
  const n=Number(String(v??'').trim());
  return Number.isInteger(n)&&n>=1&&n<=31?n:null;
}

function dateForTurnisticaColumn(rows,hdr,col,period){
  if(!period)return null;
  const day=validDayNumber(rows[hdr.r-1]?.[col]);
  if(!day)return null;
  const weekday=String(rows[hdr.r]?.[col]??'').trim().toUpperCase();

  /* Il foglio contiene ai bordi giorni del mese precedente/successivo.
     La data è valida solo quando numero e giorno della settimana coincidono
     con il mese indicato dal nome del foglio. */
  const d=new Date(period.year,period.month,day);
  if(d.getFullYear()!==period.year||d.getMonth()!==period.month||d.getDate()!==day)return null;
  if(weekday&&WEEKDAY_CODE[d.getDay()]!==weekday)return null;
  return d;
}

function parseTurnisticaSheet(rows,sheetName,allNames,index,wanted){
  const hdr=findTurnisticaHeader(rows);
  if(!hdr)return {items:[],skipped:0,found:false};
  let personRow=-1;
  for(let r=hdr.r+1;r<rows.length;r++){
    if(nameMatches(rows[r]?.[hdr.c],wanted)){personRow=r;break;}
  }
  if(personRow<0)return {items:[],skipped:0,found:false};

  const period=parseSheetPeriod(sheetName,allNames,index);
  const items=[];let skipped=0;
  const row=rows[personRow]||[];
  for(let c=hdr.c+1;c<row.length;c++){
    const raw=String(row[c]??'').trim();
    if(!raw)continue;
    const type=toType(raw);
    if(!type){
      /* Le colonne riepilogative a destra contengono numeri: non sono turni. */
      if(!/^\d+(?:[.,]\d+)?$/.test(raw))skipped++;
      continue;
    }
    const date=dateForTurnisticaColumn(rows,hdr,c,period);
    if(!date)continue;
    items.push({key:ymd(date),shift:gridShift(type)});
  }
  return {items,skipped,found:true,label:String(rows[personRow][hdr.c]||wanted)};
}

document.getElementById('imp').onclick=()=>document.getElementById('file').click();
document.getElementById('file').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f)return;
  e.target.value='';
  if(typeof XLSX==='undefined'){toast('Libreria Excel non caricata: riapri la pagina online');return;}
  try{
    const workbook=XLSX.read(new Uint8Array(await f.arrayBuffer()),{type:'array',cellDates:true});
    const wanted=String(state.settings.payroll?.excelName||'').trim();
    if(!wanted){toast('Inserisci prima il tuo nome nelle impostazioni');return;}

    const all=new Map();let skipped=0;const used=[];
    for(let si=0;si<workbook.SheetNames.length;si++){
      const sheetName=workbook.SheetNames[si];
      const ws=workbook.Sheets[sheetName];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false,raw:true});
      if(!rows.length)continue;

      const grid=parseTurnisticaSheet(rows,sheetName,workbook.SheetNames,si,wanted);
      if(grid.found){
        grid.items.forEach(x=>all.set(x.key,x));
        skipped+=grid.skipped;
        if(grid.items.length)used.push(`${sheetName} · ${grid.label}`);
        continue;
      }

      /* Supporto secondario per file semplici con colonne Data e Turno. */
      let map=null,head=-1;
      for(let r=0;r<Math.min(rows.length,20);r++){
        const mm={};
        (rows[r]||[]).forEach((cell,c)=>{const k=matchCol(cell);if(k&&mm[k]==null)mm[k]=c;});
        if(mm.date!=null&&(mm.type!=null||mm.start!=null)){map=mm;head=r;break;}
      }
      if(map){
        let count=0;
        for(let r=head+1;r<rows.length;r++){
          const item=rowToShift(rows[r],map);
          if(item){all.set(item.key,item);count++;}
        }
        if(count)used.push(sheetName);
      }
    }

    pending=[...all.values()].sort((a,b)=>a.key.localeCompare(b.key));
    if(!pending.length){toast(`Nessun turno trovato per “${wanted}”`);return;}
    openPreview(`${pending.length} turni · ${used.length} fogli`,skipped);
  }catch(err){
    console.error(err);
    toast('File Excel non leggibile o formato non riconosciuto');
  }
});
function gridShift(type){
  if(!typeOf(type).work)return {type,start:'',end:'',break:0,note:''};
  const pr=presetOf(type);return {type,start:pr[0],end:pr[1],break:typeOf(type).brk??state.settings.defaultBreak??0,note:'Importato da Excel'};
}
document.getElementById('imp-cancel').onclick=()=>{pending=[];closeSheets()};
document.getElementById('imp-go').onclick=async()=>{
  const over=document.getElementById('imp-over').checked;
  let n=0;
  if(over){
    /* Elimina i vecchi turni importati, compresi quelli salvati con date errate da versioni precedenti. */
    Object.keys(state.shifts).forEach(k=>{
      if(state.shifts[k]?.note==='Importato da Excel') delete state.shifts[k];
    });
  }
  pending.forEach(p=>{ if(state.shifts[p.key]&&!over) return; state.shifts[p.key]={...p.shift}; n++; });
  const last=pending.map(p=>p.key).sort().at(-1);
  if(last){const d=new Date(last+'T00:00:00'); view=new Date(d.getFullYear(),d.getMonth(),1);}
  pending=[];
  const saved=await saveNow();
  closeSheets(); render();
  toast(saved?(n?`${n} turni importati e salvati`:'Nessun turno aggiunto'):'Turni importati, ma il browser ha bloccato il salvataggio');
};
document.getElementById('tpl').onclick=()=>{
  if(typeof XLSX==='undefined'){toast('Libreria non caricata: riapri la pagina online');return}
  const p={mattina:presetOf('mattina'),pomeriggio:presetOf('pomeriggio'),notte:presetOf('notte'),deas:presetOf('deas')};
  const aoa=[['Data','Turno','Inizio','Fine','Pausa','Note'],
    ['01/09/2026','Mattina',p.mattina[0],p.mattina[1],0,''],
    ['02/09/2026','Pomeriggio',p.pomeriggio[0],p.pomeriggio[1],0,''],
    ['03/09/2026','Notte',p.notte[0],p.notte[1],0,''],
    ['04/09/2026','DEAS',p.deas[0],p.deas[1],60,'Smart working'],
    ['05/09/2026','Riposo','','','','']];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Turni');
  XLSX.writeFile(wb,'modello-turni.xlsx');
};
