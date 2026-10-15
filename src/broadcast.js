// Links to the broadcast scoreboard overlay hosted with Fistball Live
// (overlay.html). Public, no login — paste into OBS/vMix as a browser source.
export const LIVE_URL = "https://c-englert.github.io/fistball-live/";

// { game: "<gameId>" } pins one game; { court: "1" } follows whatever game is
// on that court (in progress → just finished → next up).
export function overlayUrl(eventId, { game, court } = {}) {
  const q = new URLSearchParams({ event: eventId });
  if (game) q.set("game", game);
  else if (court) q.set("court", court);
  return `${LIVE_URL}overlay.html?${q}`;
}

// Public JSON of the event's results via the Firestore REST API (pollable by
// graphics tools). Pass a gameId for a single game.
export function resultsJsonUrl(eventId, gameId) {
  const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID || "fistball-arena";
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/events/${eventId}/results${gameId ? `/${gameId}` : ""}`;
}

// Public, view-only page of one game on Fistball Live — score, point by point
// and both teams' starting five (for media & communication teams).
export function gamePageUrl(eventId, gameId, hash = "") {
  const q = new URLSearchParams({ event: eventId, game: gameId });
  return `${LIVE_URL}game.html?${q}${hash}`;
}
