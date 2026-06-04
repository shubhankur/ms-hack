import type { Agenda, AgendaItem } from "@/lib/types";

/** Minimal event shape consumed by the FullScreenCalendar component. */
export interface CalendarEvent {
  id: number;
  name: string;
  /** Human-readable 12-hour time, e.g. "10:00 AM" */
  time: string;
  /** Full ISO datetime string, e.g. "2026-06-04T10:00:00" */
  datetime: string;
}

/** One entry per day that has at least one event. */
export interface CalendarData {
  day: Date;
  events: CalendarEvent[];
}

/** Convert a raw 24-hour time string ("HH:MM:SS" or "HH:MM") to 12-hour format. */
export function formatTimeTo12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Transforms an Agenda (byDay record of AgendaItems) into the CalendarData[]
 * format expected by FullScreenCalendar.  Events within each day are sorted
 * chronologically by start time.
 */
export function agendaToCalendarData(agenda: Agenda): CalendarData[] {
  return Object.entries(agenda.byDay)
    .filter(([, items]) => items.length > 0)
    .map(([isoDay, items]) => {
      const [year, month, day] = isoDay.split("-").map(Number);
      const date = new Date(year, month - 1, day);

      const events: CalendarEvent[] = [...items]
        .sort((a, b) => a.event.time.localeCompare(b.event.time))
        .map(
          (item): CalendarEvent => ({
            id: item.event.id,
            name: item.event.name,
            time: formatTimeTo12h(item.event.time),
            datetime: `${isoDay}T${item.event.time}`,
          }),
        );

      return { day: date, events };
    });
}

/**
 * Build a lookup map from event id → AgendaItem for fast access in event
 * click handlers without having to scan the full agenda.
 */
export function buildAgendaItemMap(
  agenda: Agenda,
): Map<number, AgendaItem> {
  const map = new Map<number, AgendaItem>();
  for (const items of Object.values(agenda.byDay)) {
    for (const item of items) {
      map.set(item.event.id, item);
    }
  }
  return map;
}
