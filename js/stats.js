(window.__MODULE_VERSIONS=window.__MODULE_VERSIONS||{})['stats']='3.5';
function monthlyStats(y,m){
  const counts={mattina:0,pomeriggio:0,notte:0,deas:0,riposo:0,ferie:0,malattia:0};
  let workedMinutes=0;
  let overtimeMinutes=0;
  let workDays=0;
  let nonWorkDays=0;
  const premium={night:0,holiday:0,holidayNight:0};
  const days=new Date(y,m+1,0).getDate();

  for(let d=1;d<=days;d++){
    const key=`${y}-${pad(m+1)}-${pad(d)}`;
    const shift=state.shifts[key];
    if(!shift)continue;

    if(counts[shift.type]!=null)counts[shift.type]++;

    if(TYPES[shift.type]?.work){
      workDays++;
      const mins=worked(shift);
      workedMinutes+=mins;
      overtimeMinutes+=Math.max(0,mins-8*60);

      const bucket=minuteBuckets(key,shift);
      premium.night+=bucket.night;
      premium.holiday+=bucket.holiday;
      premium.holidayNight+=bucket.holidayNight;
    }else{
      nonWorkDays++;
    }
  }

  const p=payroll(y,m);
  return{
    counts,
    workedMinutes,
    overtimeMinutes,
    workDays,
    nonWorkDays,
    premium,
    payroll:p
  };
}

function renderStats(y,m){
  const s=monthlyStats(y,m);
  const statsTitle=document.getElementById('statsTitle');
  const statsGrid=document.getElementById('statsGrid');
  const shiftBars=document.getElementById('shiftBars');
  const premiumStats=document.getElementById('premiumStats');
  if(!statsTitle||!statsGrid||!shiftBars||!premiumStats)return;

  statsTitle.textContent=`${MONTHS[m]} ${y}`;

  statsGrid.innerHTML=`
    <div class="stat-tile">
      <div class="k">Giorni lavorati</div>
      <div class="v">${s.workDays}</div>
      <div class="sub">${fmtMin(s.workedMinutes)} complessive</div>
    </div>
    <div class="stat-tile">
      <div class="k">Riposi / assenze</div>
      <div class="v">${s.nonWorkDays}</div>
      <div class="sub">${s.counts.riposo} riposi · ${s.counts.ferie} ferie</div>
    </div>
    <div class="stat-tile">
      <div class="k">Straordinario</div>
      <div class="v">${fmtMin(s.overtimeMinutes)}</div>
      <div class="sub">oltre 8 ore al giorno</div>
    </div>
    <div class="stat-tile">
      <div class="k">Maggiorazioni</div>
      <div class="v">${euro(s.payroll.amounts.night+s.payroll.amounts.holiday+s.payroll.amounts.holidayNight)}</div>
      <div class="sub">totale stimato</div>
    </div>`;

  const order=['mattina','pomeriggio','notte','deas','riposo','ferie','malattia'];
  const max=Math.max(1,...order.map(id=>s.counts[id]||0));
  shiftBars.innerHTML=order.map(id=>{
    const t=TYPES[id];
    const value=s.counts[id]||0;
    const width=value/max*100;
    return `
      <div class="bar-row">
        <div class="bar-label">${t.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${t.color}"></div></div>
        <div class="bar-value">${value}</div>
      </div>`;
  }).join('');

  premiumStats.innerHTML=`
    <div class="premium-row">
      <div class="left"><span class="badge" style="background:var(--n)"></span><span>Notturne · ${fmtMin(s.premium.night)}</span></div>
      <div class="amount">+ ${euro(s.payroll.amounts.night)}</div>
    </div>
    <div class="premium-row">
      <div class="left"><span class="badge" style="background:var(--m)"></span><span>Festive · ${fmtMin(s.premium.holiday)}</span></div>
      <div class="amount">+ ${euro(s.payroll.amounts.holiday)}</div>
    </div>
    <div class="premium-row">
      <div class="left"><span class="badge" style="background:var(--x)"></span><span>Festive notturne · ${fmtMin(s.premium.holidayNight)}</span></div>
      <div class="amount">+ ${euro(s.payroll.amounts.holidayNight)}</div>
    </div>`;

  if(typeof renderHistoryChart==='function')renderHistoryChart(y,m);

  document.getElementById('copyStats').onclick=async()=>{
    const text=[
      `${MONTHS[m]} ${y}`,
      `Giorni lavorati: ${s.workDays}`,
      `Ore lavorate: ${fmtMin(s.workedMinutes)}`,
      `Mattine: ${s.counts.mattina}`,
      `Pomeriggi: ${s.counts.pomeriggio}`,
      `Notti: ${s.counts.notte}`,
      `DEAS: ${s.counts.deas}`,
      `Riposi: ${s.counts.riposo}`,
      `Ferie: ${s.counts.ferie}`,
      `Malattia: ${s.counts.malattia}`,
      `Notturne: ${fmtMin(s.premium.night)}`,
      `Festive: ${fmtMin(s.premium.holiday)}`,
      `Festive notturne: ${fmtMin(s.premium.holidayNight)}`,
      `Straordinario: ${fmtMin(s.overtimeMinutes)}`,
      `Netto stimato: ${euro(s.payroll.net)}`
    ].join('\n');

    try{
      await navigator.clipboard.writeText(text);
      document.getElementById('status').textContent='Riepilogo mensile copiato.';
    }catch(e){
      console.error(e);
      document.getElementById('status').textContent='Copia non riuscita.';
    }
  };
}


function previousMonth(year,month,offset){
  const d=new Date(year,month-offset,1);
  return{year:d.getFullYear(),month:d.getMonth()};
}

function renderHistoryChart(y,m){
  const box=document.getElementById('historyChart');
  if(!box)return;

  const values=[];
  for(let offset=5;offset>=0;offset--){
    const p=previousMonth(y,m,offset);
    const s=monthlyStats(p.year,p.month);
    values.push({
      ...p,
      label:MONTHS[p.month].slice(0,3),
      hours:s.workedMinutes/60,
      net:s.payroll.net
    });
  }

  const maxHours=Math.max(1,...values.map(v=>v.hours));
  const maxNet=Math.max(1,...values.map(v=>v.net));

  box.innerHTML=values.map(v=>`
    <div class="history-month">
      <div class="history-bars">
        <div class="history-bar hours-bar" style="height:${Math.max(3,v.hours/maxHours*100)}%" title="${v.hours.toFixed(0)} ore"></div>
        <div class="history-bar net-bar" style="height:${Math.max(3,v.net/maxNet*100)}%" title="${euro(v.net)}"></div>
      </div>
      <div class="history-label">${v.label}</div>
      <div class="history-value">${Math.round(v.hours)}h</div>
    </div>
  `).join('');
}
