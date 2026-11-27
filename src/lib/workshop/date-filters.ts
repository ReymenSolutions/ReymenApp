import { dayKeyFromString, zonedMinuteToUtc } from "@/lib/business-day";

/** Fecha de calendario en la zona del negocio; incluye completo el día final. */
export function workshopDateFilter(from: string | undefined, to: string | undefined, timezone: string) {
  const parse = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    try { return dayKeyFromString(value); } catch { return null; }
  };
  const start = parse(from);
  const end = parse(to);
  if (start && end && start > end) return {};
  const nextDay = end ? new Date(end.getTime() + 86_400_000).toISOString().slice(0, 10) : null;
  return {
    ...(start ? { gte: zonedMinuteToUtc(from!, 0, timezone) } : {}),
    ...(nextDay ? { lt: zonedMinuteToUtc(nextDay, 0, timezone) } : {}),
  };
}
