"use client";

import { useRef, useState } from "react";
import type { Agenda, AgendaItem, RsvpDraft, UserProfile } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };

const SESSION_ID = "demo-user";

const DAY_LABEL: Record<string, string> = {
  "2026-06-01": "Mon Jun 1",
  "2026-06-02": "Tue Jun 2",
  "2026-06-03": "Wed Jun 3",
  "2026-06-04": "Thu Jun 4",
  "2026-06-05": "Fri Jun 5",
  "2026-06-06": "Sat Jun 6",
  "2026-06-07": "Sun Jun 7",
};

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hey — I curate NYC Tech Week (1,600+ events) down to the handful that are actually worth your time. Tell me who you are and what you want out of the week. Pasting your bio works great.",
    },
  ]);
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<{
    totalEvents: number;
    agenda: Agenda;
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<number, RsvpDraft>>({});
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    if (!input.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: input }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: SESSION_ID, messages: next, profile }),
      }).then((r) => r.json());
      if (res.ok) {
        setMessages([...next, { role: "assistant", content: res.reply }]);
        setProfile(res.profile);
        setReady(res.ready);
      } else {
        setMessages([...next, { role: "assistant", content: `⚠️ ${res.error}` }]);
      }
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollTo(0, 1e6), 50);
    }
  }

  async function curate() {
    if (!profile) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/curate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile }),
      }).then((r) => r.json());
      if (res.ok) setResult({ totalEvents: res.totalEvents, agenda: res.agenda });
    } finally {
      setBusy(false);
    }
  }

  async function draftRsvp(item: AgendaItem) {
    const res = await fetch("/api/rsvp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, picks: [item] }),
    }).then((r) => r.json());
    if (res.ok && res.drafts[0]) {
      setDrafts((d) => ({ ...d, [item.event.id]: res.drafts[0] }));
    }
  }

  const picks = result ? Object.values(result.agenda.byDay).flat() : [];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Tech Week Concierge
          </h1>
          <p className="text-sm text-neutral-400">
            From 1,600 events to your agenda — curated to who you are.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* Chat panel */}
          <section className="flex h-[70vh] flex-col rounded-xl border border-neutral-800 bg-neutral-900">
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "ml-auto bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-100"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {busy && !result && (
                <div className="text-xs text-neutral-500">thinking…</div>
              )}
            </div>

            {ready && (
              <button
                onClick={curate}
                disabled={busy}
                className="mx-4 mb-2 rounded-lg bg-emerald-600 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                ✨ Curate my agenda
              </button>
            )}

            <div className="flex gap-2 border-t border-neutral-800 p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Tell me about you…"
                className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none placeholder:text-neutral-500"
              />
              <button
                onClick={send}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </section>

          {/* Results panel */}
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            {profile && <ProfileChips profile={profile} />}

            {!result && (
              <div className="flex h-[55vh] items-center justify-center text-center text-neutral-500">
                {ready
                  ? "Hit “Curate my agenda” to see your week."
                  : "Chat on the left. Your profile builds as you talk."}
              </div>
            )}

            {result && (
              <>
                <div className="mb-4 flex items-center gap-3 text-sm">
                  <Stat n={result.totalEvents} label="events this week" muted />
                  <span className="text-neutral-600">→</span>
                  <Stat n={picks.length} label="picked for you" />
                  <span className="text-neutral-600">·</span>
                  <Stat
                    n={picks.filter((p) => p.hiddenGem).length}
                    label="hidden gems"
                    accent
                  />
                </div>

                <div className="space-y-5">
                  {Object.entries(result.agenda.byDay).map(([day, items]) =>
                    items.length ? (
                      <div key={day}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          {DAY_LABEL[day] ?? day}
                        </h3>
                        <div className="space-y-2">
                          {items.map((it) => (
                            <EventCard
                              key={it.event.id}
                              item={it}
                              draft={drafts[it.event.id]}
                              onDraft={() => draftRsvp(it)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Stat({
  n,
  label,
  muted,
  accent,
}: {
  n: number;
  label: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className={`text-xl font-bold ${
          accent ? "text-amber-400" : muted ? "text-neutral-500" : "text-emerald-400"
        }`}
      >
        {n}
      </span>
      <span className="text-xs text-neutral-400">{label}</span>
    </span>
  );
}

function ProfileChips({ profile }: { profile: UserProfile }) {
  const chips = [
    profile.role,
    ...profile.goals.map((g) => `🎯 ${g}`),
    ...profile.interests.slice(0, 4),
    profile.socialEnergy && `energy: ${profile.socialEnergy}`,
  ].filter(Boolean) as string[];
  if (!chips.length) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function EventCard({
  item,
  draft,
  onDraft,
}: {
  item: AgendaItem;
  draft?: RsvpDraft;
  onDraft: () => void;
}) {
  const e = item.event;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{e.name}</span>
            {item.hiddenGem && (
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                HIDDEN GEM
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {e.time.slice(0, 5)} · {e.location} · {e.company}
          </div>
          <p className="mt-1 text-xs text-emerald-300/90">{item.why}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400">
            {item.fitScore}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {e.rsvpUrl && (
          <a
            href={e.rsvpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
          >
            RSVP ↗
          </a>
        )}
        {e.isInviteOnly && (
          <span className="text-xs text-neutral-500">invite-only</span>
        )}
        <button
          onClick={onDraft}
          className="rounded-md bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
        >
          {draft ? "↻ redraft" : "✍️ draft intro"}
        </button>
      </div>

      {draft && (
        <div className="mt-2 rounded-md bg-neutral-900 p-2 text-xs text-neutral-300">
          {draft.message}
        </div>
      )}
    </div>
  );
}
