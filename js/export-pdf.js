'use strict';

(function () {
  function cleanText(value) {
    return String(value ?? '')
      .replace(/[^\x20-\x7EÀ-ÿ€]/g, ' ')
      .trim();
  }

  function getMonthShifts(year, month) {
    const result = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const key =
        `${year}-${pad(month + 1)}-${pad(day)}`;

      const date = new Date(year, month, day);
      const shift = state.shifts[key];

      result.push({
        key,
        day,
        date,
        shift
      });
    }

    return result;
  }

  function getShiftLabel(shift) {
    if (!shift) return 'Non inserito';

    return TYPES[shift.type]?.label || shift.type || 'Turno';
  }

  function getShiftTime(shift) {
    if (!shift) return '—';

    const type = TYPES[shift.type];

    if (!type?.work) return '—';

    return `${shift.start || '—'} - ${shift.end || '—'}`;
  }

  function getShiftHours(shift) {
    if (!shift) return '—';

    const type = TYPES[shift.type];

    if (!type?.work) return '—';

    return fmtMin(worked(shift));
  }

  function createPdf() {
    if (!window.jspdf?.jsPDF) {
      alert(
        'La libreria PDF non è disponibile. ' +
        'Controlla la connessione e ricarica la pagina.'
      );
      return null;
    }

    const { jsPDF } = window.jspdf;

    const year = view.getFullYear();
    const month = view.getMonth();
    const shifts = getMonthShifts(year, month);

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margin = 12;
    const rowHeight = 7;
    const tableTop = 40;

    let totalWorked = 0;
    let totalNight = 0;
    let restDays = 0;
    let workDays = 0;

    shifts.forEach(({ shift }) => {
      if (!shift) return;

      const type = TYPES[shift.type];

      if (type?.work) {
        totalWorked += worked(shift);
        totalNight += nightMinutes(shift);
        workDays++;
      } else if (shift.type === 'riposo') {
        restDays++;
      }
    });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);

    pdf.text(
      `Turni - ${MONTHS[month]} ${year}`,
      margin,
      16
    );

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);

    const profileName =
      cleanText(state.settings.profileName) || 'Profilo';

    pdf.text(`Nome: ${profileName}`, margin, 23);

    pdf.text(
      `Ore lavorate: ${fmtMin(totalWorked)}`,
      margin,
      30
    );

    pdf.text(
      `Ore notturne: ${fmtMin(totalNight)}`,
      70,
      30
    );

    pdf.text(
      `Giorni lavorati: ${workDays}`,
      135,
      30
    );

    pdf.text(
      `Riposi: ${restDays}`,
      195,
      30
    );

    const columns = [
      { title: 'Giorno', x: margin, width: 22 },
      { title: 'Data', x: margin + 22, width: 32 },
      { title: 'Turno', x: margin + 54, width: 47 },
      { title: 'Orario', x: margin + 101, width: 42 },
      { title: 'Ore', x: margin + 143, width: 27 },
      { title: 'Nota', x: margin + 170, width: 103 }
    ];

    function drawHeader(y) {
      pdf.setFillColor(235, 238, 243);
      pdf.rect(
        margin,
        y,
        pageWidth - margin * 2,
        rowHeight,
        'F'
      );

      pdf.setDrawColor(170);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);

      columns.forEach(column => {
        pdf.rect(column.x, y, column.width, rowHeight);
        pdf.text(column.title, column.x + 2, y + 4.8);
      });

      pdf.setFont('helvetica', 'normal');
    }

    let y = tableTop;

    drawHeader(y);
    y += rowHeight;

    shifts.forEach(({ date, shift }) => {
      if (y + rowHeight > pageHeight - 12) {
        pdf.addPage();
        y = 15;
        drawHeader(y);
        y += rowHeight;
      }

      if (date.getDay() === 0) {
        pdf.setFillColor(252, 240, 240);
        pdf.rect(
          margin,
          y,
          pageWidth - margin * 2,
          rowHeight,
          'F'
        );
      }

      const dayName = DAYS[date.getDay()];
      const dateText =
        `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${year}`;

      const note = cleanText(shift?.note || '');
      const truncatedNote =
        note.length > 65
          ? `${note.slice(0, 62)}...`
          : note || '—';

      const values = [
        `${dayName} ${date.getDate()}`,
        dateText,
        getShiftLabel(shift),
        getShiftTime(shift),
        getShiftHours(shift),
        truncatedNote
      ];

      pdf.setDrawColor(205);
      pdf.setFontSize(8.5);

      columns.forEach((column, index) => {
        pdf.rect(column.x, y, column.width, rowHeight);

        const maxWidth = column.width - 4;
        const text = cleanText(values[index]);

        pdf.text(
          text,
          column.x + 2,
          y + 4.7,
          {
            maxWidth
          }
        );
      });

      y += rowHeight;
    });

    const pages = pdf.getNumberOfPages();

    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(100);

      pdf.text(
        `Pagina ${page} di ${pages}`,
        pageWidth - margin,
        pageHeight - 6,
        {
          align: 'right'
        }
      );

      pdf.text(
        'Generato da TurniApp',
        margin,
        pageHeight - 6
      );
    }

    return {
      pdf,
      filename:
        `turni-${MONTHS[month].toLowerCase()}-${year}.pdf`
    };
  }

  async function exportPdf() {
    try {
      const result = createPdf();

      if (!result) return;

      const { pdf, filename } = result;

      /*
       * Su iPhone prova ad aprire il menu Condividi.
       * Se la condivisione file non è supportata, scarica il PDF.
       */
      if (
        navigator.share &&
        navigator.canShare &&
        typeof File !== 'undefined'
      ) {
        const blob = pdf.output('blob');
        const file = new File(
          [blob],
          filename,
          { type: 'application/pdf' }
        );

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: filename,
            text: 'Turni mensili',
            files: [file]
          });

          return;
        }
      }

      pdf.save(filename);
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      console.error('Errore esportazione PDF:', error);

      alert(
        'Non è stato possibile creare il PDF. ' +
        'Ricarica la pagina e riprova.'
      );
    }
  }

  function connectPdfButton() {
    const button = document.getElementById('exportPdfBtn');

    if (!button) {
      console.warn('Pulsante exportPdfBtn non trovato.');
      return;
    }

    button.addEventListener('click', exportPdf);
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      connectPdfButton
    );
  } else {
    connectPdfButton();
  }
})();
