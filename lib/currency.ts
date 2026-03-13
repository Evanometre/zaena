// lib/currency.ts
export interface Currency {
  code: string;        // e.g., "NGN"
  symbol: string;      // e.g., "₦"
  name?: string;       // e.g., "Naira"
  formatOptions?: Intl.NumberFormatOptions;
}

// Holds available currencies
let availableCurrencies: Currency[] = [
  { code: "NGN", symbol: "₦", name: "Naira", formatOptions: { style: "currency", currency: "NGN" } },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", formatOptions: { style: "currency", currency: "KES" } },
  { code: "USD", symbol: "$", name: "US Dollar", formatOptions: { style: "currency", currency: "USD" } },
];

// Currently selected currency
let currentCurrency: Currency = availableCurrencies[0];

// ✅ Set currency by code
export function setCurrencyByCode(code: string) {
  const currency = availableCurrencies.find(c => c.code === code);
  if (!currency) throw new Error(`Currency with code ${code} not found`);
  currentCurrency = currency;
}

// Get current currency symbol
export function getCurrencySymbol(): string {
  return currentCurrency.symbol;
}

// Format number according to selected currency
export function formatAmount(amount: number): string {
  if (currentCurrency.formatOptions) {
    return new Intl.NumberFormat(undefined, currentCurrency.formatOptions).format(amount);
  }
  return `${currentCurrency.symbol}${amount.toFixed(2)}`;
}

// Update available currencies dynamically (from API etc.)
export function setAvailableCurrencies(currencies: Currency[]) {
  availableCurrencies = currencies;
  if (!availableCurrencies.includes(currentCurrency)) {
    currentCurrency = availableCurrencies[0];
  }
}

// Get list of currencies
export function getAvailableCurrencies(): Currency[] {
  return availableCurrencies;
}
