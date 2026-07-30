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

function valueInColumn(row,columnX,nextColumnX=Infinity){
  const candidates=numericItems(row)
    .filter(({item,value})=>
      item.x>=columnX-45 &&
      item.x<nextColumnX-12 &&
      Math.abs(value)<100000
    )
    .sort((a,b)=>a.item.x-b.item.x);

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
    localTaxes:null
  };

  let localTaxes=0;
  let foundLocalTax=false;

  for(const page of pdfData.pages){
    const header=page.rows.find(row=>
      /TRATTENUTE/i.test(row.text) && /COMPETENZE/i.test(row.text)
    );
    if(!header)continue;

    const trattenuteItem=header.items.find(item=>/TRATTENUTE/i.test(item.text));
    const competenzeItem=header.items.find(item=>/COMPETENZE/i.test(item.text));
    if(!trattenuteItem||!competenzeItem)continue;

    const trattenuteX=trattenuteItem.x;
    const competenzeX=competenzeItem.x;

    const cometaEmployeeRow=findRowByCode(page.rows,'Z20010',{
      contains:'COMETA',
      excludes:'C\\s*\\/?\\s*DITTA'
    });
    if(cometaEmployeeRow){
      const value=valueInColumn(cometaEmployeeRow,trattenuteX,competenzeX);
      if(value!=null)result.cometaEmployee=value;
    }

    const cometaEmployerRow=findRowByCode(page.rows,'Z20010',{
      contains:'COMETA.*C\\s*\\/?\\s*DITTA'
    });
    if(cometaEmployerRow){
      const value=valueInColumn(cometaEmployerRow,competenzeX,Infinity);
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
      const value=valueInColumn(irpefRow,trattenuteX,competenzeX);
      if(value!=null)result.irpefWithheld=value;
    }

    for(const code of ['F09110','F09130','F09140']){
      const row=findRowByCode(page.rows,code);
      if(!row)continue;
      const value=valueInColumn(row,trattenuteX,competenzeX);
      if(value!=null){
        localTaxes+=Math.abs(value);
        foundLocalTax=true;
      }
    }
  }

  result.localTaxes=foundLocalTax?localTaxes:null;
  return result;
}

function parsePayslipData(pdfData){
  const detected=parsePayslipText(pdfData.text);
  const columns=columnValuesFromPdf(pdfData);

  if(columns.cometaEmployee!=null)detected.cometaEmployee=columns.cometaEmployee;
  if(columns.cometaEmployer!=null)detected.cometaEmployer=columns.cometaEmployer;
  if(columns.cometaDeductible!=null)detected.cometaDeductible=columns.cometaDeductible;
  if(columns.localTaxes!=null)detected.localTaxes=columns.localTaxes;

  const taxable=findAmountNear(pdfData.text,['Imponibile\\s+IRPEF']);
  if(taxable&&columns.irpefWithheld!=null){
    const rate=columns.irpefWithheld/taxable*100;
    if(rate>=0&&rate<=60)detected.taxPct=rate;
  }

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
    psNightPct:data.nightPct??current.nightPct,
    psHolidayPct:data.holidayPct??current.holidayPct,
    psHolidayNightPct:data.holidayNightPct??current.holidayNightPct,
    psSocialPct:data.socialPct??current.socialPct,
    psTaxPct:data.taxPct??current.taxPct,
    psLocalTaxes:data.localTaxes??current.localTaxes,
    psCometaEmployee:data.cometaEmployee??current.cometaEmployee,
    psCometaEmployer:data.cometaEmployer??current.cometaEmployer,
    psCometaDeductible:data.cometaDeductible??current.cometaDeductible
  };
  Object.entries(values).forEach(([id,value])=>document.getElementById(id).value=value??0);
  document.getElementById('payslipMessage').textContent=
    `File analizzato localmente: ${fileName}. Controlla i valori prima di salvarli.`;
  document.getElementById('payslipDialog').dataset.fileName=fileName;
  document.getElementById('payslipDialog').showModal();
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
  const map={
    profileName:'psProfileName',
    gross:'psGross',
    divisor:'psDivisor',
    nightPct:'psNightPct',
    holidayPct:'psHolidayPct',
    holidayNightPct:'psHolidayNightPct',
    socialPct:'psSocialPct',
    taxPct:'psTaxPct',
    localTaxes:'psLocalTaxes',
    cometaEmployee:'psCometaEmployee',
    cometaEmployer:'psCometaEmployer',
    cometaDeductible:'psCometaDeductible'
  };

  for(const [key,id] of Object.entries(map)){
    state.settings[key]=key==='profileName'
      ? document.getElementById(id).value.trim()
      : Number(document.getElementById(id).value)||0;
  }

  state.settings.payslipFileName=
    document.getElementById('payslipDialog').dataset.fileName||'Busta paga PDF';
  state.settings.payslipImportedAt=new Date().toISOString();

  saveState();
  render();
  document.getElementById('payslipDialog').close();
};

document.getElementById('closePayslipDialog').onclick=()=>{
  document.getElementById('payslipDialog').close();
};
