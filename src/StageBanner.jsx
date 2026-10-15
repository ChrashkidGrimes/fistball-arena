// Marks non-production builds (VITE_STAGE, set by the staging deploy) so
// nobody runs a real tournament on test data by mistake.
const STAGE = import.meta.env.VITE_STAGE || "";

if (STAGE && typeof document !== "undefined") document.title = `[${STAGE.toUpperCase()}] ${document.title}`;

// Inline styles: the badge is self-contained (no styles.css entry).
const STYLE = {
  position: "fixed", left: "50%", bottom: 10, transform: "translateX(-50%)", zIndex: 10000,
  background: "#e8590c", color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: ".04em",
  padding: "5px 14px", borderRadius: 999, boxShadow: "0 2px 8px rgba(0, 0, 0, .25)",
  pointerEvents: "none", whiteSpace: "nowrap",
};

export default function StageBanner() {
  if (!STAGE) return null;
  return (
    <div className="stage-banner" role="status" style={STYLE}>
      {STAGE.toUpperCase()} — test environment, not the live data
    </div>
  );
}
