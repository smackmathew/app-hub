// Calendar days ("YYYY-MM-DD") in the owner's time zone. Daily numbers are bucketed by these.

/** The calendar day an instant falls on in `timeZone`. */
export function dayIn(timeZone: string, at: Date | number = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    typeof at === "number" ? new Date(at) : at,
  );
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `day` plus `n` days (n may be negative). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Minutes `timeZone` is ahead of UTC at the given instant. */
function offsetMinutes(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000);
}

/** The instant (ms since epoch) `day` starts in `timeZone`. */
export function startOfDay(day: string, timeZone: string): number {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  let guess = utcMidnight - offsetMinutes(timeZone, utcMidnight) * 60_000;
  // Correct once in case a DST change falls between the guess and the real answer.
  guess = utcMidnight - offsetMinutes(timeZone, guess) * 60_000;
  return guess;
}
