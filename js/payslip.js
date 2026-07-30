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

  const pension=findAmountNear(compact,['Contributo\\s+base\\s+COMETA(?![\\s\\S]{0,30}C\\/Ditta)','COMETA']);

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
    cometaAmount:pension
  };
}

async function extractPdfText(file){
  if(!window.pdfjsLib)throw new Error('Libreria PDF non disponibile');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
  const pages=[];

  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    const items=content.items
      .map(item=>({text:item.str,x:item.transform[4],y:item.transform[5]}))
      .sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);

    let lastY=null,line=[],lines=[];
    for(const item of items){
      if(lastY!=null&&Math.abs(item.y-lastY)>2){
        lines.push(line.join(' '));
        line=[];
      }
      line.push(item.text);
      lastY=item.y;
    }
    if(line.length)lines.push(line.join(' '));
    pages.push(lines.join('\n'));
  }
  return pages.join('\n\n');
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
    psCometaAmount:data.cometaAmount??current.cometaAmount
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
    const text=await extractPdfText(file);
    const detected=parsePayslipText(text);

    if(text.replace(/\s/g,'').length<50){
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
    cometaAmount:'psCometaAmount'
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
