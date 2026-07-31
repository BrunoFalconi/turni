(window.__MODULE_VERSIONS=window.__MODULE_VERSIONS||{})['payslip']='3.5';
/* Importazione locale di buste paga PDF.
   Il file resta sul dispositivo: viene estratto soltanto il testo necessario. */

if(window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc=
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function moneyNumber(value){
  if(value==null)return null;
  const cleaned=String(value)
    .replace(/\s/g,'')
    .replace(/\.(?=\d{3}(?:\D|$))/g,'')
    .replace(',','.')
    .replace(/[^\d.-]/g,'');
  const n=Number(cleaned);
  return Number.isFinite(n)?n:null;
}

function percentNumber(value){
  const n=moneyNumber(value);
  return n!=null&&n>=0&&n<=100?n:null;
}

function findAmountNear(text,labels){
  for(const label of labels){
    const rx=new RegExp(label+'[\\s\\S]{0,90}?([0-9]{1,3}(?:[. ][0-9]{3})*(?:,[0-9]{2,5})|[0-9]+(?:\\.[0-9]{2,5}))','i');
    const m=text.match(rx);
    if(m){
      const n=moneyNumber(m[1]);
      if(n!=null)return n;
    }
  }
  return null;
}

function findPercentageNear(text,labels){
  for(const label of labels){
    const rx=new RegExp(label+'[\\s\\S]{0,80}?([0-9]{1,2}(?:[,.][0-9]{1,5})?)\\s*%','i');
    const m=text.match(rx);
    if(m){
      const n=percentNumber(m[1]);
      if(n!=null)return n;
    }
  }
  return null;
}


function findCometaLineAmount(text,{employer=false}={}){
  const lines=String(text||'').split(/\r?\n/);

  for(const rawLine of lines){
    const line=rawLine.replace(/\s+/g,' ').trim();
    if(!/contributo\s+base\s+cometa/i.test(line))continue;

    const isEmployer=/c\s*\/?\s*ditta|azienda/i.test(line);
    if(employer!==isEmployer)continue;

    /* Esempio:
       Contributo base COMETA 2.411,43 1,20000 % 28,94
       Il primo importo è la base imponibile, l'ultimo è la trattenuta reale. */
    const amounts=[...line.matchAll(/(?:^|\s|\()([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2,5})|[0-9]+(?:,[0-9]{2,5}))(?=\s|\)|$)/g)]
      .map(m=>moneyNumber(m[1]))
      .filter(n=>n!=null);

    if(amounts.length){
      const amount=amounts.at(-1);
      if(amount>=0 && amount<1000)return amount;
    }
  }

  return null;
}

const PAYSLIP_MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno',
  'luglio','agosto','settembre','ottobre','novembre','dicembre'];

/* Il periodo sta sotto "PERIODO DI RETRIBUZIONE", scritto per esteso
   (es. "Maggio 2026"). Si cerca prima vicino a quella dicitura, perché
   altrove nel cedolino compaiono altre date (competenze arretrate,
   scadenze) che darebbero il mese sbagliato. */
function findPayslipPeriod(text){
  const body=String(text||'');
  const monthRx='\\b('+PAYSLIP_MONTHS.join('|')+')\\s+(20[0-9]{2})\\b';

  const anchored=body.match(
    new RegExp('PERIODO[\\s\\S]{0,120}?'+monthRx,'i')
  );
  const loose=body.match(new RegExp(monthRx,'i'));
  const m=anchored||loose;
  if(!m)return null;

  /* Con l'ancora i gruppi restano 1 e 2 in entrambi i casi. */
  const name=m[1],year=Number(m[2]);
  const month=PAYSLIP_MONTHS.indexOf(name.toLowerCase());
  if(month<0||!Number.isFinite(year))return null;

  return{
    year,month,
    key:`${year}-${String(month+1).padStart(2,'0')}`,
    label:`${name[0].toUpperCase()+name.slice(1).toLowerCase()} ${year}`,
    anchored:!!anchored
  };
}

function findNameFromText(text){
  const patterns=[
    /COGNOME\s*E?\s*NOME[\s:;-]*([A-ZÀ-Ü' ]{5,60})/i,
    /Codice dipendente[\s\S]{0,80}?([A-ZÀ-Ü']+\s+[A-ZÀ-Ü' ]+)/i
  ];
  for(const rx of patterns){
    const m=text.match(rx);
    if(m){
      return m[1].replace(/\s+/g,' ').trim().replace(/\b\w/g,c=>c.toUpperCase());
    }
  }
  return '';
}


function numericItems(row){
  return row.items
    .map(item=>({item,value:moneyNumber(item.text)}))
    .filter(entry=>entry.value!=null);
}

function itemCenter(item){
  return item.x+(item.width||0)/2;
}

function headerColumnCenters(header){
  const find=rx=>header.items.find(item=>rx.test(item.text));
  const importo=find(/IMPORTO/i);
  const riferimento=find(/RIFERIMENTO/i);
  const trattenute=find(/TRATTENUTE/i);
  const competenze=find(/COMPETENZE/i);

  if(!riferimento||!trattenute||!competenze)return null;

  return{
    importo:importo?itemCenter(importo):null,
    riferimento:itemCenter(riferimento),
    trattenute:itemCenter(trattenute),
    competenze:itemCenter(competenze)
  };
}

function strictColumnBounds(centers,column){
  if(column==='trattenute'){
    return{
      min:(centers.riferimento+centers.trattenute)/2,
      max:(centers.trattenute+centers.competenze)/2
    };
  }

  if(column==='competenze'){
    return{
      min:(centers.trattenute+centers.competenze)/2,
      max:Infinity
    };
  }

  if(column==='riferimento'){
    const left=centers.importo!=null
      ?(centers.importo+centers.riferimento)/2
      :centers.riferimento-70;
    return{
      min:left,
      max:(centers.riferimento+centers.trattenute)/2
    };
  }

  return{min:-Infinity,max:Infinity};
}

function valueInNamedColumn(row,centers,column){
  const bounds=strictColumnBounds(centers,column);
  const candidates=numericItems(row)
    .filter(({item,value})=>{
      const center=itemCenter(item);
      return center>=bounds.min &&
        center<bounds.max &&
        Math.abs(value)<100000;
    })
    .sort((a,b)=>itemCenter(a.item)-itemCenter(b.item));

  return candidates.length?candidates.at(-1).value:null;
}

function findRowByCode(rows,code,{contains='',excludes=''}={}){
  return rows.find(row=>{
    const text=row.text;
    return text.includes(code) &&
      (!contains||new RegExp(contains,'i').test(text)) &&
      (!excludes||!new RegExp(excludes,'i').test(text));
  })||null;
}

function columnValuesFromPdf(pdfData){
  const result={
    cometaEmployee:null,
    cometaEmployer:null,
    cometaDeductible:null,
    irpefWithheld:null,
    localTaxes:null,
    regionalInstallment:null,
    municipalBalanceInstallment:null,
    municipalAdvanceInstallment:null,
    fixedExtraDeductions:null,
    additionalDeduction:null,
    socialPct:null,
    hours50:null,
    hours55:null,
    period:null
  };

  let localTaxes=0;
  let foundLocalTax=false;

  for(const page of pdfData.pages){
    const header=page.rows.find(row=>
      /TRATTENUTE/i.test(row.text) && /COMPETENZE/i.test(row.text)
    );
    if(!header)continue;

    const centers=headerColumnCenters(header);
    if(!centers)continue;

    const cometaEmployeeRow=findRowByCode(page.rows,'Z20010',{
      contains:'COMETA',
      excludes:'C\\s*\\/?\\s*DITTA'
    });
    if(cometaEmployeeRow){
      const value=valueInNamedColumn(cometaEmployeeRow,centers,'trattenute');
      if(value!=null)result.cometaEmployee=value;
    }

    /* La riga della quota azienda cambia forma fra i cedolini:
       "C/DITTA", "C.DITTA", "DITTA", "AZIENDA". Si provano in ordine
       varianti sempre più larghe, e come ultima spiaggia si cerca una
       riga COMETA che non sia quella del lavoratore. */
    let cometaEmployerRow=null;
    const employerVariants=[
      'COMETA.*C\\s*[\\/.]?\\s*DITTA',
      'COMETA.*DITTA',
      'COMETA.*AZIEND',
      'C\\s*[\\/.]?\\s*DITTA.*COMETA'
    ];
    for(const variant of employerVariants){
      cometaEmployerRow=findRowByCode(page.rows,'Z20010',{contains:variant});
      if(cometaEmployerRow)break;
    }
    if(!cometaEmployerRow){
      cometaEmployerRow=page.rows.find(row=>
        /COMETA/i.test(row.text) &&
        /DITTA|AZIEND|CARICO\s+AZIEND/i.test(row.text) &&
        row!==cometaEmployeeRow
      )||null;
    }

    if(cometaEmployerRow){
      /* Prima la colonna COMPETENZE, che è la sua sede naturale.
         Se lì non c'è nulla, si ripiega sull'ultimo importo della riga,
         che nel layout Zucchetti è comunque il contributo effettivo. */
      let value=valueInNamedColumn(cometaEmployerRow,centers,'competenze');
      if(value==null){
        const amounts=numericItems(cometaEmployerRow)
          .map(entry=>entry.value)
          .filter(v=>v>0&&v<1000);
        if(amounts.length)value=amounts.at(-1);
      }
      if(value!=null)result.cometaEmployer=Math.abs(value);
    }

    const deductibleRow=findRowByCode(page.rows,'F01998');
    if(deductibleRow){
      const values=numericItems(deductibleRow)
        .map(x=>x.value)
        .filter(v=>v>=0&&v<10000);
      if(values.length)result.cometaDeductible=values.at(-1);
    }

    const irpefRow=findRowByCode(page.rows,'F03020');
    if(irpefRow){
      const value=valueInNamedColumn(irpefRow,centers,'trattenute');
      if(value!=null)result.irpefWithheld=value;
    }

    const regionalRow=findRowByCode(page.rows,'F09110');
    const municipalBalanceRow=findRowByCode(page.rows,'F09130');
    const municipalAdvanceRow=findRowByCode(page.rows,'F09140');

    if(regionalRow){
      const value=valueInNamedColumn(regionalRow,centers,'trattenute');
      if(value!=null)result.regionalInstallment=Math.abs(value);
    }
    if(municipalBalanceRow){
      const value=valueInNamedColumn(municipalBalanceRow,centers,'trattenute');
      if(value!=null)result.municipalBalanceInstallment=Math.abs(value);
    }
    if(municipalAdvanceRow){
      const value=valueInNamedColumn(municipalAdvanceRow,centers,'trattenute');
      if(value!=null)result.municipalAdvanceInstallment=Math.abs(value);
    }

    /* Le righe EPAR possono essere più di una: quando l'azienda recupera
       arretrati compaiono più mensilità nello stesso cedolino (a marzo
       2026 erano cinque). Vanno sommate tutte, non presa la prima. */
    let eparTotal=0,eparFound=false;
    for(const row of page.rows){
      if(!/003005/.test(row.text))continue;
      if(!/Contributo\s+EPAR/i.test(row.text))continue;
      const value=valueInNamedColumn(row,centers,'trattenute');
      if(value!=null){eparTotal+=Math.abs(value);eparFound=true}
    }
    if(eparFound)result.fixedExtraDeductions=Number(eparTotal.toFixed(2));

    /* Ore con maggiorazione: stanno nelle righe Z12050 (50%) e Z12055
       (55%) come "58,00000 ORE". Leggerle dal cedolino è più affidabile
       che dedurle dai turni, perché con la banca ore non coincidono. */
    for(const row of page.rows){
      const m=row.text.match(/Z120(5[0-9])[\s\S]*?([0-9]+(?:,[0-9]+)?)\s*ORE/i);
      if(!m)continue;
      const hours=moneyNumber(m[2]);
      if(hours==null||hours<=0)continue;
      if(/\b50\s*%/.test(row.text))result.hours50=(result.hours50||0)+hours;
      else if(/\b55\s*%/.test(row.text))result.hours55=(result.hours55||0)+hours;
    }

    /* F02801: ulteriore detrazione mensile (L.207/24). Sta nella
       colonna IMPORTO BASE, non fra le trattenute. */
    const extraDeductionRow=findRowByCode(page.rows,'F02801');
    if(extraDeductionRow){
      const amounts=numericItems(extraDeductionRow)
        .map(entry=>entry.value)
        .filter(v=>v>0&&v<5000);
      if(amounts.length)result.additionalDeduction=amounts.at(-1);
    }

    /* Aliquote contributive a carico del dipendente: si sommano le
       percentuali delle righe IVS e CIGS, invece di usare un valore fisso. */
    let socialSum=0,socialFound=false;
    for(const row of page.rows){
      if(!/Contributo\s+(IVS|CIGS)/i.test(row.text))continue;
      const pct=row.text.match(/([0-9]{1,2},[0-9]{1,5})\s*%/);
      if(pct){
        const value=moneyNumber(pct[1]);
        if(value!=null&&value>0&&value<30){socialSum+=value;socialFound=true}
      }
    }
    if(socialFound)result.socialPct=Number(socialSum.toFixed(2));
  }

  /* Il totale deducibile è la somma delle due quote.
     Se la riga azienda non è stata trovata ma le altre due sì,
     la quota azienda si ricava per differenza. */
  if(result.cometaEmployer==null &&
     result.cometaDeductible!=null &&
     result.cometaEmployee!=null){
    const diff=result.cometaDeductible-result.cometaEmployee;
    if(diff>0)result.cometaEmployer=Number(diff.toFixed(2));
  }

  result.localTaxes=[
    result.regionalInstallment,
    result.municipalBalanceInstallment,
    result.municipalAdvanceInstallment
  ].filter(v=>v!=null).reduce((a,b)=>a+b,0)||null;
  return result;
}

function parsePayslipData(pdfData){
  const detected=parsePayslipText(pdfData.text);
  const columns=columnValuesFromPdf(pdfData);

  if(columns.cometaEmployee!=null)detected.cometaEmployee=columns.cometaEmployee;
  if(columns.cometaEmployer!=null)detected.cometaEmployer=columns.cometaEmployer;
  if(columns.cometaDeductible!=null)detected.cometaDeductible=columns.cometaDeductible;
  if(columns.localTaxes!=null)detected.localTaxes=columns.localTaxes;
  if(columns.regionalInstallment!=null)detected.regionalInstallment=columns.regionalInstallment;
  if(columns.municipalBalanceInstallment!=null)detected.municipalBalanceInstallment=columns.municipalBalanceInstallment;
  if(columns.municipalAdvanceInstallment!=null)detected.municipalAdvanceInstallment=columns.municipalAdvanceInstallment;
  if(columns.fixedExtraDeductions!=null)detected.fixedExtraDeductions=columns.fixedExtraDeductions;
  if(columns.additionalDeduction!=null)detected.additionalDeduction=columns.additionalDeduction;
  if(columns.socialPct!=null)detected.socialPct=columns.socialPct;
  if(columns.hours50!=null)detected.hours50=columns.hours50;
  if(columns.hours55!=null)detected.hours55=columns.hours55;
  detected.period=findPayslipPeriod(pdfData.text);

  return detected;
}

function parsePayslipText(text){
  const compact=text.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ');

  const gross=
    findAmountNear(compact,[
      'TOTALE\\s+(?:ELEMENTI\\s+)?RETRIBUZIONE',
      'RETRIBUZIONE\\s+LORDA',
      'TOTALE\\s+FISSO',
      'S\\.MIN\\s+ASSORB[\\s\\S]{0,50}?TOTALE'
    ]);

  const taxable=findAmountNear(compact,['Imponibile\\s+IRPEF']);
  const withheld=findAmountNear(compact,['Ritenute\\s+IRPEF','IRPEF\\s+trattenuta']);
  const computedTax=taxable&&withheld?withheld/taxable*100:null;

  const ivs=findPercentageNear(compact,['Contributo\\s+IVS','IVS']);
  const cigs=findPercentageNear(compact,['Contributo\\s+CIGS','CIGS']);
  const epar=findPercentageNear(compact,['Contributo\\s+EPAR','EPAR']);
  const socialParts=[ivs,cigs,epar].filter(v=>v!=null);
  const social=socialParts.length?socialParts.reduce((a,b)=>a+b,0):null;

  const regional=findAmountNear(compact,['Addizionale\\s+regionale']);
  const municipal=findAmountNear(compact,['Addizionale\\s+comunale']);
  const municipalAdvance=findAmountNear(compact,['Acconto\\s+addiz\\.\\s+comunale','Acconto\\s+addizionale\\s+comunale']);
  const localTaxes=[regional,municipal,municipalAdvance].filter(v=>v!=null).reduce((a,b)=>a+b,0)||null;

  const cometaEmployee=findCometaLineAmount(compact,{employer:false});
  const cometaEmployer=findCometaLineAmount(compact,{employer:true});
  const cometaDeductible=findAmountNear(compact,[
    'Ctr\\.prev\\.compl\\.deducib\\.',
    'Contributo\\s+previdenziale\\s+complementare\\s+deducibile',
    'Totale\\s+COMETA\\s+deducibile'
  ]);

  const percentages=[...compact.matchAll(/Magg(?:iorazione)?\.?[\s\S]{0,45}?([0-9]{2}(?:[,.][0-9]+)?)\s*%/gi)]
    .map(m=>percentNumber(m[1]))
    .filter(v=>v!=null);

  const uniquePct=[...new Set(percentages.map(v=>Math.round(v*100)/100))].sort((a,b)=>a-b);

  return{
    profileName:findNameFromText(compact),
    gross:gross&&gross>=500&&gross<=15000?gross:null,
    divisor:173,
    nightPct:uniquePct.includes(50)?50:(uniquePct[0]||50),
    holidayPct:uniquePct.includes(50)?50:(uniquePct[0]||50),
    holidayNightPct:uniquePct.includes(55)?55:(uniquePct.at(-1)||55),
    socialPct:social,
    taxPct:computedTax&&computedTax<=60?computedTax:null,
    localTaxes,
    cometaEmployee,
    cometaEmployer,
    cometaDeductible:cometaDeductible ??
      ((cometaEmployee||0)+(cometaEmployer||0) || null)
  };
}

async function extractPdfData(file){
  if(!window.pdfjsLib)throw new Error('Libreria PDF non disponibile');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
  const pages=[];
  const pageTexts=[];

  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    const sorted=content.items
      .filter(item=>String(item.str||'').trim())
      .map(item=>({
        text:String(item.str).trim(),
        x:item.transform[4],
        y:item.transform[5],
        width:item.width||0
      }))
      .sort((a,b)=>Math.abs(b.y-a.y)>2.5?b.y-a.y:a.x-b.x);

    const rows=[];
    let current=null;

    for(const item of sorted){
      if(!current||Math.abs(item.y-current.y)>2.5){
        current={y:item.y,items:[],text:''};
        rows.push(current);
      }
      current.items.push(item);
    }

    for(const row of rows){
      row.items.sort((a,b)=>a.x-b.x);
      row.text=row.items.map(item=>item.text).join(' ').replace(/\s+/g,' ').trim();
    }

    pages.push({pageNo,rows});
    pageTexts.push(rows.map(row=>row.text).join('\n'));
  }

  return{
    text:pageTexts.join('\n\n'),
    pages
  };
}

function fillPayslipDialog(data,fileName){
  const current=state.settings;
  const values={
    psProfileName:data.profileName||current.profileName||'',
    psGross:data.gross??current.gross,
    psDivisor:data.divisor??current.divisor,
    psSocialPct:data.socialPct??current.socialPct,
    psFixedExtraDeductions:data.fixedExtraDeductions??current.fixedExtraDeductions,
    psRegionalInstallment:data.regionalInstallment??current.regionalInstallment,
    psMunicipalBalanceInstallment:data.municipalBalanceInstallment??current.municipalBalanceInstallment,
    psMunicipalAdvanceInstallment:data.municipalAdvanceInstallment??current.municipalAdvanceInstallment,
    psCometaEmployee:data.cometaEmployee??current.cometaEmployee,
    psCometaEmployer:data.cometaEmployer??current.cometaEmployer,
    psCometaDeductible:data.cometaDeductible??current.cometaDeductible,
    psAdditionalDeduction:data.additionalDeduction??current.additionalDeduction,
    psNightPct:data.nightPct??current.nightPct,
    psHolidayPct:data.holidayPct??current.holidayPct,
    psHolidayNightPct:data.holidayNightPct??current.holidayNightPct
  };
  Object.entries(values).forEach(([id,value])=>{
    const el=document.getElementById(id);
    if(el)el.value=value??0;
  });

  const dialog=document.getElementById('payslipDialog');
  dialog.dataset.fileName=fileName;

  /* Il periodo decide dove finiranno i valori variabili. */
  if(data.period){
    dialog.dataset.period=JSON.stringify(data.period);
  }else{
    delete dialog.dataset.period;
  }
  dialog.dataset.hours50=data.hours50||0;
  dialog.dataset.hours55=data.hours55||0;

  const banner=document.getElementById('payslipPeriodBanner');
  if(banner){
    if(data.period){
      const known=(state.payslipRegistry||{})[data.period.key];
      banner.className='period-banner ok';
      banner.innerHTML=
        `<div class="period-label">Busta paga di <b>${data.period.label}</b></div>`+
        `<div class="period-sub">`+
        (data.hours50||data.hours55
          ? `${data.hours50||0}h al 50% · ${data.hours55||0}h al 55%`
          : 'Ore con maggiorazione non riconosciute')+
        (known?` · sostituisce quella caricata il ${new Date(known.importedAt).toLocaleDateString('it-IT')}`:'')+
        `</div>`;
    }else{
      banner.className='period-banner warn';
      banner.innerHTML=
        '<div class="period-label">Mese non riconosciuto</div>'+
        '<div class="period-sub">I valori finiranno nel profilo generale, '+
        'valido per tutti i mesi. Controllali prima di salvare.</div>';
    }
  }

  document.getElementById('payslipMessage').textContent=
    `Analizzato in locale: ${fileName}`;

  dialog.showModal();
}

document.getElementById('uploadPayslip').onclick=()=>{
  document.getElementById('payslipInput').click();
};

document.getElementById('payslipInput').addEventListener('change',async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if(!file)return;

  try{
    document.getElementById('payslipStatus').textContent='Analisi della busta paga in corso…';
    const pdfData=await extractPdfData(file);
    const detected=parsePayslipData(pdfData);

    if(pdfData.text.replace(/\s/g,'').length<50){
      document.getElementById('payslipStatus').textContent=
        'PDF senza testo rilevabile: inserisci i valori manualmente.';
    }

    fillPayslipDialog(detected,file.name);
  }catch(error){
    console.error(error);
    document.getElementById('payslipStatus').textContent=
      'Non è stato possibile leggere automaticamente il PDF. Puoi comunque inserire i dati manualmente.';
    fillPayslipDialog({},file.name);
  }
});

document.getElementById('savePayslipProfile').onclick=()=>{
  /* Valori stabili: appartengono al contratto e valgono per tutti i mesi. */
  const stable={
    profileName:'psProfileName',
    gross:'psGross',
    divisor:'psDivisor',
    socialPct:'psSocialPct',
    cometaEmployee:'psCometaEmployee',
    cometaEmployer:'psCometaEmployer',
    cometaDeductible:'psCometaDeductible',
    nightPct:'psNightPct',
    holidayPct:'psHolidayPct',
    holidayNightPct:'psHolidayNightPct'
  };

  /* Valori che cambiano da un cedolino all'altro: arretrati EPAR,
     ulteriore detrazione, rate delle addizionali. Se il cedolino dichiara
     il proprio periodo finiscono lì, altrimenti nel profilo generale. */
  const monthly={
    fixedExtraDeductions:'psFixedExtraDeductions',
    additionalDeduction:'psAdditionalDeduction',
    regionalInstallment:'psRegionalInstallment',
    municipalBalanceInstallment:'psMunicipalBalanceInstallment',
    municipalAdvanceInstallment:'psMunicipalAdvanceInstallment'
  };

  for(const [key,id] of Object.entries(stable)){
    const el=document.getElementById(id);
    if(!el)continue;
    state.settings[key]=key==='profileName'
      ? el.value.trim()
      : Number(el.value)||0;
  }

  const dialog=document.getElementById('payslipDialog');
  const period=dialog.dataset.period?JSON.parse(dialog.dataset.period):null;

  if(period){
    if(!state.monthOverrides)state.monthOverrides={};
    const key=`${period.year}-${String(period.month+1).padStart(2,'0')}`;
    const entry={...(state.monthOverrides[key]||{})};

    for(const [name,id] of Object.entries(monthly)){
      const el=document.getElementById(id);
      if(el)entry[name]=Number(el.value)||0;
    }

    /* Le ore lette dalle voci Z12050/Z12055 sono quelle davvero pagate. */
    const h50=Number(dialog.dataset.hours50||0);
    const h55=Number(dialog.dataset.hours55||0);
    if(h50||h55){
      entry.night=h50;
      entry.holiday=0;
      entry.holidayNight=h55;
    }

    state.monthOverrides[key]=entry;

    /* Archivio: tiene traccia di quale cedolino è stato caricato per
       quale mese, così l'app può dirlo invece di lasciarlo indovinare. */
    if(!state.payslipRegistry)state.payslipRegistry={};
    state.payslipRegistry[key]={
      label:period.label,
      fileName:dialog.dataset.fileName||'Busta paga PDF',
      importedAt:new Date().toISOString(),
      hours50:h50||0,
      hours55:h55||0
    };

    document.getElementById('status').textContent=
      `Cedolino di ${period.label} applicato.`;
  }else{
    for(const [key,id] of Object.entries(monthly)){
      const el=document.getElementById(id);
      if(el)state.settings[key]=Number(el.value)||0;
    }
    document.getElementById('status').textContent=
      'Periodo non riconosciuto: valori salvati nel profilo generale.';
  }

  state.settings.payslipFileName=dialog.dataset.fileName||'Busta paga PDF';
  state.settings.payslipImportedAt=new Date().toISOString();

  saveState();
  render();
  dialog.close();
};

document.getElementById('closePayslipDialog').onclick=()=>{
  document.getElementById('payslipDialog').close();
};
