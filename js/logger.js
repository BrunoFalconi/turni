(window.__MODULE_VERSIONS=window.__MODULE_VERSIONS||{})['logger']='3.5';
/**
 * Logger Module - TurniApp
 * 
 * Uso:
 *   Logger.info('Turno salvato', { shift: data })
 *   Logger.error('Errore parsing', { error: err })
 *   const logs = Logger.getLogs()
 *   Logger.clearLogs()
 */

const Logger = (() => {
  const LOG_KEY = 'turni-app-logs';
  const MAX_LOGS = 50;
  const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  
  /**
   * Salva un log
   */
  function _save(level, msg, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      ...(data ? { data } : {})
    };
    
    // Console output
    const consoleMethod = level.toLowerCase();
    if (console[consoleMethod]) {
      console[consoleMethod](`[${level}] ${msg}`, data || '');
    } else {
      console.log(`[${level}] ${msg}`, data || '');
    }
    
    // Storage
    try {
      let logs = JSON.parse(localStorage.getItem(LOG_KEY)) || [];
      logs.push(entry);
      
      // Mantieni solo gli ultimi MAX_LOGS
      if (logs.length > MAX_LOGS) {
        logs = logs.slice(-MAX_LOGS);
      }
      
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error('Logger storage error:', e);
    }
  }
  
  /**
   * Cattura gli errori globali non gestiti
   */
  function _setupGlobalErrorHandler() {
    window.addEventListener('error', event => {
      Logger.error('Uncaught error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });
    
    window.addEventListener('unhandledrejection', event => {
      Logger.error('Unhandled rejection', {
        reason: String(event.reason)
      });
    });
  }
  
  /**
   * Esporta log come JSON
   */
  function _exportJSON() {
    const logs = JSON.parse(localStorage.getItem(LOG_KEY)) || [];
    return JSON.stringify(logs, null, 2);
  }
  
  /**
   * Esporta log come CSV per Excel
   */
  function _exportCSV() {
    const logs = JSON.parse(localStorage.getItem(LOG_KEY)) || [];
    const headers = ['Timestamp', 'Level', 'Message', 'Data'];
    const rows = logs.map(log => [
      log.timestamp,
      log.level,
      log.msg,
      JSON.stringify(log.data || '')
    ]);
    
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    return csv;
  }
  
  /**
   * Scarica log file
   */
  function _downloadLogs(format = 'json') {
    const content = format === 'json' ? _exportJSON() : _exportCSV();
    const ext = format === 'json' ? 'json' : 'csv';
    const filename = `turni-app-logs-${new Date().toISOString().split('T')[0]}.${ext}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // Inizializza il gestore errori globali
  _setupGlobalErrorHandler();
  
  return {
    /**
     * Log informativo
     */
    info: (msg, data) => _save('INFO', msg, data),
    
    /**
     * Log di warning
     */
    warn: (msg, data) => _save('WARN', msg, data),
    
    /**
     * Log di errore
     */
    error: (msg, data) => _save('ERROR', msg, data),
    
    /**
     * Log di debug (solo in dev)
     */
    debug: (msg, data) => {
      if (IS_DEV) _save('DEBUG', msg, data);
    },
    
    /**
     * Ottieni tutti i log
     */
    getLogs: () => {
      try {
        return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
      } catch (e) {
        console.error('Error reading logs:', e);
        return [];
      }
    },
    
    /**
     * Cancella tutti i log
     */
    clearLogs: () => {
      try {
        localStorage.removeItem(LOG_KEY);
        Logger.info('Logs cleared');
      } catch (e) {
        console.error('Error clearing logs:', e);
      }
    },
    
    /**
     * Esporta log come JSON
     */
    exportJSON: _exportJSON,
    
    /**
     * Esporta log come CSV
     */
    exportCSV: _exportCSV,
    
    /**
     * Scarica log file
     */
    downloadLogs: _downloadLogs,
    
    /**
     * Stampa log nel formato tabella
     */
    printTable: () => {
      const logs = Logger.getLogs();
      console.table(logs);
    },
    
    /**
     * Filtra log per livello
     */
    filterByLevel: (level) => {
      return Logger.getLogs().filter(log => log.level === level.toUpperCase());
    },
    
    /**
     * Filtra log per intervallo temporale
     */
    filterByTime: (minAgoMinutes, maxAgoMinutes = 0) => {
      const now = new Date();
      const minTime = new Date(now - minAgoMinutes * 60000);
      const maxTime = new Date(now - maxAgoMinutes * 60000);
      
      return Logger.getLogs().filter(log => {
        const time = new Date(log.timestamp);
        return time >= minTime && time <= maxTime;
      });
    }
  };
})();

// Esponi globalmente per debug nella console
window.Logger = Logger;
