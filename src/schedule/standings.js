// Rank a single round-robin group from its result docs, using the IFA order:
// points → head-to-head (mini-league among the tied teams) → set difference →
// point difference. Points = 2 per win. Returns team names, best first.
//
// results: [{ teamA, teamB, setsA, setsB, pointsA, pointsB, status }]

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const isPlayed = (r) => r.status === "Finished" || num(r.setsA) + num(r.setsB) > 0;

function tableFrom(results, only) {
  const T = new Map();
  const ensure = (n) => (T.has(n) ? T.get(n) : (T.set(n, { team: n, pts: 0, setsW: 0, setsL: 0, ptsF: 0, ptsA: 0 }), T.get(n)));
  for (const r of results) { ensure(r.teamA); ensure(r.teamB); }
  for (const r of results) {
    if (!isPlayed(r)) continue;
    if (only && !(only.has(r.teamA) && only.has(r.teamB))) continue;
    const a = ensure(r.teamA), b = ensure(r.teamB);
    const sa = num(r.setsA), sb = num(r.setsB), pa = num(r.pointsA), pb = num(r.pointsB);
    a.setsW += sa; a.setsL += sb; b.setsW += sb; b.setsL += sa;
    a.ptsF += pa; a.ptsA += pb; b.ptsF += pb; b.ptsA += pa;
    if (sa > sb) a.pts += 2; else if (sb > sa) b.pts += 2;
  }
  return T;
}
const setDiff = (r) => r.setsW - r.setsL;
const ptDiff = (r) => r.ptsF - r.ptsA;

export function rankGroup(results) {
  const full = tableFrom(results || [], null);
  const rows = [...full.values()];
  // primary: points; ties resolved within equal-points clusters.
  rows.sort((x, y) => y.pts - x.pts);
  const out = [];
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && rows[j].pts === rows[i].pts) j++;
    const cluster = rows.slice(i, j);
    if (cluster.length === 1) { out.push(cluster[0]); i = j; continue; }
    const names = new Set(cluster.map((r) => r.team));
    const h2h = tableFrom(results || [], names); // mini-league among the tied teams
    cluster.sort((x, y) => {
      const hx = h2h.get(x.team), hy = h2h.get(y.team);
      return (hy.pts - hx.pts)                 // head-to-head points
        || (setDiff(hy) - setDiff(hx))          // head-to-head set diff
        || (setDiff(y) - setDiff(x))            // overall set diff
        || (ptDiff(y) - ptDiff(x))              // overall point diff
        || x.team.localeCompare(y.team);        // stable
    });
    out.push(...cluster);
    i = j;
  }
  return out.map((r) => r.team);
}

// Is every match of the group finished? (all pairings played)
export function groupComplete(results, teamCount) {
  const expected = (teamCount * (teamCount - 1)) / 2;
  const played = (results || []).filter(isPlayed).length;
  return teamCount >= 2 && played >= expected;
}

// Group-stage record per team across all groups (points, set and point
// difference) — used to rank teams from different groups against each other,
// e.g. quarterfinal losers for the 5th/7th place games.
export function compareRecords(results) {
  const T = tableFrom(results || [], null);
  return (x, y) => {
    const a = T.get(x), b = T.get(y);
    if (!a || !b) return (a ? -1 : 0) + (b ? 1 : 0);
    return (b.pts - a.pts) || (setDiff(b) - setDiff(a)) || (ptDiff(b) - ptDiff(a)) || (b.ptsF - a.ptsF) || x.localeCompare(y);
  };
}
