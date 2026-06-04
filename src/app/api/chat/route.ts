// POST /api/chat — [component #2]
// Conversational profile capture. Body: { id, messages, profile? }.
// Returns { reply, ready, profile } and persists the merged profile.

import { NextResponse } from "next/server";
import { profileTurn, mergeProfile } from "@/lib/profile";
import { saveProfile } from "@/lib/cosmos";
import type { ChatMessage } from "@/lib/aoai";
import type { UserProfile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { id, messages, profile } = (await req.json()) as {
      id: string;
      messages: ChatMessage[];
      profile?: UserProfile;
    };
    if (!id || !Array.isArray(messages)) {
      return NextResponse.json({ ok: false, error: "id and messages required" }, { status: 400 });
    }

    const turn = await profileTurn(messages, profile);
    const merged = mergeProfile(id, turn, profile);

    // Best-effort persistence; don't fail the chat if Cosmos isn't wired yet.
    try {
      await saveProfile(merged);
    } catch (e) {
      console.warn("profile not persisted:", (e as Error).message);
    }

    return NextResponse.json({ ok: true, reply: turn.reply, ready: turn.ready, profile: merged });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
