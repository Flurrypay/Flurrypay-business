export interface DateWindow { from: string; to: string }
export function relativeDateWindow(label: string, now = new Date()): DateWindow | null {
  const days = label.match(/(?:last\s*)?(\d+)\s*days?/i)?.[1]; if (!days) return null;
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); const start = new Date(end); start.setUTCDate(start.getUTCDate() - Number(days) + 1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
export function displayedDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]; if (iso) return iso;
  const words = text.replace(/\s+/g, ' ').match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/i)?.[0];
  if (!words) return null;
  const date = new Date(words); if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function withinDateWindow(text: string, range: DateWindow | null) { if (!range) return true; const date = displayedDate(text); return date !== null && date >= range.from && date <= range.to; }
