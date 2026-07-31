# Guida di Deployment e Testing - TurniApp

## 📋 Checklist Pre-Deployment

### 1. Testing Locale

```bash
# Installa un server HTTP locale (se non hai npm):
# Python 3:
python -m http.server 8000

# Python 2:
python -m SimpleHTTPServer 8000

# Node.js (http-server):
npm install -g http-server
http-server -p 8000
```

Visita: `http://localhost:8000`

### 2. Testing PWA in Locale

```bash
# Apri DevTools (F12) → Application → Service Workers
# Controlla che:
# ✓ Service worker sia registrato
# ✓ Manifest sia caricato
# ✓ Cache sia popolata
```

### 3. Audit Performance

```bash
# Chrome DevTools → Lighthouse
# Esegui audit per:
# - Performance
# - Accessibility
# - Best Practices
# - PWA
# - SEO

# Target minimo:
# Performance: > 90
# Accessibility: > 90
# Best Practices: > 90
# PWA: > 90
```

---

## 🚀 Deployment su GitHub Pages

### Metodo 1: Manuale
```bash
# 1. Assicurati di aver applicato i miglioramenti
# 2. Commit e push:
git add .
git commit -m "v3.1: Miglioramenti robustezza"
git push origin main

# GitHub Pages usa il main branch automaticamente
# L'app sarà disponibile su:
# https://Kumatetsu78.github.io/turni
```

### Metodo 2: GitHub Actions (Raccomandato)
Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Validate HTML
        run: |
          # Installa validatore HTML
          npm install -g html-validate
          html-validate index.html
      
      - name: Check manifest
        run: |
          # Valida manifest.webmanifest
          npm install -g web-app-manifest-validator
          web-app-manifest-validator manifest.webmanifest
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .
```

---

## 🧪 Testing Checklist

### Browser Desktop
- [ ] Chrome/Edge (ultimo)
- [ ] Firefox (ultimo)
- [ ] Safari (ultimo)

### Mobile
- [ ] iPhone (Safari)
- [ ] Android (Chrome)
- [ ] iPad (Safari)

### Funzionalità Core
- [ ] ✅ Aggiungere turno
- [ ] ✅ Modificare turno
- [ ] ✅ Eliminare turno
- [ ] ✅ Cambio mese
- [ ] ✅ Importare Excel
- [ ] ✅ Esportare backup JSON
- [ ] ✅ Importare backup JSON
- [ ] ✅ Uploadare cedolino PDF
- [ ] ✅ Calcolo statistiche
- [ ] ✅ Calcolo stipendio
- [ ] ✅ Grafico ultimi 6 mesi

### PWA/Offline
- [ ] ✅ Service Worker registrato
- [ ] ✅ App installabile
- [ ] ✅ Funziona offline dopo primo caricamento
- [ ] ✅ Dati persistono tra reload
- [ ] ✅ Icona app corretta

### Performance
- [ ] ✅ First Contentful Paint < 2s
- [ ] ✅ Time to Interactive < 3.5s
- [ ] ✅ Caricamento PDF < 5s
- [ ] ✅ 100+ giorni non rallentano
- [ ] ✅ Caricamento Excel < 3s

### Accessibility
- [ ] ✅ Navigazione da tastiera
- [ ] ✅ Screen reader friendly
- [ ] ✅ Contrasto colori OK (WCAG AA)
- [ ] ✅ Nessun errore di accessibility in DevTools

---

## 🐛 Debugging Guide

### Console Logging

```javascript
// Abilitare logging dettagliato
Logger.getLogs()          // Vedi tutti i log
Logger.printTable()       // Tabella nei console
Logger.downloadLogs('json') // Scarica log
Logger.downloadLogs('csv')  // Scarica in Excel
Logger.filterByLevel('ERROR') // Solo errori
Logger.filterByTime(10) // Ultimi 10 minuti
```

### Service Worker Debugging

```javascript
// In console del browser:

// Vedi cache storage
caches.keys().then(k => console.log(k))

// Vedi cache contents
caches.open('turni-app-v3.1').then(c => 
  c.keys().then(reqs => reqs.forEach(r => console.log(r.url)))
)

// Pulisci cache
caches.keys().then(keys => 
  Promise.all(keys.map(k => caches.delete(k)))
)

// Manda messaggio a SW per pulire
navigator.serviceWorker.controller?.postMessage({
  action: 'CLEAR_CACHE'
})
```

### Storage Debugging

```javascript
// Vedi dati salvati
console.log(JSON.parse(localStorage.getItem('turni-app-v1')))

// Calcola dimensione
const size = JSON.stringify(localStorage).length;
console.log(`Storage used: ${(size/1024).toFixed(2)} KB`)

// Pulisci
localStorage.clear()
```

### Performance Profiling

```javascript
// Chrome DevTools → Performance tab
// 1. Click record
// 2. Fai azioni (add shift, render calendar)
// 3. Click stop
// Analizza flame chart per bottleneck

// Alternative: Navigation timing
console.log(performance.getEntriesByType('navigation')[0])
```

---

## 📊 Monitoraggio in Produzione

### Raccogliere Feedback da Utenti

Aggiungi feedback form semplice in `index.html`:

```html
<button id="feedbackBtn" class="fab" style="bottom:70px;">💬</button>

<dialog id="feedbackDialog">
  <h3>Feedback</h3>
  <textarea id="feedbackText" placeholder="Segnala bug o suggerimenti..."></textarea>
  <div class="dialog-actions">
    <button class="btn" id="sendFeedback">Invia</button>
    <button class="btn alt" id="closeFeedback">Chiudi</button>
  </div>
</dialog>
```

```javascript
// Mantenere log e generare report periodici
document.getElementById('feedbackBtn').addEventListener('click', () => {
  document.getElementById('feedbackDialog').showModal();
});

document.getElementById('sendFeedback').addEventListener('click', () => {
  const feedback = document.getElementById('feedbackText').value;
  const logs = Logger.getLogs().slice(-20); // Ultimi 20 log
  
  Logger.info('User feedback submitted', {
    feedback,
    logs,
    browser: navigator.userAgent,
    timestamp: new Date().toISOString()
  });
  
  // Opzionale: Invia a server
  // fetch('/api/feedback', { 
  //   method: 'POST',
  //   body: JSON.stringify({ feedback, logs })
  // })
  
  alert('Grazie per il feedback!');
  document.getElementById('feedbackDialog').close();
});
```

---

## 🔄 Aggiornamento App

### Versionamento

```javascript
// In core.js, incrementa:
const APP_VERSION = '3.1'; // Cambia qua per major.minor

// In sw.js, incrementa anche:
const VERSION = '3.1';

// In package.json (se usato):
"version": "3.1.0"
```

### Notificare gli Utenti di Aggiornamenti

```javascript
// In app.js, dopo il load del SW:
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(registration => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Nuovo SW è pronto, l'app è stata aggiornata
          const status = document.getElementById('status');
          status.textContent = '✓ Aggiornamento disponibile - Ricarica la pagina';
          status.style.color = '#51cf66';
          
          Logger.info('App update available');
        }
      });
    });
  });
}
```

---

## 🚨 Troubleshooting Comune

### "Service Worker non registrato"
```javascript
// In console:
navigator.serviceWorker.getRegistrations()
  .then(regs => console.log(regs))

// Se vuoto:
1. Controlla che sw.js esista
2. Controlla browser console per errori
3. Chrome: Settings → Advanced → Site settings → Service workers → Reset turni site
```

### "PDF.js non carica"
```javascript
// Controlla:
1. CDN accessibile: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
2. CORS headers corretti
3. PDF worker caricato:
   pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://..../pdf.worker.min.js'
```

### "localStorage full"
```javascript
// Limpa log vecchi:
Logger.clearLogs()

// Oppure esporta e cancella:
const backup = Logger.exportJSON()
// Salva backup da qualche parte
Logger.clearLogs()
```

### "App lenta dopo 100+ turni"
```javascript
// Profila:
performance.mark('start')
render() // function da profilare
performance.mark('end')
performance.measure('render', 'start', 'end')
console.log(performance.getEntriesByName('render')[0])

// Possibili soluzioni:
1. Virtualizzazione lista (mostra solo visibili)
2. Debounce render (attende 300ms)
3. Web Workers per parsing PDF
```

---

## 📱 Testing su Device Reale

### iPhone
1. Connetti iPhone a Mac
2. Apri Safari → Develop → iPhone device
3. Visita l'URL (con ngrok se locale)
4. Installa da menu Share → Add to Home Screen

### Android
1. Abilita USB Debugging
2. Connetti via USB
3. Chrome → chrome://inspect
4. Visita l'URL
5. Menu hamburger → Install app

---

## 📈 Analytics Semplice

Aggiungi tracking senza librerie esterne:

```javascript
const Analytics = (() => {
  const events = [];
  
  function track(action, label, value) {
    events.push({
      action,
      label,
      value,
      timestamp: new Date().toISOString()
    });
    
    Logger.debug('Analytics event', { action, label, value });
  }
  
  function report() {
    const summary = {
      totalEvents: events.length,
      eventsByAction: {},
      duration: (() => {
        const first = events[0]?.timestamp;
        const last = events[events.length - 1]?.timestamp;
        return first && last ? 
          (new Date(last) - new Date(first)) / 1000 + ' seconds' : 
          'N/A';
      })()
    };
    
    events.forEach(e => {
      summary.eventsByAction[e.action] = 
        (summary.eventsByAction[e.action] || 0) + 1;
    });
    
    return summary;
  }
  
  return { track, report };
})();

// USO:
// Analytics.track('shift', 'added', 1)
// Analytics.track('pdf', 'uploaded', 245000)
// console.log(Analytics.report())
```

---

## 🎯 KPI da Monitorare

1. **Performance**
   - First Contentful Paint (< 2s)
   - Time to Interactive (< 3.5s)
   - Cumulative Layout Shift (< 0.1)

2. **Usability**
   - Errori JavaScript per sessione
   - Turni aggiunti per utente
   - Sessioni offline vs online

3. **Technical**
   - Cache hit rate (> 80%)
   - PDF parsing success rate (> 95%)
   - Storage used per utente (< 2MB)

---

## 📝 Release Notes Template

```markdown
## v3.2 - [Data]

### 🆕 Features
- Aggiunti shortcut all'home screen
- Logon migliorato per debug

### 🐛 Bugfix
- Risolto memory leak nei dialog
- Service worker cache versioning

### ⚡ Performance
- Debounce save state riduce localStorage writes
- Asset loading ottimizzato

### 📚 Docs
- Aggiunta guida deployment
- Logger documentation

### 📦 Dependencies
- XLSX 0.18.5 (con SRI)
- PDF.js 3.11.174 (con fallback)

**Install:** Ricarica e aggiungi all'home screen
**Upgrade:** Automatico via service worker
```

---

## ✅ Final Checklist

- [ ] Tutti i test passati
- [ ] Logs puliti (nessun console.error)
- [ ] Performance Lighthouse > 90
- [ ] PWA installabile
- [ ] Offline funzionante
- [ ] Manifest valido
- [ ] Service worker non ha errori
- [ ] CDN dependencies con SRI
- [ ] README aggiornato
- [ ] Release notes scritte
- [ ] Commit e tag creati
- [ ] GitHub Pages aggiornato

Buon deployment! 🚀
