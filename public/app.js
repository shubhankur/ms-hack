const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const results = document.querySelector("#results");
const filters = document.querySelector("#filters");
const userHistory = [];

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  userHistory.push(message);
  addMessage("user", message);
  setLoading(true);

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, messages: userHistory, limit: 10 }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Search failed");
    }

    filters.textContent = JSON.stringify(payload.filters, null, 2);
    renderResults(payload.events || []);
    addMessage("assistant", buildAssistantMessage(payload.events || []));
  } catch (error) {
    addMessage("assistant", error.message);
  } finally {
    setLoading(false);
  }
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

function addMessage(role, text) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  messages.appendChild(node);
  messages.scrollTop = messages.scrollHeight;
}

function renderResults(events) {
  results.replaceChildren();

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "event";
    empty.textContent = "No matching events found for that time window.";
    results.appendChild(empty);
    return;
  }

  for (const event of events) {
    const card = document.createElement("article");
    card.className = "event";

    const chips = [
      ...(event.tracks || []),
      ...(event.audience || []),
      ...(event.topic || []),
      event.format,
      ...(event.intent || []),
    ].filter(Boolean);

    card.innerHTML = `
      <h3>${escapeHtml(event.name)}</h3>
      <div class="meta">${escapeHtml(formatDateTime(event))} · ${escapeHtml(event.location || "Location TBD")}</div>
      <div class="meta">${escapeHtml(event.company || "Host TBD")} · score ${event.score}</div>
      <div class="chips">${chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("")}</div>
      <div class="meta">${escapeHtml(event.summary || "")}</div>
      <div class="meta">${escapeHtml((event.reasons || []).join(" · "))}</div>
      ${event.rsvpUrl ? `<a class="rsvp" href="${escapeAttribute(event.rsvpUrl)}" target="_blank" rel="noreferrer">Open RSVP</a>` : ""}
    `;
    results.appendChild(card);
  }
}

function formatDateTime(event) {
  const date = event.date ? new Date(event.date).toLocaleDateString([], { month: "short", day: "numeric" }) : "Date TBD";
  return `${date}, ${event.time || "Time TBD"}`;
}

function setLoading(loading) {
  form.querySelector("button").disabled = loading;
  form.querySelector("button").textContent = loading ? "Searching" : "Send";
}

function buildAssistantMessage(events) {
  if (events.length === 0) {
    return "No matching events found. Try widening the time window or goal.";
  }
  return `Found ${events.length} matches. Top pick: ${events[0].name}. You can refine this, for example: only investor events, make it after 5, or show hackathons.`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
