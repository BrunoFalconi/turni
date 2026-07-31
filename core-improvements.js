/**
 * SNIPPET DI MIGLIORAMENTI PER core.js
 * 
 * Questo file mostra come implementare:
 * 1. Debounce per saveState()
 * 2. Cleanup per dialog listeners
 * 3. Error handling robusto
 * 4. Versionamento storage
 * 
 * ISTRUZIONI: Copia/adatta in core.js
 */

// ============================================
// 1. DEBOUNCE SAVE STATE
// ============================================

// Aggiungi dopo la definizione di saveState()
let saveTimeout;
const SAVE_DELAY = 1000; // 1 secondo

function saveStateDebounced() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    Logger.debug('Saving state to localStorage');
    saveState();
  }, SAVE_DELAY);
}

// Cancella il timeout quando chiudi la pagina
window.addEventListener('pagehide', () => {
  clearTimeout(saveTimeout);
  saveState(); // Salva subito prima di chiudere
  Logger.info('Page unloading - state saved');
});

// ============================================
// 2. VERSIONAMENTO STORAGE CON MIGRAZIONE
// ============================================

// Sostituisci la riga:
// const STORAGE_KEY = 'turni-app-stabile-v1';
// con:

const STORAGE_VERSION = 1;
const STORAGE_KEY = `turni-app-v${STORAGE_VERSION}`;

// Aggiungi questa funzione PRIMA di loadState()
function migrateStorageIfNeeded() {
  // Check vecchia chiave v1
  const oldKey = 'turni-app-stabile-v1';
  const oldData = localStorage.getItem(oldKey);
  
  if (oldData && !localStorage.getItem(STORAGE_KEY)) {
    try {
      const parsed = JSON.parse(oldData);
      const normalized = normalizeState(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      Logger.info('Storage migrated from v1 to current version', {
        shifts: Object.keys(normalized.shifts).length
      });
    } catch (err) {
      Logger.error('Storage migration failed', { error: err.message });
    }
  }
}

// Chiama prima di loadState():
// migrateStorageIfNeeded();
// state = loadState();

// ============================================
// 3. DIALOG LISTENERS CLEANUP
// ============================================

/**
 * Attach event listener con auto-cleanup quando il dialog si chiude
 */
function attachDialogListener(buttonId, callback) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  
  // Rimuovi listener precedenti creando una copia senza handler
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  // Attach nuovo listener
  document.getElementById(buttonId).addEventListener('click', callback, { once: true });
}

/**
 * Semplice dialog manager
 */
class DialogManager {
  constructor(dialogId) {
    this.dialog = document.getElementById(dialogId);
    this.listeners = [];
  }
  
  on(selector, event, callback) {
    const el = this.dialog.querySelector(selector);
    if (!el) return;
    
    el.addEventListener(event, callback);
    this.listeners.push({ el, event, callback });
    return this;
  }
  
  open() {
    if (this.dialog.show) this.dialog.show();
    else if (this.dialog.showModal) this.dialog.showModal();
  }
  
  close() {
    this.dialog.close();
  }
  
  cleanup() {
    this.listeners.forEach(({ el, event, callback }) => {
      el.removeEventListener(event, callback);
    });
    this.listeners = [];
  }
  
  onClose(callback) {
    this.dialog.addEventListener('close', () => {
      this.cleanup();
      callback();
    }, { once: true });
  }
}

// USO ESEMPIO per Shift Dialog:
/*
const shiftDialog = new DialogManager('shiftDialog');

shiftDialog
  .on('#saveShift', 'click', () => {
    // save logic
    Logger.info('Shift saved');
    shiftDialog.close();
  })
  .on('#deleteShift', 'click', () => {
    // delete logic
    shiftDialog.close();
  })
  .on('#closeShift', 'click', () => {
    shiftDialog.close();
  });

shiftDialog.onClose(() => {
  Logger.debug('Shift dialog closed, cleanup done');
});

shiftDialog.open();
*/

// ============================================
// 4. ERROR HANDLING ROBUSTO PER PDF PARSING
// ============================================

/**
 * Wrapper robusto per PDF parsing
 */
async function safeParsePDF(file) {
  const statusEl = document.getElementById('status');
  const originalText = statusEl.textContent;
  
  try {
    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File PDF troppo grande (max 10MB)');
    }
    
    // Check MIME type
    if (!file.type.includes('pdf')) {
      throw new Error('File non è un PDF valido');
    }
    
    // Load PDF.js se non disponibile
    if (!window.pdfjsLib) {
      statusEl.textContent = '⏳ Caricamento lettore PDF...';
      window.pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    }
    
    // Parse
    statusEl.textContent = '⏳ Elaborazione PDF...';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    
    if (pdf.numPages === 0) {
      throw new Error('PDF vuoto');
    }
    
    statusEl.textContent = `✓ PDF caricato (${pdf.numPages} pagine)`;
    Logger.info('PDF parsed successfully', { pages: pdf.numPages, size: file.size });
    return pdf;
    
  } catch (err) {
    statusEl.textContent = `⚠️ Errore: ${err.message}`;
    statusEl.style.color = '#ff6b6b';
    
    Logger.error('PDF parsing error', {
      fileName: file.name,
      fileSize: file.size,
      error: err.message
    });
    
    // Reset color dopo 3 secondi
    setTimeout(() => {
      statusEl.style.color = '';
      statusEl.textContent = originalText;
    }, 3000);
    
    throw err;
  }
}

// ============================================
// 5. HELPER PER ERROR TOAST/NOTIFICATION
// ============================================

class StatusNotification {
  constructor(elementId = 'status', duration = 3000) {
    this.el = document.getElementById(elementId);
    this.duration = duration;
    this.timeout = null;
  }
  
  show(message, type = 'info') {
    clearTimeout(this.timeout);
    
    const colors = {
      'success': '#51cf66',
      'error': '#ff6b6b',
      'warning': '#ffd43b',
      'info': '#4dabf7'
    };
    
    this.el.textContent = message;
    this.el.style.color = colors[type] || colors['info'];
    
    if (type !== 'error') {
      this.timeout = setTimeout(() => {
        this.el.style.color = '';
      }, this.duration);
    }
    
    Logger.info(`Notification: ${message}`, { type });
  }
  
  success(msg) { this.show(msg, 'success'); }
  error(msg) { this.show(msg, 'error'); }
  warning(msg) { this.show(msg, 'warning'); }
  info(msg) { this.show(msg, 'info'); }
}

// USO:
// const notif = new StatusNotification('status');
// notif.success('Turno salvato');
// notif.error('Errore nel salvataggio');

// ============================================
// 6. PERFORMANCE MONITORING
// ============================================

class PerformanceMonitor {
  constructor() {
    this.marks = {};
  }
  
  start(label) {
    this.marks[label] = performance.now();
  }
  
  end(label) {
    if (!this.marks[label]) {
      console.warn(`Performance mark "${label}" not found`);
      return;
    }
    
    const duration = performance.now() - this.marks[label];
    Logger.debug(`${label} took ${duration.toFixed(2)}ms`);
    delete this.marks[label];
    return duration;
  }
}

// USO:
// const perf = new PerformanceMonitor();
// perf.start('render-calendar');
// // ... render code ...
// perf.end('render-calendar'); // → "render-calendar took 125.34ms"

// ============================================
// 7. STATE CHANGE LISTENER PATTERN
// ============================================

/**
 * Semplice event emitter per cambamenti di state
 */
const StateEmitter = (() => {
  const listeners = {};
  
  return {
    on(event, callback) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    },
    
    off(event, callback) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    },
    
    emit(event, data) {
      if (!listeners[event]) return;
      listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          Logger.error(`Event listener error for "${event}"`, { error: err.message });
        }
      });
    }
  };
})();

// USO:
// StateEmitter.on('shift:added', (shift) => {
//   Logger.info('Shift added', shift);
//   notif.success('Turno aggiunto');
// });
// 
// StateEmitter.on('state:error', (err) => {
//   Logger.error('State error', err);
//   notif.error(err.message);
// });

// ============================================
// INTEGRATION NOTES
// ============================================

/*
PER USARE QUESTI MIGLIORAMENTI IN core.js:

1. Aggiungi il logger PRIMA di core.js in index.html:
   <script src="./js/logger.js"></script>

2. Sostituisci saveState() con saveStateDebounced() in tutti i punti:
   - document.getElementById('addBtn').addEventListener('click', ...)
   - document.getElementById('saveShift').onclick = () => saveStateDebounced()
   - etc.

3. Per i dialog, usa DialogManager:
   const shiftDialog = new DialogManager('shiftDialog');
   shiftDialog.on('#saveShift', 'click', callback);
   shiftDialog.open();

4. Per mostrare errori agli utenti:
   const notif = new StatusNotification('status');
   notif.error('Qualcosa è andato storto');

5. Per monitoring:
   const perf = new PerformanceMonitor();
   perf.start('render');
   // ... render code ...
   perf.end('render');

6. Per logare cambiamenti di stato:
   StateEmitter.emit('shift:added', shift);
   StateEmitter.on('shift:added', (shift) => { ... });
*/
