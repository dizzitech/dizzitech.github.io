// Shared by the build and browser: never put punctuation or a trunk prefix in wa.me.
export function normalizeWhatsApp(value) {
  const input = String(value ?? '').trim();
  if (!input || !/^\+?[\d ()-]+$/.test(input)) return '';
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!/^[1-9]\d{6,14}$/.test(digits)) return '';
  if (digits.startsWith('7') && digits.length !== 11) return '';
  return digits;
}

export function whatsappUrl(number, message) {
  const digits = normalizeWhatsApp(number);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : '';
}

export function formatWhatsApp(number) {
  const digits = normalizeWhatsApp(number);
  if (!digits) return '';
  return digits.length === 11 && digits.startsWith('7')
    ? `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`
    : `+${digits}`;
}
