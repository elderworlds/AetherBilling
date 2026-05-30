export const INSTALLMENT_COUNT = 4;
export const DEFAULT_INTERVAL_DAYS = 14;

export type SchedulePreset = "weekly" | "biweekly" | "monthly" | "custom";
export type PayMode = "full" | "pay_in_4";

export const SCHEDULE_PRESETS: Record<Exclude<SchedulePreset, "custom">, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export function resolveIntervalDays(preset: SchedulePreset, customDays?: number): number {
  if (preset === "custom") {
    const days = Math.round(Number(customDays) || 0);
    return days > 0 ? days : DEFAULT_INTERVAL_DAYS;
  }
  return SCHEDULE_PRESETS[preset];
}

export function formatScheduleLabel(preset: SchedulePreset, customDays?: number): string {
  switch (preset) {
    case "weekly":
      return "week";
    case "biweekly":
      return "2 weeks";
    case "monthly":
      return "30 days";
    case "custom": {
      const days = resolveIntervalDays("custom", customDays);
      return `${days} day${days === 1 ? "" : "s"}`;
    }
  }
}

export function formatScheduleFromDays(days: number): string {
  if (days === 7) return "every week";
  if (days === 14) return "every 2 weeks";
  if (days === 30) return "every 30 days";
  return `every ${days} day${days === 1 ? "" : "s"}`;
}

export function splitInstallments(totalCents: number, count = INSTALLMENT_COUNT) {
  const total = Math.max(0, Math.round(totalCents));
  if (total <= 0) return Array.from({ length: count }, () => 0);
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
