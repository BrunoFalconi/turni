'use strict';

(function () {
  function progressiveTax(annualTaxable) {
    const taxable = Math.max(0, Number(annualTaxable) || 0);

    if (taxable <= 28000) {
      return taxable * 0.23;
    }

    if (taxable <= 50000) {
      return 28000 * 0.23 +
        (taxable - 28000) * 0.35;
    }

    return 28000 * 0.23 +
      22000 * 0.35 +
      (taxable - 50000) * 0.43;
  }

  function employeeDeduction(annualTaxable) {
    const income = Math.max(0, Number(annualTaxable) || 0);

    /*
     * Inserisci qui la stessa formula delle detrazioni
     * già usata dal calcolo attuale dell'app.
     *
     * Per ora restituisce zero per evitare errori.
     */
    return 0;
  }

  function calculateProjectedMonthlyIrpef(monthlyTaxable) {
    const annualTaxable =
      Math.max(0, Number(monthlyTaxable) || 0) * 12;

    const annualGrossTax = progressiveTax(annualTaxable);
    const annualDeduction = employeeDeduction(annualTaxable);

    const annualNetTax = Math.max(
      0,
      annualGrossTax - annualDeduction
    );

    return annualNetTax / 12;
  }

  function getMonthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  function getPayrollProfile(year, month) {
    const settings = state.settings || {};
    const override =
      state.monthOverrides?.[getMonthKey(year, month)] || {};

    return {
      gross: Number(settings.gross) || 0,
      divisor: Number(settings.divisor) || 173,

      socialPct: Number(settings.socialPct) || 0,

      fixedExtraDeductions:
        Number(
          override.fixedExtraDeductions ??
          settings.fixedExtraDeductions
        ) || 0,

      additionalDeduction:
        Number(
          override.additionalDeduction ??
          settings.additionalDeduction
        ) || 0,

      regionalInstallment:
        Number(
          override.regionalInstallment ??
          settings.regionalInstallment
        ) || 0,

      municipalBalanceInstallment:
        Number(
          override.municipalBalanceInstallment ??
          settings.municipalBalanceInstallment
        ) || 0,

      municipalAdvanceInstallment:
        Number(
          override.municipalAdvanceInstallment ??
          settings.municipalAdvanceInstallment
        ) || 0,

      nightPct: Number(settings.nightPct) || 50,
      holidayPct: Number(settings.holidayPct) || 50,
      holidayNightPct:
        Number(settings.holidayNightPct) || 55,

      cometaEmployee:
        Number(settings.cometaEmployee) || 0
    };
  }

  function calculatePayrollSimulation({
    year,
    month,
    nightHours = 0,
    holidayHours = 0,
    holidayNightHours = 0
  }) {
    const profile = getPayrollProfile(year, month);

    if (profile.gross <= 0) {
      throw new Error(
        'Lordo mensile non disponibile. Importa prima un cedolino.'
      );
    }

    const hourlyRate =
      profile.gross / profile.divisor;

    const nightAmount =
      Number(nightHours || 0) *
      hourlyRate *
      (profile.nightPct / 100);

    const holidayAmount =
      Number(holidayHours || 0) *
      hourlyRate *
      (profile.holidayPct / 100);

    const holidayNightAmount =
      Number(holidayNightHours || 0) *
      hourlyRate *
      (profile.holidayNightPct / 100);

    const additions =
      nightAmount +
      holidayAmount +
      holidayNightAmount;

    const grossTotal =
      profile.gross + additions;

    const socialContributions =
      grossTotal * (profile.socialPct / 100);

    const taxableIrpef = Math.max(
      0,
      grossTotal -
      socialContributions -
      profile.cometaEmployee
    );

    const monthlyIrpef =
      calculateProjectedMonthlyIrpef(taxableIrpef);

    const localTaxes =
      profile.regionalInstallment +
      profile.municipalBalanceInstallment +
      profile.municipalAdvanceInstallment;

    const totalDeductions =
      socialContributions +
      profile.cometaEmployee +
      profile.fixedExtraDeductions +
      monthlyIrpef +
      localTaxes;

    const estimatedNet =
      grossTotal -
      totalDeductions +
      profile.additionalDeduction;

    return {
      grossBase: profile.gross,
      additions,
      grossTotal,
      socialContributions,
      cometaEmployee: profile.cometaEmployee,
      taxableIrpef,
      monthlyIrpef,
      localTaxes,
      fixedExtraDeductions:
        profile.fixedExtraDeductions,
      additionalDeduction:
        profile.additionalDeduction,
      totalDeductions,
      estimatedNet
    };
  }

  window.calculateProjectedMonthlyIrpef =
    calculateProjectedMonthlyIrpef;

  window.calculatePayrollSimulation =
    calculatePayrollSimulation;
})();
