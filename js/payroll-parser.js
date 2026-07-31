/**
 * ============================================================================
 * MODULO 1: PARSER DEL CEDOLINO ZUCCHETTI
 * Estrae i parametri vitali dal testo grezzo del PDF (es. usando pdf.js)
 * ============================================================================
 */
async function estraiTestoPdf(file) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js non è disponibile');
  }

  const data = new Uint8Array(await file.arrayBuffer());

  const documento = await window.pdfjsLib.getDocument({
    data
  }).promise;

  const pagine = [];

  for (
    let numeroPagina = 1;
    numeroPagina <= documento.numPages;
    numeroPagina++
  ) {
    const pagina = await documento.getPage(numeroPagina);
    const contenuto = await pagina.getTextContent();

    /*
     * Ricostruisce il testo raggruppandolo approssimativamente
     * per righe. È più affidabile di un semplice join con spazio.
     */
    const elementi = contenuto.items
      .filter(item => item.str?.trim())
      .map(item => ({
        testo: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5]
      }))
      .sort((a, b) => {
        const differenzaRiga = b.y - a.y;

        if (Math.abs(differenzaRiga) > 3) {
          return differenzaRiga;
        }

        return a.x - b.x;
      });

    const righe = [];
    let rigaCorrente = [];
    let ultimaY = null;

    elementi.forEach(elemento => {
      if (
        ultimaY !== null &&
        Math.abs(elemento.y - ultimaY) > 3
      ) {
        righe.push(rigaCorrente.join(' | '));
        rigaCorrente = [];
      }

      rigaCorrente.push(elemento.testo);
      ultimaY = elemento.y;
    });

    if (rigaCorrente.length) {
      righe.push(rigaCorrente.join(' | '));
    }

    pagine.push(righe.join('\n'));
  }

  return pagine.join('\n\n');
}

window.estraiTestoPdf = estraiTestoPdf;

const estraiProfiloDaPDF = (testoPDF) => {
    // Helper per convertire numeri italiani ("2.615,39") in float JS (2615.39)
    const parseItaNumber = (str) => {
        if (!str) return 0;
        return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    };

    // 1. Estrazione Lordo Fisso Base (Cerca la riga "TOTALE" in basso)
    const matchLordo = testoPDF.match(/TOTALE\s+([\d\.]+,\d+)/);
    const lordoFissoBase = matchLordo ? parseItaNumber(matchLordo[1]) : 0;

    // 2. Estrazione Dinamica dei Contributi (INPS, EPAR, ecc.)
    let contributiDinamici = []; // Si applicano sul Lordo Finale (es. IVS, CIGS)
    let contributiFissi = [];    // Si applicano solo sul Lordo Base (es. EPAR)

    // Regex per catturare: Nome, Base di Calcolo, Aliquota
    // Es. "Z00000 Contributo IVS | 2.972,00 | 9,19000% | 273,13"
    const regexContributi = /(Contributo\s+[A-Za-z\s]+).*?([\d\.]+,\d+)\s+\|\s+(\d+,\d+)%/gi;
    let matchContributo;

    while ((matchContributo = regexContributi.exec(testoPDF)) !== null) {
        const nome = matchContributo[1].trim();
        const basePDF = parseItaNumber(matchContributo[2]);
        const aliquota = parseItaNumber(matchContributo[3]) / 100;

        const voce = { nome, aliquota };

        // Smistamento: se la base letta nel PDF è uguale al lordo contrattuale, è fisso
        if (Math.abs(basePDF - lordoFissoBase) < 1) {
            contributiFissi.push(voce);
        } else {
            contributiDinamici.push(voce);
        }
    }

    // 3. Estrazione Addizionali (Regionale e Comunali)
    const getTrattenuta = (regex) => {
        const match = testoPDF.match(regex);
        return match ? parseItaNumber(match[1]) : 0;
    };
    
    // Cattura l'ultimo numero a destra nelle righe delle addizionali
    const addReg = getTrattenuta(/Addizionale regionale.*?(\d+,\d+)\s*$/m);
    const addComSaldo = getTrattenuta(/Addizionale comunale.*?(\d+,\d+)\s*$/m);
    const addComAcconto = getTrattenuta(/Acconto addiz\. comunale.*?(\d+,\d+)\s*$/m);
    const addizionaliMensili = addReg + addComSaldo + addComAcconto;

    // 4. Mappatura Maggiorazioni Fisse (Configurazione per l'app)
    // Queste percentuali possono essere anche estratte dinamicamente, 
    // ma le definiamo fisse basate sul vostro contratto aziendale per sicurezza.
    const maggiorazioniContratto = {
        notturno: 0.50,
        festivo: 0.50,
        festivoNotturno: 0.55 // Fixato al 55% come da busta paga
    };

    return {
        lordoFisso: lordoFissoBase,
        contributi: {
            dinamici: contributiDinamici,
            fissi: contributiFissi
        },
        addizionaliMensili: addizionaliMensili,
        moltiplicatori: maggiorazioniContratto,
        oreContrattuali: 173 // Divisore standard (modificabile se necessario)
    };
};
window.estraiProfiloDaPDF = estraiProfiloDaPDF;


 
