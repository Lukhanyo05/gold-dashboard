interface TaxBracket {
  min: number;
  max: number;
  base: number;
  rate: number;
}

const SARS_BRACKETS: TaxBracket[] = [
  { min: 0,        max: 245_100,   base: 0,        rate: 0.18 },
  { min: 245_100,  max: 383_100,   base: 44_118,   rate: 0.26 },
  { min: 383_100,  max: 530_200,   base: 79_998,   rate: 0.31 },
  { min: 530_200,  max: 695_800,   base: 125_599,  rate: 0.36 },
  { min: 695_800,  max: 887_000,   base: 185_215,  rate: 0.39 },
  { min: 887_000,  max: 1_878_600, base: 259_783,  rate: 0.41 },
  { min: 1_878_600, max: Infinity, base: 666_339,  rate: 0.45 },
];

const PRIMARY_REBATE = 17_820;

export function calculateAnnualTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;

  const bracket = SARS_BRACKETS.find(
    (b) => taxableIncome > b.min && taxableIncome <= b.max
  );
  if (!bracket) return 0;

  const taxBeforeRebate =
    bracket.base + (taxableIncome - bracket.min) * bracket.rate;

  return Math.max(0, taxBeforeRebate - PRIMARY_REBATE);
}

export function effectiveTaxRate(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  return calculateAnnualTax(taxableIncome) / taxableIncome;
}

/**
 * Reserve a slice of every winning trade for tax.
 * Uses a conservative effective rate (defaults to your Account.taxRate).
 */
export function reserveForTax(profit: number, taxRate: number): number {
  if (profit <= 0) return 0;
  return Math.round(profit * taxRate * 100) / 100;
}