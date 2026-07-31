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
    };
  }

  if (
    code.startsWith('fer') ||
    code.startsWith('perm') ||
    code.startsWith('par') ||
    code.startsWith('lutto') ||
    code === 'f'
  ) {
    return {
      type: 'ferie',
      allTypes: []
    };
  }

  if (
    code.startsWith('rip') ||
    code.startsWith('lib') ||
    code === 'r' ||
    code === 'rc' ||
    code === '-'
  ) {
    return {
      type: 'riposo',
      allTypes: []
    };
  }

  if (
    code.startsWith('mat') ||
    code === 'm'
  ) {
    return {
      type: 'mattina',
      allTypes: ['mattina']
    };
  }

  if (
    code.startsWith('pom') ||
    code === 'p'
  ) {
    return {
      type: 'pomeriggio',
      allTypes: ['pomeriggio']
    };
  }

  if (
    code.startsWith('not') ||
    code === 'n'
  ) {
    return {
      type: 'notte',
      allTypes: ['notte']
    };
  }

  console.warn(
    'Codice turno Excel non riconosciuto:',
    value
  );

  return null;
}

/**
 * Compatibilità con eventuali vecchie chiamate a toType().
 */
function toType(value) {
  return parseShiftCode(value)?.type || null;
}

/**
 * Ricostruisce mese e anno di ogni foglio.
 *
 * Esempio:
 * Giugno ... Luglio ... Agosto (2026)
 * viene ricostruito come:
 * Giugno 2025 ... Luglio 2025 ... Agosto 2026.
 */
function parsePeriods(sheetNames) {
  const parsed = sheetNames.map(name => {
    const normalized = norm(name);

    const monthName = Object
      .keys(MONTH_NUM)
      .find(month => normalized.includes(month));

    const yearMatch = String(name)
      .match(/(?:19|20)\d{2}/);

    if (!monthName) {
      return null;
    }

    return {
      month: MONTH_NUM[monthName],
      year: yearMatch
        ? Number(yearMatch[0])
        : null
    };
  });

  const anchors = parsed
    .map((period, index) => {
      if (!period || period.year == null) {
        return null;
      }

      return {
        ...period,
        index
      };
    })
    .filter(Boolean);

  return parsed.map((period, index) => {
    if (!period) {
      return null;
    }

    if (period.year != null) {
      return period;
    }

    if (!anchors.length) {
      return {
        month: period.month,
        year: new Date().getFullYear()
      };
    }

    /*
     * Usa il foglio con anno esplicito più vicino.
     */
    const anchor = anchors
      .slice()
      .sort((a, b) => {
        return (
          Math.abs(a.index - index) -
          Math.abs(b.index - index)
        );
      })[0];

    const monthDifference = index - anchor.index;

    const absoluteMonth =
      anchor.year * 12 +
      anchor.month +
      monthDifference;

    return {
      year: Math.floor(absoluteMonth / 12),
      month:
        ((absoluteMonth % 12) + 12) % 12
    };
  });
}

/**
 * Riconosce:
 * - riga dei numeri dei giorni;
 * - riga dei giorni della settimana;
 * - colonna con i nomi.
 */
function findSheetLayout(rows) {
  const searchLimit = Math.min(
    rows.length - 1,
    30
  );

  /*
   * Prima cerca esplicitamente NOME/TURNO.
   */
  for (let rowIndex = 0; rowIndex < searchLimit; rowIndex++) {
    const row = rows[rowIndex] || [];

    for (
      let columnIndex = 0;
      columnIndex < row.length;
      columnIndex++
    ) {
      const cell = norm(row[columnIndex]);

      if (cell.includes('nome/turno')) {
        return {
          dayRow: rowIndex - 1,
          weekdayRow: rowIndex,
          nameColumn: columnIndex
        };
      }
    }
  }

  /*
   * Nei fogli vecchi la cella NOME/TURNO è vuota.
   * Cerca quindi una riga con almeno sette numeri validi.
   */
  for (
    let rowIndex = 0;
    rowIndex < searchLimit;
    rowIndex++
  ) {
    const row = rows[rowIndex] || [];
    const nextRow = rows[rowIndex + 1] || [];

    const validDays = row.filter(value => {
      return validDay(value) != null;
    }).length;

    const weekdayCount = nextRow.filter(value => {
      const code = String(value || '')
        .trim()
        .toUpperCase();

      return WEEKDAY_CODE.includes(code);
    }).length;

    if (
      validDays >= 7 &&
      weekdayCount >= 5
    ) {
      return {
        dayRow: rowIndex,
        weekdayRow: rowIndex + 1,
        nameColumn: 0
      };
    }
  }

  return null;
}

function nameMatches(cell, wanted) {
  const normalizeName = value => {
    return norm(value)
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const actual = normalizeName(cell);
  const requested = normalizeName(wanted);

  if (!actual || !requested) {
    return false;
  }

  const actualWords = actual
    .split(' ')
    .filter(Boolean);

  const requestedWords = requested
    .split(' ')
    .filter(Boolean);

  return (
    actual === requested ||
    actual.includes(requested) ||
    requested.includes(actual) ||
    requestedWords.every(word =>
      actualWords.includes(word)
    )
  );
}

function validDay(value) {
  const number = Number(
    String(value ?? '').trim()
  );

  return (
    Number.isInteger(number) &&
    number >= 1 &&
    number <= 31
  )
    ? number
    : null;
}

/**
 * Crea tutte le date delle colonne del foglio.
 *
 * Il primo giorno "1" viene considerato il primo giorno
 * del mese indicato dal nome del foglio.
 *
 * Le altre colonne vengono ricostruite in sequenza.
 * Questo rende l'importazione resistente a:
 * - giorni della settimana copiati male;
 * - 31 inserito per errore in novembre;
 * - fogli che partono dal mese precedente.
 */
function buildColumnDateMap(rows, layout, period) {
  const result = new Map();

  if (
    !layout ||
    !period ||
    layout.dayRow < 0
  ) {
    return result;
  }

  const dayRow = rows[layout.dayRow] || [];

  const dateColumns = [];

  for (
    let column = layout.nameColumn + 1;
    column < dayRow.length;
    column++
  ) {
    const day = validDay(dayRow[column]);

    if (day != null) {
      dateColumns.push({
        column,
        day
      });
    }
  }

  if (!dateColumns.length) {
    return result;
  }

  /*
   * Cerca il primo giorno 1.
   * Nel file rappresenta l'inizio del mese del foglio.
   */
  let anchorIndex = dateColumns.findIndex(
    item => item.day === 1
  );

  /*
   * Caso anomalo: nessun 1 presente.
   * Usa la prima colonna come riferimento.
   */
  if (anchorIndex < 0) {
    anchorIndex = 0;
  }

  const anchorEntry = dateColumns[anchorIndex];

  let anchorDate;

  if (anchorEntry.day === 1) {
    anchorDate = new Date(
      period.year,
      period.month,
      1
    );
  } else {
    anchorDate = new Date(
      period.year,
      period.month,
      anchorEntry.day
    );
  }

  dateColumns.forEach((entry, index) => {
    const date = new Date(anchorDate);

    date.setDate(
      anchorDate.getDate() +
      (index - anchorIndex)
    );

    result.set(entry.column, date);
  });

  return result;
}

/**
 * Crea il turno da salvare in state.shifts.
 */
function makeShiftFromDescriptor(descriptor) {
  if (!descriptor) {
    return null;
  }

  const typeDefinition =
    TYPES[descriptor.type];

  if (!typeDefinition) {
    console.warn(
      'Tipo turno non presente in TYPES:',
      descriptor.type
    );

    return null;
  }

  if (!typeDefinition.work) {
    return {
      type: descriptor.type,
      start: '',
      end: '',
      break: 0,
      note: 'Importato da Excel'
    };
  }

  return {
    type: descriptor.type,

    start:
      descriptor.start ||
      typeDefinition.start,

    end:
      descriptor.end ||
      typeDefinition.end,

    break:
      descriptor.break ??
      typeDefinition.brk ??
      0,

    note: 'Importato da Excel'
  };
}

/**
 * Importa i turni della persona selezionata.
 */
function parsePersonalShifts(
  rows,
  period,
  wantedName
) {
  const layout = findSheetLayout(rows);

  if (
    !layout ||
    !period
  ) {
    return [];
  }

  let personRow = -1;

  for (
    let rowIndex = layout.weekdayRow + 1;
    rowIndex < rows.length;
    rowIndex++
  ) {
    if (
      nameMatches(
        rows[rowIndex]?.[layout.nameColumn],
        wantedName
      )
    ) {
      personRow = rowIndex;
      break;
    }
  }

  if (personRow < 0) {
    return [];
  }

  const dateMap = buildColumnDateMap(
    rows,
    layout,
    period
  );

  const row = rows[personRow] || [];
  const output = [];

  for (
    const [column, date]
    of dateMap.entries()
  ) {
    const descriptor =
      parseShiftCode(row[column]);

    if (!descriptor) {
      continue;
    }

    const shift =
      makeShiftFromDescriptor(descriptor);

    if (!shift) {
      continue;
    }

    output.push({
      key: ymd(date),
      shift
    });
  }

  return output;
}

/**
 * Identifica le righe che non rappresentano colleghi.
 */
function isSummaryRowName(name) {
  const normalized = norm(name)
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return true;
  }

  const exactSummaryNames = new Set([
    'm',
    'p',
    'n',
    'r',
    'd',
    'deas',
    'ferie',
    'riposo',
    'riposi',
    'totale',
    'totali',
    'nome/turno',
    'giorno'
  ]);

  return (
    exactSummaryNames.has(normalized) ||
    normalized.startsWith('totale ') ||
    normalized.includes('numero riposi')
  );
}

/**
 * Legge tutti i colleghi per creare il PDF semplificato.
 */
function parseAllShifts(rows, period) {
  const layout = findSheetLayout(rows);

  if (
    !layout ||
    !period
  ) {
    return {};
  }

  const dateMap = buildColumnDateMap(
    rows,
    layout,
    period
  );

  const result = {};

  for (
    let rowIndex = layout.weekdayRow + 1;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const rawName =
      rows[rowIndex]?.[layout.nameColumn];

    const name = String(rawName || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      !name ||
      isSummaryRowName(name)
    ) {
      continue;
    }

    const row = rows[rowIndex] || [];

    for (
      const [column, date]
      of dateMap.entries()
    ) {
      const descriptor =
        parseShiftCode(row[column]);

      if (
        !descriptor ||
        !descriptor.allTypes?.length
      ) {
        continue;
      }

      const key = ymd(date);

      if (!result[key]) {
        result[key] = {
          notte: [],
          mattina: [],
          pomeriggio: []
        };
      }

      descriptor.allTypes.forEach(type => {
        if (!result[key][type]) {
          return;
        }

        if (
          !result[key][type].includes(name)
        ) {
          result[key][type].push(name);
        }
      });
    }
  }

  return result;
}

/**
 * Unisce la turnistica completa.
 *
 * I fogli successivi hanno priorità sulle date sovrapposte,
 * perché normalmente contengono la versione più recente.
 */
function mergeAllShifts(target, source) {
  Object.entries(source).forEach(
    ([dateKey, dayData]) => {
      target[dateKey] = {
        notte: [
          ...(dayData.notte || [])
        ],

        mattina: [
          ...(dayData.mattina || [])
        ],

        pomeriggio: [
          ...(dayData.pomeriggio || [])
        ]
      };
    }
  );
}

function shiftPreviewLabel(shift) {
  const definition = TYPES[shift.type];

  const label =
    definition?.label ||
    shift.type;

  if (
    definition?.work &&
    shift.start &&
    shift.end
  ) {
    return (
      `${label} ` +
      `${shift.start}-${shift.end}`
    );
  }

  return label;
}

let pendingAllShifts = {};

document
  .getElementById('importBtn')
  .onclick = () => {
    if (!state.settings.excelName) {
      document
        .getElementById('settings')
        .click();

      return;
    }

    document
      .getElementById('fileInput')
      .click();
  };

document
  .getElementById('fileInput')
  .addEventListener(
    'change',
    async event => {
      const file =
        event.target.files[0];

      event.target.value = '';

      if (!file) {
        return;
      }

      if (typeof XLSX === 'undefined') {
        alert(
          'La libreria Excel non è disponibile. ' +
          'Apri una volta l’app con internet.'
        );

        return;
      }

      try {
        const workbook = XLSX.read(
          new Uint8Array(
            await file.arrayBuffer()
          ),
          {
            type: 'array',
            cellDates: true
          }
        );

        const periods = parsePeriods(
          workbook.SheetNames
        );

        const personalMap = new Map();
        const allShifts = {};

        const diagnostics = {
          parsedSheets: 0,
          ignoredSheets: 0,
          unknownCodes: new Set()
        };

        workbook.SheetNames.forEach(
          (sheetName, sheetIndex) => {
            const period =
              periods[sheetIndex];

            if (!period) {
              diagnostics.ignoredSheets++;
              return;
            }

            const rows =
              XLSX.utils.sheet_to_json(
                workbook.Sheets[sheetName],
                {
                  header: 1,
                  defval: '',
                  blankrows: false,
                  raw: true
                }
              );

            const personalShifts =
              parsePersonalShifts(
                rows,
                period,
                state.settings.excelName
              );

            /*
             * Le date presenti nei fogli successivi
             * sostituiscono quelle dei fogli precedenti.
             */
            personalShifts.forEach(item => {
              personalMap.set(
                item.key,
                item
              );
            });

            const completeShifts =
              parseAllShifts(
                rows,
                period
              );

            mergeAllShifts(
              allShifts,
              completeShifts
            );

            diagnostics.parsedSheets++;
          }
        );

        pendingAllShifts = allShifts;

        pending = [
          ...personalMap.values()
        ].sort((a, b) =>
          a.key.localeCompare(b.key)
        );

        if (!pending.length) {
          alert(
            `Nessun turno trovato per ` +
            `“${state.settings.excelName}”.`
          );

          return;
        }

        const firstKey =
          pending[0]?.key;

        const lastKey =
          pending.at(-1)?.key;

        document
          .getElementById('previewText')
          .textContent =
            `Trovati ${pending.length} giorni ` +
            `dal ${firstKey || '—'} ` +
            `al ${lastKey || '—'}. ` +
            `Letti ${diagnostics.parsedSheets} fogli. ` +
            `L'importazione sostituirà soltanto ` +
            `i vecchi turni importati da Excel.`;

        const previewBox =
          document.getElementById(
            'previewList'
          );

        previewBox.innerHTML = '';

        pending
          .slice(0, 120)
          .forEach(item => {
            const date = new Date(
              item.key + 'T00:00:00'
            );

            const row =
              document.createElement('div');

            row.className = 'row';

            row.innerHTML =
              `<span>` +
              `${date.getDate()}/` +
              `${date.getMonth() + 1}/` +
              `${date.getFullYear()}` +
              `</span>` +

              `<span class="grow">` +
              `${shiftPreviewLabel(item.shift)}` +
              `</span>`;

            previewBox.appendChild(row);
          });

        document
          .getElementById(
            'previewDialog'
          )
          .showModal();

      } catch (error) {
        console.error(
          'Errore importazione Excel:',
          error
        );

        pending = [];
        pendingAllShifts = {};

        alert(
          'File Excel non leggibile ' +
          'o formato non riconosciuto.'
        );
      }
    }
  );

document
  .getElementById('confirmImport')
  .onclick = () => {
    /*
     * Cancella soltanto i vecchi turni
     * precedentemente importati da Excel.
     *
     * I turni inseriti manualmente restano intatti.
     */
    Object.keys(state.shifts).forEach(
      key => {
        if (
          state.shifts[key]?.note ===
          'Importato da Excel'
        ) {
          delete state.shifts[key];
        }
      }
    );

    pending.forEach(item => {
      state.shifts[item.key] =
        item.shift;
    });

    state.allShifts =
      pendingAllShifts;

    /*
     * Porta il calendario sull'ultimo mese importato.
     */
    const lastKey =
      pending.at(-1)?.key;

    if (lastKey) {
      const date = new Date(
        lastKey + 'T00:00:00'
      );

      view = new Date(
        date.getFullYear(),
        date.getMonth(),
        1
      );
    }

    const importedCount =
      pending.length;

    pending = [];
    pendingAllShifts = {};

    saveState();
    render();

    const status =
      document.getElementById('status');

    if (status) {
      status.textContent =
        `${importedCount} turni importati correttamente.`;
    }

    document
      .getElementById(
        'previewDialog'
      )
      .close();
  };

document
  .getElementById('cancelImport')
  .onclick = () => {
    pending = [];
    pendingAllShifts = {};

    document
      .getElementById(
        'previewDialog'
      )
      .close();
  };
