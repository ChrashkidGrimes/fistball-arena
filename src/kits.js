// Uniform helpers shared by the games list, the uniforms page and the report.
// A game's kit per side is a uniform number (1/2) into the team's kits, or —
// in older events — a shirt hex string.
export function resolveKit(value, teamKits) {
  if (!value) return null;
  if (typeof value === "string") return { shirt: value, shorts: "" };
  const k = (teamKits || [])[value - 1];
  return k && (k.shirt || k.shorts) ? { ...k, n: value } : null;
}

// Uniforms are registered per team AND category, so a club with a men's and a
// women's team (e.g. Clubs WC) has separate uniforms. Older events keyed them
// by team name only — still used as a fallback.
export const kitKey = (team, category) => `${team} · ${category || ""}`;
export const teamKitsFor = (teamKits, team, category) =>
  (teamKits || {})[kitKey(team, category)] || (teamKits || {})[team];
