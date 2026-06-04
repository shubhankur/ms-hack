// Shared domain types for the Tech Week curator.

/** A single host/co-host of an event. */
export interface EventHost {
  key: string;
  label: string;
  role: string; // "primary" | "cohost_1" | ...
}

/** Normalized Tech Week event, as stored in Cosmos. */
export interface TechWeekEvent {
  id: number;
  name: string;
  date: string; // ISO day, e.g. "2026-06-04"
  time: string; // "07:00:00"
  timeOfDay: string; // "Morning" | "Afternoon" | "Evening"
  location: string; // neighborhood / venue label
  company: string; // primary host company
  hosts: EventHost[];
  rsvpUrl: string | null; // Partiful deep-link; null when invite-only/no link
  isInviteOnly: boolean;
  sponsorTier: string | null; // "platinum" | ...
  city: string;
  /** LLM-derived topic tags (enrichment step). */
  themes?: string[];
  /** Optional short description pulled from the Partiful page. */
  blurb?: string;
  /** Bookkeeping. */
  ingestedAt?: string;
}

/** Raw shape returned by the tech-week.com tRPC endpoint. */
export interface RawTechWeekEvent {
  id: number;
  city: string;
  date: string;
  time: string;
  location: string;
  name: string;
  company: string;
  externalHref: string | null;
  isInviteOnly: boolean;
  sponsorTier?: string;
  facets: {
    time?: { label: string };
    locations?: { label: string }[];
    hosts?: EventHost[];
  };
}

/** Structured user profile extracted from the chat [component #2]. */
export interface UserProfile {
  id: string; // session/user id
  role?: string; // "founder", "VC", "BD", "engineer"...
  oneLiner?: string; // bio / what they do
  goals: string[]; // ["raise", "hire", "find customers", "learn", "network"]
  interests: string[]; // free-text topics: ["AI infra", "fintech", "devtools"]
  days: string[]; // available ISO days
  neighborhoods?: string[]; // preferred areas, empty = any
  socialEnergy?: "low" | "medium" | "high"; // events/day appetite
  avoid?: string[]; // things to skip
  updatedAt?: string;
}

/** Per-event score produced by the curation engine [component #3]. */
export interface ScoredEvent {
  event: TechWeekEvent;
  fitScore: number; // 0-100
  why: string; // one-line justification, personalized
  hiddenGem: boolean; // high-fit but low-profile
}

/** A finalized day-by-day agenda slot. */
export interface AgendaItem extends ScoredEvent {
  conflictsWith?: number[]; // ids of overlapping events that were dropped
}

export interface Agenda {
  profileId: string;
  byDay: Record<string, AgendaItem[]>; // ISO day -> ordered picks
  generatedAt: string;
}

/** Draft application/RSVP message for a pick [component #4]. */
export interface RsvpDraft {
  eventId: number;
  eventName: string;
  rsvpUrl: string | null;
  message: string; // personalized note to the host
  isInviteOnly: boolean;
}
