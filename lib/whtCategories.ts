// Nigerian WHT rates by expense category (FIRS schedule)
export const WHT_RATES: Record<string, number> = {
  'Rent':               10,
  'Professional Fees':  5,
  'Contract Services':  5,
  'Management Fees':    10,
  'Commission':         10,
  'Technical Fees':     5,
};

export function getWHTRate(category: string): number {
  const normalised = category.trim().toLowerCase();
  const match = Object.entries(WHT_RATES).find(
    ([k]) => k.toLowerCase() === normalised
  );
  return match?.[1] ?? 0;
}

export function computeWHT(grossAmount: number, rate: number): number {
  return Math.round((grossAmount * rate / 100) * 100) / 100;
}