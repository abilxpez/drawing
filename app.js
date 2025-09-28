// app.js — local MVP with JSON preferred, CSV fallback (same folder)
// Serve with:  python3 -m http.server 8000   then open http://localhost:8000/

const DONE_KEY = "art_prompt_done_v1";

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const pickedEl = $("#picked");
const statusEl = $("#status");
const searchEl = $("#search");
const btnPick = $("#btnPick");

const COMPLETED_KEY = "art_prompt_completed_at_v1";
const filterCategoryEl = $("#filterCategory");
const filterCompletedEl = $("#filterCompleted");

const sortByEl = $("#sortBy");

const USER_TOPICS_KEY = "art_prompt_user_topics_v1";

const newTitleEl = $("#newTitle");
const newCategoryEl = $("#newCategory");
const newCategoryNameEl = $("#newCategoryName");
const btnAddTopicEl = $("#btnAddTopic");

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

    loadProgress();

    // Merge user-added topics from localStorage
    const userTopics = loadUserTopics();
    if (userTopics.length) topics = topics.concat(userTopics);

    // initial filter dropdowns
    populateCategoryFilter(topics);

    // add-topic UI listeners
    if (newCategoryEl) {
        newCategoryEl.addEventListener("change", () => {
            const showNew = newCategoryEl.value === "__new__";
            newCategoryNameEl.style.display = showNew ? "" : "none";
            if (showNew) newCategoryNameEl.focus();
        });
    }
    if (btnAddTopicEl) btnAddTopicEl.addEventListener("click", addTopic);


    btnPick.addEventListener("click", pickRandom);
    searchEl.addEventListener("input", renderList);

    if (filterCategoryEl) filterCategoryEl.addEventListener("change", renderList);
    if (filterCompletedEl) filterCompletedEl.addEventListener("change", renderList);

    if (sortByEl) sortByEl.addEventListener("change", renderList);

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
        return { id, title, category, done: !!t.done, completedAt: t.completedAt || null };
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

function saveProgress() {
    const doneMap = Object.fromEntries(topics.map((t) => [t.id, !!t.done]));
    const whenMap = Object.fromEntries(
        topics.map((t) => [t.id, t.completedAt ? Number(t.completedAt) : null])
    );
    localStorage.setItem(DONE_KEY, JSON.stringify(doneMap));
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(whenMap));
}
function loadProgress() {
    try {
        const doneMap = JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
        const whenMap = JSON.parse(localStorage.getItem(COMPLETED_KEY) || "{}");
        topics.forEach((t) => {
            if (Object.prototype.hasOwnProperty.call(doneMap, t.id)) t.done = !!doneMap[t.id];
            if (Object.prototype.hasOwnProperty.call(whenMap, t.id)) t.completedAt = whenMap[t.id];
        });
    } catch { }
}


/* ---------------- UI ---------------- */

function renderList() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const catFilter = (filterCategoryEl && filterCategoryEl.value) || "";
    const dateFilter = (filterCompletedEl && filterCompletedEl.value) || "";

    // 1) Filter by date window first
    const dateFiltered = topics.filter((t) => {
        if (dateFilter === "today") return t.done && isToday(t.completedAt);
        if (dateFilter === "7") return t.done && withinDays(t.completedAt, 7);
        if (dateFilter === "30") return t.done && withinDays(t.completedAt, 30);
        if (dateFilter === "never") return !t.done || !t.completedAt;
        return true; // All dates
    });

    // 2) Rebuild category options from the date-filtered set
    populateCategoryFilter(dateFiltered);

    // 3) Apply search + category to the already date-filtered set
    const items = dateFiltered.filter((t) => {
        const matchesQ = !q ? true : (t.title + " " + (t.category || "")).toLowerCase().includes(q);
        if (!matchesQ) return false;
        if (catFilter && t.category !== catFilter) return false;
        return true;
    });

    const sorted = sortItems(items);

    // 4) Render
    listEl.innerHTML = "";
    sorted.forEach((t) => {
        const row = document.createElement("div");
        row.className = "item";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!t.done;
        cb.addEventListener("change", () => toggleDone(t.id));

        const title = document.createElement("div");
        title.className = "title";
        title.innerHTML = t.category
            ? `${escapeHTML(t.title)}<div class="tag">${escapeHTML(t.category)}</div>`
            : `${escapeHTML(t.title)}`;

        // NEW: timestamp element (only if done)
        const stamp = document.createElement("div");
        stamp.className = "stamp";
        stamp.textContent = t.done && t.completedAt ? `completed ${formatStamp(t.completedAt)}` : "";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = t.done ? "Mark Not Done" : "Mark Done";
        btn.addEventListener("click", () => toggleDone(t.id));

        row.appendChild(cb);
        row.appendChild(title);
        row.appendChild(stamp); // ← to the right, before the button
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
    <div><strong>Picked:</strong> <span class="picked-title">${escapeHTML(t.title)}</span></div>
    ${t.category ? `<div class="tag">${escapeHTML(t.category)}</div>` : ""}
    <div class="row" style="margin-top:8px">
      <button type="button" onclick="toggleDone('${t.id}')">${t.done ? "Mark Not Done" : "Mark Done"
        }</button>
    </div>`;
}

function toggleDone(id) {
    const t = topics.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null;
    saveProgress();
    renderList();
    if (pickedEl.textContent.includes(t.title)) pickRandom();
}


function withinDays(ts, days) {
    if (!ts) return false;
    const ms = days * 24 * 60 * 60 * 1000;
    return (Date.now() - Number(ts)) <= ms;
}
function isToday(ts) {
    if (!ts) return false;
    const d = new Date(Number(ts));
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
}
function formatStamp(ts) {
    if (!ts) return "";
    const d = new Date(Number(ts));
    // e.g., Sep 27, 9:41 PM
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function populateCategoryFilter(sourceTopics) {
    // For the FILTER select
    if (filterCategoryEl) {
      const prev = filterCategoryEl.value;
      const cats = Array.from(new Set(sourceTopics.map(t => t.category).filter(Boolean))).sort();
      filterCategoryEl.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
      cats.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        filterCategoryEl.appendChild(opt);
      });
      if (prev && cats.includes(prev)) filterCategoryEl.value = prev;
      else filterCategoryEl.value = "";
    }
  
    // For the ADD-TOPIC select
    if (newCategoryEl) {
      const keepNew = newCategoryEl.value === "__new__";
      // Remove all but the first and the last (“+ New category…”) option
      const opts = Array.from(newCategoryEl.querySelectorAll("option"));
      const first = opts[0];
      const last = opts[opts.length - 1]; // assumes it's __new__
      newCategoryEl.innerHTML = "";
      newCategoryEl.appendChild(first);
      const cats = Array.from(new Set(sourceTopics.map(t => t.category).filter(Boolean))).sort();
      cats.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        newCategoryEl.appendChild(opt);
      });
      newCategoryEl.appendChild(last);
      // Restore selection
      newCategoryEl.value = keepNew ? "__new__" : "";
      newCategoryNameEl.style.display = keepNew ? "" : "none";
    }
  }
  
  function addTopic() {
    const title = (newTitleEl?.value || "").trim();
    let categorySel = newCategoryEl?.value || "";
    const newCat = (newCategoryNameEl?.value || "").trim();
  
    if (!title) { alert("Please enter a topic title."); newTitleEl?.focus(); return; }
  
    let category = categorySel === "__new__" ? newCat : categorySel;
    category = (category || "").trim();
  
    if (!category) { alert("Please choose or enter a category."); 
      if (categorySel === "__new__") newCategoryNameEl?.focus(); else newCategoryEl?.focus();
      return;
    }
  
    // Build topic, prevent duplicate (same title+category)
    const id = hashId(title + "|" + category);
    if (topics.some(t => t.id === id)) {
      alert("That topic already exists in this category.");
      return;
    }
  
    const topic = { id, title, category, done: false, completedAt: null };
  
    // Persist to user-topics
    const existing = loadUserTopics();
    existing.push(topic);
    saveUserTopics(existing);
  
    // Append to working set
    topics.push(topic);
  
    // Refresh UI & dropdowns
    populateCategoryFilter(topics);
    renderList();
  
    // Reset inputs
    if (newCategoryEl) newCategoryEl.value = categorySel === "__new__" ? "__new__" : category;
    if (categorySel === "__new__") {
      newCategoryNameEl.value = "";
      newCategoryNameEl.style.display = "none";
      newCategoryEl.value = category; // switch to the newly created category
    }
    newTitleEl.value = "";
    newTitleEl.focus();
  }
  

/* ---------------- misc ---------------- */

function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
function escapeHTML(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}


function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function sortItems(items) {
    const mode = (sortByEl && sortByEl.value) || "date_desc";
    const safeDate = (t) => Number(t?.completedAt || 0); // 0 for not completed

    const arr = items.slice(); // don’t mutate original

    if (mode === "date_desc") {
        // Newest done first; undated (not completed) sink to bottom
        return arr.sort((a, b) => {
            const da = safeDate(a), db = safeDate(b);
            if (da === 0 && db === 0) return cmp(a.title, b.title); // tie-break
            if (da === 0) return 1;
            if (db === 0) return -1;
            return db - da;
        });
    }

    if (mode === "date_asc") {
        // Oldest done first; undated sink to bottom
        return arr.sort((a, b) => {
            const da = safeDate(a), db = safeDate(b);
            if (da === 0 && db === 0) return cmp(a.title, b.title);
            if (da === 0) return 1;
            if (db === 0) return -1;
            return da - db;
        });
    }

    if (mode === "alpha") {
        return arr.sort((a, b) => cmp(a.title.toLowerCase(), b.title.toLowerCase()));
    }

    if (mode === "alpha_desc") {
        return arr.sort((a, b) => cmp(b.title.toLowerCase(), a.title.toLowerCase()));
    }

    if (mode === "category") {
        // Category A→Z, then title
        return arr.sort((a, b) => {
            const ca = (a.category || "").toLowerCase();
            const cb = (b.category || "").toLowerCase();
            const c = cmp(ca, cb);
            return c !== 0 ? c : cmp(a.title.toLowerCase(), b.title.toLowerCase());
        });
    }

    return arr;
}


function loadUserTopics() {
    try {
        const raw = JSON.parse(localStorage.getItem(USER_TOPICS_KEY) || "[]");
        if (Array.isArray(raw)) return raw.map(t => ({
            id: t.id, title: t.title, category: t.category,
            done: !!t.done, completedAt: t.completedAt || null
        }));
    } catch { }
    return [];
}

function saveUserTopics(userTopics) {
    localStorage.setItem(USER_TOPICS_KEY, JSON.stringify(userTopics));
}
