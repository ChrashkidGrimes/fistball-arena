import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const EVENT = "2026 U18 World Championship & Women's EFA Championship";
const EVENT_DATE = "23rd – 26th July 2026";
const EVENT_PLACE = "Reiden – Switzerland";

const PURPLE = "#3a2d6b";
const LINE = "#8a90a2";
const LIGHT = "#eceef3";

const s = StyleSheet.create({
  page: { padding: 22, fontSize: 8, fontFamily: "Helvetica", color: "#111" },
  // header
  hWrap: { borderWidth: 1, borderColor: LINE },
  hLogos: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 6 },
  hLogoLeft: { flexDirection: "row", alignItems: "center" },
  hLogo: { height: 34, objectFit: "contain" },
  hPromos: { flexDirection: "row", alignItems: "center", gap: 10 },
  hPromo: { height: 28, objectFit: "contain", marginLeft: 8 },
  hTop: { backgroundColor: PURPLE, color: "#fff", padding: 6, textAlign: "center" },
  hEvent: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  hMeta: { fontSize: 7, marginTop: 2 },
  hTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center", padding: 4, backgroundColor: LIGHT },
  row: { flexDirection: "row" },
  infoCell: { flex: 1, borderRightWidth: 1, borderColor: LINE, padding: 4 },
  infoLast: { flex: 1, padding: 4 },
  label: { fontSize: 6, color: "#666" },
  value: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  teams: { flexDirection: "row", borderTopWidth: 1, borderColor: LINE },
  teamCell: { flex: 1, padding: 5 },
  teamName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  // sections
  section: { marginTop: 10 },
  secTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: PURPLE, marginBottom: 4, textTransform: "uppercase" },
  // rally record
  setBlock: { borderWidth: 1, borderColor: LINE, marginBottom: 5, padding: 4 },
  setHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  setLabel: { fontFamily: "Helvetica-Bold" },
  rRow: { flexDirection: "row", alignItems: "center", marginVertical: 1 },
  rTeam: { width: 70, fontFamily: "Helvetica-Bold", color: PURPLE, fontSize: 7 },
  rCells: { flexDirection: "row", flexWrap: "wrap", flex: 1 },
  cell: { width: 14, height: 13, borderWidth: 0.5, borderColor: LINE, marginRight: 1, marginBottom: 1, alignItems: "center", justifyContent: "center" },
  cellX: { backgroundColor: LIGHT, color: "#aab" },
  cellTxt: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  // rosters
  twoCol: { flexDirection: "row", gap: 8 },
  col: { flex: 1, borderWidth: 1, borderColor: LINE },
  colHead: { backgroundColor: PURPLE, color: "#fff", padding: 3, fontFamily: "Helvetica-Bold", fontSize: 8 },
  pRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 0.5, borderColor: LINE, paddingVertical: 2, paddingHorizontal: 3 },
  pC: { width: 12, textAlign: "center", fontFamily: "Helvetica-Bold" },
  pNr: { width: 16, textAlign: "center", fontFamily: "Helvetica-Bold" },
  pName: { flex: 1 },
  pOC: { width: 16, alignItems: "center", justifyContent: "center" },
  pOCdot: { width: 7, height: 7, borderRadius: 1, backgroundColor: "#2f6df0" },
  card: { width: 14, height: 12, marginLeft: 1, borderWidth: 0.5, borderColor: LINE, alignItems: "center", justifyContent: "center" },
  cardTxt: { fontSize: 6, fontFamily: "Helvetica-Bold" },
  roleLbl: { color: PURPLE, fontFamily: "Helvetica-Bold" },
  // referees / footer
  refGrid: { flexDirection: "row", flexWrap: "wrap" },
  refCell: { width: "33.33%", padding: 4, borderWidth: 0.5, borderColor: LINE },
  sigRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  sigBox: { flex: 1, borderWidth: 1, borderColor: LINE, height: 40, padding: 4, justifyContent: "space-between" },
  small: { fontSize: 7 },
});

function short(name) { return (name || "").split(" - ")[0]; }
function setScore(set) {
  const r = (set && set.rallies) || [];
  let a = 0, b = 0;
  for (const x of r) { if (x === "A") a++; else if (x === "B") b++; }
  return { a, b };
}
function rows(rallies) {
  const A = [], B = [];
  let ca = 0, cb = 0;
  for (const w of rallies) {
    if (w === "A") { ca++; A.push(String(ca)); B.push("/"); }
    else { cb++; B.push(String(cb)); A.push("/"); }
  }
  return { A, B };
}

const CARD = { y: "#f2c20a", yr: "#e2731b", r: "#e23b3b" };

function Card({ kind, on }) {
  return (
    <View style={[s.card, on ? { backgroundColor: CARD[kind] } : {}]}>
      <Text style={[s.cardTxt, on ? { color: "#fff" } : { color: "#bbb" }]}>{kind.toUpperCase()}</Text>
    </View>
  );
}

function TeamColumn({ team, side }) {
  return (
    <View style={s.col}>
      <Text style={s.colHead}>Team {side}: {team.name}</Text>
      {team.players.map((p, i) => (
        <View style={s.pRow} key={i}>
          <Text style={s.pC}>{p.captain ? "C" : ""}</Text>
          <Text style={s.pNr}>{p.nr}</Text>
          <Text style={s.pName}>{p.name}{p.first ? ", " + p.first : ""}</Text>
          <View style={s.pOC}>{p.onCourt ? <View style={s.pOCdot} /> : null}</View>
          <Card kind="y" on={p.cards?.y} />
          <Card kind="yr" on={p.cards?.yr} />
          <Card kind="r" on={p.cards?.r} />
        </View>
      ))}
      {team.staff.map((st, i) => (
        <View style={s.pRow} key={"s" + i}>
          <Text style={s.pC}></Text>
          <Text style={[s.pName, s.roleLbl]}>{st.role}</Text>
          <Text style={s.pName}>{st.name}{st.first ? ", " + st.first : ""}</Text>
          <Text style={s.pOC}></Text>
          <Card kind="y" on={st.cards?.y} />
          <Card kind="yr" on={st.cards?.yr} />
          <Card kind="r" on={st.cards?.r} />
        </View>
      ))}
    </View>
  );
}

export default function SumulaPDF({ draft, branding }) {
  const d = draft;
  const promos = (branding?.promoters || []).filter((p) => p?.dataUrl);
  const hasLogos = !!(branding?.eventLogo?.dataUrl || promos.length);
  const played = d.sets.map((set, i) => ({ set, i, sc: setScore(set) })).filter((x) => x.sc.a + x.sc.b > 0);
  let setsA = 0, setsB = 0;
  for (const { sc } of played) { if (sc.a > sc.b) setsA++; else if (sc.b > sc.a) setsB++; }
  const info = [
    ["Match Nr", "#" + d.info.nr], ["Date", d.info.date], ["Time", d.info.time],
    ["Court", d.info.court], ["Best of", String(d.info.bestOf)],
    ["Round", d.info.round], ["Category", d.info.category],
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* header */}
        <View style={s.hWrap}>
          {hasLogos && (
            <View style={s.hLogos}>
              <View style={s.hLogoLeft}>
                {branding?.eventLogo?.dataUrl ? <Image src={branding.eventLogo.dataUrl} style={s.hLogo} /> : null}
              </View>
              <View style={s.hPromos}>
                {promos.map((p, i) => <Image key={i} src={p.dataUrl} style={s.hPromo} />)}
              </View>
            </View>
          )}
          <View style={s.hTop}>
            <Text style={s.hEvent}>{branding?.name || EVENT}</Text>
            <Text style={s.hMeta}>{EVENT_DATE}  ·  {EVENT_PLACE}</Text>
          </View>
          <Text style={s.hTitle}>Fistball Game Report</Text>
          <View style={s.row}>
            {info.map(([k, v], i) => (
              <View key={k} style={i === info.length - 1 ? s.infoLast : s.infoCell}>
                <Text style={s.label}>{k}</Text>
                <Text style={s.value}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={s.teams}>
            <View style={[s.teamCell, { borderRightWidth: 1, borderColor: LINE }]}>
              <Text style={s.label}>Team A</Text>
              <Text style={s.teamName}>{d.teamA.name}</Text>
            </View>
            <View style={s.teamCell}>
              <Text style={s.label}>Team B</Text>
              <Text style={s.teamName}>{d.teamB.name}</Text>
            </View>
          </View>
        </View>

        {/* points record */}
        <View style={s.section}>
          <Text style={s.secTitle}>Points record  ·  {short(d.teamA.name)} {setsA} — {setsB} {short(d.teamB.name)}</Text>
          {played.length === 0 && <Text style={s.small}>No points recorded.</Text>}
          {played.map(({ set, i, sc }) => {
            const r = rows(set.rallies || []);
            return (
              <View style={s.setBlock} key={i}>
                <View style={s.setHead}>
                  <Text style={s.setLabel}>Set {i + 1}</Text>
                  <Text style={s.setLabel}>{sc.a} : {sc.b}</Text>
                </View>
                <View style={s.rRow}>
                  <Text style={s.rTeam}>{short(d.teamA.name)}</Text>
                  <View style={s.rCells}>
                    {r.A.map((c, j) => (
                      <View key={j} style={[s.cell, c === "/" ? s.cellX : {}]}><Text style={s.cellTxt}>{c}</Text></View>
                    ))}
                  </View>
                </View>
                <View style={s.rRow}>
                  <Text style={s.rTeam}>{short(d.teamB.name)}</Text>
                  <View style={s.rCells}>
                    {r.B.map((c, j) => (
                      <View key={j} style={[s.cell, c === "/" ? s.cellX : {}]}><Text style={s.cellTxt}>{c}</Text></View>
                    ))}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* time-outs */}
        <View style={s.section}>
          <Text style={s.secTitle}>Time-outs  (set · score at the moment)</Text>
          <View style={s.twoCol}>
            {["teamA", "teamB"].map((side) => (
              <View key={side} style={{ flex: 1 }}>
                <Text style={s.small}>
                  {short(d[side].name)}: {(d.timeouts?.[side] || []).length
                    ? d.timeouts[side].map((t) => `S${(t.set ?? 0) + 1} ${t.a}:${t.b}`).join("    ")
                    : "—"}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* team registration */}
        <View style={s.section}>
          <Text style={s.secTitle}>Team registration  (C = captain · blue dot = on court · Y / YR / R = cautions)</Text>
          <View style={s.twoCol}>
            <TeamColumn team={d.teamA} side="A" />
            <TeamColumn team={d.teamB} side="B" />
          </View>
        </View>

        {/* referees */}
        <View style={s.section}>
          <Text style={s.secTitle}>Referee team</Text>
          <View style={s.refGrid}>
            {[["Referee 1", d.referees.r1], ["Referee 2", d.referees.r2], ["Recording Clerk", d.referees.clerk],
              ["Assistant 1", d.referees.a1], ["Assistant 2", d.referees.a2],
              ["Ball / serve", `1st: ${sideName(d, d.ballChoice.set1)}  ·  Deciding: ${sideName(d, d.ballChoice.set5)}`]]
              .map(([k, v]) => (
                <View style={s.refCell} key={k}>
                  <Text style={s.label}>{k}</Text>
                  <Text style={s.value}>{v || "—"}</Text>
                </View>
              ))}
          </View>
        </View>

        {/* extraordinary events + signatures */}
        <View style={s.section}>
          <Text style={s.secTitle}>Remarks / extraordinary events</Text>
          <View style={{ borderWidth: 1, borderColor: LINE, padding: 5, minHeight: 30 }}>
            <Text style={s.small}>{d.remarks || "—"}</Text>
            <Text style={[s.small, { marginTop: 4 }]}>Responsible: {d.responsible || "—"}</Text>
            {(d.amendments || []).map((a, i) => (
              <Text key={i} style={[s.small, { marginTop: 4 }]}>
                Amended after submission — {new Date(a.at).toLocaleString("en-GB")} · {a.by}: {a.reason || "—"}
              </Text>
            ))}
          </View>
          <View style={s.sigRow}>
            {[[`Captain — ${short(d.teamA.name)}`, d.signatures.capA],
              [`Captain — ${short(d.teamB.name)}`, d.signatures.capB],
              ["Referee", d.signatures.referee],
              ["Recording Clerk", d.signatures.clerk]].map(([k, on]) => (
              <View style={s.sigBox} key={k}>
                <Text style={s.small}>{on ? "signed" : ""}</Text>
                <Text style={[s.label, { textAlign: "center" }]}>{k}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

function sideName(d, side) {
  if (side === "A") return short(d.teamA.name);
  if (side === "B") return short(d.teamB.name);
  return "—";
}
