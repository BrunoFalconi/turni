(window.__MODULE_VERSIONS =
  window.__MODULE_VERSIONS || {})['excel'] = '3.7';

/*
 * Importazione della turnistica Excel.
 *
 * Funzioni principali:
 * - ricostruisce gli anni dai nomi dei fogli;
 * - gestisce fogli che iniziano nel mese precedente;
 * - non si blocca se i giorni della settimana sono errati;
 * - riconosce turni standard e codici speciali;
 * - importa i turni personali;
 * - conserva i turni di tutti per il PDF semplificato.
 */

const MONTH_NUM = {
  gennaio: 0,
  febbraio: 1,
  marzo: 2,
  aprile: 3,
  maggio: 4,
  giugno: 5,
  luglio: 6,
  agosto: 7,
  settembre: 8,
  ottobre: 9,
  novembre: 10,
  dicembre: 11
};

/**
 * Restituisce una versione normalizzata del codice turno.
 */
function normalizeShiftCode(value) {
  return norm(value)
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converte il codice Excel in una descrizione completa.
 *
 * allTypes indica in quali colonne deve apparire il collega
 * nel PDF semplificato di tutti.
 */
function parseShiftCode(value) {
  const original = normalizeShiftCode(value);

  if (!original) {
    return null;
  }

  /*
   * Turno speciale 08:00-20:00.
   * È un turno lavorato di 12 ore.
   */
  if (
    /^m\s*0?8\s*[-/]\s*20\b/.test(original) ||
    /^0?8\s*[-/]\s*20\b/.test(original)
  ) {
    return {
      type: 'mattina',
      start: '08:00',
      end: '20:00',
      break: 0,
      allTypes: ['mattina', 'pomeriggio'],
      label: 'Mattina 08:00-20:00'
    };
  }

  /*
   * Elimina annotazioni come:
   * M(A), P (A), N(A).
   */
  const code = original
    .replace(/\s*\([^)]*\)\s*/g, '')
    .trim();

  if (
    code.startsWith('deas') ||
    code === 'd' ||
    code === 'sw'
  ) {
    return {
      type: 'deas',
      allTypes: []
    };
  }

  if (
    code.startsWith('mal')
  ) {
    return {
      type: 'malattia',
      allTypes: []
   
