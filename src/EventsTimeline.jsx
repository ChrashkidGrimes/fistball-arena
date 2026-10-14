import { useMemo, useState } from "react";
import { IconStar, IconShield, IconWhistle, IconEye } from "./icons.jsx";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86400000;
const COLW = 320;      // px per month column (wider → duration bars are clearer)
const PILLW = 340;     // assumed pill width for lane packing (~+50%)
const LANE_H = 84;     // px per lane row
const parseISO = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const roleIcon = (role) =>
  role === "org-admin" ? IconStar : role === "admin" ? IconShield : role === "official" ? IconWhistle : IconEye;
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtRange(s, e) {
  if (!s) return "";
  if (!e || +e === +s) return `${s.getDate()} ${MO[s.getMonth()]}`;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
    return `${s.getDate()}–${e.getDate()} ${MO[e.getMonth()]}`;
  return `${s.getDate()} ${MO[s.getMonth()]} – ${e.getDate()} ${MO[e.getMonth()]}`;
}

function Avatar({ src, name }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img className="tl-logo" src={src} alt="" onError={() => setErr(true)} />;
  return <span className="tl-logo tl-logo-ph">{(name || "?").trim()[0]}</span>;
}

// Horizontal month timeline: one pill per event at its start date, event logo
// as the avatar. Events are packed into lanes so pills never overlap.
export default function EventsTimeline({ events, brandings, live, roleOf, onOpen }) {
  const items = useMemo(
    () => (events || [])
      .map((e) => ({ ev: e, s: parseISO(e.startDate), e2: parseISO(e.endDate || e.startDate) }))
      .filter((x) => x.s)
      .sort((a, b) => a.s - b.s),
    [events]
  );
  const undated = useMemo(() => (events || []).filter((e) => !parseISO(e.startDate)), [events]);

  const model = useMemo(() => {
    if (!items.length) return null;
    const minD = new Date(Math.min(...items.map((x) => +x.s)));
    const maxD = new Date(Math.max(...items.map((x) => +x.e2)));
    // Anchor the window so TODAY sits at 30% (30% past · 70% future), while still
    // fitting every event. total = max(pastNeeded/0.3, futureNeeded/0.7).
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const pastNeeded = Math.max(0, (today - minD) / DAY);
    const futureNeeded = Math.max(0, (maxD - today) / DAY);
    const totalDaysWin = Math.max(pastNeeded / 0.3, futureNeeded / 0.7, 60);
    const winStart = new Date(+today - totalDaysWin * 0.3 * DAY);
    const winEnd = new Date(+today + totalDaysWin * 0.7 * DAY);
    const start = new Date(winStart.getFullYear(), winStart.getMonth(), 1);
    const end = new Date(winEnd.getFullYear(), winEnd.getMonth() + 1, 0);
    const months = [];
    for (let c = new Date(start); c <= end; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) months.push(new Date(c));
    const totalDays = Math.round((end - start) / DAY) + 1;
    const width = months.length * COLW;
    const xOf = (d) => ((d - start) / DAY) / totalDays * width;

    const laneEnds = []; // right edge px per lane
    const placed = items.map((x) => {
      const left = xOf(x.s);
      let lane = laneEnds.findIndex((r) => r <= left - 6);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = left + PILLW;
      const spanW = Math.max(6, xOf(new Date(+x.e2 + DAY)) - left); // start→end bar
      return { ...x, left, lane, spanW };
    });
    return { months, width, xOf, placed, lanes: laneEnds.length, start, end };
  }, [items]);

  if (!model) {
    return <div className="empty">No dated events to show on the timeline.{undated.length ? " Some events have no start date." : ""}</div>;
  }

  const { months, width, xOf, placed, lanes } = model;
  const todayX = (() => {
    const now = new Date(); const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const x = xOf(d);
    return x >= 0 && x <= width ? x : null;
  })();
  const laneAreaH = lanes * LANE_H + 12;

  return (
    <div className="tl-wrap">
      <div className="tl-scroll">
        <div className="tl-inner" style={{ width }}>
          <div className="tl-months">
            {months.map((m, i) => (
              <div className="tl-month" key={i} style={{ width: COLW }}>
                <span className="tl-month-lbl">{MONTH[m.getMonth()]} {String(m.getFullYear()).slice(2)}</span>
              </div>
            ))}
          </div>
          <div className="tl-lanes" style={{ height: laneAreaH }}>
            {months.map((m, i) => <div className="tl-grid-line" key={i} style={{ left: i * COLW }} />)}
            {todayX != null && (
              <div className="tl-today" style={{ left: todayX }}><span className="tl-today-lbl">Today</span></div>
            )}
            {placed.map(({ ev, left, lane, spanW, s, e2 }) => {
              const role = roleOf(ev);
              const RoleIcon = roleIcon(role);
              const isLive = !!live?.ids?.has(ev.id);
              const logo = brandings?.[ev.id]?.eventLogo?.dataUrl;
              const dateLabel = fmtRange(s, e2);
              return (
                <div key={ev.id} className="tl-item" style={{ left, top: lane * LANE_H + 6 }}>
                  <button className={`tl-pill ${isLive ? "live" : ""}`} onClick={() => onOpen(ev.id)} title={`${ev.name} · ${dateLabel}`}>
                    <Avatar src={logo} name={ev.name} />
                    <span className="tl-txt">
                      <span className="tl-name">{ev.name}</span>
                      <span className="tl-meta">
                        <RoleIcon size={12} /> {role}
                        <span className="tl-dates">· {dateLabel}</span>
                        {isLive && <span className="tl-liveflag"><span className="live-dot" /> Live</span>}
                      </span>
                    </span>
                  </button>
                  <div className="tl-bar" style={{ width: Math.max(14, spanW) }} title={`${dateLabel} — actual dates`} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {undated.length > 0 && (
        <div className="tl-undated">
          <span className="muted-sm">No date:</span>
          {undated.map((e) => (
            <button key={e.id} className="btn sm" onClick={() => onOpen(e.id)}>{e.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
