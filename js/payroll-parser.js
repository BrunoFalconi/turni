/**
 * ============================================================================
 * MODULO 1: PARSER DEL CEDOLINO ZUCCHETTI
 * Estrae i parametri vitali dal testo grezzo del PDF (es. usando pdf.js)
 * ============================================================================
 */
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


 
