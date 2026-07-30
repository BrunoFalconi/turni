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
  const currentMonthPayroll=payroll(view.getFullYear(),view.getMonth());

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

  let workedMinutes=0;
  const y=view.getFullYear(),m=view.getMonth(),days=new Date(y,m+1,0).getDate();
  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`;
    const shift=state.shifts[key];
    if(shift&&TYPES[shift.type]?.work)workedMinutes+=worked(shift);
  }

  document.getElementById('dashHours').textContent=fmtMin(workedMinutes);
  document.getElementById('dashNet').textContent=euro(currentMonthPayroll.net);
}

function openPayrollDialog(){
  const ids=['socialPct','taxPct','localTaxes','cometaAmount','otherDeductions','otherEarnings'];
  ids.forEach(id=>document.getElementById(id).value=state.settings[id]??0);
  document.getElementById('payrollDialog').showModal();
}

document.getElementById('savePayrollSettings').onclick=()=>{
  const ids=['socialPct','taxPct','localTaxes','cometaAmount','otherDeductions','otherEarnings'];
  ids.forEach(id=>state.settings[id]=Number(document.getElementById(id).value)||0);
  saveState();
  render();
  document.getElementById('payrollDialog').close();
};

document.getElementById('closePayrollSettings').onclick=()=>{
  document.getElementById('payrollDialog').close();
};

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
    `Fondo Cometa: ${euro(p.cometa)}`,
    `Netto stimato: ${euro(p.net)}`
  ].join('\n');

  try{
    await navigator.clipboard.writeText(text);
    document.getElementById('status').textContent='Stima busta paga copiata.';
  }catch(e){
    document.getElementById('status').textContent='Copia non riuscita.';
  }
};
