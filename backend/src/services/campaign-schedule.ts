const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const IST_OFFSET_MINUTES = 330;

/** Parse a wall-clock date/time as Asia/Kolkata without relying on the host TZ. */
export function parseKolkataDateTime(date: unknown, time: unknown): Date | null {
  if (typeof date !== "string" || typeof time !== "string") return null;
  const dateParts = DATE_PATTERN.exec(date);
  const timeParts = TIME_PATTERN.exec(time);
  if (!dateParts || !timeParts) return null;
  const [, yearText, monthText, dayText] = dateParts;
  const [, hourText, minuteText] = timeParts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60_000);
}

export function validateCampaignSchedule(startDate: unknown, startTime: unknown, endDate: unknown, endTime: unknown, now = new Date()): { start: Date; end: Date } | { error: string } {
  const start = parseKolkataDateTime(startDate, startTime);
  if (!start) return { error: "Choose a valid start date and time." };
  const end = parseKolkataDateTime(endDate, endTime);
  if (!end) return { error: "Choose a valid end date and time." };
  if (start.getTime() <= now.getTime()) return { error: "Campaign start date and time must be in the future (Asia/Kolkata)." };
  if (end.getTime() <= start.getTime()) return { error: "Campaign end must be after its start date and time." };
  return { start, end };
}
