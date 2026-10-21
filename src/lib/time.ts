const EPOCH_MS = Date.UTC(2026, 4, 17);
const TICK_MS = 10 * 60 * 1000;
const TZ = "Asia/Jakarta";
export const TZ_LABEL = "WIB";

export const tickToTime = (tick: number) => new Date(EPOCH_MS + tick * TICK_MS);

const fmtTimeOpts: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const fmtDateTimeOpts: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

// D1's CURRENT_TIMESTAMP is UTC without a zone ("YYYY-MM-DD HH:MM:SS"); browsers
// would read that as local time, so mark it as UTC explicitly.
const toDate = (v: string | Date) =>
  v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}Z` : v);

export const fmtTime = (iso: string | Date) => new Intl.DateTimeFormat("en-GB", fmtTimeOpts).format(toDate(iso));

export const fmtDateTime = (iso: string | Date) => new Intl.DateTimeFormat("en-GB", fmtDateTimeOpts).format(toDate(iso));

export const fmtTick = (tick: number) => fmtTime(tickToTime(tick));
