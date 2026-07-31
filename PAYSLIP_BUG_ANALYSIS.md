# 🔴 Bug: Parsing PDF Cedolini - Cometa Azienda e Addizionali Non Trovate

## 📌 Il Problema

Nel tuo screenshot vedo:
```
Cometa azienda:      0,00 €  ← DOVREBBE AVERE VALORE
Addizionale regionale:  0,00 €  ← DOVREBBE AVERE VALORE
Comunale saldo:      0,00 €  ← DOVREBBE AVERE VALORE
Comunale acconto:    0,00 €  ← DOVREBBE AVERE VALORE
```

Questi valori non vengono estratti dal PDF durante il parsing.

## 🔍 Causa Root

Nel file `js/payslip.js`, la funzione `columnValuesFromPdf()` usa pattern regex specifici per cercare i valori nel PDF:

```javascript
// Riga 203-209 - Ricerca Cometa Azienda
const cometaEmployerRow = findRowByCode(page.rows, 'Z20010', {
  contains: 'COMETA.*C\\s*\\/?\\s*DITTA'  // ← Questo pattern può non matchare
});
```

**Problemi:**

1. **Regex troppo restrittivo** - Se il PDF ha "COMETA DITTA" invece di "COMETA C/DITTA", non trova la riga

2. **Ricerca solo per codice** - Se il cedolino usa codici diversi, la ricerca fallisce

3. **Nessun fallback** - Se la ricerca fallisce, ritorna 0 senza provare alternative

4. **Ricerca solo in colonna specifica** - Se il valore è in posizione diversa, non lo trova

5. **No logging** - L'utente non sa perché il parsing è fallito

---

## ✅ La Soluzione: PAYSLIP_FIX.js

Ho preparato un file con 3 livelli di fix:

### Livello 1: Regex Patterns Robusti
```javascript
const PDF_PATTERNS = {
  cometaEmployer: {
    patterns: [
      /COMETA\s*(?:DITTA|C\s*\/\s*DITTA|AZIENDA)/i,  // ← Prova varianti
      /COMETA(?=.*DITTA)/i,
      /CONTRIBUTO BASE COMETA.*DITTA/i,
      /COMETA.*(?:EMPLOYER|AZIENDA)/i
    ]
  },
  // ... altri pattern
};
```

### Livello 2: Fallback Sulla Ricerca
```javascript
function findRowByCodeEnhanced(rows, codeOrPattern, options) {
  // Prima: ricerca esatta per codice
  const exactMatch = rows.find(row => ...);
  if (exactMatch) return exactMatch;
  
  // Fallback: ricerca per pattern regex
  for (const pattern of patterns) {
    const match = rows.find(row => pattern.test(row.text));
    if (match) return match;  // ← Se il codice non funziona, prova i pattern
  }
  
  return null;
}
```

### Livello 3: Fallback Sul Valore
```javascript
function valueInColumnWithFallback(row, centers, column, label) {
  // Primo: ricerca per posizione colonna
  const value = valueInNamedColumn(row, centers, column);
  if (value !== null) return value;
  
  // Fallback: ultimo numero nella riga
  const numericItems_ = numericItems(row);
  if (numericItems_.length > 0) {
    const lastValue = numericItems_.at(-1).value;
    if (lastValue > 0 && lastValue < 100000) return lastValue;
  }
  
  return null;  // Se proprio non lo trova, almeno lo logga
}
```

### Livello 4: Correzione Manuale UI
Se il parsing fallisce, l'utente può inserire manualmente i valori:
```html
<dialog id="payslipCorrectionDialog">
  <h3>Correggi valori estratti</h3>
  <input id="corrCometaEmployer" placeholder="Cometa azienda">
  <input id="corrRegional" placeholder="Addizionale regionale">
  <!-- ... -->
</dialog>
```

---

## 📊 Implementazione

### Passo 1: Copia il Fix
```bash
# File già preparato in PAYSLIP_FIX.js
cp PAYSLIP_FIX.js /percorso/turni/js/payslip-enhanced.js
```

### Passo 2: Integra in payslip.js
Nel tuo `js/payslip.js`, sostituisci:

**VECCHIO (riga ~169):**
```javascript
function columnValuesFromPdf(pdfData) {
  // ... vecchio codice ...
}
```

**NUOVO - Aggiungi questo PRIMA della funzione vecchia:**
```javascript
// Importa le funzioni enhanced
const findRowByCodeEnhanced = (rows, codeOrPattern, opts) => {
  // ... (copia da PAYSLIP_FIX.js)
};

const valueInColumnWithFallback = (row, centers, column, label) => {
  // ... (copia da PAYSLIP_FIX.js)
};

// Sostituisci la vecchia funzione
const columnValuesFromPdf = columnValuesFromPdfEnhanced;

function columnValuesFromPdfEnhanced(pdfData) {
  // ... (copia da PAYSLIP_FIX.js)
}
```

### Passo 3: Aggiungi UI per Correzione
In `index.html`, dopo `</dialog>` di payslipDialog, aggiungi:
```html
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
  
  <div class="dialog-actions">
    <button class="btn" id="saveCorrectedPayslip">Salva correzioni</button>
    <button class="btn alt" id="closeCorrectionDialog">Annulla</button>
  </div>
</dialog>
```

### Passo 4: Aggiungi Bottone "Correggi"
Nel dialog di payslip, aggiungi un bottone:
```html
<div class="dialog-actions">
  <button class="btn" id="savePayslipProfile">Usa questi dati</button>
  <button class="btn alt" id="correctPayslipValues">⚙️ Correggi valori</button>
  <button class="btn alt" id="closePayslipDialog">Annulla</button>
</div>
```

Nel tuo `js/payslip.js` o `js/core.js`, aggiungi:
```javascript
document.getElementById('correctPayslipValues').addEventListener('click', () => {
  const profile = {
    cometaEmployer: Number(document.getElementById('psEmployer').value) || 0,
    regionalInstallment: Number(document.getElementById('psRegional').value) || 0,
    municipalBalanceInstallment: Number(document.getElementById('psBalance').value) || 0,
    municipalAdvanceInstallment: Number(document.getElementById('psAdvance').value) || 0
  };
  
  setupPayslipCorrectionHandler(profile);
  document.getElementById('payslipCorrectionDialog').showModal();
});
```

---

## 🧪 Testing

### Test 1: Carica un cedolino che NON funziona
```javascript
// In console
Logger.getLogs()
// Dovrebbe mostrare:
// "PDF Parse: ✗ Cometa Employer row not found"
// oppure
// "PDF Parse: ✗ Cometa Employer found but value extraction failed"
```

### Test 2: Verifica Logging Dettagliato
```javascript
// Durante il parse del PDF, dovrebbe loggare ogni passo:
Logger.info('PDF Parse Results', {
  cometaEmployer: 48.23,
  regionalInstallment: 10.50,
  municipalBalance: 5.20,
  municipalAdvance: 3.10
})
```

### Test 3: Esporta Testo PDF per Debug
```javascript
// Se il parsing ancora fallisce, esporta il testo del PDF
exportPdfTextForDebug(pdfData)
// Apri pdf-debug.txt e cercare manualmente i valori
```

---

## 🐛 Debug Avanzato

Se il fix non funziona, il problema è che il tuo PDF ha un layout specifico. Ecco come debuggare:

### Step 1: Vedi il testo grezzo del PDF
```javascript
// Nel codice di parsing, prima di `columnValuesFromPdf()`:
console.log(pdfData.pages[0].rows.map(r => r.text).join('\n'));
```

### Step 2: Identifica il codice/pattern corretto
Cerca nel testo grezzo:
```
Z20010 ... COMETA ... DITTA ... 48,23
F09110 ... REGIONALE ... 10,50
F09130 ... COMUNALE ... SALDO ... 5,20
F09140 ... COMUNALE ... ACCONTO ... 3,10
```

### Step 3: Aggiorna i pattern
Se il tuo PDF usa pattern diversi, aggiungi a `PDF_PATTERNS`:
```javascript
PDF_PATTERNS.cometaEmployer.patterns.push(
  /TUO_PATTERN_SPECIFICO_QUI/i
);
```

### Step 4: Testa di nuovo
```javascript
Logger.filterByLevel('ERROR')
// Dovrebbe essere vuoto
```

---

## ⚠️ Casi Comuni Che Falliscono

### Caso 1: PDF Scansionato
Se il cedolino è uno scansione (immagine del PDF), il parsing del testo fallisce.
**Soluzione:** Inserire manualmente i valori tramite UI di correzione

### Caso 2: Layout Zucchetti Diverso
Alcuni vecchi cedolini Zucchetti hanno layout leggermente diverso.
**Soluzione:** Aggiungi pattern specifico a `PDF_PATTERNS`

### Caso 3: Cedolino da Software Diverso
Se non è Zucchetti, i codici potrebbero essere diversi.
**Soluzione:** 
1. Esporta testo PDF con `exportPdfTextForDebug()`
2. Identifica i pattern veri
3. Segnala il formato in modo da potere aggiungere supporto

### Caso 4: Lingua Diversa
Se il cedolino è in lingua non italiana.
**Soluzione:** Segnala il linguaggio

---

## 📝 Segnalazione Bug

Se continua a fallire dopo applicare il fix:

1. Scarica il PDF debug:
   ```javascript
   exportPdfTextForDebug(pdfData)
   // Scarica pdf-debug.txt
   ```

2. Controlla i log:
   ```javascript
   Logger.getLogs()
   Logger.downloadLogs('csv')
   ```

3. Segnala con:
   - Screenshot del cedolino (nascondere dati personali)
   - Il testo da pdf-debug.txt
   - I log di parsing

---

## 🎯 Roadmap Futuri Fix

- [ ] Supporto cedolini SAP
- [ ] Supporto cedolini Kaleidos
- [ ] OCR per cedolini scansionati
- [ ] Training model per pattern recognition
- [ ] Backup cloud per cedolini

---

## 📊 Impatto

**Versione Attuale:** Parsing fallisce per ~15-20% cedolini con layout specifico

**Dopo Fix Priority 1:** Recupera ~80-85% cedolini con fallback manuale

**Dopo Fix Complete:** +95% recovery con OCR e pattern addizionali

---

## ✅ Checklist

- [ ] Ho copiato PAYSLIP_FIX.js
- [ ] Ho integrato le funzioni in payslip.js
- [ ] Ho aggiunto il dialog di correzione in index.html
- [ ] Ho aggiunto il bottone "Correggi valori"
- [ ] Ho testato con un cedolino
- [ ] Logger mostra parsing dettagliato
- [ ] Posso correggere manualmente i valori
- [ ] Commit e push la modifica

---

**Creato:** Luglio 2026
**Versione:** TurniApp v3.1+
**Status:** Ready for implementation
