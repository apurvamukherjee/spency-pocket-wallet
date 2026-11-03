// Intl has no region → currency API; this covers the most common regions and falls back to USD.
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", IN: "INR", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD", HK: "HKD", JP: "JPY", CN: "CNY",
  KR: "KRW", TW: "TWD", ID: "IDR", MY: "MYR", TH: "THB", PH: "PHP", VN: "VND", PK: "PKR", BD: "BDT", LK: "LKR",
  NP: "NPR", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", IL: "ILS", TR: "TRY", EG: "EGP", ZA: "ZAR", NG: "NGN",
  KE: "KES", BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", CH: "CHF", SE: "SEK", NO: "NOK",
  DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", UA: "UAH",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", PT: "EUR", FI: "EUR", GR: "EUR",
};

export const LOCALES = [
  "en-US", "en-GB", "en-IN", "en-CA", "en-AU", "en-SG", "hi-IN", "de-DE", "fr-FR", "es-ES", "es-MX", "it-IT",
  "nl-NL", "pt-BR", "pt-PT", "sv-SE", "pl-PL", "tr-TR", "ar-AE", "ja-JP", "ko-KR", "zh-CN", "id-ID", "th-TH",
];

export function currencyForLocale(locale: string): string {
  const region = new Intl.Locale(locale).maximize().region;
  return (region && REGION_CURRENCY[region]) || "USD";
}

/** Best guesses from the browser, used to prefill sign-up and new profiles. */
export function detectDefaults(): { locale: string; currency: string; timeZone: string } {
  const locale = navigator.language || "en-US";
  return { locale, currency: currencyForLocale(locale), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

export function currencyOptions(displayLocale: string): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([displayLocale], { type: "currency" });
  return Intl.supportedValuesOf("currency")
    .map((c) => ({ value: c, label: `${c} · ${names.of(c) ?? c}` }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export function localeOptions(displayLocale: string, current: string): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([displayLocale], { type: "language" });
  return [...new Set([current, ...LOCALES])].map((l) => ({ value: l, label: names.of(l) ?? l }));
}

export function timeZoneOptions(current: string): string[] {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
}

/** Locale's first day of the week as 0 = Sunday … 6 = Saturday; Monday when the browser can't say. */
export function defaultWeekStart(locale: string): number {
  const l: unknown = new Intl.Locale(locale);
  const info =
    typeof l === "object" && l !== null && "getWeekInfo" in l && typeof l.getWeekInfo === "function" ? l.getWeekInfo() : null;
  const first = typeof info === "object" && info !== null && "firstDay" in info ? Number(info.firstDay) : 1;
  return first === 7 ? 0 : first;
}
