import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, useMatch } from "react-router-dom";
import { useEvent } from "./eventContext.js";
import { subscribeLivePointer } from "./cloud.js";
import AccountMenu from "./AccountMenu.jsx";
import { IconBack, IconGames, IconStandings, IconRoster, IconSettings, IconSchedule, IconGuide, IconWhistle, IconShirt } from "./icons.jsx";

const LIVE_URL = "https://c-englert.github.io/fistball-live/";

// Left-sidebar app shell for the event context. Pages render into <Outlet/>.
export default function AppShell({ me, onSignOut }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { eventId, event, isAdmin, archived } = useEvent();
  const base = `/e/${eventId}`;
  const [live, setLive] = useState(null);
  const [open, setOpen] = useState(false); // mobile drawer
  useEffect(() => subscribeLivePointer(setLive), []);
  const onAir = live?.eventId === eventId;
  const go = (to) => { setOpen(false); nav(to); };

  // active section from the sub-path (after /e/:eventId)
  const sub = loc.pathname.replace(base, "").replace(/^\//, "").split("/")[0]; // "", "standings", "game", …
  const gameMatch = useMatch("/e/:eventId/game/:id");

  const items = [
    { key: "", label: "Games", Icon: IconGames },
    { key: "standings", label: "Standings", Icon: IconStandings },
    ...(isAdmin ? [
      { key: "arrange", label: "Schedule", Icon: IconSchedule },
      { key: "roster", label: "Players & staff", Icon: IconRoster },
      { key: "referees", label: "Referees", Icon: IconWhistle },
      { key: "colors", label: "Uniforms", Icon: IconShirt },
      { key: "settings", label: "Settings", Icon: IconSettings },
    ] : []),
  ];
  const activeKey = gameMatch ? "" : sub;
  const activeLabel = (items.find((i) => i.key === activeKey) || {}).label || "";
  const evName = event?.name || "Event";

  return (
    <div className="shell">
      <div className={`sb-scrim ${open ? "show" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sb-eventhead">
          <button className="sb-back" onClick={() => go("/")}><IconBack size={13} /> Events</button>
          <div className="sb-eventname">{evName}</div>
          <div className="sb-eventmeta">{[event?.place, event?.dates].filter(Boolean).join(" · ")}{archived ? " · Archived" : ""}</div>
          {onAir && (
            <div className="sb-state">
              <span className="dot-live" /> Live on Fistball Live
              <a className="live-link" href={`${LIVE_URL}?event=${eventId}`} target="_blank" rel="noreferrer">View ↗</a>
            </div>
          )}
        </div>
        <div className="sb-label">Event</div>
        <nav className="sb-nav">
          {items.map((it) => (
            <button key={it.key} className={`navitem ${activeKey === it.key ? "active" : ""}`}
              onClick={() => go(it.key ? `${base}/${it.key}` : base)}>
              <span className="ic"><it.Icon /></span> {it.label}
            </button>
          ))}
        </nav>
        <button className="navitem sb-guide" onClick={() => go("/guide")}>
          <span className="ic"><IconGuide /></span> Guide
        </button>
        <div className="sb-foot">
          <AccountMenu me={me} onSignOut={onSignOut} />
          <div className="sb-who"><div className="who">{me.name}</div><div className="role">{me.admin ? "org-admin" : "member"}</div></div>
        </div>
      </aside>

      <div className="main">
        <header className="appbar">
          <button className="sb-toggle" onClick={() => setOpen(true)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <button className="crumb-link" onClick={() => nav("/")}>Arena</button>
            <span className="sep">›</span>
            <button className="crumb-link" onClick={() => nav("/")}>Events</button>
            <span className="sep">›</span>
            {gameMatch || activeKey === "" ? (
              <span className="crumb-cur">{evName}</span>
            ) : (
              <>
                <button className="crumb-link" onClick={() => nav(base)}>{evName}</button>
                <span className="sep">›</span>
                <span className="crumb-cur">{activeLabel}</span>
              </>
            )}
            {gameMatch && (<><span className="sep">›</span><button className="crumb-link" onClick={() => nav(base)}>Games</button><span className="sep">›</span><span className="crumb-cur">Game report</span></>)}
          </nav>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
