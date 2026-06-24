import { useCallback, useEffect, useMemo, useState } from "react";
import { t as translate, useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";

type SchedulePreset = "every_minute" | "every_hour" | "every_day" | "weekdays" | "weekly" | "monthly" | "custom";
type TranslateFn = typeof translate;

const PRESETS: { value: SchedulePreset; labelKey: string; defaultValue: string }[] = [
  { value: "every_minute", labelKey: "components.scheduleeditor.preset_every_minute.label", defaultValue: "Every minute" },
  { value: "every_hour", labelKey: "components.scheduleeditor.preset_every_hour.label", defaultValue: "Every hour" },
  { value: "every_day", labelKey: "components.scheduleeditor.preset_every_day.label", defaultValue: "Every day" },
  { value: "weekdays", labelKey: "components.scheduleeditor.preset_weekdays.label", defaultValue: "Weekdays" },
  { value: "weekly", labelKey: "components.scheduleeditor.preset_weekly.label", defaultValue: "Weekly" },
  { value: "monthly", labelKey: "components.scheduleeditor.preset_monthly.label", defaultValue: "Monthly" },
  { value: "custom", labelKey: "components.scheduleeditor.preset_custom.label", defaultValue: "Custom (cron)" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i) }));

const MINUTES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i * 5),
  label: String(i * 5).padStart(2, "0"),
}));

const DAYS_OF_WEEK = [
  { value: "1", labelKey: "components.scheduleeditor.day_mon.label", defaultValue: "Mon" },
  { value: "2", labelKey: "components.scheduleeditor.day_tue.label", defaultValue: "Tue" },
  { value: "3", labelKey: "components.scheduleeditor.day_wed.label", defaultValue: "Wed" },
  { value: "4", labelKey: "components.scheduleeditor.day_thu.label", defaultValue: "Thu" },
  { value: "5", labelKey: "components.scheduleeditor.day_fri.label", defaultValue: "Fri" },
  { value: "6", labelKey: "components.scheduleeditor.day_sat.label", defaultValue: "Sat" },
  { value: "0", labelKey: "components.scheduleeditor.day_sun.label", defaultValue: "Sun" },
];

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function parseCronToPreset(cron: string): {
  preset: SchedulePreset;
  hour: string;
  minute: string;
  dayOfWeek: string;
  dayOfMonth: string;
} {
  const defaults = { hour: "10", minute: "0", dayOfWeek: "1", dayOfMonth: "1" };

  if (!cron || !cron.trim()) {
    return { preset: "every_day", ...defaults };
  }

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { preset: "custom", ...defaults };
  }

  const [min, hr, dom, , dow] = parts;

  // Every minute: "* * * * *"
  if (min === "*" && hr === "*" && dom === "*" && dow === "*") {
    return { preset: "every_minute", ...defaults };
  }

  // Every hour: "0 * * * *"
  if (hr === "*" && dom === "*" && dow === "*") {
    return { preset: "every_hour", ...defaults, minute: min === "*" ? "0" : min };
  }

  // Every day: "M H * * *"
  if (dom === "*" && dow === "*" && hr !== "*") {
    return { preset: "every_day", ...defaults, hour: hr, minute: min === "*" ? "0" : min };
  }

  // Weekdays: "M H * * 1-5"
  if (dom === "*" && dow === "1-5" && hr !== "*") {
    return { preset: "weekdays", ...defaults, hour: hr, minute: min === "*" ? "0" : min };
  }

  // Weekly: "M H * * D" (single day)
  if (dom === "*" && /^\d$/.test(dow) && hr !== "*") {
    return { preset: "weekly", ...defaults, hour: hr, minute: min === "*" ? "0" : min, dayOfWeek: dow };
  }

  // Monthly: "M H D * *"
  if (/^\d{1,2}$/.test(dom) && dow === "*" && hr !== "*") {
    return { preset: "monthly", ...defaults, hour: hr, minute: min === "*" ? "0" : min, dayOfMonth: dom };
  }

  return { preset: "custom", ...defaults };
}

function buildCron(preset: SchedulePreset, hour: string, minute: string, dayOfWeek: string, dayOfMonth: string): string {
  switch (preset) {
    case "every_minute":
      return "* * * * *";
    case "every_hour":
      return `${minute} * * * *`;
    case "every_day":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    case "custom":
      return "";
  }
}

function formatHourLabel(value: string, t: TranslateFn = translate): string {
  const hour = Number(value);
  const displayHour = hour === 0 ? 12 : hour < 12 ? hour : hour === 12 ? 12 : hour - 12;
  const period = hour < 12
    ? t("components.scheduleeditor.am.label", { defaultValue: "AM" })
    : t("components.scheduleeditor.pm.label", { defaultValue: "PM" });
  return t("components.scheduleeditor.hour_label", {
    hour: displayHour,
    period,
    defaultValue: "{{hour}} {{period}}",
  });
}

function formatTimeLabel(hour: string, minute: string, t: TranslateFn = translate): string {
  const hourNumber = Number(hour);
  const displayHour = hourNumber === 0 ? 12 : hourNumber < 12 ? hourNumber : hourNumber === 12 ? 12 : hourNumber - 12;
  const period = hourNumber < 12
    ? t("components.scheduleeditor.am.label", { defaultValue: "AM" })
    : t("components.scheduleeditor.pm.label", { defaultValue: "PM" });
  return t("components.scheduleeditor.time_with_period", {
    hour: displayHour,
    minute: minute.padStart(2, "0"),
    period,
    defaultValue: "{{hour}}:{{minute}} {{period}}",
  });
}

function formatDayOfWeek(value: string, t: TranslateFn = translate): string {
  const day = DAYS_OF_WEEK.find((d) => d.value === value);
  return day ? t(day.labelKey, { defaultValue: day.defaultValue }) : value;
}

function describeSchedule(cron: string, t: TranslateFn = translate): string {
  const { preset, hour, minute, dayOfWeek, dayOfMonth } = parseCronToPreset(cron);
  const timeStr = formatTimeLabel(hour, minute, t);

  switch (preset) {
    case "every_minute":
      return t("components.scheduleeditor.summary_every_minute", { defaultValue: "Every minute" });
    case "every_hour":
      return t("components.scheduleeditor.summary_every_hour", {
        minute: minute.padStart(2, "0"),
        defaultValue: "Every hour at :{{minute}}",
      });
    case "every_day":
      return t("components.scheduleeditor.summary_every_day", {
        time: timeStr,
        defaultValue: "Every day at {{time}}",
      });
    case "weekdays":
      return t("components.scheduleeditor.summary_weekdays", {
        time: timeStr,
        defaultValue: "Weekdays at {{time}}",
      });
    case "weekly": {
      const day = formatDayOfWeek(dayOfWeek, t);
      return t("components.scheduleeditor.summary_weekly", {
        day,
        time: timeStr,
        defaultValue: "Every {{day}} at {{time}}",
      });
    }
    case "monthly":
      return t("components.scheduleeditor.summary_monthly", {
        day: dayOfMonth,
        ordinalDay: `${dayOfMonth}${ordinalSuffix(Number(dayOfMonth))}`,
        time: timeStr,
        defaultValue: "Monthly on the {{ordinalDay}} at {{time}}",
      });
    case "custom":
      return cron || t("components.scheduleeditor.no_schedule_set", { defaultValue: "No schedule set" });
  }
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export { describeSchedule };

export function ScheduleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (cron: string) => void;
}) {
const { t } = useTranslation();

  const parsed = useMemo(() => parseCronToPreset(value), [value]);
  const [preset, setPreset] = useState<SchedulePreset>(parsed.preset);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [dayOfWeek, setDayOfWeek] = useState(parsed.dayOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth);
  const [customCron, setCustomCron] = useState(preset === "custom" ? value : "");

  // Sync from external value changes
  useEffect(() => {
    const p = parseCronToPreset(value);
    setPreset(p.preset);
    setHour(p.hour);
    setMinute(p.minute);
    setDayOfWeek(p.dayOfWeek);
    setDayOfMonth(p.dayOfMonth);
    if (p.preset === "custom") setCustomCron(value);
  }, [value]);

  const emitChange = useCallback(
    (p: SchedulePreset, h: string, m: string, dow: string, dom: string, custom: string) => {
      if (p === "custom") {
        onChange(custom);
      } else {
        onChange(buildCron(p, h, m, dow, dom));
      }
    },
    [onChange],
  );

  const handlePresetChange = (newPreset: SchedulePreset) => {
    setPreset(newPreset);
    if (newPreset === "custom") {
      setCustomCron(value);
    } else {
      emitChange(newPreset, hour, minute, dayOfWeek, dayOfMonth, customCron);
    }
  };

  return (
    <div className="space-y-3">
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as SchedulePreset)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("components.scheduleeditor.choose_frequency.attr_placeholder", { defaultValue: "Choose frequency..." })} />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {t(p.labelKey, { defaultValue: p.defaultValue })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" ? (
        <div className="space-y-1.5">
          <Input
            value={customCron}
            onChange={(e) => {
              setCustomCron(e.target.value);
              emitChange("custom", hour, minute, dayOfWeek, dayOfMonth, e.target.value);
            }}
            placeholder={t("components.scheduleeditor.0_10.attr_placeholder", { defaultValue: "0 10 * * *" })}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("components.scheduleeditor.five_fields_minute_hour_day_of_m.jsx-text", { defaultValue: "\n            Five fields: minute hour day-of-month month day-of-week\n          " })}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {preset !== "every_minute" && preset !== "every_hour" && (
            <>
              <span className="text-sm text-muted-foreground">{t("components.scheduleeditor.at.jsx-text", { defaultValue: "at" })}</span>
              <Select
                value={hour}
                onValueChange={(h) => {
                  setHour(h);
                  emitChange(preset, h, minute, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {formatHourLabel(h.value, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">:</span>
              <Select
                value={minute}
                onValueChange={(m) => {
                  setMinute(m);
                  emitChange(preset, hour, m, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {preset === "every_hour" && (
            <>
              <span className="text-sm text-muted-foreground">{t("components.scheduleeditor.at_minute.jsx-text", { defaultValue: "at minute" })}</span>
              <Select
                value={minute}
                onValueChange={(m) => {
                  setMinute(m);
                  emitChange(preset, hour, m, dayOfWeek, dayOfMonth, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      :{m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {preset === "weekly" && (
            <>
              <span className="text-sm text-muted-foreground">{t("components.scheduleeditor.on.jsx-text", { defaultValue: "on" })}</span>
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map((d) => (
                  <Button
                    key={d.value}
                    type="button"
                    variant={dayOfWeek === d.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setDayOfWeek(d.value);
                      emitChange(preset, hour, minute, d.value, dayOfMonth, customCron);
                    }}
                  >
                    {t(d.labelKey, { defaultValue: d.defaultValue })}
                  </Button>
                ))}
              </div>
            </>
          )}

          {preset === "monthly" && (
            <>
              <span className="text-sm text-muted-foreground">{t("components.scheduleeditor.on_day.jsx-text", { defaultValue: "on day" })}</span>
              <Select
                value={dayOfMonth}
                onValueChange={(dom) => {
                  setDayOfMonth(dom);
                  emitChange(preset, hour, minute, dayOfWeek, dom, customCron);
                }}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_MONTH.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      )}
    </div>
  );
}
