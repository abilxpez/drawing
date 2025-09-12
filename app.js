// app.js — local MVP with JSON preferred, CSV fallback (same folder)
// Serve with:  python3 -m http.server 8000   then open http://localhost:8000/

const DONE_KEY = "art_prompt_done_v1";

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const pickedEl = $("#picked");
const statusEl = $("#status");
const searchEl = $("#search");
const btnPick = $("#btnPick");

let topics = []; // { id, title, category, done }

init();

async function init() {
  if (location.protocol === "file:") {
    setStatus("Open via a local server (e.g., python -m http.server). file:// cannot fetch.");
    return;
  }

  setStatus("Loading topics…");
  // Try ./topics.json, then ./topics.csv
  const json = await fetchJSON("./topics.json");
  if (Array.isArray(json)) {
    topics = normalizeJSON(json);
    setStatus(`Loaded ${topics.length} topics from topics.json`);
  } else {
    const csv = await fetchText("./topics.csv");
    if (csv == null) {
      setStatus("Error: Neither topics.json nor topics.csv found next to index.html");
      return;
    }
    topics = parseDelimitedToTopics(csv);
    setStatus(`Loaded ${topics.length} topics from topics.csv`);
  }

  loadDone();
  btnPick.addEventListener("click", pickRandom);
  searchEl.addEventListener("input", renderList);

  renderList();
  pickedEl.textContent = 'Click "Pick Drawing" to get a random topic.';
}

/* ---------------- Fetch helpers ---------------- */

async function fetchJSON(path) {
  try {
    const url = cacheBust(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { return null; }
  } catch { return null; }
}

async function fetchText(path) {
  try {
    const url = cacheBust(path);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

function cacheBust(path) {
  const u = new URL(path, location.href);
  u.searchParams.set("_", Date.now());
  return u.toString();
}

/* ---------------- Parsing ---------------- */

function normalizeJSON(arr) {
  return arr.map((t) => {
    const title = (t.title || "").trim();
    const category = (t.category || "").trim();
    const id = t.id || hashId(title + "|" + category);
    return { id, title, category, done: !!t.done };
  });
}

function parseDelimitedToTopics(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  // detect tab vs comma using header line
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delim).map((s) => s.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim);
    // ensure exactly headers.length columns (pad)
    while (cols.length < headers.length) cols.push("");
    for (let c = 0; c < headers.length; c++) {
      const title = (cols[c] || "").trim();
      if (!title) continue;
      const category = headers[c] || "";
      out.push({ id: hashId(title + "|" + category), title, category, done: false });
    }
  }
  return out;
}

function hashId(s) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "t" + (h >>> 0).toString(36);
}

/* ---------------- Persistence ---------------- */

function saveDone() {
  const m = Object.fromEntries(topics.map((t) => [t.id, !!t.done]));
  localStorage.setItem(DONE_KEY, JSON.stringify(m));
}
function loadDone() {
  try {
    const m = JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
    topics.forEach((t) => { if (Object.prototype.hasOwnProperty.call(m, t.id)) t.done = !!m[t.id]; });
  } catch {}
}

/* ---------------- UI ---------------- */

function renderList() {
  const q = (searchEl.value || "").trim().toLowerCase();
  const items = topics.filter((t) =>
    !q ? true : (t.title + " " + (t.category || "")).toLowerCase().includes(q)
  );
  listEl.innerHTML = "";
  items.forEach((t) => {
    const row = document.createElement("div");
    row.className = "item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!t.done;
    cb.addEventListener("change", () => toggleDone(t.id));

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = t.category ? `${t.title} (${t.category})` : t.title;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t.done ? "Mark Not Done" : "Mark Done";
    btn.addEventListener("click", () => toggleDone(t.id));

    row.appendChild(cb);
    row.appendChild(title);
    row.appendChild(btn);
    listEl.appendChild(row);
  });
}

function pickRandom() {
  const pool = topics.filter((t) => !t.done);
  const arr = pool.length ? pool : topics;
  if (!arr.length) { pickedEl.textContent = "No topics available."; return; }
  const t = arr[Math.floor(Math.random() * arr.length)];
  pickedEl.innerHTML = `
    <div><strong>Picked:</strong> ${escapeHTML(t.title)}${
      t.category ? ` <span class="muted">(${escapeHTML(t.category)})</span>` : ""
    }</div>
    <div class="row" style="margin-top:8px">
      <button type="button" onclick="toggleDone('${t.id}')">${
        t.done ? "Mark Not Done" : "Mark Done"
      }</button>
    </div>`;
}

function toggleDone(id) {
  const t = topics.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveDone();
  renderList();
  if (pickedEl.textContent.includes(t.title)) pickRandom();
}

/* ---------------- misc ---------------- */

function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
function escapeHTML(s) {
  return String(s).replace(/[&<>\"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
