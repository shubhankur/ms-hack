"use client";

import { useEffect } from "react";
import { X, ExternalLink, Gem, Star } from "lucide-react";
import type { AgendaItem, RsvpDraft } from "@/lib/types";
import { formatTimeTo12h } from "@/lib/calendar-adapter";

interface EventDetailModalProps {
  /** The selected agenda item to display. Pass null to hide the modal. */
  item: AgendaItem | null;
  /** Previously drafted RSVP message for this event, if any. */
  draft?: RsvpDraft;
  /** Whether the draft is currently being generated. */
  draftLoading?: boolean;
  onClose: () => void;
  onDraft: (item: AgendaItem) => void;
}

export function EventDetailModal({
  item,
  draft,
  draftLoading,
  onClose,
  onDraft,
}: EventDetailModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!item) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  const e = item.event;
  const timeFormatted = formatTimeTo12h(e.time);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Event details: ${e.name}`}
    >
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 p-5">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-neutral-100 leading-snug">
                {e.name}
              </h2>
              {item.hiddenGem && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                  <Gem size={10} />
                  HIDDEN GEM
                </span>
              )}
              {e.sponsorTier && (
                <span className="inline-flex items-center gap-1 rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-400">
                  <Star size={10} />
                  {e.sponsorTier}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              {timeFormatted} · {e.location} · {e.company}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── Fit score + why ─────────────────────────────────── */}
          <div className="rounded-lg bg-emerald-500/10 p-3">
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-emerald-400">
                {item.fitScore}
              </span>
              <span className="text-xs text-neutral-400">/ 100 fit score</span>
            </div>
            <p className="text-sm text-emerald-300/90">{item.why}</p>
          </div>

          {/* ── Description / blurb ─────────────────────────────── */}
          {e.blurb && (
            <p className="text-sm text-neutral-400 leading-relaxed">{e.blurb}</p>
          )}

          {/* ── Hosts ───────────────────────────────────────────── */}
          {e.hosts.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Hosts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {e.hosts.map((h) => (
                  <span
                    key={h.key}
                    className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300"
                  >
                    {h.label}
                    {h.role !== "primary" && (
                      <span className="ml-1 text-neutral-500">
                        (co-host)
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Action buttons ──────────────────────────────────── */}
          <div className="flex gap-2 pt-1">
            {e.rsvpUrl ? (
              <a
                href={e.rsvpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Visit RSVP
                <ExternalLink size={13} />
              </a>
            ) : (
              <span className="flex flex-1 items-center justify-center rounded-lg bg-neutral-800 py-2 text-sm text-neutral-500 cursor-default">
                Invite Only
              </span>
            )}
            <button
              onClick={() => onDraft(item)}
              disabled={draftLoading}
              className="flex-1 rounded-lg bg-neutral-800 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
            >
              {draftLoading ? "Drafting…" : draft ? "↻ Redraft" : "✍️ Draft intro"}
            </button>
          </div>

          {/* ── Draft message ────────────────────────────────────── */}
          {draft && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
              {draft.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
