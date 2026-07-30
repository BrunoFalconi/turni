# Turni e stipendio

Web app installabile per gestire i turni, importare il file Excel **Turnistica T1** e stimare le maggiorazioni dello stipendio.

## Caricamento su GitHub

1. Apri il repository.
2. Premi **Add file → Upload files**.
3. Trascina **tutto il contenuto di questa cartella**, comprese le cartelle `css`, `js` e `icons`.
4. Premi **Commit changes**.
5. In **Settings → Pages**, pubblica il branch `main` dalla cartella `/ (root)`.

Non caricare la cartella superiore come sottocartella: `index.html` deve essere visibile nella pagina principale del repository.

## Modalità offline

Apri il sito online almeno una volta e ricaricalo. Il service worker salverà i file dell'app. La libreria per leggere Excel viene memorizzata dopo il primo caricamento online; successivamente l'importazione può funzionare offline nello stesso browser.

## Installazione

- iPhone/iPad: Safari → Condividi → **Aggiungi alla schermata Home**.
- Android/Chrome: menu del browser → **Installa app**.
- PC: icona di installazione nella barra degli indirizzi, quando disponibile.

## Dati

I turni sono salvati nel browser del dispositivo. Cancellare dati e cookie del sito elimina l'archivio locale.
