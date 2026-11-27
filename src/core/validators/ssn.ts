/**
 * Validates US Social Security Numbers (XXX-XX-XXXX) against SSA issuance rules:
 * - Area number cannot be 000, 666, or 900–999
 * - Group number cannot be 00
 * - Serial number cannot be 0000
 */
export function isValidSsn(raw: string): boolean {
  const match = /^(\d{3})-(\d{2})-(\d{4})$/.exec(raw.trim());
  if (!match) {
    return false;
  }

  const area = Number(match[1]);
  const group = Number(match[2]);
  const serial = Number(match[3]);

  if (area === 0 || area === 666 || area >= 900) {
    return false;
  }
  if (group === 0) {
    return false;
  }
  if (serial === 0) {
    return false;
  }

  return true;
}
