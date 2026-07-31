'use strict';

(function () {
  /**
   * Calcola l'IRPEF mensile stimata partendo
   * dall'imponibile previdenziale mensile già pulito dai contributi.
   *
   * Le aliquote e le soglie devono essere mantenute coerenti
   * con la logica fiscale già presente nell'app.
   */
  function calcolaIrpefAnnuaProiettata(
    imponibileMensile,
    opzioni = {}
  ) {
    const mesiProiezione = opzioni.mesiProiezione || 12;
    const detrazioneAnnua = opzioni.detrazioneAnnua || 0;

    const imponibileAnnuo =
      Math.max(0, imponibileMensile) * mesiProiezione;

    let irpefLordaAnnua = 0;

    /*
     * Inserisci qui gli stessi scaglioni già usati
     * dalla tua app.
     *
     * Questo esempio usa tre fasce generiche:
     * sostituiscile con quelle effettivamente configurate.
     */
    const scaglioni = [
      {
        finoA: 28000,
        aliquota: 0.23
      },
      {
        finoA: 50000,
        aliquota: 0.35
      },
      {
        finoA: Infinity,
        aliquota: 0.43
      }
    ];

    let precedente = 0;
    let residuo = imponibileAnnuo;

    for (const scaglione of scaglioni) {
      if (residuo <= 0) break;

      const ampiezza =
        scaglione.finoA === Infinity
          ? residuo
          : scaglione.finoA - precedente;

      const imponibileFascia =
        Math.min(residuo, ampiezza);

      irpefLordaAnnua +=
        imponibileFascia * scaglione.aliquota;

      residuo -= imponibileFascia;
      precedente = scaglione.finoA;
    }

    const irpefNettaAnnua = Math.max(
      0,
      irpefLordaAnnua - detrazioneAnnua
    );

    return irpefNettaAnnua / mesiProiezione;
  }

  function calcolaSimulazioneMese(
    profilo,
    meseSimulazione,
    oreLavorate,
    opzioniFiscali = {}
  ) {
    if (!profilo) {
      throw new Error('Profilo cedolino non disponibile');
    }

    const pagaOrariaBase =
      profilo.lordoFisso / profilo.oreContrattuali;

    let lordoMaggiorazioni = 0;

    if (oreLavorate.notturne) {
      lordoMaggiorazioni +=
        oreLavorate.notturne *
        pagaOrariaBase *
        profilo.moltiplicatori.notturno;
    }

    if (oreLavorate.festive) {
      lordoMaggiorazioni +=
        oreLavorate.festive *
        pagaOrariaBase *
        profilo.moltiplicatori.festivo;
    }

    if (oreLavorate.festiveNotturne) {
      lordoMaggiorazioni +=
        oreLavorate.festiveNotturne *
        pagaOrariaBase *
        profilo.moltiplicatori.festivoNotturno;
    }

    const lordoTotale =
      profilo.lordoFisso + lordoMaggiorazioni;

    let totaleContributi = 0;

    profilo.contributi.dinamici.forEach(contributo => {
      totaleContributi +=
        lordoTotale * contributo.aliquota;
    });

    profilo.contributi.fissi.forEach(contributo => {
      totaleContributi +=
        profilo.lordoFisso * contributo.aliquota;
    });

    /*
     * Base IRPEF pulita dai contributi calcolati
     * dinamicamente.
     */
    const imponibileIrpef = Math.max(
      0,
      lordoTotale - totaleContributi
    );

    const irpefNetta =
      calcolaIrpefAnnuaProiettata(
        imponibileIrpef,
        opzioniFiscali
      );

    const mesiSenzaAddizionali = [1, 2];

    const addizionali =
      mesiSenzaAddizionali.includes(meseSimulazione)
        ? 0
        : profilo.addizionaliMensili;

    const nettoStimato =
      imponibileIrpef -
      irpefNetta -
      addizionali;

    return {
      competenze: {
        lordoBase: profilo.lordoFisso,
        maggiorazioni: lordoMaggiorazioni,
        lordoFinale: lordoTotale
      },

      trattenute: {
        contributiInpsFondi: totaleContributi,
        irpef: irpefNetta,
        addizionali
      },

      imponibileIrpef,
      nettoStimato
    };
  }

  window.calcolaIrpefAnnuaProiettata =
    calcolaIrpefAnnuaProiettata;

  window.calcolaSimulazioneMese =
    calcolaSimulazioneMese;
})();
