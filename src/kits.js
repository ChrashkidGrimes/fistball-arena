// Uniform helpers shared by the games list, the uniforms page and the report.
// A uniform is its jersey colours: { colors: [hex, …] } (up to 3, e.g. a
// striped jersey). A game's kit per side is a uniform number (1/2) into the
// team's kits, or — in older events — a jersey hex string.
export const MAX_KIT_COLORS = 3;
// Jersey colours of a stored uniform; older ones were { shirt, shorts }
// (shorts are no longer used).
export const kitColors = (k) => (Array.isArray(k?.colors) ? k.colors.filter(Boolean) : k?.shirt ? [k.shirt] : []);
export function resolveKit(value, teamKits) {
  if (!value) return null;
  if (typeof value === "string") return { colors: [value] };
  const colors = kitColors((teamKits || [])[value - 1]);
  return colors.length ? { colors, n: value } : null;
}

// Uniforms are registered per team AND category, so a club with a men's and a
// women's team (e.g. Clubs WC) has separate uniforms. Older events keyed them
// by team name only — still used as a fallback.
export const kitKey = (team, category) => `${team} · ${category || ""}`;
export const teamKitsFor = (teamKits, team, category) =>
  (teamKits || {})[kitKey(team, category)] || (teamKits || {})[team];
