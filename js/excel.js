(window.__MODULE_VERSIONS=window.__MODULE_VERSIONS||{})['excel']='3.6';
function toType(v){
  const n=norm(v).replace(/\s*\([^)]*\)\s*/g,'').trim();
  if(n.startsWith('deas')||n==='d'||n==='sw')return'deas';
  if(n.startsWith('mal'))return'malattia';
  if(n.startsWith('fer')||n.startsWith('perm')||n.startsWith('lutto')||n==='f')return'ferie';
  if(n.startsWith('rip')||n.startsWith('lib')||n==='r'||n==='rc'||n==='-')return'riposo';
  if(n.startsWith('mat')||n==='m')return'mattina';
  if(n.startsWith('pom')||n==='p')return'pomeriggio';
  if(n.startsWith('not')||n==='n')return'notte';
  return null;
}
const MONTH_NUM={gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,settembre:8,ottobre:9,novembre:10,dicembre:11};

function parsePeriods(names){
  const parsed=names.map(name=>{
    const n=norm(name),monthName=Object.keys(MONTH_NUM).find(m=>n.includes(m)),year=String(name).match(/(?:19|20)\d{2}/);
    return monthName?{month:MONTH_NUM[monthName],year:year?Number(year[0]):null}:null;
  });
  const anchors=parsed.map((p,i)=>p&&p.year!=null?{...p,i}:null).filter(Boolean);
  return parsed.map((p,i)=>{
    if(!p)return null;
    if(p.year!=null)return p;
    if(!anchors.length)return{month:p.month,year:new Date().getFullYear()};
    const a=anchors.slice().sort((x,y)=>Math.abs(x.i-i)-Math.abs(y.i-i))[0];
    const diff=i-a.i;
    const absolute=a.year*12+a.month+diff;
    return{year:Math.floor(absolute/12),month:((absolute%12)+12)%12};
  });
}
function findHeader(rows){
  for(let r=0;r<Math.min(rows.length,25);r++)for(let c=0;c<(rows[r]||[]).length;c++)if(norm(rows[r][c]).includes('nome/turno'))return{r,c};
  /* Nel tuo file la cella A10 può essere vuota: riconosce anche riga giorni + riga giorni-settimana. */
  for(let r=1;r<Math.min(rows.length-1,25);r++){
    const nums=(rows[r]||[]).filter(v=>Number.isInteger(Number(v))&&Number(v)>=1&&Number(v)<=31).length;
    const weekdays=(rows[r+1]||[]).filter(v=>WEEKDAY_CODE.includes(String(v||'').trim().toUpperCase())).length;
    if(nums>=7&&weekdays>=7)return{r:r+1,c:0};
  }
  return null;
}
function nameMatches(cell,wanted){
  const a=norm(cell).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(),b=norm(wanted).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(!a||!b)return false;
  const aw=a.split(' ').filter(Boolean),bw=b.split(' ').filter(Boolean);
  return a===b||a.includes(b)||b.includes(a)||bw.every(x=>aw.includes(x));
}
function validDay(v){const n=Number(String(v??'').trim());return Number.isInteger(n)&&n>=1&&n<=31?n:null}
function makeShift(type){
  const t=TYPES[type];return t.work?{type,start:t.start,end:t.end,break:t.brk||0,note:'Importato da Excel'}:{type,start:'',end:'',break:0,note:'Importato da Excel'};
}
function parseGridSheet(rows,period,wanted){
  const hdr=findHeader(rows);if(!hdr||!period)return[];
  let person=-1;
  for(let r=hdr.r+1;r<rows.length;r++){if(nameMatches(rows[r]?.[hdr.c],wanted)){person=r;break}}
  if(person<0)return[];
  const out=[],row=rows[person]||[];
  for(let c=hdr.c+1;c<row.length;c++){
    const type=toType(row[c]);if(!type)continue;
    const day=validDay(rows[hdr.r-1]?.[c]);if(!day)continue;
    const d=new Date(period.year,period.month,day);
    if(d.getMonth()!==period.month||d.getFullYear()!==period.year)continue;
    const weekday=String(rows[hdr.r]?.[c]??'').trim().toUpperCase();
    if(weekday&&WEEKDAY_CODE[d.getDay()]!==weekday)continue;
    out.push({key:ymd(d),shift:makeShift(type)});
  }
  return out;
}
function parseAllShifts(rows, period) {
  const hdr = findHeader(rows);

  if (!hdr || !period) return {};

  const result = {};

  for (let r = hdr.r + 1; r < rows.length; r++) {
    const name = String(rows[r]?.[hdr.c] || '').trim();

    if (!name) continue;

    /*
     * Evita le righe riepilogative presenti nella parte
     * inferiore del foglio.
     */
    const normalizedName = norm(name);

    if (
      normalizedName === 'm' ||
      normalizedName === 'p' ||
      normalizedName === 'n' ||
      normalizedName.includes('riposi')
    ) {
      continue;
    }

    const row = rows[r] || [];

    for (let c = hdr.c + 1; c < row.length; c++) {
      const type = toType(row[c]);

      /*
       * Nel PDF semplificato servono solamente:
       * N = notte
       * M = mattina
       * P = pomeriggio
       */
      if (
        type !== 'notte' &&
        type !== 'mattina' &&
        type !== 'pomeriggio'
      ) {
        continue;
      }

      const day = validDay(rows[hdr.r - 1]?.[c]);

      if (!day) continue;

      const date = new Date(
        period.year,
        period.month,
        day
      );

      if (
        date.getMonth() !== period.month ||
        date.getFullYear() !== period.year
      ) {
        continue;
      }

      const weekday =
        String(rows[hdr.r]?.[c] ?? '')
          .trim()
          .toUpperCase();

      if (
        weekday &&
        WEEKDAY_CODE[date.getDay()] !== weekday
      ) {
        continue;
      }

      const key = ymd(date);

      if (!result[key]) {
        result[key] = {
          notte: [],
          mattina: [],
          pomeriggio: []
        };
      }

      result[key][type].push(name);
    }
  }

  return result;
}
let pendingAllShifts = {};
document.getElementById('importBtn').onclick=()=>{
  if(!state.settings.excelName){document.getElementById('settings').click();return}
  document.getElementById('fileInput').click();
};
document.getElementById('fileInput').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  if(typeof XLSX==='undefined'){alert('La libreria Excel non è disponibile. Apri una volta l’app con internet.');return}
  try{
    const wb=XLSX.read(new Uint8Array(await f.arrayBuffer()),{type:'array',cellDates:true});
  const periods = parsePeriods(wb.SheetNames);
  const map = new Map();
  const allShifts = {};

    wb.SheetNames.forEach((name, i) => {
    const rows = XLSX.utils.sheet_to_json(
      wb.Sheets[name],
    {
      header: 1,
      defval: '',
      blankrows: false,
      raw: true
    }
  );

  /*
   * Importazione personale invariata.
   */
  parseGridSheet(
    rows,
    periods[i],
    state.settings.excelName
  ).forEach(x => map.set(x.key, x));

  /*
   * Legge anche tutti i colleghi per il PDF semplificato.
   */
  const sheetShifts = parseAllShifts(
    rows,
    periods[i]
  );

  Object.assign(allShifts, sheetShifts);
});

pendingAllShifts = allShifts;
    pending=[...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
    if(!pending.length){alert(`Nessun turno trovato per “${state.settings.excelName}”.`);return}
    document.getElementById('previewText').textContent=`Trovati ${pending.length} giorni. L'importazione sostituirà soltanto i vecchi turni importati da Excel.`;
    const box=document.getElementById('previewList');box.innerHTML='';
    pending.slice(0,120).forEach(p=>{
      const d=new Date(p.key+'T00:00:00'),t=TYPES[p.shift.type],r=document.createElement('div');
      r.className='row';r.innerHTML=`<span>${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}</span><span class="grow">${t.label}</span>`;box.appendChild(r);
    });
    document.getElementById('previewDialog').showModal();
  }catch(err){console.error(err);alert('File Excel non leggibile o formato non riconosciuto.')}
});
document.getElementById('confirmImport').onclick=()=>{
  Object.keys(state.shifts).forEach(k=>{if(state.shifts[k]?.note==='Importato da Excel')delete state.shifts[k]});
  pending.forEach(p=>state.shifts[p.key]=p.shift);
  const last=pending.at(-1)?.key;if(last){const d=new Date(last+'T00:00:00');view=new Date(d.getFullYear(),d.getMonth(),1)}
  pending=[];saveState();render();document.getElementById('previewDialog').close();
};
document.getElementById('cancelImport').onclick=()=>{pending=[];document.getElementById('previewDialog').close()};
