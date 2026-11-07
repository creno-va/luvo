import { isDate, shiftDate, type PrescriptionItem } from "./domain.ts";
// Calendar duration is a review suggestion, never a dose calculation.
export function durationEndDate(start: string, duration: string): string {
  const match = duration.trim().match(/^(\d{1,4})\s*(?:일(?:분)?)?$/);
  const days = match ? Number(match[1]) : 0;
  return isDate(start) && days >= 1 && days <= 3650
    ? shiftDate(start, days - 1)
    : "";
}
export function preparePrescriptionReview(
  item: PrescriptionItem,
): PrescriptionItem {
  if (item.action === "stop" || (item.endDate && !item.endDateDerived))
    return item;
  const endDate = durationEndDate(item.startDate, item.durationDays || "");
  return endDate
    ? { ...item, endDate, endDateDerived: true }
    : item.endDateDerived
      ? { ...item, endDate: "", endDateDerived: false }
      : item;
}
