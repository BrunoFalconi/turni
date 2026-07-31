# Turni — correzioni verificate sul cedolino di Maggio 2026

## Prima di tutto: la mia diagnosi precedente era sbagliata

Avevo detto che la base oraria delle maggiorazioni era troppo alta e che
andava abbassata a ~2134 €. **Non è vero.** Il cedolino lo dimostra:

```
Z12050 Magg. banca ore 50%   7,33659 €/ora  ->  7,33659 / 0,50 = 14,6732
Z12055 Magg. banca ore 55%   8,07025 €/ora  ->  8,07025 / 0,55 = 14,6732
2538,46 / 173                              =              14,6732
```

La base oraria dell'app era già esatta. Se avevi lanciato la calibrazione
che ti avevo fatto, **rimetti "Base maggiorazioni" a 0** nel profilo
fiscale, altrimenti falsa tutti i mesi.

Il vero errore erano le **ore**, e altre tre cose sul lato trattenute.

## I quattro errori veri

### 1. Ore contate male (era questo il buco da 98 €)

```
App      : 60h notturne + 22h festive + 2h festive notturne  =  84h
Cedolino : 62h al 50% + 8h al 55%                            =  70h
```

Le 70 ore coincidono con "Ore straordinarie 70,00" in testata. Le voci si
chiamano **"Magg. banca ore"**: la maggiorazione si applica alle ore
accantonate nella banca ore, non a ogni ora notturna o festiva lavorata.
Il tuo contratto ha una regola che dai turni non è ricostruibile.

**Soluzione:** nuovo dialog *Ore con maggiorazione* dove copi le ore dal
cedolino, salvate per singolo mese. I mesi senza override continuano a
usare il calcolo automatico.

### 2. Imponibile IRPEF: sottraeva la quota sbagliata

```
App      : lordo − contributi − cometa DEDUCIBILE (75,46) = 2689,69
Cedolino : F02000 Imponibile IRPEF                        = 2736,85
Corretto : lordo − contributi − cometa LAVORATORE (28,30) = 2736,85
```

La quota azienda (47,16) non è mai entrata nel lordo — è fra parentesi,
figurativa. Sottrarla era uno sconto doppio. Il totale deducibile F01998
serve alla dichiarazione annuale, non al cedolino mensile.

### 3. Mancava l'ulteriore detrazione L.207/24

Il cedolino ha `F02801 Ulteriore detrazione L.207/24 = 61,85`, che l'app
non conosceva. Da sola valeva ~62 € di IRPEF in più al mese.

### 4. Aliquota contributiva sbagliata

```
App      : 9,59% forfettario
Cedolino : IVS 9,19% + CIGS 0,30% = 9,49%,  più EPAR 0,10% su 2538,46
```

Il default passa a 9,49% e il parser ora legge le percentuali vere dalle
righe IVS e CIGS invece di usare un valore fisso.

## Risultato

| Voce | Stima app | Cedolino | Scarto |
|---|---:|---:|---:|
| Lordo finale | 3.057,89 | 3.057,89 | 0,00 |
| Contributi | 292,73 | 292,74 | 0,01 |
| Imponibile IRPEF | 2.736,86 | 2.736,85 | 0,01 |
| IRPEF | 486,50 | 485,78 | 0,72 |
| Addizionali | 76,72 | 76,72 | 0,00 |
| Cometa lavoratore | 28,30 | 28,30 | 0,00 |
| Cometa azienda | 47,16 | 47,16 | 0,00 |
| **Netto** | **2.173,64** | **2.174,00** | **0,36** |

I 72 centesimi sull'IRPEF restano perché il cedolino usa il conguaglio
progressivo sul cumulato dell'anno (Imp. IRPEF 12.278,57 da gennaio),
mentre l'app proietta il mese × 12. Su un mese medio la differenza è
minima; su un mese anomalo cresce. Se vuoi azzerarla, compila
**Reddito annuo aggiuntivo** con l'imponibile annuo effettivo.

## Configurazione da inserire

Impostazioni → profilo fiscale:

| Campo | Valore |
|---|---|
| Lordo fisso mensile | 2538,46 |
| Divisore mensile | 173 |
| Base maggiorazioni | **0** (non toccare) |
| Contributi dipendente % | 9,49 |
| Trattenute fisse extra | 2,54 (EPAR) |
| Ulteriore detrazione mensile | 61,85 |
| Addizionale regionale | 51,84 |
| Comunale saldo | 17,18 |
| Comunale acconto | 7,70 |
| Cometa lavoratore | 28,30 |
| Cometa azienda | 47,16 |
| Cometa deducibile | 75,46 |

Poi *Ore con maggiorazione* → 62 / 0 / 8 → Applica.

## Cometa azienda

Nel cedolino sta su `Z20010 Contributo base COMETA C/Ditta ... ( 47,16 )`.
Il parser cercava un solo pattern e la colonna COMPETENZE. Ora prova
quattro varianti di scrittura, ripiega sull'ultimo importo della riga, e
se la riga proprio manca ricava la quota per differenza
(deducibile 75,46 − lavoratore 28,30 = 47,16).

## Altri file

- `js/logger.js` (nuovo) — log su console e localStorage, `Logger.getLogs()`
- `sw.js` — versione cache in costante, pulizia automatica
- `manifest.webmanifest` — description, categorie, shortcut
- `css/style.css` — riga base oraria, media query tablet/desktop

## Una nota sulla privacy

Il PDF che hai caricato contiene nome, codice fiscale, IBAN e matricola.
L'app li tiene in locale, ma per condividere un cedolino conviene
oscurarli.
