import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { subscribeLivePointer } from "./cloud.js";
import AccountMenu from "./AccountMenu.jsx";
import { IconEvents, IconUsers, IconGuide } from "./icons.jsx";

const LIVE_URL = "https://c-englert.github.io/fistball-live/";

// Left-sidebar app shell for the GLOBAL context (outside any event):
// the event list, the users & access area, and the guide.
export default function GlobalShell({ me, onSignOut }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [live, setLive] = useState(null);
  const [open, setOpen] = useState(false); // mobile drawer
  useEffect(() => subscribeLivePointer(setLive), []);
  const go = (to) => { setOpen(false); nav(to); };

  const sub = loc.pathname.replace(/^\//, "").split("/")[0]; // "", "users", "guide"
  const items = [
    { key: "", label: "Events", Icon: IconEvents },
    ...(me.admin ? [{ key: "users", label: "Users & access", Icon: IconUsers }] : []),
    { key: "guide", label: "Guide", Icon: IconGuide },
  ];
  const activeLabel = (items.find((i) => i.key === sub) || {}).label || "";

  return (
    <div className="shell">
      <div className={`sb-scrim ${open ? "show" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sb-brandhead">
          <span className="sb-mark"><img src={import.meta.env.BASE_URL + "ifa-mark.png"} alt="IFA" /></span>
          <div>
            <div className="sb-brandname">Fistball Arena</div>
            <div className="sb-brandsub">Game reports</div>
          </div>
        </div>
        {(live?.events || []).map((e) => (
          <div className="sb-state global" key={e.eventId}>
            <span className="dot-live" /> {e.name || "Event"} live
            <a className="live-link" href={`${LIVE_URL}?event=${e.eventId}`} target="_blank" rel="noreferrer">View ↗</a>
          </div>
        ))}
        <div className="sb-label">Global</div>
        <nav className="sb-nav">
          {items.map((it) => (
            <button key={it.key} className={`navitem ${sub === it.key ? "active" : ""}`}
              onClick={() => go(it.key ? `/${it.key}` : "/")}>
              <span className="ic"><it.Icon /></span> {it.label}
            </button>
          ))}
        </nav>
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
            <button className="crumb-link" onClick={() => go("/")}>Arena</button>
            {sub === "" ? (
              <><span className="sep">›</span><span className="crumb-cur">Events</span></>
            ) : (
              <><span className="sep">›</span><span className="crumb-cur">{activeLabel}</span></>
            )}
          </nav>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
