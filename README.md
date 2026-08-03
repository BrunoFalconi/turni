# Turni

App per turnisti: calendario dei turni, calcolo delle ore e stima della busta paga.

Funziona nel browser, senza installazione e senza account. **I dati restano sul
dispositivo**: turni, stipendio e cedolini non vengono mai inviati da nessuna parte.

👉 **[Apri l'app](https://kumatetsu78.github.io/turni/)**

---

## Cosa fa

**Calendario** — Ogni giorno mostra il tipo di turno con un colore e una barretta
che indica dove cade nelle 24 ore: si legge il ritmo del mese a colpo d'occhio.
In cima ci sono il turno di oggi e quello di domani.

**Regole del ciclo** — Segnala quando i turni non rispettano il ciclo: prima di
una notte deve esserci un riposo, un'altra notte o un DEAS; ogni settimana deve
avere 5 giorni coperti e 2 riposi. Ferie e permessi contano come giorni coperti,
non come riposi.

**Paga** — Calcola ore lavorate, notturne, festive e festive notturne dividendo
ogni turno minuto per minuto, applica le maggiorazioni del contratto e stima
lordo e netto del mese. Prevede le prossime sei buste.

**Bacheca** — I turni di tutto il reparto, giorno per giorno.

**Esportazioni** — Turnario di reparto o turni di una persona in PDF, i propri
turni nel calendario dell'iPhone, riepilogo del mese negli appunti.

---

## Primo avvio

### 1. Carica i turni

Impostazioni → **Turni** → *Importa da Excel*, e scegli il file del turnario.
L'app riconosce diverse disposizioni (giorni in riga, giorni in colonna, elenco
per righe), legge tutti i fogli del file e chiede a chi corrispondono i turni.

In alternativa, *Incolla sequenza turni*: si indica la data di partenza e si
incolla una stringa tipo `R N M M P P R R N R M P R DEAS`.

### 2. Imposta la retribuzione

Impostazioni → **Retribuzione** → *Lordo fisso mensile*.

È il **TOTALE** degli elementi della retribuzione, in alto sulla busta — non il
minimo tabellare. Verifica: lordo ÷ ore contrattuali deve dare la stessa paga
oraria scritta sulle righe «Magg.» della busta.

Se hai avuto aumenti, registrali in *Aumenti e scatti*: ogni mese userà il lordo
in vigore allora, e i mesi passati non vengono ricalcolati.

### 3. Dai un riferimento per il netto

Impostazioni → **La tua busta paga**. Servono quattro dati da una busta:

| Campo | Dove si trova |
|---|---|
| Di che mese è | — |
| Netto del mese | riquadro in basso a destra |
| Totale competenze | poco sopra il netto |
| Imponibile IRPEF | fra le voci del mese, codice `F02000` |

Le maggiorazioni le calcola l'app dai turni di quel mese.

Da questi numeri ricava contributi e aliquota IRPEF: la differenza fra competenze
e imponibile IRPEF **è** la somma dei contributi, qualunque essi siano. Per questo
funziona anche con fondi diversi da persona a persona.

Se qualcosa non torna l'app lo dice: campo mancante, importi invertiti, contributi
fuori scala, lordo incoerente con la busta.

### 4. Per il netto esatto: i cedolini

Impostazioni → **La tua busta paga** → *Cedolini dei mesi scorsi*. Per ogni mese
bastano il mese e il netto incassato.

- Un mese di cui hai dato il netto mostra **quel** netto, non una stima.
- Con un cedolino l'app ancora la parte fissa del periodo.
- Con due o più misura anche quanto ti resta di ogni euro di maggiorazione, e
  dichiara lo scarto medio.

I cedolini precedenti a un aumento non vengono mescolati con quelli successivi:
la parte fissa è cambiata.

---

## Uso quotidiano

- **Scorri lateralmente** per cambiare mese, oppure tocca il nome del mese per
  scegliere da una griglia. Su computer funzionano anche le frecce della tastiera.
- **Tocca un giorno** per modificarlo. Funzionano anche i giorni dei mesi
  adiacenti mostrati ai bordi della griglia.
- Dal giorno 15 l'app ricorda di caricare i turni del mese successivo.

---

## Note

**Dati separati per dispositivo.** Telefono e computer hanno archivi distinti:
quello che imposti su uno non compare sull'altro. Per allinearli:
Impostazioni → *Backup e dati* → **Salva backup**, e ripristina il file sull'altro
dispositivo.

**Aggiornamenti.** All'avvio l'app controlla se online c'è una versione più
recente e propone di caricarla. In caso di dubbi, *Backup e dati* → **Forza
aggiornamento**.

**Sul telefono.** Aprire in Safari → Condividi → *Aggiungi a schermata Home*.
Da lì parte a schermo intero e i dati vengono salvati.

**Cosa l'app non può sapere.** Le addizionali regionali e comunali dipendono dal
reddito dell'anno precedente e dal comune di residenza; conguagli, arretrati e
tredicesima seguono regole proprie. Per questo il netto è una stima finché non lo
ancori a un cedolino vero. Il lordo, che dipende solo da turni e contratto, è
invece esatto.

---

## Il progetto

Un solo file, `index.html`, senza dipendenze da installare. Dall'esterno carica
solo tre librerie: lettura Excel e generazione PDF.

Il numero di versione si legge in Impostazioni → *Backup e dati*.
