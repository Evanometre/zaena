/** 
 * onboarding/utility/timezoneCurrencyMap.ts
 * Maps IANA timezone prefixes/strings to a suggested currency.
 * The lookup uses the most specific match first (full string),
 * then falls back to the region prefix (e.g. "Africa", "America").
 *
 * Currency shape includes the code and a display symbol for use in UI.
 */

export interface CurrencySuggestion {
  code: string;   // ISO 4217, e.g. 'NGN'
  symbol: string; // Display symbol, e.g. '₦'
  name: string;   // Human-readable, e.g. 'Nigerian Naira'
}

// Specific timezone → currency (checked first)
const TIMEZONE_CURRENCY_MAP: Record<string, CurrencySuggestion> = {
  // Africa
  'Africa/Lagos': { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  'Africa/Abidjan': { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  'Africa/Accra': { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  'Africa/Nairobi': { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  'Africa/Johannesburg': { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  'Africa/Cairo': { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  'Africa/Casablanca': { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham' },
  'Africa/Dar_es_Salaam': { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  'Africa/Kampala': { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  'Africa/Lusaka': { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
  'Africa/Harare': { code: 'ZWL', symbol: 'Z$', name: 'Zimbabwean Dollar' },
  'Africa/Addis_Ababa': { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  'Africa/Kigali': { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc' },
  'Africa/Maputo': { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical' },

  // Americas
  'America/New_York': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'America/Chicago': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'America/Denver': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'America/Los_Angeles': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'America/Toronto': { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  'America/Vancouver': { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  'America/Sao_Paulo': { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  'America/Mexico_City': { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  'America/Bogota': { code: 'COP', symbol: 'COL$', name: 'Colombian Peso' },
  'America/Buenos_Aires': { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  'America/Lima': { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  'America/Santiago': { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  'America/Caracas': { code: 'VES', symbol: 'Bs.S', name: 'Venezuelan Bolívar' },
  'America/Jamaica': { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar' },

  // Europe
  'Europe/London': { code: 'GBP', symbol: '£', name: 'British Pound' },
  'Europe/Dublin': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Paris': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Berlin': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Rome': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Madrid': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Amsterdam': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Zurich': { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  'Europe/Oslo': { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  'Europe/Stockholm': { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  'Europe/Copenhagen': { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  'Europe/Warsaw': { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  'Europe/Moscow': { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },

  // Asia
  'Asia/Dubai': { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  'Asia/Riyadh': { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  'Asia/Qatar': { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
  'Asia/Kuwait': { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  'Asia/Bahrain': { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar' },
  'Asia/Kolkata': { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  'Asia/Dhaka': { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  'Asia/Karachi': { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  'Asia/Tokyo': { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  'Asia/Shanghai': { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  'Asia/Hong_Kong': { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  'Asia/Singapore': { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  'Asia/Seoul': { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  'Asia/Bangkok': { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  'Asia/Jakarta': { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  'Asia/Manila': { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  'Asia/Kuala_Lumpur': { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  'Asia/Colombo': { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  'Asia/Kathmandu': { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee' },
  'Asia/Tehran': { code: 'IRR', symbol: '﷼', name: 'Iranian Rial' },
  'Asia/Jerusalem': { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  'Asia/Beirut': { code: 'LBP', symbol: 'ل.ل', name: 'Lebanese Pound' },

  // Pacific / Oceania
  'Australia/Sydney': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Melbourne': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Perth': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Pacific/Auckland': { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
};

// Region-prefix fallbacks (used if no exact match found)
const REGION_FALLBACKS: Record<string, CurrencySuggestion> = {
  'Africa': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'America': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'Europe': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Asia': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'Australia': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Pacific': { code: 'USD', symbol: '$', name: 'US Dollar' },
};

const DEFAULT_CURRENCY: CurrencySuggestion = {
  code: 'USD',
  symbol: '$',
  name: 'US Dollar',
};

/**
 * Given an IANA timezone string, return a suggested currency.
 * Falls back to region prefix, then USD.
 *
 * @example
 * getCurrencyForTimezone('Africa/Lagos') // → { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' }
 * getCurrencyForTimezone('Europe/Athens') // → { code: 'EUR', symbol: '€', name: 'Euro' } (region fallback)
 */
export function getCurrencyForTimezone(timezone: string): CurrencySuggestion {
  // 1. Exact match
  if (TIMEZONE_CURRENCY_MAP[timezone]) {
    return TIMEZONE_CURRENCY_MAP[timezone];
  }

  // 2. Region prefix (e.g. "Africa" from "Africa/Accra")
  const region = timezone.split('/')[0];
  if (REGION_FALLBACKS[region]) {
    return REGION_FALLBACKS[region];
  }

  // 3. Ultimate fallback
  return DEFAULT_CURRENCY;
}

/**
 * All currencies available for manual selection, sorted by code.
 */
export const ALL_CURRENCIES: CurrencySuggestion[] = [
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'COP', symbol: 'COL$', name: 'Colombian Peso' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'IRR', symbol: '﷼', name: 'Iranian Rial' },
  { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  { code: 'LBP', symbol: 'ل.ل', name: 'Lebanese Pound' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'VES', symbol: 'Bs.S', name: 'Venezuelan Bolívar' },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
  { code: 'ZWL', symbol: 'Z$', name: 'Zimbabwean Dollar' },
];