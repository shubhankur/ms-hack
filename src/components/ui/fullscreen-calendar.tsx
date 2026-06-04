"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarData, CalendarEvent } from "@/lib/calendar-adapter";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface FullScreenCalendarProps {
  data: CalendarData[];
  onEventClick: (event: CalendarEvent) => void;
}

export function FullScreenCalendar({
  data,
  onEventClick,
}: FullScreenCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  /** Build a date-keyed lookup map from the CalendarData array. */
  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const entry of data) {
      map.set(format(entry.day, "yyyy-MM-dd"), entry.events);
    }
    return map;
  }, [data]);

  function getEventsForDay(day: Date): CalendarEvent[] {
    return eventMap.get(format(day, "yyyy-MM-dd")) ?? [];
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900">
      {/* Calendar header — navigation */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-base font-semibold text-neutral-100">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentDate((d) => subMonths(d, 1))}
            aria-label="Previous month"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => {
              const today = new Date();
              setCurrentDate(today);
              setSelectedDay(today);
            }}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentDate((d) => addMonths(d, 1))}
            aria-label="Next month"
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day-of-week header row */}
      <div className="grid grid-cols-7 border-b border-neutral-800">
        {WEEK_DAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-neutral-800">
        {days.map((day) => {
          const events = getEventsForDay(day);
          const inCurrentMonth = isSameMonth(day, currentDate);
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const isTodayCell = isToday(day);

          return (
            <div
              key={day.toISOString()}
              onClick={() => setSelectedDay(day)}
              className={cn(
                "min-h-24 cursor-pointer p-1.5 transition-colors hover:bg-neutral-800/50",
                !inCurrentMonth && "opacity-30",
                isSelected && "ring-1 ring-inset ring-blue-500",
              )}
            >
              {/* Date number */}
              <div
                className={cn(
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isTodayCell
                    ? "bg-blue-600 text-white"
                    : "text-neutral-400",
                )}
              >
                {format(day, "d")}
              </div>

              {/* Event pills — show up to 2, then "+N more" */}
              <div className="space-y-0.5">
                {events.slice(0, 2).map((event) => (
                  <button
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className="w-full truncate rounded bg-emerald-500/20 px-1 py-0.5 text-left text-[10px] leading-tight text-emerald-300 hover:bg-emerald-500/35"
                    title={event.name}
                  >
                    <span className="font-medium">{event.time}</span>{" "}
                    {event.name}
                  </button>
                ))}
                {events.length > 2 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Open first overflow event so the user can navigate
                      onEventClick(events[2]);
                    }}
                    className="w-full text-left text-[10px] text-neutral-500 hover:text-neutral-400"
                  >
                    +{events.length - 2} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
