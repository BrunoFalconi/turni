# Turni e stipendio

Progetto pronto per GitHub Pages.

## File da caricare nella radice del repository

Dopo aver estratto lo ZIP, nella home del repository devono comparire direttamente:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `.nojekyll`
- cartella `css`
- cartella `js`
- cartella `icons`

Non caricare la cartella `TurniApp-Pronto-GitHub` come sottocartella e non caricare lo ZIP direttamente. `index.html` deve essere visibile nella home del repository.

## Pubblicazione

In GitHub: **Settings → Pages → Deploy from a branch → main → /(root)**.

Per il repository `Kumatetsu78/turni`, il sito è:

`https://kumatetsu78.github.io/turni/`

## Offline

Apri il sito online una prima volta e ricaricalo. Il service worker salva l'app nel browser. La libreria Excel è caricata da CDN e viene memorizzata dopo il primo utilizzo online; quindi l'importazione Excel offline richiede almeno una prima apertura con connessione.

I turni sono salvati nel browser tramite `localStorage`. Cancellare dati e cookie del sito elimina l'archivio locale.
