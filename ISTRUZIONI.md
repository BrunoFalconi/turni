# Turni — file sistemati

Rispetto al repository originale sono cambiati 6 file, più `js/logger.js` che è nuovo.

## Il problema del lordo sbagliato

L'app calcolava le maggiorazioni sul **lordo fisso completo** (2538,46 €):

```
oraria = 2538,46 / 173 = 14,6732 €/h
60h notturne × 14,6732 × 50%  = 440,20
22h festive  × 14,6732 × 50%  = 161,40
 2h fest.not.× 14,6732 × 55%  =  16,14
                       lordo   = 3156,20   ← sbagliato
```

In busta paga le maggiorazioni non si calcolano sul lordo fisso, ma su
**paga base + contingenza + EDR**, che esclude superminimo e indennità.
Con i tuoi numeri quella base vale circa **2134,47 €** (oraria 12,3380 €/h):

```
60h × 12,3380 × 50%  = 370,14
22h × 12,3380 × 50%  = 135,72
 2h × 12,3380 × 55%  =  13,57
              lordo   = 3057,89   ← corretto
```

## Cosa è cambiato

### `js/core.js`
- Nuove impostazioni `premiumBase` e `premiumDivisor`: la base oraria delle
  maggiorazioni è ora separata dal lordo fisso. Se lasciate a 0 il calcolo
  resta identico a prima, quindi i profili esistenti non cambiano risultato.
- Nuova impostazione `netAdjustment`: scarto costante fra netto reale e stimato.
- `payroll()` usa `premiumHourly` al posto di `hourly` per le maggiorazioni.
- Due funzioni di calibrazione che invertono la formula:
  `calibratePremiumBase()` ricava la base dal lordo reale,
  `calibrateNetAdjustment()` ricava lo scarto dal netto reale.

### `index.html`
- Tre campi nuovi nel profilo fiscale: base maggiorazioni, divisore
  maggiorazioni, correzione netto.
- Pulsante **Calibra da cedolino** e relativo dialog.
- Meta description e Open Graph, preconnect al CDN.

### `js/payslip.js`
- Cometa azienda: la ricerca provava un solo pattern (`C/DITTA`). Ora prova
  quattro varianti, poi cerca una riga COMETA che non sia quella del
  lavoratore, e se la colonna COMPETENZE è vuota ripiega sull'ultimo importo
  della riga.
- Se la riga azienda non si trova ma ci sono deducibile e lavoratore, la quota
  azienda si ricava per differenza (`deducibile − lavoratore`).

### `js/logger.js` (nuovo)
Logging su console e localStorage, ultimi 50 eventi, export JSON/CSV.
Da console: `Logger.getLogs()`, `Logger.downloadLogs('csv')`.

### `sw.js`
Versione della cache in una costante (`VERSION = '3.1'`), pulizia automatica
delle cache vecchie, cache-first sugli asset.

### `manifest.webmanifest`
Description, categorie, orientamento, shortcut.

### `css/style.css`
Stile per la riga "base oraria" e due media query per tablet e desktop.

## Come calibrare

1. Vai su un mese di cui hai già la busta paga e i turni completi in app.
2. Impostazioni → profilo fiscale → **Calibra da cedolino**.
3. Inserisci lordo reale (3057,89) e netto reale (2174,00).
4. **Calcola e salva**.

L'app scrive `premiumBase = 2134,47` e `netAdjustment = 41,90`, e da quel
momento tutti i mesi usano quella base.

## Sul residuo di 41,90 €

Dopo aver corretto il lordo il netto stimato è 2132,10 contro 2174,00 reali.
Lo scarto viene quasi tutto dall'IRPEF: l'app proietta l'imponibile del mese
× 12 per stimare il reddito annuo, ma un mese con 84 ore di maggiorazione non
è rappresentativo, quindi l'aliquota risulta più alta del vero.

`netAdjustment` copre lo scarto come costante. Se vuoi qualcosa di più solido,
compila **Reddito annuo aggiuntivo** nel profilo fiscale con il tuo imponibile
annuo effettivo e rimetti la correzione a 0: la proiezione diventa più
realistica e lo scarto si riduce da solo.

## Verifica

```
node --check js/core.js     # sintassi
python3 -m http.server 8000 # prova locale
```

In console dopo il caricamento di un cedolino: `Logger.getLogs()` mostra
l'esito del parsing riga per riga.
