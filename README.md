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
