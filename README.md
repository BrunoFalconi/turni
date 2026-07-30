# TurniApp modulare

Struttura:

- `index.html`
- `css/style.css`
- `js/core.js` — stato, salvataggio, calendario, turni e stipendio
- `js/excel.js` — importazione Turnistica T1
- `js/backup.js` — esportazione/importazione JSON
- `js/app.js` — avvio, sincronizzazione e service worker
- `sw.js`
- `manifest.webmanifest`
- `icon-192.png`
- `icon-512.png`

## Pubblicazione su GitHub Pages

Carica nella root del repository tutto il contenuto della cartella estratta, mantenendo le cartelle `css` e `js`.

L'app usa la chiave locale `turni-app-stabile-v1`, quindi mantiene i dati già inseriti nella versione precedente sullo stesso browser.


## Versione 2.1 — Statistiche

Aggiunge:

- conteggio per tipo di turno;
- giorni lavorati e assenze;
- ore straordinarie oltre 8 ore/giorno;
- dettaglio ore notturne, festive e festive notturne;
- distribuzione grafica dei turni;
- pulsante per copiare il riepilogo mensile.

La chiave di salvataggio resta `turni-app-stabile-v1`, quindi i dati già presenti non vengono persi.


## Versione 2.2 — Dashboard e simulatore busta paga

Aggiunge:

- riepilogo del turno di oggi;
- prossimo turno programmato;
- ore e netto stimato del mese in dashboard;
- lordo totale stimato;
- contributi previdenziali;
- IRPEF stimata;
- addizionali;
- Fondo Cometa;
- altre competenze/trattenute;
- copia del riepilogo paga.

I turni continuano a usare la chiave `turni-app-stabile-v1`.


## Versione 2.3 — Dashboard corretta e grafici

- Dashboard integrata direttamente in `core.js`, così non dipende più da un file separato.
- Ore del mese e netto usano la stessa fonte dati della sezione Statistiche.
- Aggiunto grafico degli ultimi sei mesi con ore lavorate e netto stimato.
- La chiave dati resta `turni-app-stabile-v1`.
