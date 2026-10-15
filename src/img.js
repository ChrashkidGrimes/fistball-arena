// Turn an uploaded image File into a small PNG data URL (keeps transparency,
// which logos usually need; PNG also works in the PDF). Downscaled — further
// if a detailed logo is still too big — so the Firestore doc stays well under
// its 1 MB limit (a too-large write fails on the server, not in the browser).
const MAX_DATA_URL = 700_000;

export function fileToLogoDataUrl(file, max = 420) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) { reject(new Error("Not an image file — use PNG, JPG or SVG.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // SVGs without width/height report 0 — draw them at the target size.
      const iw = img.naturalWidth || img.width || max, ih = img.naturalHeight || img.height || max;
      try {
        for (const size of [max, 320, 240, 180, 120]) {
          const scale = Math.min(1, size / Math.max(iw, ih));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(iw * scale));
          c.height = Math.max(1, Math.round(ih * scale));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const data = c.toDataURL("image/png");
          if (data.length <= MAX_DATA_URL) { URL.revokeObjectURL(url); resolve(data); return; }
        }
        URL.revokeObjectURL(url);
        reject(new Error("This image is too detailed to store even when shrunk — try a simpler PNG."));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image — use PNG, JPG or SVG.")); };
    img.src = url;
  });
}
