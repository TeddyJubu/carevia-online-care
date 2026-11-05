export function formatEuro(fee) {
  if (fee == null || !Number.isFinite(Number(fee))) return '';
  const amount = Number(fee);
  return `€${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function initialsFor(name = '', provided = '') {
  if (provided) return provided;
  const parts = String(name)
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'Dr';
  return `${parts[0][0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function groupSlots(slots) {
  const groups = [];
  const seen = new Map();
  for (const slot of slots) {
    const splitAt = slot.indexOf(' · ');
    const day = splitAt === -1 ? 'Available times' : slot.slice(0, splitAt);
    const time = splitAt === -1 ? slot : slot.slice(splitAt + 3);
    if (!seen.has(day)) {
      const entry = { day, times: [] };
      seen.set(day, entry);
      groups.push(entry);
    }
    seen.get(day).times.push({ slot, time });
  }
  return groups;
}

export function rememberAppointment(appointment, extra = {}) {
  const record = { ...extra, ...appointment };
  sessionStorage.setItem(`carevia-appointment-${appointment.id}`, JSON.stringify(record));
  return record;
}

export function recalledAppointment(id) {
  try {
    const raw = sessionStorage.getItem(`carevia-appointment-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
