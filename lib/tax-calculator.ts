interface PITBracket {
  min: number;
  max: number | null;
  rate: number;
}

interface PITConfig {
  year: number;
  brackets: PITBracket[];
  consolidation_relief_rate: number;
  max_consolidation_relief: number;
  currency: string;
}

/**
 * Calculate Nigerian Personal Income Tax (PIT)
 * Based on 2026 tax brackets with consolidation relief
 */
export function calculateNigerianPIT(
  annualGrossIncome: number,
  pitConfig: PITConfig,
): {
  grossIncome: number;
  consolidationRelief: number;
  taxableIncome: number;
  totalTax: number;
  effectiveRate: number;
  breakdown: {
    bracket: string;
    taxable: number;
    rate: number;
    tax: number;
  }[];
} {
  // Step 1: Calculate Consolidation Relief
  // Higher of: ₦200,000 OR 1% of gross income
  const calculatedRelief =
    annualGrossIncome * pitConfig.consolidation_relief_rate;
  const consolidationRelief = Math.min(
    Math.max(calculatedRelief, pitConfig.max_consolidation_relief),
    pitConfig.max_consolidation_relief,
  );

  // Step 2: Calculate Taxable Income
  const taxableIncome = Math.max(0, annualGrossIncome - consolidationRelief);

  // Step 3: Apply Tax Brackets
  let totalTax = 0;
  let remainingIncome = taxableIncome;
  const breakdown: {
    bracket: string;
    taxable: number;
    rate: number;
    tax: number;
  }[] = [];

  for (const bracket of pitConfig.brackets) {
    if (remainingIncome <= 0) break;

    const bracketMin = bracket.min;
    const bracketMax = bracket.max || Infinity;
    const bracketSize = bracketMax - bracketMin;

    // How much of this bracket applies?
    const taxableInBracket = Math.min(remainingIncome, bracketSize);
    const taxForBracket = (taxableInBracket * bracket.rate) / 100;

    totalTax += taxForBracket;
    remainingIncome -= taxableInBracket;

    if (taxableInBracket > 0) {
      breakdown.push({
        bracket: bracket.max
          ? `₦${bracketMin.toLocaleString()} - ₦${bracketMax.toLocaleString()}`
          : `Above ₦${bracketMin.toLocaleString()}`,
        taxable: taxableInBracket,
        rate: bracket.rate,
        tax: taxForBracket,
      });
    }
  }

  const effectiveRate =
    annualGrossIncome > 0 ? (totalTax / annualGrossIncome) * 100 : 0;

  return {
    grossIncome: annualGrossIncome,
    consolidationRelief,
    taxableIncome,
    totalTax: Math.round(totalTax),
    effectiveRate: parseFloat(effectiveRate.toFixed(2)),
    breakdown,
  };
}

/**
 * Calculate monthly PIT from annual salary
 */
export function calculateMonthlyPIT(
  monthlySalary: number,
  pitConfig: PITConfig,
): number {
  const annualSalary = monthlySalary * 12;
  const { totalTax } = calculateNigerianPIT(annualSalary, pitConfig);
  return Math.round(totalTax / 12);
}

/**
 * Format currency in Naira
 */
export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
