import i18n from "i18next";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.round((now - then) / 1000);

  if (seconds < MINUTE) return i18n.t("commonRelative.justNow", { defaultValue: "just now" });
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return i18n.t("commonRelative.minutesAgo", { count: m, defaultValue: `${m}m ago` });
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return i18n.t("commonRelative.hoursAgo", { count: h, defaultValue: `${h}h ago` });
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return i18n.t("commonRelative.daysAgo", { count: d, defaultValue: `${d}d ago` });
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return i18n.t("commonRelative.weeksAgo", { count: w, defaultValue: `${w}w ago` });
  }
  const mo = Math.floor(seconds / MONTH);
  return i18n.t("commonRelative.monthsAgo", { count: mo, defaultValue: `${mo}mo ago` });
}
