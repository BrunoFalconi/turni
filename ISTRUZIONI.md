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


---

# Aggiornamento dopo il cedolino di Marzo 2026

Marzo conferma le correzioni, ma ha fatto emergere un limite strutturale
dell'app: **teneva un solo profilo fiscale valido per tutti i mesi**,
mentre quattro voci cambiano da un cedolino all'altro.

## Le voci che variano

| Voce | Marzo | Maggio |
|---|---:|---:|
| EPAR / trattenute fisse | 11,18 | 2,54 |
| Ulteriore detrazione L.207/24 | 66,30 | 61,85 |
| Acconto addiz. comunale | 7,69 | 7,70 |
| Ore al 50% | 58 | 62 |
| Ore al 55% | 6 | 8 |

L'EPAR è il caso più vistoso. A maggio c'è **una riga** (2.538,46 × 0,10% =
2,54). A marzo ce ne sono **cinque**, perché sono stati recuperati gli
arretrati di dicembre 2025, gennaio e febbraio 2026:

```
003005 Contributo EPAR 12/25  2.158,26 x 0,10% = 2,16
003005 Contributo EPAR 12/25  2.158,26 x 0,10% = 2,16
003005 Contributo EPAR 01/26  2.158,26 x 0,10% = 2,16
003005 Contributo EPAR 02/26  2.158,26 x 0,10% = 2,16
003005 Contributo EPAR        2.538,46 x 0,10% = 2,54
                                        totale  11,18
```

Con un profilo unico da 2,54 l'app sbagliava marzo di 8,64 € di contributi,
e di conseguenza anche l'imponibile IRPEF.

## Cosa è cambiato

Il dialog *Dati del mese* (prima si chiamava "Ore con maggiorazione") ora
copre anche le trattenute variabili: EPAR, ulteriore detrazione e le tre
addizionali. Quello che inserisci vale solo per quel mese; gli altri
continuano a usare il profilo generale.

Internamente `state.premiumOverrides` diventa `state.monthOverrides` e
contiene otto campi invece di tre. I dati già salvati con il nome vecchio
vengono letti lo stesso, quindi non perdi nulla.

## Risultato sui due mesi, stesso profilo generale

| Voce | Marzo stima | Marzo cedolino | Maggio stima | Maggio cedolino |
|---|---:|---:|---:|---:|
| Lordo | 3.012,40 | 3.012,40 | 3.057,89 | 3.057,89 |
| Contributi | 297,06 | 297,02 | 292,73 | 292,74 |
| Imponibile IRPEF | 2.687,05 | 2.687,08 | 2.736,86 | 2.736,85 |
| IRPEF | 460,29 | 461,80 | 486,50 | 485,78 |
| **Netto** | **2.150,04** | **2.149,00** | **2.173,64** | **2.174,00** |

Scarto: 1,04 € a marzo, 0,36 € a maggio.

## Perché resta uno scarto di circa un euro

L'IRPEF del cedolino usa il **conguaglio progressivo sul cumulato
annuo**: a marzo il progressivo è 6.883,18 con 934,48 già versati, a
maggio 12.278,57 con 1.873,84. L'app invece proietta l'imponibile del
mese × 12, che è un'approssimazione. Nota che a marzo sbaglia in difetto
e a maggio in eccesso: è il comportamento tipico di questa
approssimazione, non un errore sistematico.

Portarla a zero richiederebbe di tenere il progressivo annuo in memoria e
ricalcolare l'imposta sul cumulato a ogni mese. È fattibile ma va fatto
bene: se ti interessa dimmelo, perché cambia la struttura del calcolo.

## Valori da inserire per marzo

Vai su marzo → *Dati del mese*:

| Campo | Valore |
|---|---|
| Ore al 50% (notturne) | 58 |
| Ore al 50% (festive) | 0 |
| Ore al 55% | 6 |
| EPAR / trattenute fisse | 11,18 |
| Ulteriore detrazione | 66,30 |
| Addizionale regionale | 51,84 |
| Comunale saldo | 17,18 |
| Comunale acconto | 7,69 |

## Sui 2.046 € che vedevi

Non riesco a riprodurre quel numero: con le correzioni applicate e le ore
giuste marzo dà 2.150. Il candidato più probabile è che l'override delle
ore non fosse stato inserito per marzo e l'app stesse ancora contando le
ore dai turni, che nel tuo contratto non corrispondono a quelle pagate.
Dopo aver inserito i valori qui sopra, se il numero resta lontano dimmi
che **lordo** mostra l'app per marzo: da lì si capisce subito se il
problema è sulle competenze o sulle trattenute.
