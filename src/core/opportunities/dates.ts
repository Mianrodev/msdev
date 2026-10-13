/**
 * Deadlines and dates, by deterministic rules only.
 *
 * A deadline keeps the source's exact wording next to the normalised value. When the source names
 * no timezone, the app does not assume one: it treats the deadline as a window spanning every
 * timezone on Earth (UTC+14 … UTC−12) and only calls it "passed" once it has passed everywhere.
 * Ambiguous dates like 03/04/2026 are not guessed (day-first and month-first disagree).
 */

export interface Deadline {
  /** Verbatim source text. */
  raw: string;
  /** YYYY-MM-DD in the deadline's own timezone, or null if the date can't be read unambiguously. */
  date: string | null;
  /** HH:MM (24h) in the deadline's own timezone, or null when the source gives no time. */
  time: string | null;
  /** IANA zone or fixed offset label ("UTC", "+01:00", "Europe/London"), or null when not stated. */
  timezone: string | null;
  /** The exact instant (ISO, UTC), only when date, time and timezone are all known. */
  instant: string | null;
  /** Why something is missing, in plain words. */
  notes: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Unambiguous abbreviations only. "IST" (India / Ireland / Israel) and "CST" (US / China) are deliberately absent. */
const ABBREVIATIONS: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0, BST: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, WET: 0, WEST: 60,
  EST: -300, EDT: -240, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
  AEST: 600, AEDT: 660, ACST: 570, AWST: 480, NZST: 720, NZDT: 780, SGT: 480, JST: 540, KST: 540, HKT: 480,
};
const AMBIGUOUS_ZONES = new Set(["IST", "CST", "AST"]);

const pad = (n: number) => String(n).padStart(2, "0");
const offsetLabel = (min: number) => (min === 0 ? "UTC" : `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`);

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Offset (minutes east of UTC) of an IANA zone at a given UTC instant. */
export function zoneOffsetMinutes(zone: string, atUtcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(atUtcMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - atUtcMs) / 60_000);
  } catch {
    return null;
  }
}

function toInstant(date: string, time: string, offsetMin: number | null, zone: string | null): string | null {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  let off = offsetMin;
  if (off === null && zone) {
    // Two passes handle DST boundaries.
    const first = zoneOffsetMinutes(zone, localAsUtc);
    if (first === null) return null;
    off = zoneOffsetMinutes(zone, localAsUtc - first * 60_000) ?? first;
  }
  if (off === null) return null;
  return new Date(localAsUtc - off * 60_000).toISOString();
}

/**
 * Read a deadline as written by a source. `zoneHint` is a timezone the *source itself* states for all
 * its notices (e.g. a portal that says "all times are UK time") — never a guess by this app.
 */
export function parseDeadline(rawInput: string | null | undefined, zoneHint?: string | null): Deadline | null {
  const raw = (rawInput ?? "").trim();
  if (!raw) return null;
  const notes: string[] = [];
  let date: string | null = null;
  let time: string | null = null;
  let offset: number | null = null;
  let zone: string | null = null;

  // ISO 8601: 2026-11-10, 2026-11-10T12:00, 2026-11-10T12:00:00Z, 2026-11-10T12:00:00+01:00
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(raw);
  if (iso) {
    const [, y, mo, d, hh, mi, , tz] = iso;
    if (validDate(+y, +mo, +d)) date = `${y}-${mo}-${d}`;
    if (hh) time = `${hh}:${mi}`;
    if (tz) {
      if (/^z$/i.test(tz)) offset = 0;
      else {
        const m = /([+-])(\d{2}):?(\d{2})/.exec(tz)!;
        offset = (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]);
      }
    }
  } else {
    const text = raw.replace(/,/g, " ").replace(/\s+/g, " ");
    // Time: 12:00, 5pm, 5:30 PM, 17.00, noon, midnight
    const t = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$|[A-Z(])/i;
    const words = /\b(noon|midday|midnight)\b/i.exec(text);
    // Date: 10 November 2026 / November 10 2026 / 10 Nov 2026
    const dmy = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/.exec(text);
    const mdy = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\b/.exec(text);
    const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(text);
    const isoInText = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
    let rest = text;
    if (isoInText) {
      if (validDate(+isoInText[1], +isoInText[2], +isoInText[3])) date = `${isoInText[1]}-${isoInText[2]}-${isoInText[3]}`;
      rest = text.replace(isoInText[0], " ");
    } else if (dmy && MONTHS[dmy[2].toLowerCase()]) {
      const m = MONTHS[dmy[2].toLowerCase()];
      if (validDate(+dmy[3], m, +dmy[1])) date = `${dmy[3]}-${pad(m)}-${pad(+dmy[1])}`;
      rest = text.replace(dmy[0], " ");
    } else if (mdy && MONTHS[mdy[1].toLowerCase()]) {
      const m = MONTHS[mdy[1].toLowerCase()];
      if (validDate(+mdy[3], m, +mdy[2])) date = `${mdy[3]}-${pad(m)}-${pad(+mdy[2])}`;
      rest = text.replace(mdy[0], " ");
    } else if (numeric) {
      const a = +numeric[1];
      const b = +numeric[2];
      const y = +numeric[3];
      rest = text.replace(numeric[0], " ");
      if (a > 12 && validDate(y, b, a)) date = `${y}-${pad(b)}-${pad(a)}`;
      else if (b > 12 && validDate(y, a, b)) date = `${y}-${pad(a)}-${pad(b)}`;
      else if (a === b && validDate(y, a, b)) date = `${y}-${pad(a)}-${pad(b)}`;
      else notes.push("Date format is ambiguous (day/month order not stated) — check the original notice");
    }
    if (words) {
      time = /midnight/i.test(words[1]) ? "00:00" : "12:00";
      if (/midnight/i.test(words[1])) notes.push('"Midnight" is ambiguous (start or end of the day) — treated as 00:00');
    } else {
      const tm = t.exec(rest);
      if (tm && (tm[2] !== undefined || tm[3])) {
        let h = +tm[1];
        const min = tm[2] ? +tm[2] : 0;
        const ap = tm[3]?.toLowerCase().replace(/\./g, "");
        if (ap === "pm" && h < 12) h += 12;
        if (ap === "am" && h === 12) h = 0;
        if (h <= 23 && min <= 59) time = `${pad(h)}:${pad(min)}`;
      }
    }
    // Timezone: an IANA name, an offset, or an unambiguous abbreviation.
    const ianaM = /\b([A-Z][a-z]+\/[A-Z][A-Za-z_]+(?:\/[A-Z][A-Za-z_]+)?)\b/.exec(raw);
    const offM = /\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/i.exec(raw);
    const abbrM = /\b([A-Z]{1,5})\b/g;
    if (ianaM && zoneOffsetMinutes(ianaM[1], Date.now()) !== null) zone = ianaM[1];
    else if (offM) offset = (offM[1] === "-" ? -1 : 1) * (+offM[2] * 60 + (offM[3] ? +offM[3] : 0));
    else {
      let m: RegExpExecArray | null;
      while ((m = abbrM.exec(raw))) {
        const a = m[1].toUpperCase();
        if (a in ABBREVIATIONS) {
          offset = ABBREVIATIONS[a];
          break;
        }
        if (AMBIGUOUS_ZONES.has(a)) {
          notes.push(`"${a}" could mean more than one timezone — not assumed`);
          break;
        }
      }
    }
  }

  if (offset === null && !zone && zoneHint) zone = zoneHint;
  if (!date && !notes.length) notes.push("No date could be read from the source text");
  if (date && !time) notes.push("No time of day stated");
  if (date && offset === null && !zone) notes.push("Timezone not stated");

  const timezone = zone ?? (offset !== null ? offsetLabel(offset) : null);
  const instant = date && time && (offset !== null || zone) ? toInstant(date, time, offset, zone) : null;
  return { raw, date, time, timezone, instant, notes };
}

export type DeadlineStatus = "open" | "closing_soon" | "passed" | "uncertain" | "unknown";

export interface DeadlineCheck {
  status: DeadlineStatus;
  /** Whole days until the earliest moment the deadline could fall (conservative), or null. */
  daysLeft: number | null;
  /** Plain description, e.g. "12 days left", "Passed on 3 Oct 2026", "Passes today in some timezones". */
  label: string;
}

const DAY = 86_400_000;
const EARLIEST_OFFSET = 14 * 60; // UTC+14 is the first place a local time happens
const LATEST_OFFSET = -12 * 60; // UTC−12 is the last

/** The earliest and latest instants a deadline could mean, given what the source says. */
export function deadlineWindow(d: Deadline): { earliest: number; latest: number } | null {
  if (!d.date) return null;
  if (d.instant) {
    const t = Date.parse(d.instant);
    return { earliest: t, latest: t };
  }
  const [y, m, day] = d.date.split("-").map(Number);
  const [hStart, mStart] = d.time ? d.time.split(":").map(Number) : [0, 0];
  const [hEnd, mEnd] = d.time ? d.time.split(":").map(Number) : [23, 59];
  const startLocal = Date.UTC(y, m - 1, day, hStart, mStart);
  const endLocal = Date.UTC(y, m - 1, day, hEnd, mEnd);
  if (d.timezone) {
    // Zone known, time not: the window is the whole local day in that zone.
    const off = /^[+-]\d{2}:\d{2}$/.test(d.timezone)
      ? (d.timezone[0] === "-" ? -1 : 1) * (+d.timezone.slice(1, 3) * 60 + +d.timezone.slice(4, 6))
      : d.timezone === "UTC"
        ? 0
        : zoneOffsetMinutes(d.timezone, startLocal);
    if (off !== null) return { earliest: startLocal - off * 60_000, latest: endLocal - off * 60_000 };
  }
  return { earliest: startLocal - EARLIEST_OFFSET * 60_000, latest: endLocal - LATEST_OFFSET * 60_000 };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Where a deadline stands at `now`. Never says "open" for a deadline it can't read. */
export function checkDeadline(d: Deadline | null, now: Date = new Date(), soonDays = 7): DeadlineCheck {
  if (!d) return { status: "unknown", daysLeft: null, label: "Deadline not published" };
  const w = deadlineWindow(d);
  if (!w) return { status: "unknown", daysLeft: null, label: "Deadline unclear — see original wording" };
  const t = now.getTime();
  if (t > w.latest) return { status: "passed", daysLeft: null, label: `Passed (${fmtDate(d.date)})` };
  if (t >= w.earliest) return { status: "uncertain", daysLeft: 0, label: "May already have passed — timezone or time not stated" };
  const daysLeft = Math.floor((w.earliest - t) / DAY);
  const approx = w.earliest !== w.latest ? " (approx.)" : "";
  const label = daysLeft === 0 ? `Closes within 24 hours${approx}` : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left${approx}`;
  return { status: daysLeft < soonDays ? "closing_soon" : "open", daysLeft, label };
}

/** Is a deadline inside a user's from/to range (YYYY-MM-DD, inclusive)? null = can't tell. */
export function deadlineInRange(d: Deadline | null, from?: string | null, to?: string | null): boolean | null {
  if (!from && !to) return true;
  if (!d?.date) return null;
  if (from && d.date < from) return false;
  if (to && d.date > to) return false;
  return true;
}
