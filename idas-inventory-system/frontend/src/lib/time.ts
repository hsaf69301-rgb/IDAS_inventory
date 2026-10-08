/** Lab-local time helpers. The lab runs on Asia/Colombo (UTC+5:30); all timestamps travel as UTC ISO strings. */
export const LAB_TZ = 'Asia/Colombo';

function tzOffsetMs(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** "2030-01-07" + "10:00" in the lab time zone → UTC ISO string. */
export function zonedToUtcIso(date: string, time: string, tz = LAB_TZ): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - tzOffsetMs(guess, tz)).toISOString();
}

export function labParts(iso: string | Date, tz = LAB_TZ) {
  const dt = typeof iso === 'string' ? new Date(iso) : iso;
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(dt).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, minutes: +p.hour * 60 + +p.minute };
}

export const fmtDateTime = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: LAB_TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
export const fmtDate = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: LAB_TZ, dateStyle: 'medium' }).format(new Date(iso)) : '—');
export const fmtTime = (iso: string) => labParts(iso).time;
export const toLocalInput = (iso: string) => { const p = labParts(iso); return `${p.date}T${p.time}`; };
export const todayLab = () => labParts(new Date()).date;

export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function mondayOf(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(ymd, -((dow + 6) % 7));
}
