# Analisi e Problemi - TurniApp

## 📋 Riepilogo Generale
Il progetto è ben strutturato, modulare e funzionale. Tuttavia, ci sono diverse aree di miglioramento in termini di robustezza, performance e manutenibilità.

---

## 🔴 Problemi Critici

### 1. **Manifest WebManifest Incompleto**
**File:** `manifest.webmanifest`
**Problema:** Mancano proprietà consigliate che migliorano la UX della PWA.

**Manca:**
- `categories` - per app store
- `orientation` - specifica portret-primary
- `screenshots` - per install prompt
- `prefer_related_applications` - false
- `description`

**Soluzione:**
```json
{
  "name": "TurniApp - Gestione Turni e Stipendi",
  "short_name": "Turni",
  "description": "App modulare per la gestione dei turni di lavoro, calcolo stipendi e analisi cedolini",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#0e1420",
  "theme_color": "#0e1420",
  "categories": ["productivity", "utilities"],
  "screenshots": [
    {
      "src": "./icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ],
  "icons": [
    {
      "src": "./icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "./icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    }
  ],
  "prefer_related_applications": false
}
```

---

### 2. **Service Worker Cache Strategy Non Ottimale**
**File:** `sw.js`
**Problema:** 
- Cache aggiornato solo manualmente (stringa hardcoded)
- Non ha mecanismo di versioning automatico
- Fetch sempre tenta online-first (costo dati)

**Soluzione:**
```javascript
const VERSION = '3.1'; // Incrementare quando deployi
const CACHE = `turni-app-v${VERSION}`;
const CORE = [
  './', './index.html', './css/style.css',
  './js/core.js', './js/excel.js', './js/backup.js',
  './js/stats.js', './js/payslip.js', './js/app.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  // Cache-first per assets, network-first per API
  const url = new URL(event.request.url);
  const isAsset = /\.(js|css|png|jpg|webp)$/.test(url.pathname);
  
  event.respondWith((async () => {
    try {
      if (isAsset) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE);
        cache.put(event.request, fresh.clone());
        return fresh;
      } else {
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE);
        cache.put(event.request, fresh.clone());
        return fresh;
      }
    } catch (err) {
      return (await caches.match(event.request)) || 
        (event.request.mode === 'navigate' ? await caches.match('./index.html') : 
        Response.error());
    }
  })());
});
```

---

### 3. **Memory Leaks nei Dialog**
**File:** `js/core.js`
**Problema:**
- Gli event listeners nei dialog non vengono rimossi
- Click multipli generano listener duplicati
- Potenziale memory leak soprattutto su dispositivi mobile

**Aree problematiche:**
```javascript
// ❌ Aggiunti ogni volta senza cleanup:
document.getElementById('saveShift').onclick = ...
document.getElementById('saveSettings').onclick = ...
document.getElementById('uploadPayslip').onclick = ...
```

**Soluzione:** Usare delegazione di eventi o rimuovere listener precedenti:
```javascript
function initializeDialogListeners() {
  const saveBtn = document.getElementById('saveShift');
  // Rimuovi listener precedenti
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  const newBtn = document.getElementById('saveShift');
  
  newBtn.addEventListener('click', () => {
    // handler
  }, { once: true });
}
```

---

### 4. **Storage Key Hardcoded Non Versionato**
**File:** `js/core.js` (riga 3)
**Problema:**
```javascript
const STORAGE_KEY = 'turni-app-stabile-v1';
```
- Blocca per sempre il formato v1
- Impossibile migrare a v2 senza perdere dati
- Se il formato cambia, tutto il codice deve ripetere la migration

**Soluzione:**
```javascript
const STORAGE_VERSION = 1;
const STORAGE_KEY = `turni-app-v${STORAGE_VERSION}`;

function migrateIfNeeded() {
  // Controlla chiavi vecchie e migra
  const old = localStorage.getItem('turni-app-stabile-v1');
  if (old && !localStorage.getItem(STORAGE_KEY)) {
    const data = JSON.parse(old);
    normalizeState(data); // applica tutte le migrazioni
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
```

---

## 🟡 Problemi Importanti

### 5. **Nessun Error Handling per PDF Parsing**
**File:** `js/payslip.js`
**Problema:**
- Se il PDF è corrotto o il parsing fallisce, l'utente non sa cosa è successo
- Nessun fallback se pdfjs non carica

**Soluzione:** Aggiungi try-catch migliore:
```javascript
async function parsePDF(file) {
  try {
    if (!window.pdfjsWorker) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    
    const pdf = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
    if (pdf.numPages === 0) {
      throw new Error('PDF vuoto');
    }
    // ... parsing ...
  } catch (err) {
    showError(`Errore parsing PDF: ${err.message}`);
    console.error('PDF parse error:', err);
  }
}

function showError(msg) {
  const status = document.getElementById('status');
  status.textContent = `⚠️ ${msg}`;
  status.style.color = '#ff6b6b';
  setTimeout(() => { status.style.color = ''; }, 3000);
}
```

---

### 6. **Dipendenze CDN Non Versionate**
**File:** `index.html` (righe 246-247)
**Problema:**
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
```
- Versioni hardcoded ma senza SRI (Subresource Integrity)
- CDN potrebbe non disponibile (no fallback)
- Vulnerabilità non monitorate

**Soluzione:**
```html
<!-- Con SRI e fallback locale -->
<script 
  src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
  integrity="sha512-..."
  onerror="loadLocalXLSX()"></script>
<script src="./lib/xlsx-fallback.js"></script>

<script>
  function loadLocalXLSX() {
    const script = document.createElement('script');
    script.src = './lib/xlsx.full.min.js';
    document.head.appendChild(script);
  }
</script>
```

---

### 7. **CSS Media Queries Incomplete**
**File:** `css/style.css`
**Problema:**
- Layout potrebbe avere breakpoint mancanti
- Non testato su tablet/grandi schermi
- No dark mode media query

**Soluzione:** Aggiungi:
```css
/* Tablet */
@media (min-width: 768px) {
  .grid { columns: 4; }
  .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop */
@media (min-width: 1024px) {
  #app { max-width: 900px; margin: 0 auto; }
  .stats-card { display: grid; grid-template-columns: 1fr 1fr; }
}

/* Dark mode media query */
@media (prefers-color-scheme: dark) {
  /* Già implementato con CSS vars? Controllare */
}

/* Notch support */
@supports (padding: max(0px)) {
  .top { padding-left: max(8px, env(safe-area-inset-left)); }
}
```

---

### 8. **Nessun Logging/Monitoring**
**File:** `js/core.js`, `js/app.js`
**Problema:**
- Solo console.error in rari casi
- Nessun modo per debuggare problemi in produzione
- Errori invisibili agli utenti

**Soluzione:** Crea un logger semplice:
```javascript
// js/logger.js
const Logger = (() => {
  const LOG_KEY = 'turni-app-logs';
  
  function log(level, msg, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      data
    };
    console[level.toLowerCase()](msg, data);
    
    // Salva ultimi 50 log in localStorage
    try {
      let logs = JSON.parse(localStorage.getItem(LOG_KEY)) || [];
      logs.push(entry);
      if (logs.length > 50) logs = logs.slice(-50);
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch (e) {}
  }
  
  return {
    error: (msg, data) => log('ERROR', msg, data),
    warn: (msg, data) => log('WARN', msg, data),
    info: (msg, data) => log('INFO', msg, data),
    getLogs: () => JSON.parse(localStorage.getItem(LOG_KEY)) || [],
    clearLogs: () => localStorage.removeItem(LOG_KEY)
  };
})();
```

---

## 🟢 Miglioramenti Minori

### 9. **Performance: Debounce per Save**
**File:** `js/core.js`
**Problema:**
- `saveState()` chiamato ad ogni cambio
- 100 turni = 100 localStorage writes

**Soluzione:**
```javascript
let saveTimeout;
function saveStateDebounced() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveState(), 1000);
}

// Sostituisci tutte le saveState() con saveStateDebounced()
```

---

### 10. **Missing Meta Tags**
**File:** `index.html`
**Problema:**
```html
<!-- Mancano -->
<meta name="description" content="...">
<meta property="og:title" content="TurniApp">
<meta property="og:image" content="./icon-192.png">
```

**Soluzione:** Aggiungi nella `<head>`:
```html
<meta name="description" content="App modulare per la gestione dei turni di lavoro, calcolo stipendi e analisi cedolini">
<meta name="theme-color" content="#0e1420" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a2332" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="TurniApp - Gestione Turni">
<meta property="og:description" content="Gestisci i tuoi turni di lavoro, stipendi e cedolini in un'app offline">
<meta property="og:image" content="./icon-192.png">
<meta property="og:type" content="website">
<link rel="canonical" href="https://github.com/Kumatetsu78/turni">
```

---

## 📝 Checklist Correzioni Consigliate

**Priority Alta:**
- [ ] Aggiornare manifest.webmanifest con tutte le proprietà
- [ ] Migliorare service worker con versioning
- [ ] Aggiungere error handling robusto
- [ ] Rimuovere memory leak nei dialog

**Priority Media:**
- [ ] Implementare logger
- [ ] Aggiungere debounce su saveState
- [ ] Versionare storage key
- [ ] Aggiungere SRI alle dipendenze CDN

**Priority Bassa:**
- [ ] Completare media queries CSS
- [ ] Aggiungere meta tags
- [ ] Testare responsive design
- [ ] Aggiungere dark mode

---

## 🚀 Prossimi Passi Suggeriti

1. **Creare branch di sviluppo:** `git checkout -b bugfix/improvements`
2. **Applicare correzioni critiche per primo**
3. **Testare offline e online**
4. **Fare test su device fisici (Android + iOS)**
5. **Deploy con nuova versione cache**
6. **Monitare errori in produzione**

---

## 📌 Note Aggiuntive

- **Versione:** Attualmente v3 (motore fiscale)
- **Browser support:** Moderne (ES6+)
- **Dipendenze:** XLSX, PDF.js (entrambe CDN)
- **Storage:** localStorage, no backend
- **PWA:** ✅ Supportata, offline-first

Il progetto è solido. Con questi miglioramenti sarà ancora più robusto e mantenibile.
