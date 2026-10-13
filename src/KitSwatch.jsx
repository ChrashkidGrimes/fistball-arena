// A uniform's shirt colour as a tiny swatch (shorts don't matter).
export function KitSwatch({ kit, size = 14 }) {
  if (!kit?.shirt) return null;
  return <span className="kit-sw" title={kit.n ? `Uniform ${kit.n}` : "Shirt"} style={{ width: size, height: size, background: kit.shirt }} />;
}
