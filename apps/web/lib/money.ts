import { fromMinorUnits } from "@repo/validators";

/**
 * Formats an amount stored in the smallest currency unit (paise, cents, …)
 * for display. Uses Intl so symbol placement and grouping follow the locale;
 * `fromMinorUnits` handles zero- and three-decimal currencies correctly.
 */
export function formatMinorAmount(
  amountInMinor: number,
  currency: string,
  options?: { locale?: string; maximumFractionDigits?: number },
): string {
  const amount = fromMinorUnits(amountInMinor, currency);

  try {
    return new Intl.NumberFormat(options?.locale, {
      style: "currency",
      currency,
      maximumFractionDigits: options?.maximumFractionDigits,
    }).format(amount);
  } catch {
    // Unknown currency codes make Intl throw; degrade to a plain number.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Formats a major-unit amount (used for inputs and previews). */
export function formatMajorAmount(
  amount: number,
  currency: string,
  options?: { locale?: string; maximumFractionDigits?: number },
): string {
  try {
    return new Intl.NumberFormat(options?.locale, {
      style: "currency",
      currency,
      maximumFractionDigits: options?.maximumFractionDigits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
