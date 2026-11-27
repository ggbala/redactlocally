/**
 * Checks whether a normalized digit string matches a recognized ISO/IEC 7812
 * payment card IIN/BIN prefix and valid card length.
 * Prevents random Luhn-passing numeric IDs (e.g. 16-digit order IDs starting with 1/7/8/9)
 * from false-positiving as credit cards.
 */
function hasValidCardIinAndLength(digits: string): boolean {
  const len = digits.length;

  // Visa: 4xxx (13, 16, or 19 digits)
  if (digits.startsWith('4')) {
    return len === 13 || len === 16 || len === 19;
  }

  // American Express: 34xx or 37xx (15 digits)
  if (/^3[47]/.test(digits)) {
    return len === 15;
  }

  // Mastercard: 51-55 (16 digits) or 2221-2720 (16 digits)
  if (/^5[1-5]/.test(digits)) {
    return len === 16;
  }
  const first4 = Number(digits.slice(0, 4));
  if (first4 >= 2221 && first4 <= 2720) {
    return len === 16;
  }

  // Discover: 6011, 65, 644-649, or 622126-622925 (16-19 digits)
  if (/^(?:6011|65|64[4-9])/.test(digits)) {
    return len >= 16 && len <= 19;
  }
  const first6 = Number(digits.slice(0, 6));
  if (first6 >= 622126 && first6 <= 622925) {
    return len >= 16 && len <= 19;
  }

  // JCB: 3528-3589 (16-19 digits)
  if (first4 >= 3528 && first4 <= 3589) {
    return len >= 16 && len <= 19;
  }

  // Diners Club: 300-305, 36, 38-39 (14-16 digits)
  if (/^(?:30[0-5]|36|3[89])/.test(digits)) {
    return len >= 14 && len <= 16;
  }

  // UnionPay: 62 (16-19 digits)
  if (digits.startsWith('62')) {
    return len >= 16 && len <= 19;
  }

  // Maestro: 50, 56-69 (13-19 digits)
  if (/^(?:50|5[6-9]|6\d)/.test(digits)) {
    return len >= 13 && len <= 19;
  }

  return false;
}

/**
 * Validates payment card numbers (13–19 digits) using ISO/IEC 7812 IIN/BIN prefixes
 * plus the Luhn checksum algorithm. Rejects trivial all-identical-digit sequences.
 */
export function isValidLuhn(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) {
    return false;
  }
  if (/^(\d)\1+$/.test(digits)) {
    return false;
  }
  if (!hasValidCardIinAndLength(digits)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}
