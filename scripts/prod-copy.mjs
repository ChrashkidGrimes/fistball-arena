// Copy the production Firestore data into the local emulators (read-only on
// production). Run via compose, see docs/local-testing.md:
//
//   PROD_READER_KEY=~/.config/fistball-arena/prod-reader.json \
//     podman compose run --rm prod-copy           # export from prod + import
//   podman compose run --rm prod-copy --import-only   # re-import the last copy
//
// Safety:
// - Production is only ever READ: the code below sends nothing but GET and
//   listCollectionIds (a read) to firestore.googleapis.com. All writes go to
//   the emulator (FIRESTORE_EMULATOR_HOST) of a "demo-*" project.
// - Before the first read, the key is checked with testIamPermissions: if it
//   may create, update or delete Firestore documents, the script stops. Give
//   the service account only the "Cloud Datastore Viewer" role.
// - The copy (personal data: names, birthdays, photos) is stored in the
//   prod-copy volume, never in the working tree.
//
// No dependencies: the service-account JWT is signed with node:crypto.

import { createSign } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const KEY_FILE = process.env.PROD_READER_KEY_FILE || "/secrets/prod-reader.json";
const COPY_DIR = process.env.PROD_COPY_DIR || "/copy";
const COPY_FILE = `${COPY_DIR}/firestore.json`;
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_EMU = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const TARGET = process.env.GCLOUD_PROJECT || "demo-fistball";
const IMPORT_ONLY = process.argv.includes("--import-only");
const PROD = "https://firestore.googleapis.com/v1";
const WRITE_PERMISSIONS = ["datastore.entities.create", "datastore.entities.update", "datastore.entities.delete"];

const die = (msg) => { console.error(msg); process.exit(1); };
if (!EMU || !AUTH_EMU) die("Set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST — the copy only goes into the emulators.");
if (!TARGET.startsWith("demo-")) die(`Refusing to import into "${TARGET}" — only demo-* projects.`);

/* ----------------- service-account access token ----------------- */
const b64url = (x) => Buffer.from(x).toString("base64url");
function signedJwt(key, scope, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: key.private_key_id }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope, aud: key.token_uri, iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key, "base64url");
  return `${header}.${claims}.${sig}`;
}
async function accessToken(key) {
  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt(key, "https://www.googleapis.com/auth/cloud-platform") }),
  });
  const body = await res.json();
  if (!res.ok) die(`Could not get an access token: ${res.status} ${JSON.stringify(body)}`);
  return body.access_token;
}

// Stop unless the key is read-only on Firestore.
async function assertReadOnly(project, token) {
  const res = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ permissions: WRITE_PERMISSIONS }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`Could not verify the key's permissions (${res.status}) — stopping to be safe. ${JSON.stringify(body)}`);
  if (body.permissions?.length) die(`This key may WRITE to production (${body.permissions.join(", ")}). Use a service account with only "Cloud Datastore Viewer".`);
}

/* ----------------- export (read-only) ----------------- */
async function exportProd() {
  let key;
  try { key = JSON.parse(readFileSync(KEY_FILE, "utf8")); } catch { key = null; }
  if (!key?.private_key || !key.client_email || !key.token_uri) die("No service-account key. Set PROD_READER_KEY to the key's JSON file (see docs/local-testing.md).");
  const project = process.env.PROD_PROJECT_ID || key.project_id;
  if (project.startsWith("demo-")) die(`"${project}" is not a production project.`);
  const token = await accessToken(key);
  await assertReadOnly(project, token);
  console.log(`Key ${key.client_email} is read-only on ${project}. Reading…`);

  const root = `projects/${project}/databases/(default)/documents`;
  const H = { Authorization: `Bearer ${token}` };
  const get = async (url) => {
    const res = await fetch(url, { headers: H });
    if (!res.ok) die(`GET ${url} → ${res.status} ${await res.text()}`);
    return res.json();
  };
  // listCollectionIds is a read, but the API takes it as POST.
  const collectionIds = async (parent) => {
    const ids = [];
    let pageToken;
    do {
      const res = await fetch(`${PROD}/${parent}:listCollectionIds`, {
        method: "POST", headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ pageSize: 300, pageToken }),
      });
      if (!res.ok) die(`listCollectionIds ${parent} → ${res.status} ${await res.text()}`);
      const body = await res.json();
      ids.push(...(body.collectionIds || []));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return ids;
  };

  const docs = []; // [{ path, fields }], path relative to the documents root
  const walk = async (parentPath) => {
    for (const id of await collectionIds(parentPath ? `${root}/${parentPath}` : root)) {
      const col = parentPath ? `${parentPath}/${id}` : id;
      let pageToken;
      do {
        const q = new URLSearchParams({ pageSize: "300", showMissing: "true" });
        if (pageToken) q.set("pageToken", pageToken);
        const body = await get(`${PROD}/${root}/${col}?${q}`);
        for (const d of body.documents || []) {
          const path = d.name.slice(root.length + 1);
          if (d.fields) docs.push({ path, fields: d.fields }); // "missing" docs only hold subcollections
          await walk(path);
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
    }
  };
  await walk("");
  mkdirSync(COPY_DIR, { recursive: true });
  writeFileSync(COPY_FILE, JSON.stringify({ project, exportedAt: new Date().toISOString(), docs }));
  console.log(`Read ${docs.length} documents from ${project} → ${COPY_FILE}`);
}

/* ----------------- import into the emulator ----------------- */
async function importCopy() {
  if (!existsSync(COPY_FILE)) die(`No copy at ${COPY_FILE} — run without --import-only first.`);
  const { project, exportedAt, docs } = JSON.parse(readFileSync(COPY_FILE, "utf8"));
  const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
  const emuDocs = `projects/${TARGET}/databases/(default)/documents`;
  const call = async (url, init) => {
    const res = await fetch(url, init);
    if (!res.ok) die(`${init?.method || "GET"} ${url} → ${res.status} ${await res.text()}`);
  };
  // Replace everything in the emulators (demo data, accounts) with the copy.
  await call(`http://${EMU}/emulator/v1/projects/${TARGET}/databases/(default)/documents`, { method: "DELETE" });
  await call(`http://${AUTH_EMU}/emulator/v1/projects/${TARGET}/accounts`, { method: "DELETE" });
  // Commit in batches of ≤ 400 writes / ~4 MB (logos are data URLs).
  let batch = [], bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    await call(`http://${EMU}/v1/${emuDocs}:commit`, { method: "POST", headers: OWNER, body: JSON.stringify({ writes: batch }) });
    batch = []; bytes = 0;
  };
  // Document references point into the source project; repoint them.
  const srcDocs = `projects/${project}/databases/(default)/documents`;
  const repoint = (v) => {
    if (Array.isArray(v)) return v.map(repoint);
    if (!v || typeof v !== "object") return v;
    if (typeof v.referenceValue === "string") return { referenceValue: v.referenceValue.replace(srcDocs, emuDocs) };
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, repoint(x)]));
  };
  for (const d of docs) {
    const w = { update: { name: `${emuDocs}/${d.path}`, fields: repoint(d.fields) } };
    const size = JSON.stringify(w).length;
    if (batch.length >= 400 || bytes + size > 4e6) await flush();
    batch.push(w); bytes += size;
  }
  await flush();
  console.log(`Imported ${docs.length} documents (copy of ${project}, ${exportedAt}) into the ${TARGET} emulator.`);
  console.log("Sign in with your usual email in the emulator's account chooser — roles come from the copied data.");
}

if (!IMPORT_ONLY) await exportProd();
await importCopy();
