// Marks non-production builds (VITE_STAGE, set by the staging deploy) so
// nobody runs a real tournament on test data by mistake.
const STAGE = import.meta.env.VITE_STAGE || "";

if (STAGE && typeof document !== "undefined") document.title = `[${STAGE.toUpperCase()}] ${document.title}`;

export default function StageBanner() {
  if (!STAGE) return null;
  return (
    <div className="stage-banner" role="status">
      {STAGE.toUpperCase()} — test environment, not the live data
    </div>
  );
}
