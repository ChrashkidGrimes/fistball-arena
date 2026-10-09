// Shirt over shorts, as a tiny two-tone swatch.
export function KitSwatch({ kit, size = 14 }) {
  if (!kit) return null;
  const title = [kit.n && `Uniform ${kit.n}`, kit.shirt && "shirt", kit.shorts && "shorts"].filter(Boolean).join(" · ");
  return (
    <span className="kit-sw" title={title} style={{ width: size, height: size * 1.25 }}>
      <span style={{ background: kit.shirt || "transparent", flex: 3 }} />
      <span style={{ background: kit.shorts || kit.shirt || "transparent", flex: 2 }} />
    </span>
  );
}
