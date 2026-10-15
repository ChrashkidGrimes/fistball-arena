// The jersey as a small swatch: one stripe per colour.
export function KitSwatch({ kit, size = 14 }) {
  if (!kit?.colors?.length) return null;
  return (
    <span className="kit-sw" title={kit.n ? `Uniform ${kit.n}` : "Jersey"} style={{ width: size, height: size * 1.15 }}>
      {kit.colors.map((c, i) => <span key={i} style={{ background: c }} />)}
    </span>
  );
}
