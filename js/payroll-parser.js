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


/**
 * ============================================================================
 * MODULO 2: MOTORE DI SIMULAZIONE
 * Calcola il netto per il mese selezionato basandosi sul profilo estratto e i turni
 * ============================================================================
 */
const calcolaSimulazioneMese = (profilo, meseSimulazione, oreLavorate) => {
    // 1. Calcolo Base Oraria
    const pagaOrariaBase = profilo.lordoFisso / profilo.oreContrattuali;

    // 2. Calcolo Maggiorazioni dai Turni
    let lordoMaggiorazioni = 0;
    if (oreLavorate.notturne) {
        lordoMaggiorazioni += oreLavorate.notturne * (pagaOrariaBase * profilo.moltiplicatori.notturno);
    }
    if (oreLavorate.festive) {
        lordoMaggiorazioni += oreLavorate.festive * (pagaOrariaBase * profilo.moltiplicatori.festivo);
    }
    if (oreLavorate.festiveNotturne) {
        lordoMaggiorazioni += oreLavorate.festiveNotturne * (pagaOrariaBase * profilo.moltiplicatori.festivoNotturno);
    }

    const lordoTotale = profilo.lordoFisso + lordoMaggiorazioni;

    // 3. Calcolo Trattenute Previdenziali (INPS, Fondi, ecc.)
    let totaleContributi = 0;
    
    // Applica contributi dinamici (es. INPS) sul Lordo Totale maggiorato
    profilo.contributi.dinamici.forEach(c => {
        totaleContributi += (lordoTotale * c.aliquota);
    });

    // Applica contributi fissi (es. EPAR) solo sul Lordo Base contrattuale
    profilo.contributi.fissi.forEach(c => {
        totaleContributi += (profilo.lordoFisso * c.aliquota);
    });

    // 4. Gestione Addizionali Temporali (Niente addizionali a Gen/Feb)
    let trattenutaAddizionaliReale = 0;
    const mesiSenzaAddizionali = [1, 2]; // 1 = Gennaio, 2 = Febbraio
    
    if (!mesiSenzaAddizionali.includes(meseSimulazione)) {
        trattenutaAddizionaliReale = profilo.addizionaliMensili;
    }

    // 5. Calcolo Fiscale (IRPEF)
    const imponibileIrpef = lordoTotale - totaleContributi;
    
    // Funzione fittizia: qui il collega deve richiamare il modulo scaglioni IRPEF 2026 e detrazioni
    const irpefNetta = calcolaIrpefAnnuaProiettata(imponibileIrpef); 

    // 6. Netto Finale
    const nettoStimato = imponibileIrpef - irpefNetta - trattenutaAddizionaliReale;

    return {
        competenze: {
            lordoBase: profilo.lordoFisso.toFixed(2),
            maggiorazioni: lordoMaggiorazioni.toFixed(2),
            lordoFinale: lordoTotale.toFixed(2)
        },
        trattenute: {
            contributiInpsFondi: totaleContributi.toFixed(2),
            irpef: irpefNetta.toFixed(2),
            addizionali: trattenutaAddizionaliReale.toFixed(2)
        },
        nettoStimato: nettoStimato.toFixed(2)
    };
};

// ============================================================================
// ESEMPIO DI UTILIZZO NELL'APP
// ============================================================================
/*
  // 1. Quando l'utente carica il PDF:
  const testoEstrattoDalPdf = "...(testo restituito dalla libreria PDF)...";
  const profiloUtente = estraiProfiloDaPDF(testoEstrattoDalPdf);
  // -> Salva 'profiloUtente' nel database o nel local storage

  // 2. Quando l'utente guarda Agosto (Mese 8) e segna i turni:
  const turniInseriti = {
      notturne: 18,
      festive: 26,
      festiveNotturne: 6
  };
  
  const previsione = calcolaSimulazioneMese(profiloUtente, 8, turniInseriti);
  console.log(previsione);
*/
