(window.__MODULE_VERSIONS=window.__MODULE_VERSIONS||{})['core']='3.5';
'use strict';

const APP_VERSION='3.5';
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
  monthOverrides:{},
  payslipRegistry:{},
  settings:{
    profileName:'',
    excelName:'',
    payslipFileName:'',
    payslipImportedAt:'',
    gross:2538.46,
    divisor:173,
    /* Base su cui si calcolano le maggiorazioni.
       In busta paga di solito NON coincide con il lordo fisso:
       è paga base + contingenza + EDR, senza superminimo e indennità.
       0 = usa il lordo fisso (comportamento vecchio). */
    premiumBase:0,
    premiumDivisor:0,
    nightPct:50,
    holidayPct:50,
    holidayNightPct:55,
    deductionPct:31.34,
    socialPct:9.49,
    /* Detrazione mensile aggiuntiva (F02801 nel cedolino Zucchetti). */
    additionalDeduction:0,
    /* Mese di riferimento per i mesi privi di cedolino. */
    baselineMonth:'',
    taxPct:0,
    fixedExtraDeductions:0,
    regionalInstallment:0,
    municipalBalanceInstallment:0,
    municipalAdvanceInstallment:0,
    localTaxes:0,
    cometaEmployee:28.94,
    cometaEmployer:48.23,
    cometaDeductible:77.17,
    otherDeductions:0,
    otherEarnings:0,
    workingDaysAnnual:365,
    otherAnnualIncome:0,
    useSubstituteTax:false,
    substituteTaxRate:15,
    substituteAnnualLimit:1500,
    substituteUsedYtd:0,
    /* Correzione fine del netto: differenza costante fra netto reale
       e netto stimato (voci non modellate, arrotondamenti, conguagli). */
    netAdjustment:0,
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
  const saved={...(s.settings||{})};

  /* Migrazione dalle vecchie versioni che avevano un solo campo Cometa. */
  if(saved.cometaEmployee==null && saved.cometaAmount!=null){
    saved.cometaEmployee=Number(saved.cometaAmount)||0;
  }
  if(saved.cometaEmployer==null)saved.cometaEmployer=0;
  if(saved.cometaDeductible==null){
    saved.cometaDeductible=
      (Number(saved.cometaEmployee)||0)+(Number(saved.cometaEmployer)||0);
  }
  delete saved.cometaAmount;

  return {
    shifts:s.shifts&&typeof s.shifts==='object'?s.shifts:{},
    monthOverrides:(s.monthOverrides&&typeof s.monthOverrides==='object'?s.monthOverrides:null)
      ||(s.premiumOverrides&&typeof s.premiumOverrides==='object'?s.premiumOverrides:{}),
    payslipRegistry:s.payslipRegistry&&typeof s.payslipRegistry==='object'?s.payslipRegistry:{},
    settings:{...DEFAULT_STATE.settings,...saved}
  };
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
    document.getElementById('status').textContent=ok
      ?`v${APP_VERSION} · salvato sul dispositivo · ${Object.keys(state.shifts).length} giorni`
      :'Salvataggio non riuscito.';
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
function annualGrossIrpef(income){
  const x=Math.max(0,Number(income)||0);
  if(x<=28000)return x*0.23;
  if(x<=50000)return 6440+(x-28000)*0.35;
  return 14140+(x-50000)*0.43;
}

function employeeAnnualDeduction(income,workingDays=365){
  const x=Math.max(0,Number(income)||0);
  let d=0;
  if(x<=15000)d=1955;
  else if(x<=28000)d=1910+1190*((28000-x)/13000);
  else if(x<=50000)d=1910*((50000-x)/22000);
  if(x>25000&&x<=35000)d+=65;
  return Math.max(0,d)*Math.min(365,Math.max(0,workingDays))/365;
}

/* Mese di riferimento scelto dall'app quando l'utente non ne ha indicato
   uno. Fra i cedolini caricati si preferisce quello con le trattenute
   fisse piu basse: un mese con arretrati EPAR non e rappresentativo e
   ripeterebbe quegli importi su tutti gli altri mesi. A parita, vince il
   piu recente. */
function autoBaselineMonth(){
  const registry=state.payslipRegistry||{};
  const overrides=state.monthOverrides||{};
  const keys=Object.keys(registry);
  if(!keys.length)return '';

  return keys.sort((a,b)=>{
    const ea=Number(overrides[a]?.fixedExtraDeductions)||0;
    const eb=Number(overrides[b]?.fixedExtraDeductions)||0;
    if(ea!==eb)return ea-eb;
    return b.localeCompare(a);
  })[0];
}

function payroll(y,m){
  const mins={night:0,holiday:0,holidayNight:0},days=new Date(y,m+1,0).getDate();
  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`,s=state.shifts[key];if(!s)continue;
    const b=minuteBuckets(key,s);Object.keys(mins).forEach(k=>mins[k]+=b[k]);
  }

  /* Le ore contate dai turni non sempre coincidono con quelle pagate.
     Con la banca ore la maggiorazione si applica alle ore accantonate,
     non a ogni ora notturna o festiva lavorata. Quando il mese ha un
     override, le ore inserite a mano hanno la precedenza. */
  const monthKey=`${y}-${pad(m+1)}`;
  const override=(state.monthOverrides||state.premiumOverrides||{})[monthKey]||{};
  const overridden=Object.keys(override).length>0;
  if(override.night!=null)mins.night=Math.round(Number(override.night)*60)||0;
  if(override.holiday!=null)mins.holiday=Math.round(Number(override.holiday)*60)||0;
  if(override.holidayNight!=null)mins.holidayNight=Math.round(Number(override.holidayNight)*60)||0;

  /* Alcune voci non sono costanti: gli arretrati EPAR compaiono solo in
     certi mesi, l'ulteriore detrazione varia con l'imponibile, le rate
     delle addizionali si arrotondano diversamente.
     Ordine di precedenza:
       1. il mese stesso, se ha un cedolino caricato;
       2. il "mese tipo" scelto dall'utente, per i mesi senza cedolino;
       3. il profilo generale.
     Il mese tipo va scelto fra quelli normali: se si indica un mese con
     arretrati, quegli importi verrebbero ripetuti ovunque. */
  const baselineKey=state.settings.baselineMonth||autoBaselineMonth();
  const baseline=(baselineKey&&baselineKey!==monthKey)
    ?((state.monthOverrides||{})[baselineKey]||{})
    :{};

  const pick=name=>{
    if(override[name]!=null)return Number(override[name])||0;
    if(baseline[name]!=null)return Number(baseline[name])||0;
    return Number(state.settings[name])||0;
  };

  /* Un mese è "verificato" solo se ha il proprio cedolino: le ore della
     banca ore non sono deducibili dai turni, quindi altrove è una stima. */
  const verified=!!(state.payslipRegistry||{})[monthKey];

  const baseGross=Number(state.settings.gross)||0;
  const divisor=Number(state.settings.divisor)||173;
  const hourly=baseGross/divisor;

  /* Le maggiorazioni si calcolano su una base propria, che di norma
     è più bassa del lordo fisso. Se non configurata, si ricade sul
     lordo fisso per non cambiare il risultato dei profili esistenti. */
  const premiumBase=Number(state.settings.premiumBase)||baseGross;
  const premiumDivisor=Number(state.settings.premiumDivisor)||divisor;
  const premiumHourly=premiumBase/premiumDivisor;

  const amounts={
    night:mins.night/60*premiumHourly*(Number(state.settings.nightPct)||0)/100,
    holiday:mins.holiday/60*premiumHourly*(Number(state.settings.holidayPct)||0)/100,
    holidayNight:mins.holidayNight/60*premiumHourly*(Number(state.settings.holidayNightPct)||0)/100
  };

  const premiums=amounts.night+amounts.holiday+amounts.holidayNight;
  const otherEarnings=Number(state.settings.otherEarnings)||0;
  const gross=baseGross+premiums+otherEarnings;

  const social=gross*(Number(state.settings.socialPct)||0)/100;
  const fixedExtra=pick('fixedExtraDeductions');
  const cometaEmployee=Number(state.settings.cometaEmployee)||0;
  const cometaEmployer=Number(state.settings.cometaEmployer)||0;
  const cometaDeductible=Number(state.settings.cometaDeductible)||0;

  /* L'imponibile IRPEF si riduce solo della quota COMETA a carico del
     lavoratore. La quota azienda non è mai entrata nel lordo, quindi
     sottrarla sarebbe un doppio sconto. Il totale deducibile (F01998)
     serve alla dichiarazione annuale, non al cedolino mensile. */
  const ordinaryTaxable=Math.max(0,gross-social-fixedExtra-cometaEmployee);
  const annualProjected=ordinaryTaxable*12+(Number(state.settings.otherAnnualIncome)||0);
  const annualIrpefGross=annualGrossIrpef(annualProjected);
  const annualDeduction=employeeAnnualDeduction(
    annualProjected,
    Number(state.settings.workingDaysAnnual)||365
  );

  let substituteTax=0;
  let ordinaryTaxableForIrpef=ordinaryTaxable;

  if(y===2026&&state.settings.useSubstituteTax){
    const limit=Math.max(0,(Number(state.settings.substituteAnnualLimit)||1500)-(Number(state.settings.substituteUsedYtd)||0));
    const substituteBase=Math.min(premiums,limit);
    substituteTax=substituteBase*(Number(state.settings.substituteTaxRate)||15)/100;
    ordinaryTaxableForIrpef=Math.max(0,ordinaryTaxable-substituteBase);
  }

  const annualProjectedAdjusted=ordinaryTaxableForIrpef*12+(Number(state.settings.otherAnnualIncome)||0);
  const annualIrpefAdjusted=annualGrossIrpef(annualProjectedAdjusted);
  const annualDeductionAdjusted=employeeAnnualDeduction(
    annualProjectedAdjusted,
    Number(state.settings.workingDaysAnnual)||365
  );
  /* Detrazione aggiuntiva mensile (in Zucchetti: F02801, L.207/24).
     È già un importo mensile, non va diviso per 12. */
  const additionalDeduction=pick('additionalDeduction');
  const tax=Math.max(0,(annualIrpefAdjusted-annualDeductionAdjusted)/12-additionalDeduction);

  const regional=pick('regionalInstallment');
  const municipalBalance=pick('municipalBalanceInstallment');
  const municipalAdvance=pick('municipalAdvanceInstallment');
  const localTaxes=regional+municipalBalance+municipalAdvance;
  const otherDeductions=Number(state.settings.otherDeductions)||0;

  const deductions=
    social+fixedExtra+tax+substituteTax+localTaxes+cometaEmployee+otherDeductions;

  const netAdjustment=Number(state.settings.netAdjustment)||0;

  return{
    mins,amounts,premiums,otherEarnings,gross,hourly,
    premiumBase,premiumDivisor,premiumHourly,netAdjustment,overridden,verified,additionalDeduction,
    social,fixedExtra,ordinaryTaxable,
    annualProjected,annualIrpefGross,annualDeduction,
    tax,substituteTax,
    regional,municipalBalance,municipalAdvance,localTaxes,
    cometaEmployee,cometaEmployer,cometaDeductible,
    otherDeductions,deductions,net:gross-deductions+netAdjustment
  };
}

/* ============================================================
   CALIBRAZIONE DAL CEDOLINO REALE
   L'utente inserisce lordo e netto veri di un mese già chiuso.
   Da lì si ricava la base oraria delle maggiorazioni e lo scarto
   residuo del netto, senza dover indovinare le voci del contratto.
   ============================================================ */

/* Somma delle ore pesate per la rispettiva percentuale.
   Serve a invertire la formula delle maggiorazioni. */
function premiumWeightedHours(y,m){
  const mins={night:0,holiday:0,holidayNight:0};
  const days=new Date(y,m+1,0).getDate();
  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`,s=state.shifts[key];
    if(!s)continue;
    const b=minuteBuckets(key,s);
    Object.keys(mins).forEach(k=>mins[k]+=b[k]);
  }
  return mins.night/60*(Number(state.settings.nightPct)||0)/100
    +mins.holiday/60*(Number(state.settings.holidayPct)||0)/100
    +mins.holidayNight/60*(Number(state.settings.holidayNightPct)||0)/100;
}

/* Ricava premiumBase da un lordo reale.
   lordoReale = lordoFisso + altreCompetenze + oraria * oreP0esate
   => oraria = (lordoReale - lordoFisso - altre) / orePesate
   => premiumBase = oraria * divisore */
function calibratePremiumBase(y,m,realGross){
  const weighted=premiumWeightedHours(y,m);
  if(weighted<=0)return{ok:false,reason:'Nessuna ora con maggiorazione nel mese selezionato.'};

  const baseGross=Number(state.settings.gross)||0;
  const otherEarnings=Number(state.settings.otherEarnings)||0;
  const premiumsNeeded=Number(realGross)-baseGross-otherEarnings;

  if(!Number.isFinite(premiumsNeeded))return{ok:false,reason:'Lordo reale non valido.'};
  if(premiumsNeeded<0)return{ok:false,reason:'Il lordo reale è inferiore al lordo fisso: controlla il valore.'};

  const hourly=premiumsNeeded/weighted;
  const divisor=Number(state.settings.premiumDivisor)||Number(state.settings.divisor)||173;

  return{
    ok:true,
    hourly,
    premiumBase:hourly*divisor,
    premiumDivisor:divisor,
    weightedHours:weighted,
    premiums:premiumsNeeded
  };
}

/* Ricava lo scarto residuo del netto dopo aver corretto la base. */
function calibrateNetAdjustment(y,m,realNet){
  const p=payroll(y,m);
  const withoutAdjustment=p.net-(Number(state.settings.netAdjustment)||0);
  const delta=Number(realNet)-withoutAdjustment;
  return Number.isFinite(delta)?{ok:true,delta,estimated:withoutAdjustment}:{ok:false};
}

function findNextWorkShift(fromDate){
  const start=new Date(fromDate);
  start.setHours(0,0,0,0);

  for(let i=1;i<=370;i++){
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    const key=ymd(d);
    const shift=state.shifts[key];
    if(shift&&TYPES[shift.type]?.work)return{date:d,key,shift};
  }
  return null;
}

function renderDashboard(){
  const today=new Date();
  const todayKey=ymd(today);
  const todayShift=state.shifts[todayKey];
  const y=view.getFullYear(),m=view.getMonth();
  const stats=typeof monthlyStats==='function'?monthlyStats(y,m):null;
  const currentMonthPayroll=stats?.payroll||payroll(y,m);

  document.getElementById('todayTitle').textContent=
    `${DAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}`;

  const todayBadge=document.getElementById('todayBadge');
  const todayShiftBox=document.getElementById('todayShift');
  const todayTime=document.getElementById('todayTime');

  if(todayShift){
    const type=TYPES[todayShift.type]||TYPES.riposo;
    todayBadge.textContent=type.label;
    todayBadge.style.color=type.color;
    todayShiftBox.textContent=type.label;
    todayTime.textContent=type.work?`${todayShift.start}–${todayShift.end}`:'Giornata non lavorativa';
  }else{
    todayBadge.textContent='Non inserito';
    todayBadge.style.color='var(--muted)';
    todayShiftBox.textContent='—';
    todayTime.textContent='Nessun turno registrato';
  }

  const next=findNextWorkShift(today);
  if(next){
    const type=TYPES[next.shift.type];
    document.getElementById('nextShift').textContent=type.label;
    document.getElementById('nextShift').style.color=type.color;
    document.getElementById('nextShiftDate').textContent=
      `${DAYS[next.date.getDay()]} ${next.date.getDate()} ${MONTHS[next.date.getMonth()]} · ${next.shift.start}–${next.shift.end}`;
  }else{
    document.getElementById('nextShift').textContent='—';
    document.getElementById('nextShiftDate').textContent='Nessun turno futuro';
  }

  let workedMinutes=stats?.workedMinutes||0;
  if(!stats){
    const days=new Date(y,m+1,0).getDate();
    for(let d=1;d<=days;d++){
      const key=`${y}-${pad(m+1)}-${pad(d)}`;
      const shift=state.shifts[key];
      if(shift&&TYPES[shift.type]?.work)workedMinutes+=worked(shift);
    }
  }

  document.getElementById('dashHours').textContent=fmtMin(workedMinutes);
  document.getElementById('dashNet').textContent=euro(currentMonthPayroll.net);
}

function openPayrollDialog(){
  const ids=[
    'gross','divisor','premiumBase','premiumDivisor','netAdjustment','additionalDeduction','socialPct','fixedExtraDeductions',
    'regionalInstallment','municipalBalanceInstallment','municipalAdvanceInstallment',
    'cometaEmployee','cometaEmployer','cometaDeductible',
    'otherEarnings','otherDeductions','workingDaysAnnual',
    'otherAnnualIncome','substituteAnnualLimit','substituteUsedYtd'
  ];
  const fieldIds={gross:'pfGross',divisor:'pfDivisor',premiumBase:'pfPremiumBase',premiumDivisor:'pfPremiumDivisor',netAdjustment:'pfNetAdjustment',additionalDeduction:'pfAdditionalDeduction',socialPct:'pfSocialPct',fixedExtraDeductions:'pfFixedExtraDeductions',regionalInstallment:'pfRegionalInstallment',municipalBalanceInstallment:'pfMunicipalBalanceInstallment',municipalAdvanceInstallment:'pfMunicipalAdvanceInstallment',cometaEmployee:'pfCometaEmployee',cometaEmployer:'pfCometaEmployer',cometaDeductible:'pfCometaDeductible',otherEarnings:'pfOtherEarnings',otherDeductions:'pfOtherDeductions',workingDaysAnnual:'pfWorkingDaysAnnual',otherAnnualIncome:'pfOtherAnnualIncome',substituteAnnualLimit:'pfSubstituteAnnualLimit',substituteUsedYtd:'pfSubstituteUsedYtd'};
  ids.forEach(id=>document.getElementById(fieldIds[id]).value=state.settings[id]??0);
  document.getElementById('pfUseSubstituteTax').checked=!!state.settings.useSubstituteTax;
  document.getElementById('payrollDialog').showModal();
}

document.getElementById('savePayrollSettings').onclick=()=>{
  const ids=[
    'gross','divisor','premiumBase','premiumDivisor','netAdjustment','additionalDeduction','socialPct','fixedExtraDeductions',
    'regionalInstallment','municipalBalanceInstallment','municipalAdvanceInstallment',
    'cometaEmployee','cometaEmployer','cometaDeductible',
    'otherEarnings','otherDeductions','workingDaysAnnual',
    'otherAnnualIncome','substituteAnnualLimit','substituteUsedYtd'
  ];
  const fieldIds={gross:'pfGross',divisor:'pfDivisor',premiumBase:'pfPremiumBase',premiumDivisor:'pfPremiumDivisor',netAdjustment:'pfNetAdjustment',additionalDeduction:'pfAdditionalDeduction',socialPct:'pfSocialPct',fixedExtraDeductions:'pfFixedExtraDeductions',regionalInstallment:'pfRegionalInstallment',municipalBalanceInstallment:'pfMunicipalBalanceInstallment',municipalAdvanceInstallment:'pfMunicipalAdvanceInstallment',cometaEmployee:'pfCometaEmployee',cometaEmployer:'pfCometaEmployer',cometaDeductible:'pfCometaDeductible',otherEarnings:'pfOtherEarnings',otherDeductions:'pfOtherDeductions',workingDaysAnnual:'pfWorkingDaysAnnual',otherAnnualIncome:'pfOtherAnnualIncome',substituteAnnualLimit:'pfSubstituteAnnualLimit',substituteUsedYtd:'pfSubstituteUsedYtd'};
  ids.forEach(id=>state.settings[id]=Number(document.getElementById(fieldIds[id]).value)||0);
  state.settings.useSubstituteTax=document.getElementById('pfUseSubstituteTax').checked;
  saveState();render();document.getElementById('payrollDialog').close();
};

document.getElementById('closePayrollSettings').onclick=()=>{
  document.getElementById('payrollDialog').close();
};

/* ---------- Dati specifici del mese ---------- */

const MONTH_OVERRIDE_FIELDS=[
  ['night','calNightH'],
  ['holiday','calHolidayH'],
  ['holidayNight','calHolidayNightH'],
  ['fixedExtraDeductions','calFixedExtra'],
  ['additionalDeduction','calAdditionalDeduction'],
  ['regionalInstallment','calRegional'],
  ['municipalBalanceInstallment','calMunicipalBalance'],
  ['municipalAdvanceInstallment','calMunicipalAdvance']
];

function monthOverrideKey(y,m){return `${y}-${pad(m+1)}`}

function openCalibrationDialog(){
  const y=view.getFullYear(),m=view.getMonth();
  const key=monthOverrideKey(y,m);
  const saved=(state.monthOverrides||{})[key]||{};

  /* Le ore automatiche si leggono ignorando l'override, altrimenti
     mostrerebbero il valore già inserito a mano. */
  const auto={night:0,holiday:0,holidayNight:0};
  const days=new Date(y,m+1,0).getDate();
  for(let d=1;d<=days;d++){
    const k=`${y}-${pad(m+1)}-${pad(d)}`,sh=state.shifts[k];
    if(!sh)continue;
    const b=minuteBuckets(k,sh);
    Object.keys(auto).forEach(x=>auto[x]+=b[x]);
  }

  document.getElementById('calMonth').textContent=`${MONTHS[m]} ${y}`;
  document.getElementById('calComputed').textContent=
    `Dai turni: ${(auto.night/60).toFixed(2)}h notturne · `+
    `${(auto.holiday/60).toFixed(2)}h festive · `+
    `${(auto.holidayNight/60).toFixed(2)}h festive notturne`;

  document.getElementById('calNightH').value=saved.night??(auto.night/60).toFixed(2);
  document.getElementById('calHolidayH').value=saved.holiday??(auto.holiday/60).toFixed(2);
  document.getElementById('calHolidayNightH').value=saved.holidayNight??(auto.holidayNight/60).toFixed(2);

  ['fixedExtraDeductions','additionalDeduction','regionalInstallment',
   'municipalBalanceInstallment','municipalAdvanceInstallment'].forEach(name=>{
    const el=document.getElementById(MONTH_OVERRIDE_FIELDS.find(f=>f[0]===name)[1]);
    if(el)el.value=saved[name]??state.settings[name]??0;
  });

  document.getElementById('calResult').textContent=Object.keys(saved).length
    ? 'Questo mese usa valori inseriti a mano.'
    : 'Questo mese usa il profilo generale.';

  document.getElementById('calibrationDialog').showModal();
}

const applyHoursBtn=document.getElementById('applyPremiumHours');
if(applyHoursBtn){
  applyHoursBtn.onclick=()=>{
    const y=view.getFullYear(),m=view.getMonth();
    if(!state.monthOverrides)state.monthOverrides={};
    const entry={};
    MONTH_OVERRIDE_FIELDS.forEach(([name,fieldId])=>{
      const el=document.getElementById(fieldId);
      if(el)entry[name]=Number(el.value)||0;
    });
    state.monthOverrides[monthOverrideKey(y,m)]=entry;
    saveState();render();
    const p=payroll(y,m);
    document.getElementById('calResult').textContent=
      `Lordo ${euro(p.gross)} · netto ${euro(p.net)}`;
  };
}

const clearHoursBtn=document.getElementById('clearPremiumHours');
if(clearHoursBtn){
  clearHoursBtn.onclick=()=>{
    const y=view.getFullYear(),m=view.getMonth();
    if(state.monthOverrides)delete state.monthOverrides[monthOverrideKey(y,m)];
    saveState();render();openCalibrationDialog();
  };
}

const closeCalBtn=document.getElementById('closeCalibration');
if(closeCalBtn){
  closeCalBtn.onclick=()=>document.getElementById('calibrationDialog').close();
}

const openCalBtn=document.getElementById('openCalibration');
if(openCalBtn){
  openCalBtn.onclick=()=>{
    document.getElementById('payrollDialog').close();
    openCalibrationDialog();
  };
}

document.getElementById('copyPayroll').onclick=async()=>{
  const y=view.getFullYear(),m=view.getMonth(),p=payroll(y,m);
  const text=[
    `Stima busta paga — ${MONTHS[m]} ${y}`,
    `Lordo fisso: ${euro(state.settings.gross)}`,
    `Maggiorazione notte: ${euro(p.amounts.night)}`,
    `Maggiorazione festivi: ${euro(p.amounts.holiday)}`,
    `Maggiorazione festivi notturni: ${euro(p.amounts.holidayNight)}`,
    `Lordo stimato: ${euro(p.gross)}`,
    `Contributi: ${euro(p.social)}`,
    `IRPEF stimata: ${euro(p.tax)}`,
    `Addizionali: ${euro(p.localTaxes)}`,
    `Cometa lavoratore: ${euro(p.cometaEmployee)}`,
    `Cometa azienda: ${euro(p.cometaEmployer)}`,
    `Cometa deducibile: ${euro(p.cometaDeductible)}`,
    `Netto stimato: ${euro(p.net)}`
  ].join('\n');

  try{
    await navigator.clipboard.writeText(text);
    document.getElementById('status').textContent='Stima busta paga copiata.';
  }catch(e){
    document.getElementById('status').textContent='Copia non riuscita.';
  }
};

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
  document.getElementById('status').textContent=
    `v${APP_VERSION} · salvato sul dispositivo · ${Object.keys(state.shifts).length} giorni`;
  renderPayslipArchive();
  renderBaselineSelect();

  /* Badge sul mese in vista: dice se quel mese ha un cedolino caricato. */
  const monthBadge=document.getElementById('payslipMonthBadge');
  if(monthBadge){
    const entry=(state.payslipRegistry||{})[`${y}-${pad(m+1)}`];
    if(entry){
      monthBadge.className='month-badge ok';
      monthBadge.textContent=`Busta paga di ${entry.label} caricata`;
    }else{
      monthBadge.className='month-badge';
      monthBadge.textContent='Nessuna busta paga per questo mese';
    }
  }

  if(typeof renderStats==='function')renderStats(y,m);
  if(typeof renderDashboard==='function')renderDashboard();

  const p=payroll(y,m);

  const payBadge=document.getElementById('payAccuracy');
  if(payBadge){
    if(p.verified){
      payBadge.className='accuracy ok';
      payBadge.textContent='Verificato sul cedolino di questo mese';
    }else{
      const key=state.settings.baselineMonth||autoBaselineMonth();
      payBadge.className='accuracy est';
      if(key){
        const [by,bm]=key.split('-').map(Number);
        const auto=state.settings.baselineMonth?'':' (scelto in automatico)';
        payBadge.textContent=
          `Stima · trattenute da ${MONTHS[bm-1]} ${by}${auto}, ore dai turni`;
      }else{
        payBadge.textContent='Stima · nessun cedolino caricato';
      }
    }
  }

  document.getElementById('pay').innerHTML=`
    <div class="pay-section-title">Competenze</div>
    <div class="payrow main"><span>Lordo fisso</span><span>${euro(state.settings.gross)}</span></div>
    <div class="payrow hint"><span>Base oraria maggiorazioni</span><span>${euro(p.premiumHourly)}/h</span></div>
    <div class="payrow"><span>Notturne ${fmtMin(p.mins.night)}</span><span>+ ${euro(p.amounts.night)}</span></div>
    <div class="payrow"><span>Festivi ${fmtMin(p.mins.holiday)}</span><span>+ ${euro(p.amounts.holiday)}</span></div>
    <div class="payrow"><span>Festivi notturni ${fmtMin(p.mins.holidayNight)}</span><span>+ ${euro(p.amounts.holidayNight)}</span></div>
    ${p.otherEarnings?`<div class="payrow"><span>Altre competenze</span><span>+ ${euro(p.otherEarnings)}</span></div>`:''}
    <div class="payrow total-gross"><span>Lordo finale</span><span>${euro(p.gross)}</span></div>

    <div class="pay-section-title">Trattenute dinamiche</div>
    <div class="payrow deduction"><span>Contributi dipendente</span><span>− ${euro(p.social)}</span></div>
    ${p.fixedExtra?`<div class="payrow deduction"><span>Trattenute fisse extra</span><span>− ${euro(p.fixedExtra)}</span></div>`:''}
    <div class="payrow deduction"><span>IRPEF netta stimata</span><span>− ${euro(p.tax)}</span></div>
    ${p.substituteTax?`<div class="payrow deduction"><span>Imposta sostitutiva maggiorazioni</span><span>− ${euro(p.substituteTax)}</span></div>`:''}
    <div class="payrow deduction"><span>Addizionale regionale</span><span>− ${euro(p.regional)}</span></div>
    <div class="payrow deduction"><span>Comunale saldo</span><span>− ${euro(p.municipalBalance)}</span></div>
    <div class="payrow deduction"><span>Comunale acconto</span><span>− ${euro(p.municipalAdvance)}</span></div>
    <div class="payrow deduction"><span>Cometa lavoratore</span><span>− ${euro(p.cometaEmployee)}</span></div>
    <div class="payrow"><span>Cometa azienda</span><span>${euro(p.cometaEmployer)}</span></div>
    <div class="payrow"><span>Cometa deducibile</span><span>${euro(p.cometaDeductible)}</span></div>
    ${p.otherDeductions?`<div class="payrow deduction"><span>Altre trattenute</span><span>− ${euro(p.otherDeductions)}</span></div>`:''}

    <div class="payrow net-final"><span>Netto stimato</span><span>${euro(p.net)}</span></div>
    <button class="btn alt pay-settings-btn" id="openPayrollSettings">Modifica profilo fiscale</button>`;

  const openPayrollSettings=document.getElementById('openPayrollSettings');
  if(openPayrollSettings)openPayrollSettings.onclick=openPayrollDialog;

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
  for(const id of ['profileName','excelName','gross','divisor','nightPct','holidayPct','holidayNightPct','deductionPct'])document.getElementById(id).value=state.settings[id];
  document.getElementById('settingsDialog').showModal();
};
document.getElementById('saveSettings').onclick=()=>{
  for(const id of ['profileName','excelName','gross','divisor','nightPct','holidayPct','holidayNightPct','deductionPct']){
    state.settings[id]=(id==='profileName'||id==='excelName')?document.getElementById(id).value:(Number(document.getElementById(id).value)||0);
  }
  saveState();render();document.getElementById('settingsDialog').close();
};
document.getElementById('closeSettings').onclick=()=>document.getElementById('settingsDialog').close();
document.getElementById('wipeAll').onclick=()=>{if(confirm('Cancellare tutti i dati?')){state=clone(DEFAULT_STATE);saveState();render();document.getElementById('settingsDialog').close()}};
document.getElementById('clearMonthBtn').onclick=()=>{
  const y=view.getFullYear(),m=view.getMonth();if(!confirm(`Cancellare tutti i turni di ${MONTHS[m]} ${y}?`))return;
  Object.keys(state.shifts).forEach(k=>{const d=new Date(k+'T00:00:00');if(d.getFullYear()===y&&d.getMonth()===m)delete state.shifts[k]});
  saveState();render();
};

/* Elenco dei cedolini caricati, ordinato dal più recente. */
function renderPayslipArchive(){
  const box=document.getElementById('payslipArchive');
  if(!box)return;

  const entries=Object.entries(state.payslipRegistry||{})
    .sort((a,b)=>b[0].localeCompare(a[0]));

  const status=document.getElementById('payslipStatus');
  if(status){
    status.textContent=entries.length
      ? `${entries.length} busta paga caricata${entries.length>1?'e':''}.`
      : 'Nessuna busta paga caricata.';
  }

  if(!entries.length){
    box.innerHTML='<div class="archive-empty">Carica un PDF: l\'app riconosce da sola il mese di competenza.</div>';
    return;
  }

  box.innerHTML=entries.map(([key,e])=>{
    const [yy,mm]=key.split('-').map(Number);
    const hours=(e.hours50||e.hours55)
      ? `${e.hours50||0}h 50% · ${e.hours55||0}h 55%`
      : 'ore non lette';
    return `<div class="archive-row" data-key="${key}">
      <div>
        <div class="archive-month">${MONTHS[mm-1]} ${yy}</div>
        <div class="archive-sub">${hours}</div>
      </div>
      <button class="mini-btn archive-go" data-y="${yy}" data-m="${mm-1}">Vai</button>
    </div>`;
  }).join('');

  box.querySelectorAll('.archive-go').forEach(btn=>{
    btn.onclick=()=>{
      view=new Date(Number(btn.dataset.y),Number(btn.dataset.m),1);
      document.getElementById('settingsDialog').close();
      render();
    };
  });
}

/* Selettore del mese di riferimento, popolato dai cedolini caricati. */
function renderBaselineSelect(){
  const sel=document.getElementById('baselineMonth');
  if(!sel)return;

  const entries=Object.entries(state.payslipRegistry||{})
    .sort((a,b)=>b[0].localeCompare(a[0]));

  const auto=autoBaselineMonth();
  const autoLabel=auto
    ?(()=>{const [yy,mm]=auto.split('-').map(Number);return `${MONTHS[mm-1]} ${yy}`})()
    :'nessuno';

  sel.innerHTML=`<option value="">Automatico (${autoLabel})</option>`+
    entries.map(([key])=>{
      const [yy,mm]=key.split('-').map(Number);
      const sel_=key===state.settings.baselineMonth?' selected':'';
      return `<option value="${key}"${sel_}>${MONTHS[mm-1]} ${yy}</option>`;
    }).join('');

  sel.onchange=()=>{
    state.settings.baselineMonth=sel.value;
    saveState();
    render();
  };
}
