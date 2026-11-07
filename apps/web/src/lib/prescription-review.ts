// Calendar duration is derived scheduling metadata, never a dose calculation.
export function durationEndDate(start: string, duration: string): string {
  const match = duration.trim().match(/^([1-9]\d{0,3})\s*(?:일(?:분)?)?$/);
  const days = match ? Number(match[1]) : 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || days < 1 || days > 3650) return "";
  const date = new Date(`${start}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== start)
    return "";
  date.setUTCDate(date.getUTCDate() + days - 1);
  return date.toISOString().slice(0, 10);
}
// Numeric mobile keyboards do not expose ':', so insert it while typing.
export function formatDoseTime(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : digits;
}
