import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// PDF of the Plans page (same data, src/officials/plans.js): one page per
// team (uniform per game) or per official (every round of a day). Flags are
// left out — the built-in PDF fonts have no emoji; colours are drawn.

const PURPLE = "#3a2d6b", LINE = "#8a90a2", LIGHT = "#eceef3";
const SLOT_LABEL = { r1: "Referee 1", r2: "Referee 2", clerk: "Clerk", a1: "Assistant 1", a2: "Assistant 2", cm: "Court manager" };
const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  event: { fontSize: 9, color: "#555" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: PURPLE, marginTop: 2 },
  sub: { fontSize: 10, color: "#555", marginTop: 2, marginBottom: 10 },
  thead: { flexDirection: "row", backgroundColor: LIGHT, borderBottomWidth: 1, borderColor: LINE },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: LINE, minHeight: 18, alignItems: "center" },
  free: { backgroundColor: "#f6f7fa", color: "#888" },
  th: { fontFamily: "Helvetica-Bold", padding: 4, fontSize: 8 },
  td: { padding: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  swatchRow: { flexDirection: "row", alignItems: "center", padding: 4 },
  swatch: { width: 10, height: 10, borderWidth: 0.5, borderColor: "#555", marginRight: 4, flexDirection: "row" },
  foot: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7, color: "#888", textAlign: "center" },
});
// Team columns / official columns.
const T = { day: { width: 108 }, time: { width: 40 }, court: { width: 40 }, game: { width: 130 }, opp: { flex: 1 }, kit: { width: 90 } };
const O = { time: { width: 40 }, role: { width: 80 }, court: { width: 46 }, game: { flex: 1 }, shirt: { width: 90 } };

const dayLong = (v) => {
  const [dd, mm, yy] = String(v || "").split("/").map(Number);
  if (!dd) return v || "";
  return new Date(2000 + (yy || 0), (mm || 1) - 1, dd).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
};
const short = (t) => String(t?.name || t || "").split(" - ")[0];
// A jersey (1–3 colours, one stripe each) or a referee shirt colour.
const Swatch = ({ colors, label }) => (
  <View style={s.swatchRow}>
    <View style={s.swatch}>{colors.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}</View>
    <Text>{label}</Text>
  </View>
);
const Head = ({ event, title, sub }) => (
  <>
    <Text style={s.event}>{[event?.name, event?.place, event?.dates].filter(Boolean).join("  ·  ")}</Text>
    <Text style={s.title}>{title}</Text>
    {sub ? <Text style={s.sub}>{sub}</Text> : null}
  </>
);
const Foot = () => <Text style={s.foot} fixed>Fistball Arena  ·  created {new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Text>;

export default function PlansPDF({ event, teams, officials, rounds = 0, day }) {
  return (
    <Document>
      {(teams || []).map((t) => (
        <Page key={t.key} size="A4" style={s.page}>
          <Head event={event} title={short(t)} sub={`${t.category ? t.category + "  ·  " : ""}Uniforms  ·  ${t.rows.length} game${t.rows.length === 1 ? "" : "s"}`} />
          <View style={s.thead} fixed>
            <Text style={[s.th, T.day]}>Day</Text><Text style={[s.th, T.time]}>Time</Text><Text style={[s.th, T.court]}>Court</Text>
            <Text style={[s.th, T.game]}>Game</Text><Text style={[s.th, T.opp]}>Opponent</Text><Text style={[s.th, T.kit]}>Uniform</Text>
          </View>
          {t.rows.map(({ g, opponent, kit }, i) => (
            <View key={g.id} style={s.tr} wrap={false}>
              <Text style={[s.td, T.day]}>{t.rows[i - 1]?.g.date === g.date ? "" : dayLong(g.date)}</Text>
              <Text style={[s.td, T.time]}>{g.time}</Text>
              <Text style={[s.td, T.court]}>{g.court}</Text>
              <Text style={[s.td, T.game]}>#{g.nr}  {g.round}</Text>
              <Text style={[s.td, T.opp]}>{short(opponent)}</Text>
              <View style={T.kit}>{kit ? <Swatch colors={kit.colors} label={`Uniform ${kit.n || ""}`} /> : <Text style={s.td}>not set</Text>}</View>
            </View>
          ))}
          <Foot />
        </Page>
      ))}
      {(officials || []).map((o) => (
        <Page key={o.key} size="A4" style={s.page}>
          <Head event={event} title={o.name + (o.country ? `  (${o.country})` : "")} sub={`${dayLong(day)}  ·  ${o.onDuty} of ${rounds} rounds on duty`} />
          <View style={s.thead} fixed>
            <Text style={[s.th, O.time]}>Time</Text><Text style={[s.th, O.role]}>Role</Text><Text style={[s.th, O.court]}>Court</Text>
            <Text style={[s.th, O.game]}>Game</Text><Text style={[s.th, O.shirt]}>Shirt</Text>
          </View>
          {o.rows.map(({ time, duties }) => (!duties.length
            ? <View key={time} style={[s.tr, s.free]} wrap={false}><Text style={[s.td, O.time]}>{time}</Text><Text style={[s.td, { flex: 1 }]}>free</Text></View>
            : duties.map((d, i) => (
              <View key={time + i} style={s.tr} wrap={false}>
                <Text style={[s.td, O.time]}>{i === 0 ? time : ""}</Text>
                <Text style={[s.td, s.bold, O.role]}>{SLOT_LABEL[d.slot]}</Text>
                <Text style={[s.td, O.court]}>{d.courts.join(", ")}</Text>
                <Text style={[s.td, O.game]}>{d.games.map((g) => `#${g.nr}  ${short(g.teamA)} v ${short(g.teamB)}`).join("\n")}</Text>
                <View style={O.shirt}>{d.shirts.length ? d.shirts.map((r) => <Swatch key={r.id} colors={[r.shirt]} label={r.name} />) : <Text style={s.td}>—</Text>}</View>
              </View>
            ))))}
          <Foot />
        </Page>
      ))}
    </Document>
  );
}
