/**
 * Masks a sensitive original value for shoulder-surfing protection in popovers and diff tables.
 * Example: "alice@acme.com" -> "al***om", "AKIAIOSFODNN7EXAMPLE" -> "AK***LE"
 */
export function maskSensitiveValue(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 4) {
    return '••••';
  }
  if (singleLine.includes('@') && !singleLine.includes('://')) {
    const [local, domain] = singleLine.split('@');
    const localPrefix = local.slice(0, Math.min(2, local.length));
    return `${localPrefix}***@${domain}`;
  }
  const head = singleLine.slice(0, 3);
  const tail = singleLine.slice(-2);
  return `${head}•••${tail}`;
}

export function formatIsoDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  pii: 'PII',
  financial: 'Financial',
  secrets: 'Secrets',
  network: 'Network',
  custom: 'Custom',
  slm_ner: 'Local AI',
};
