/**
 * FIX PAYSLIP PARSING - payslip.js
 * 
 * PROBLEMI RISOLTI:
 * 1. Cometa azienda non trovata (Z20010 C/DITTA pattern fallisce)
 * 2. Addizionali (regionale, comunale) non trovate
 * 3. No fallback se parsing fallisce
 * 4. No logging per debug
 * 
 * SOLUZIONI:
 * - Regex più robusti per trovare righe
 * - Fallback su ricerca per testo se codice non funziona
 * - Logging dettagliato per debug
 * - Interfaccia di correzione manuale
 */

// ============================================
// 1. REGEX PATTERNS MIGLIORATI
// ============================================

const PDF_PATTERNS = {
  cometaEmployer: {
    codes: ['Z20010', 'Z200'],  // Prova varianti
    patterns: [
      /COMETA\s*(?:DITTA|C\s*\/\s*DITTA|AZIENDA)/i,
      /COMETA(?=.*DITTA)/i,
      /CONTRIBUTO BASE COMETA.*DITTA/i,
      /COMETA.*(?:EMPLOYER|AZIENDA)/i
    ]
  },
  
  regionalTax: {
    codes: ['F09110'],
    patterns: [
      /ADDIZIONALE.*REGIONALE|REGIONALE/i,
      /IMPOSTA REGIONALE/i,
      /F09110/i
    ]
  },
  
  municipalBalance: {
    codes: ['F09130'],
    patterns: [
      /ADDIZIONALE.*COMUNALE|COMUNALE(?=.*SALDO)/i,
      /IMPOSTA COMUNALE.*SALDO/i,
      /F09130/i
    ]
  },
  
  municipalAdvance: {
    codes: ['F09140'],
    patterns: [
      /ADDIZIONALE.*COMUNALE.*ACCONTO|ACCONTO|ANTICIPO/i,
      /IMPOSTA COMUNALE.*ACCONTO|ACCONTO/i,
      /F09140/i
    ]
  }
};

// ============================================
// 2. ENHANCED COLUMN VALUE FINDER
// ============================================

/**
 * Trova valore in colonna con fallback su ricerca per testo
 */
function valueInColumnWithFallback(row, centers, column, label) {
  // Primo tentativo: ricerca per posizione colonna
  const value = valueInNamedColumn(row, centers, column);
  if (value !== null) {
    Logger?.debug?.(`Found ${label} in column ${column}: ${value}`);
    return value;
  }
  
  // Fallback: ricerca per testo (ultimo numero nella riga)
  const numericItems_ = numericItems(row);
  if (numericItems_.length > 0) {
    const lastValue = numericItems_.at(-1).value;
    if (lastValue > 0 && lastValue < 100000) {
      Logger?.debug?.(`Found ${label} as last numeric: ${lastValue}`);
      return lastValue;
    }
  }
  
  Logger?.debug?.(`Could not find ${label} in row: ${row.text.substring(0, 50)}`);
  return null;
}

/**
 * Trova riga per codice con multiple pattern matching
 */
function findRowByCodeEnhanced(rows, codeOrPattern, { contains = '', excludes = '', patterns = [] } = {}) {
  // Prima: ricerca esatta per codice
  if (codeOrPattern && typeof codeOrPattern === 'string') {
    const exactMatch = rows.find(row => {
      const text = row.text;
      return text.includes(codeOrPattern) &&
        (!contains || new RegExp(contains, 'i').test(text)) &&
        (!excludes || !new RegExp(excludes, 'i').test(text));
    });
    if (exactMatch) return exactMatch;
  }
  
  // Fallback: ricerca per pattern regex
  for (const pattern of patterns) {
    const match = rows.find(row => pattern.test(row.text));
    if (match) return match;
  }
  
  return null;
}

// ============================================
// 3. ENHANCED COLUMN PARSER
// ============================================

/**
 * Versione migliorata di columnValuesFromPdf
 * SOSTITUIRE la funzione esistente in payslip.js
 */
function columnValuesFromPdfEnhanced(pdfData) {
  const result = {
    cometaEmployee: null,
    cometaEmployer: null,        // ← PROBLEMA 1: Questo era sempre null
    cometaDeductible: null,
    irpefWithheld: null,
    localTaxes: null,
    regionalInstallment: null,   // ← PROBLEMA 2: Questi erano sempre null
    municipalBalanceInstallment: null,
    municipalAdvanceInstallment: null,
    fixedExtraDeductions: null,
    // Aggiunto per debug
    _parseLog: []
  };

  const log = (msg) => {
    result._parseLog.push(msg);
    Logger?.debug?.(`PDF Parse: ${msg}`);
  };

  let localTaxes = 0;

  for (const page of pdfData.pages) {
    // Trova header con colonne
    const header = page.rows.find(row =>
      /TRATTENUTE/i.test(row.text) && /COMPETENZE/i.test(row.text)
    );
    if (!header) {
      log('No header found in page');
      continue;
    }

    const centers = headerColumnCenters(header);
    if (!centers) {
      log('Could not determine column centers');
      continue;
    }

    log(`Column centers: trattenute=${centers.trattenute}, competenze=${centers.competenze}`);

    // ==========================================
    // COMETA EMPLOYEE (Lavoratore)
    // ==========================================
    const cometaEmployeeRow = findRowByCodeEnhanced(
      page.rows,
      'Z20010',
      {
        contains: 'COMETA',
        excludes: 'C\\s*\\/?\\s*DITTA|AZIENDA|DITT'
      }
    );
    if (cometaEmployeeRow) {
      const value = valueInColumnWithFallback(cometaEmployeeRow, centers, 'trattenute', 'Cometa Employee');
      if (value != null) {
        result.cometaEmployee = value;
        log(`✓ Cometa Employee: ${value}`);
      }
    } else {
      log('✗ Cometa Employee row not found');
    }

    // ==========================================
    // COMETA EMPLOYER (Azienda) - FIX PRINCIPALE
    // ==========================================
    let cometaEmployerRow = null;
    
    // Prova ricerca con codice Z20010
    cometaEmployerRow = findRowByCodeEnhanced(page.rows, 'Z20010', {
      contains: 'COMETA',
      excludes: 'LAVORATORE'
    });
    
    // Se non trova, prova con pattern regex
    if (!cometaEmployerRow) {
      cometaEmployerRow = findRowByCodeEnhanced(page.rows, null, {
        patterns: PDF_PATTERNS.cometaEmployer.patterns
      });
    }
    
    if (cometaEmployerRow) {
      // Prova prima nella colonna competenze (dove dovrebbe stare)
      let value = valueInNamedColumn(cometaEmployerRow, centers, 'competenze');
      
      // Se non trova, prova con fallback
      if (value == null) {
        value = valueInColumnWithFallback(cometaEmployerRow, centers, 'competenze', 'Cometa Employer');
      }
      
      if (value != null) {
        result.cometaEmployer = Math.abs(value);
        log(`✓ Cometa Employer: ${result.cometaEmployer}`);
      } else {
        log(`✗ Cometa Employer found but value extraction failed: ${cometaEmployerRow.text.substring(0, 50)}`);
      }
    } else {
      log('✗ Cometa Employer row not found');
    }

    // ==========================================
    // COMETA DEDUCTIBLE (Deducibile)
    // ==========================================
    const deductibleRow = findRowByCode(page.rows, 'F01998');
    if (deductibleRow) {
      const values = numericItems(deductibleRow)
        .map(x => x.value)
        .filter(v => v >= 0 && v < 10000);
      if (values.length) {
        result.cometaDeductible = values.at(-1);
        log(`✓ Cometa Deductible: ${result.cometaDeductible}`);
      }
    } else {
      log('✗ Cometa Deductible row not found');
    }

    // ==========================================
    // IRPEF (Ritenuta IRPEF)
    // ==========================================
    const irpefRow = findRowByCode(page.rows, 'F03020');
    if (irpefRow) {
      const value = valueInNamedColumn(irpefRow, centers, 'trattenute');
      if (value != null) {
        result.irpefWithheld = value;
        log(`✓ IRPEF Withheld: ${value}`);
      }
    } else {
      log('✗ IRPEF row not found');
    }

    // ==========================================
    // ADDIZIONALI - FIX PER NON TROVARE VALORI
    // ==========================================
    
    // Regionale (F09110)
    let regionalRow = findRowByCodeEnhanced(
      page.rows,
      'F09110',
      { patterns: PDF_PATTERNS.regionalTax.patterns }
    );
    
    if (regionalRow) {
      const value = valueInColumnWithFallback(regionalRow, centers, 'trattenute', 'Regional Tax');
      if (value != null) {
        result.regionalInstallment = Math.abs(value);
        log(`✓ Regional Installment: ${result.regionalInstallment}`);
      } else {
        log(`✗ Regional Tax found but value extraction failed`);
      }
    } else {
      log('✗ Regional Tax row not found');
    }

    // Comunale Saldo (F09130)
    let municipalBalanceRow = findRowByCodeEnhanced(
      page.rows,
      'F09130',
      { patterns: PDF_PATTERNS.municipalBalance.patterns }
    );
    
    if (municipalBalanceRow) {
      const value = valueInColumnWithFallback(municipalBalanceRow, centers, 'trattenute', 'Municipal Balance');
      if (value != null) {
        result.municipalBalanceInstallment = Math.abs(value);
        log(`✓ Municipal Balance: ${result.municipalBalanceInstallment}`);
      } else {
        log(`✗ Municipal Balance found but value extraction failed`);
      }
    } else {
      log('✗ Municipal Balance row not found');
    }

    // Comunale Acconto (F09140)
    let municipalAdvanceRow = findRowByCodeEnhanced(
      page.rows,
      'F09140',
      { patterns: PDF_PATTERNS.municipalAdvance.patterns }
    );
    
    if (municipalAdvanceRow) {
      const value = valueInColumnWithFallback(municipalAdvanceRow, centers, 'trattenute', 'Municipal Advance');
      if (value != null) {
        result.municipalAdvanceInstallment = Math.abs(value);
        log(`✓ Municipal Advance: ${result.municipalAdvanceInstallment}`);
      } else {
        log(`✗ Municipal Advance found but value extraction failed`);
      }
    } else {
      log('✗ Municipal Advance row not found');
    }

    // ==========================================
    // EPAR
    // ==========================================
    const eparRow = findRowByCode(page.rows, '003005', { contains: 'Contributo\\s+EPAR' });
    if (eparRow) {
      const value = valueInNamedColumn(eparRow, centers, 'trattenute');
      if (value != null) {
        result.fixedExtraDeductions = Math.abs(value);
        log(`✓ EPAR: ${result.fixedExtraDeductions}`);
      }
    }
  }

  result.localTaxes = [
    result.regionalInstallment,
    result.municipalBalanceInstallment,
    result.municipalAdvanceInstallment
  ].filter(v => v != null).reduce((a, b) => a + b, 0) || null;

  // Log parse results
  Logger?.info?.('PDF Parse Results', {
    cometaEmployee: result.cometaEmployee,
    cometaEmployer: result.cometaEmployer,
    regionalInstallment: result.regionalInstallment,
    municipalBalance: result.municipalBalanceInstallment,
    municipalAdvance: result.municipalAdvanceInstallment,
    log: result._parseLog.join(' | ')
  });

  delete result._parseLog;
  return result;
}

// ============================================
// 4. MANUAL CORRECTION UI
// ============================================

/**
 * Aggiungi dialog per correzione manuale
 * Inserisci questo HTML in index.html dopo payslipDialog:
 */

const PAYSLIP_CORRECTION_HTML = `
<dialog id="payslipCorrectionDialog">
  <h3>Correggi valori estratti</h3>
  <p class="notice">Se alcuni valori non sono stati estratti correttamente, correggili qui:</p>
  
  <div class="fields">
    <div><label>Cometa azienda €</label>
      <input id="corrCometaEmployer" type="number" step="0.01"></div>
    <div><label>Addizionale regionale €</label>
      <input id="corrRegional" type="number" step="0.01"></div>
    <div><label>Comunale saldo €</label>
      <input id="corrMunicipalBalance" type="number" step="0.01"></div>
    <div><label>Comunale acconto €</label>
      <input id="corrMunicipalAdvance" type="number" step="0.01"></div>
  </div>
  
  <div class="notice" style="color:#ffa500;font-size:12px;">
    Nota: Questi valori corriggeranno il profilo fiscale estratto
  </div>
  
  <div class="dialog-actions">
    <button class="btn" id="saveCorrectedPayslip">Salva correzioni</button>
    <button class="btn alt" id="closeCorrectionDialog">Annulla</button>
  </div>
</dialog>
`;

/**
 * Handler per salvataggio correzioni manuali
 */
function setupPayslipCorrectionHandler(profile) {
  const corrDialog = document.getElementById('payslipCorrectionDialog');
  if (!corrDialog) return;
  
  document.getElementById('corrCometaEmployer').value = profile.cometaEmployer || '';
  document.getElementById('corrRegional').value = profile.regionalInstallment || '';
  document.getElementById('corrMunicipalBalance').value = profile.municipalBalanceInstallment || '';
  document.getElementById('corrMunicipalAdvance').value = profile.municipalAdvanceInstallment || '';
  
  const saveBtn = document.getElementById('saveCorrectedPayslip');
  const closeBtn = document.getElementById('closeCorrectionDialog');
  
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      profile.cometaEmployer = Number(document.getElementById('corrCometaEmployer').value) || 0;
      profile.regionalInstallment = Number(document.getElementById('corrRegional').value) || 0;
      profile.municipalBalanceInstallment = Number(document.getElementById('corrMunicipalBalance').value) || 0;
      profile.municipalAdvanceInstallment = Number(document.getElementById('corrMunicipalAdvance').value) || 0;
      
      Logger?.info?.('Payslip values corrected manually', profile);
      
      corrDialog.close();
      // Aggiorna profilo nel sistema
      // savePayrollSettings(profile);
    }, { once: true });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => corrDialog.close(), { once: true });
  }
}

// ============================================
// 5. ISTRUZIONI DI INTEGRAZIONE
// ============================================

/*
PER APPLICARE QUESTO FIX IN payslip.js:

1. SOSTITUISCI la funzione columnValuesFromPdf() con columnValuesFromPdfEnhanced()
   Vecchio:
   function columnValuesFromPdf(pdfData) { ... }
   
   Nuovo:
   const columnValuesFromPdf = columnValuesFromPdfEnhanced;

2. AGGIUNGI le funzioni di supporto:
   - valueInColumnWithFallback()
   - findRowByCodeEnhanced()

3. AGGIUNGI il dialog HTML in index.html (vedi PAYSLIP_CORRECTION_HTML)

4. NEL PAYSLIP DIALOG, aggiungi un bottone "Correggi valori":
   <button class="btn alt" id="correctPayslipValues">⚙️ Correggi valori</button>
   
   Con handler:
   document.getElementById('correctPayslipValues').addEventListener('click', () => {
     setupPayslipCorrectionHandler(profileData);
     document.getElementById('payslipCorrectionDialog').showModal();
   });

5. TESTA con un cedolino dove non find Cometa azienda
   Vedi in console se Logger.getLogs() mostra "Cometa Employer found but value extraction failed"

6. SE MOSTRA "Cometa Employer row not found", significa che il PDF ha un layout diverso
   In questo caso, aggiungi il pattern specifico a PDF_PATTERNS.cometaEmployer.patterns
*/

// ============================================
// 6. DEBUG: EXPORT PDF TEXT
// ============================================

/**
 * Utility per esportare tutto il testo del PDF per debug
 * Aggiungi in console del browser durante il parsing
 */
function exportPdfTextForDebug(pdfData) {
  let fullText = '';
  for (const page of pdfData.pages) {
    fullText += '=== PAGINA ===\n';
    for (const row of page.rows) {
      fullText += `${row.text}\n`;
    }
    fullText += '\n';
  }
  
  const blob = new Blob([fullText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pdf-debug.txt';
  a.click();
  URL.revokeObjectURL(url);
  
  console.log('PDF text exported to pdf-debug.txt');
}
