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

export const fmtTime = (iso: string | Date) =>
  new Intl.DateTimeFormat("en-GB", fmtTimeOpts).format(new Date(iso));

export const fmtDateTime = (iso: string | Date) =>
  new Intl.DateTimeFormat("en-GB", fmtDateTimeOpts).format(new Date(iso));

export const fmtTick = (tick: number) => fmtTime(tickToTime(tick));
