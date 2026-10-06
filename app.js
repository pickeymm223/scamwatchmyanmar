/* ScamWatch Myanmar — web checker (GitHub Pages, static) */
const CSV_URL = "https://docs.google.com/spreadsheets/d/1odYBdPi93Tt3oydiQquhyoTRzaeao0hyIoMv7Luv6xE/export?format=csv&gid=1156714479";

/* Web search stats beacon (admin only viewing via bot /admin).
   WEB_STATS_URL = Google Apps Script web app URL; empty = disabled.
   Only logs search type + hit/miss — never the query value. */
const WEB_STATS_URL = "";
function logWebStats(type, result) {
  if (!WEB_STATS_URL) return;
  try {
    fetch(WEB_STATS_URL, {
      method: "POST", mode: "no-cors",
      headers: {"Content-Type": "text/plain"},
      body: JSON.stringify({type: type, result: result})
    });
  } catch (e) {}
}
function logWebSearch(type, hit) { logWebStats(type, hit ? "hit" : "miss"); }

// Column indexes (Google Form → Sheet)
// Column indexes resolved from CSV header row (robust against new Form questions).
// Falls back to legacy hardcoded positions if a header is missing.
const C = {
  phone: 2, name: 3, facebook: 4, telegram: 5,
  scamType: 6, payType: 7, accName: 8, bankAcct: 9,
  story: 10, loss: 12, viber: 17, otherPhones: 20, tgId: 21, status: 22, tgUrl: 23,
  ccy: 24
};
const HDR_MAP = [
  ["phone", ["ဖုန်း"]],
  ["name", ["နာမည်"]],
  ["facebook", ["Facebook"]],
  ["telegram", ["Telegram"]],
  ["scamType", ["လိမ်နည်းအမျိုးအစား"]],
  ["payType", ["ငွေပေးချေမှုအမျိုးအစား"]],
  ["accName", ["လက်ခံသူအကောင့်နာမည်"]],
  ["bankAcct", ["ဘဏ်အကောင့်"]],
  ["bankAcctPl", ["ဘဏ်အကောင့်များ"]],
  ["story", ["ဖြစ်စဉ်"]],
  ["loss", ["ဆုံးရှုံးငွေ"]],
  ["viber", ["Viber"]],
  ["otherPhones", ["📱 အခြားဖုန်းနံပါတ်များ"]],
  ["tgId", ["🆔 Telegram ID"]],
  ["status", ["status"]],
  ["tgUrl", ["Telegraph"]],
  ["ccy", ["ငွေကြေးအမျိုးအစား", "Currency"]],
  ["othPh", ["📱 အခြားဖုန်းနံပါတ်များ"]],
  ["payOther", ["✏️ အခြား — ငွေပေးချေမှုအမျိုးအစား"]],
  ["gameId", ["Game ID", "ဂိမ်း ID", "GameID", "🎮 Game ID"]],
  ["socialEx", ["Social Media  & Exchange"]],
  ["payDetail", ["ငွေပေးချေမှုအသေးစိတ်", "Pay အမျိုးစား"]],
];
function resolveColumns(hdr) {
  const clean = hdr.map(h => String(h || "").trim());
  HDR_MAP.forEach(([key, names]) => {
    for (const n of names) {
      const i = clean.indexOf(n);
      if (i >= 0) { C[key] = i; break; }
    }
  });
}
function normCcy(v) {
  // data-driven: any 3-letter code — no code change needed for new currencies
  const u = String(v || "").trim().toUpperCase();
  const m = u.match(/\b([A-Z]{3,4})\b/);
  if (m) return m[1];
  if (u === "$") return "USD";
  if (u === "฿" || u.includes("BAHT")) return "THB";
  return "MMK";
}
/* Payment logos — data-driven: only shows logos for payment types in the reports */
const PAY_LOGOS = [
  [/kbz\s*pay/i, "kbzpay", "KBZPay"],
  [/wave/i, "wavepay", "WavePay"],
  [/kbz\s*bank/i, "kbzbank", "KBZ Bank"],
  [/binance/i, "binance", "Binance"],
];
function payLogo(key) { return (typeof LOGO_DATA !== "undefined" && LOGO_DATA[key]) || ""; }
function renderPayLogos() {
  const grid = document.getElementById("payGrid");
  if (!grid) return;
  const seen = new Set();
  ROWS.forEach(r => {
    String(r[C.payType] || "").split(",").forEach(p => {
      p = p.trim();
      if (p && p !== "အခြား") seen.add(p);
    });
    const po = String(r[C.payOther] || "").trim();
    if (po) seen.add(po);
  });
  const items = [];
  PAY_LOGOS.forEach(([re, key, name]) => {
    for (const p of seen) {
      if (re.test(p)) { items.push([payLogo(key), name]); break; }
    }
  });
  grid.innerHTML = items.map(([logo, name]) =>
    `<div class="pay-logo"><img src="${logo}" alt="${esc(name)}" loading="lazy"></div>`
  ).join("");
}
/* Payment scam statistics — ranked by report count, with logos */
function renderPayStats() {
  const el = document.getElementById("payStats");
  if (!el) return;
  const counts = {};
  ROWS.forEach(r => {
    String(r[C.payType] || "").split(",").forEach(p => {
      p = p.trim();
      if (p && p !== "အခြား") counts[p] = (counts[p] || 0) + 1;
    });
    const po = String(r[C.payOther] || "").trim();
    if (po) counts[po] = (counts[po] || 0) + 1;
  });
  // match to known logos
  const ranked = [];
  PAY_LOGOS.forEach(([re, key, name]) => {
    let n = 0;
    for (const p in counts) { if (re.test(p)) n += counts[p]; }
    if (n > 0) ranked.push([payLogo(key), name, n]);
  });
  // unknown payment types without logos
  for (const p in counts) {
    if (!PAY_LOGOS.some(([re]) => re.test(p))) ranked.push(["", p, counts[p]]);
  }
  ranked.sort((a, b) => b[2] - a[2]);
  const max = ranked.length ? ranked[0][2] : 1;
  el.innerHTML = ranked.map(([logo, name, n], i) => {
    const pct = Math.round(n / max * 100);
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const img = logo ? `<img src="${logo}" alt="${esc(name)}" loading="lazy">` : `<span class="pay-name">${esc(name)}</span>`;
    return `<div class="paystat-row">
      <span class="paystat-medal">${medal}</span>
      <span class="paystat-logo">${img}</span>
      <div class="paystat-mid">
        <div class="paystat-name">${esc(name)}</div>
        <div class="paystat-bar-wrap"><div class="paystat-bar" style="width:${pct}%"></div></div>
      </div>
      <span class="paystat-count">${n}</span>
    </div>`;
  }).join("") || `<p class="muted">${t("no_data")}</p>`;
}
function fmtCompact(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, "") + "K";
  return String(Math.round(n));
}
function fmtLossTotals(byCcy) {
  const parts = Object.entries(byCcy).filter(([, a]) => a > 0)
    .map(([c, a]) => fmtCompact(a) + " " + c);
  return parts.length ? parts.join(" · ") : "0 MMK";
}

let ROWS = [];
const IGNORED = new Set(["merged", "duplicate", "rejected"]);

/* ---------- CSV parse (quoted fields, embedded newlines) ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ""; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/* ---------- phone utils (bot နဲ့ အတူတူ) ---------- */
function normPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("959")) d = "09" + d.slice(3);
  else if (d.startsWith("95") && d.length >= 11) d = "0" + d.slice(2);
  return /^09\d{7,9}$/.test(d) ? d : null;
}
function maskPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (/^09\d{7,9}$/.test(d)) return d.slice(0, 3) + "*******" + d.slice(-1);
  if (/^959\d{7,9}$/.test(d)) return d.slice(0, 4) + "*******" + d.slice(-1);
  return d.length > 4 ? d.slice(0, 2) + "*******" + d.slice(-1) : p;
}
function maskPhonesInText(t) {
  return String(t || "").replace(/\+?9?5?9\d{7,9}|09\d{7,9}/g, m => maskPhone(m));
}
function maskAcct(a) {
  const d = String(a || "").replace(/\s/g, "");
  if (d.length >= 6) return d.slice(0, 4) + "****" + d.slice(-2);
  return a;
}
function binanceUids(b) {
  const out = [];
  const re = /(\d{6,12})\s*\(\s*binance\s*\)/gi;
  let m;
  while ((m = re.exec(String(b || "")))) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
function bankDigitsList(b) {
  const out = [];
  (String(b || "").match(/\d[\d\s\-]*\d/g) || []).forEach(x => {
    const d = x.replace(/\D/g, "");
    if (d.length >= 8 && !out.includes(d)) out.push(d);
  });
  return out;
}
function summarize(t, per) {
  t = String(t || "");
  per = per || 220;
  if (t.length <= per) return t;
  const cut = t.slice(0, per);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut) + "\u2026";
}
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtNum(n) {
  n = parseFloat(String(n || "").replace(/[^\d.]/g, "")) || 0;
  return n.toLocaleString("en-US");
}

/* ---------- data ---------- */
function rowPhones(r) {
  const out = [];
  [r[C.phone], r[C.viber]].forEach(p => {
    const n = normPhone(p);
    if (n) out.push(n);
  });
  String(r[C.otherPhones] || "").split(/[,;\n]/).forEach(p => {
    const n = normPhone(p);
    if (n && !out.includes(n)) out.push(n);
  });
  return out;
}

async function loadData() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const text = await res.text();
  const parsed = parseCSV(text);
  resolveColumns(parsed[0] || []);
  const rows = parsed.slice(1); // header ဖြုတ်
  ROWS = rows.map((r, idx) => {
    r._sheetRow = idx + 2; // original sheet row number (1-indexed + header)
    return r;
  }).filter(r => {
    const st = String(r[C.status] || "").trim().toLowerCase();
    if (IGNORED.has(st)) return false;
    // bot နဲ့ အတူ: ဖုန်း / TG ID / ဘဏ်အကောင့် တခုခု ရှိရင် ထည့်
    return (r[C.phone] || "").trim() !== ""
        || (r[C.tgId] || "").trim() !== ""
        || (r[C.bankAcct] || "").trim() !== ""
        || (r[C.bankAcctPl] || "").trim() !== "";
  });
  renderStats();
}

function normText(t) {
  return String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function groupEntities(ents) {
  // ents: [{fb, name, acc, phones:[]}] → index group များ (union-find)
  const parent = ents.map((_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const keyToIdx = {};
  ents.forEach((r, idx) => {
    const keys = new Set();
    [["facebook", r.fb], ["name", r.name], ["acc_name", r.acc]].forEach(([fld, val]) => {
      const v = normText(val);
      if (v.length >= 2) keys.add(fld + ":" + v);
    });
    (r.phones || []).forEach(ph => keys.add("phone:" + ph));
    keys.forEach(k => {
      if (k in keyToIdx) { const ra = find(idx), rb = find(keyToIdx[k]); if (ra !== rb) parent[rb] = ra; }
      else keyToIdx[k] = idx;
    });
  });
  const groups = {};
  ents.forEach((_, idx) => {
    const root = find(idx);
    (groups[root] = groups[root] || []).push(idx);
  });
  return Object.values(groups);
}
function isVerified(r) {
  return String(r[C.status] || "").trim().toLowerCase() === "verified";
}

function renderStats() {
  const ents = ROWS.map(r => ({
    fb: r[C.facebook], name: r[C.name], acc: r[C.accName],
    phones: rowPhones(r), verified: isVerified(r),
    loss: parseFloat(String(r[C.loss]).replace(/[^\d.]/g, "")) || 0,
    ccy: normCcy(r[C.ccy])
  }));
  const groups = groupEntities(ents);
  const total = groups.length;
  const verCount = groups.filter(g => g.some(i => ents[i].verified)).length;
  const pend = total - verCount;
  const sumCcy = list => {
    const o = {};
    list.forEach(e => { const c = e.ccy || "MMK"; o[c] = (o[c] || 0) + e.loss; });
    return o;
  };
  const lossVccy = sumCcy(ents.filter(e => e.verified));
  const lossPccy = sumCcy(ents.filter(e => !e.verified));
  const cards = [
    [total, t("stat_reports")],
    [verCount, t("stat_verified")],
    [pend, t("stat_pending")],
    [fmtLossTotals(lossVccy), t("stat_loss")],
  ];
  document.getElementById("statsBody").innerHTML = cards.map(([n, l]) =>
    `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`
  ).join("");
  renderPayLogos();
  renderPayStats();
  const ll = document.getElementById("lossLine");
  if (ll) ll.textContent = t("loss_line").replace("{p}", fmtLossTotals(lossPccy)).replace("{v}", fmtLossTotals(lossVccy));
}


/* ---------- search ---------- */
/* Global Search — field အကုန် တစ်ခါတည်း ရှာ.
   Returns: [{label, hits, fkey}, ...] (may include not-found entries with hits=[]) */
function normTxt(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function globalSearch(q) {
  const t = q.trim();
  if (!t) return null;
  const results = [];
  const seen = new Set();
  const notFound = [];
  const addHits = (label, hits, fkey) => {
    const fresh = hits.filter(r => !seen.has(r));
    fresh.forEach(r => seen.add(r));
    if (fresh.length) results.push({ label, hits: fresh, fkey });
  };

  // --- 1. Phone (exact) ---
  const ph = normPhone(t);
  const phoneDigits = ph ? ph.replace(/\D/g, "") : "";
  if (ph) {
    const hits = [];
    ROWS.forEach(r => { if (rowPhones(r).includes(ph)) hits.push(r); });
    if (hits.length) addHits("📱 " + maskPhone(ph), hits, "phone");
    else notFound.push({ label: "📱 " + maskPhone(ph), fkey: "phone" });
  }

  // --- 2. Numeric: tg_id / binance / bank (exact) ---
  const matchedIds = new Set();
  const tidMs = t.match(/(?<!\d)(\d{8,12})(?!\d)/g) || [];
  tidMs.forEach(tid => {
    if (tid === phoneDigits || tid.startsWith("09")) return;
    let hits = [];
    ROWS.forEach(r => { if (String(r[C.tgId] || "").trim() === tid) hits.push(r); });
    if (hits.length) { addHits("🆔 " + tid, hits, "tg_id"); matchedIds.add(tid); return; }
    hits = [];
    ROWS.forEach(r => { if (binanceUids(r[C.othPh]).includes(tid)) hits.push(r); });
    if (hits.length) { addHits("🟡 Binance UID " + tid, hits, "binance"); matchedIds.add(tid); return; }
    hits = [];
    ROWS.forEach(r => { if (String(r[C.gameId] || "").trim() === tid) hits.push(r); });
    if (hits.length) { addHits("🎮 Game ID " + tid, hits, "game_id"); matchedIds.add(tid); return; }
    if (tid.length >= 10) {
      hits = [];
      ROWS.forEach(r => { if (bankDigitsList(r[C.bankAcct]).includes(tid)) hits.push(r); });
      if (hits.length) { addHits("🏦 " + maskAcct(tid), hits, "bank"); matchedIds.add(tid); return; }
      notFound.push({ label: "🏦 " + maskAcct(tid), fkey: "bank" });
    } else {
      notFound.push({ label: "🆔 " + tid, fkey: "tg_id" });
    }
  });
  // bank with separators
  const bankMs = t.match(/(?<!\d)(\d[\d\s\-]{8,20}\d)(?!\d)/g) || [];
  bankMs.forEach(bm => {
    const d = bm.replace(/\D/g, "");
    if (d === phoneDigits || d.length < 10 || matchedIds.has(d)) return;
    const hits = [];
    ROWS.forEach(r => { if (bankDigitsList(r[C.bankAcct]).includes(d)) hits.push(r); });
    if (hits.length) { addHits("🏦 " + maskAcct(d), hits, "bank"); matchedIds.add(d); }
    else notFound.push({ label: "🏦 " + maskAcct(d), fkey: "bank" });
  });

  // --- 3. Telegram username (exact) ---
  const atMs = t.match(/@(\w{3,})/g) || [];
  atMs.forEach(am => {
    const u = am.slice(1).toLowerCase();
    const hits = [];
    ROWS.forEach(r => {
      if (String(r[C.telegram] || "").toLowerCase().replace(/^@/, "") === u) hits.push(r);
    });
    if (hits.length) addHits("✈️ @" + u, hits, "username");
    else notFound.push({ label: "✈️ @" + u, fkey: "username" });
  });

  // --- 4. Names: exact → similar (max 5) ---
  if (!/\d{4,}/.test(t) && t.length >= 2) {
    const nq = normTxt(t.replace(/^@/, ""));
    const fields = [["name", "👤"], ["accName", "💳"], ["facebook", "📘"], ["telegram", "✈️"]];
    // exact
    const byField = {};
    ROWS.forEach(r => {
      if (seen.has(r)) return;
      for (const [f, icon] of fields) {
        if (normTxt(r[C[f]]) === nq && nq) { (byField[f] = byField[f] || []).push(r); break; }
      }
    });
    for (const [f, icon] of fields) {
      if (byField[f]) addHits(icon + " " + t.slice(0, 40), byField[f], f);
    }
    // similar if no exact
    if (!Object.keys(byField).length && nq.length >= 3) {
      const sim = {};
      ROWS.forEach(r => {
        if (seen.has(r) || Object.values(sim).flat().length >= 5) return;
        for (const [f] of fields) {
          if (normTxt(r[C[f]]).includes(nq)) { (sim[f] = sim[f] || []).push(r); break; }
        }
      });
      for (const [f, icon] of fields) {
        if (sim[f]) {
          const fresh = sim[f].filter(r => !seen.has(r));
          fresh.forEach(r => seen.add(r));
          if (fresh.length) results.push({ label: icon + " ~" + t.slice(0, 40), hits: fresh, fkey: f + "_similar" });
        }
      }
    }
  }

  notFound.forEach(nf => results.push({ label: nf.label, hits: [], fkey: nf.fkey }));
  return results.length ? results : null;
}
function findMatches(q) {
  const rs = globalSearch(q);
  if (!rs) return null;
  // backward compat: return first result as {label, hits}
  return rs[0];
}

function renderResult(q) {
  const box = document.getElementById("result");
  const rs = globalSearch(q);
  if (!rs) {
    box.innerHTML = `<div class="rcard warn"><div class="rhead"><span class="badge warn">ℹ️</span></div>
      <p class="rnote">${t("invalid_input")}</p></div>`;
    return;
  }
  // stats beacon: first hit type, hit/miss only (no query value)
  const first = rs.find(r => r.hits.length) || rs[0];
  const st = first.label.startsWith("📱") ? "phone"
    : first.label.startsWith("🆔") ? "tg_id"
    : first.label.includes("Binance UID") ? "binance"
    : first.label.startsWith("✈️") ? "username"
    : first.label.startsWith("📘") ? "facebook" : "bank";
  logWebSearch(st, rs.some(r => r.hits.length));
  const cards = [];
  for (const m of rs) {
    if (!m.hits.length) {
      cards.push(`<div class="rcard ok">
        <div class="rhead"><span class="badge ok">${t("badge_notfound")}</span></div>
        <div class="rtitle">${esc(m.label)}</div>
        <p class="rnote">${t("nf_p1")}</p>
        <p class="rnote">${t("nf_p2")}</p></div>`);
      continue;
    }
    // entity အလိုက် စု (bot နဲ့ အတူတူ union-find)
    const ents = m.hits.map(r => ({
      fb: r[C.facebook], name: r[C.name], acc: r[C.accName],
      phones: rowPhones(r), row: r
    }));
    const groups = groupEntities(ents);
    const similar = m.fkey.endsWith("_similar");
    cards.push(groups.map(g => renderGroup(m.label, g.map(i => ents[i].row), similar)).join(""));
  }
  const hasSimilar = rs.some(r => r.fkey.endsWith("_similar") && r.hits.length);
  box.innerHTML = cards.join("") + (hasSimilar ? `<p class="rnote"><i>💡 ${t("similar_note")}</i></p>` : "");
}

function renderGroup(label, rows, similar) {
  const verified = rows.some(isVerified);
  const names = [...new Set(rows.map(r => r[C.name]).filter(Boolean))];
  const fbs = [...new Set(rows.map(r => r[C.facebook]).filter(Boolean))];
  const phones = [...new Set(rows.flatMap(rowPhones))];
  // Parse structured social/payment fields
  function parseStructured(text) {
    const out = {};
    String(text || "").split("\n").forEach(line => {
      const m = line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/);
      if (m && m[1].trim() && m[2].trim()) {
        const k = m[1].trim();
        (out[k] = out[k] || []).push(m[2].trim());
      }
    });
    return out;
  }
  const socialAll = {};
  const payAll = {};
  rows.forEach(r => {
    const s = parseStructured(r[C.socialEx]);
    for (const [k, v] of Object.entries(s)) (socialAll[k] = socialAll[k] || []).push(...v);
    const p = parseStructured(r[C.payDetail]);
    for (const [k, v] of Object.entries(p)) (payAll[k] = payAll[k] || []).push(...v);
  });
  const payLines = [...new Set(rows.map(r => {
    const acc = (r[C.accName] || "").trim(), pt = (r[C.payType] || "").trim();
    return acc ? `${acc}${pt ? " (" + pt + ")" : ""}` : "";
  }).filter(Boolean))];
  const lossByCcy = {};
  rows.forEach(r => {
    const c = normCcy(r[C.ccy]);
    lossByCcy[c] = (lossByCcy[c] || 0) + (parseFloat(String(r[C.loss]).replace(/[^\d.]/g, "")) || 0);
  });
  const lossStr = fmtLossTotals(lossByCcy);
  const types = [...new Set(rows.map(r => r[C.scamType]).filter(Boolean))];
  const tgIds = [...new Set(rows.map(r => String(r[C.tgId] || "").trim()).filter(Boolean))];

  if (!verified) {
    return `<div class="rcard warn">
      <div class="rhead"><span class="badge warn">${t("badge_pending")}</span></div>
      <div class="rtitle">${esc(label)}</div>
      <p class="rnote">${t("pend_p1")}</p>
      <p class="rnote">${t("pend_p2")}</p></div>`;
  }
  const descs = [...new Set(rows.map(r => r[C.story]).filter(Boolean))];
  const tgUrls = [...new Set(rows.map(r => (r[C.tgUrl] || "").trim()).filter(Boolean))];
  // Website record page link (preferred over Telegraph)
  const sheetRows = [...new Set(rows.map(r => r._sheetRow).filter(Boolean))];
  const recordLink = sheetRows.length ? `/r/${sheetRows[0]}.html` : (tgUrls.length ? tgUrls[0] : "");
  const row = (k, v) => v ? `<div class="rrow"><span class="k">${k}</span><span class="v">${v}</span></div>` : "";
  const platIcons = { Facebook: "📘", Telegram: "✈️", Viber: "📞", Binance: "🟡", Bitget: "🔵" };
  const socialRows = Object.entries(socialAll).map(([plat, vals]) =>
    row(`${platIcons[plat] || "🔗"} ${plat}`, [...new Set(vals)].map(esc).join(", "))).join("");
  const payRows = Object.entries(payAll).map(([method, accts]) =>
    row(`💳 ${esc(method)}`, [...new Set(accts)].map(a =>
      /\d{7,}/.test(a) ? esc(a.replace(/(\d{3})\d+(\d{2})/, "$1******$2")) : esc(a)
    ).join("; "))).join("");
  return `<div class="rcard danger">
    <div class="rhead"><span class="badge danger">${t("badge_verified")}</span></div>
    <div class="rtitle">${esc(label)}</div>
    <div class="rrows">
      ${row(t("lbl_name"), esc(names.join(", ")))}
      ${socialRows || row(t("lbl_fb"), esc(fbs.join(", ")))}
      ${row(t("lbl_phone"), phones.map(maskPhone).map(esc).join(", "))}
      ${row(t("lbl_tgid"), tgIds.map(esc).join(", "))}
      ${row("🟡 Binance UID", [...new Set(rows.flatMap(r => binanceUids(r[C.othPh])))].map(esc).join(", "))}
      ${payRows || row(t("lbl_pay"), payLines.map(esc).join("; "))}
      ${row(t("lbl_type"), esc(types.join(", ")))}
      ${row(t("lbl_loss"), lossStr !== "0 MMK" ? lossStr : "")}
    </div>
    ${descs.map(d => `<div class="story"><b>${t("story_h")}</b><br>${esc(maskPhonesInText(summarize(d)))}</div>`).join("")}
    ${recordLink ? `<a class="readmore" href="${esc(recordLink)}" target="_blank" rel="noopener">${t("readmore")}</a>` : ""}
    <p class="rnote">${t("warn_dont")}</p>
    <p class="rnote">${t("note_label")} ${t("pend_p1")}</p>
    <p class="rnote">${t("pend_p2")}</p>
  </div>`;
}

/* ---------- FB alerts ---------- */
async function loadFbAlerts() {
  const el = document.getElementById("fbList");
  if (!el) return;
  try {
    const r = await fetch("fb_alerts.json?v=" + Date.now());
    if (!r.ok) throw 0;
    const d = await r.json();
    const alerts = d.alerts || [];
    if (!alerts.length) {
      el.innerHTML = `<p class="muted">${t("no_data")}</p>`;
      return;
    }
    el.innerHTML = alerts.slice().reverse().map(a => `
      <div class="fb-item">
        <div class="fb-meta">📡 ${esc(a.group)} · 🕐 ${esc(a.time || "")}</div>
        ${a.phones && a.phones.length ? `<div class="fb-meta">📱 ${a.phones.map(esc).join(", ")}</div>` : ""}
        <div class="fb-preview">${esc(a.preview)}</div>
        <a class="fb-link" href="${esc(a.url)}" target="_blank" rel="noopener">🔗 ${t("fb_view")}</a>
      </div>`).join("")
      + `<p class="rnote">⚠️ ${t("fb_unverified")}</p>`;
  } catch (e) {
    el.innerHTML = `<p class="muted">${t("no_data")}</p>`;
  }
}

/* ---------- search chips ---------- */
document.querySelectorAll(".chip").forEach(c =>
  c.addEventListener("click", () => {
    const q = document.getElementById("q");
    if (q) { q.value = c.dataset.ex; q.focus(); renderResult(c.dataset.ex); q.scrollIntoView({behavior:"smooth", block:"center"}); }
  }));

/* ---------- hamburger ---------- */
document.getElementById("menubtn")?.addEventListener("click", () => {
  document.getElementById("mainNav")?.classList.toggle("open");
});
document.querySelectorAll("#mainNav a").forEach(a =>
  a.addEventListener("click", () => document.getElementById("mainNav")?.classList.remove("open")));

/* ---------- init ---------- */
document.getElementById("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("q").value;
  document.getElementById("result").innerHTML =
    `<div class="loading"><span class="spinner"></span>${t("loading")}</div>`;
  setTimeout(() => renderResult(q), 1200);
});

loadFbAlerts();
loadData().catch(() => {
  document.getElementById("statsBody").innerHTML =
    `<p class="muted">${t("data_error")}</p>`;
});

// page visit beacon (unique user မဟုတ် — page view အရေအတွက်သာ)
logWebStats("visit", "-");

// Auto-show record from ?r= URL param (opaque row ID from bots)
(function() {
  const params = new URLSearchParams(window.location.search);
  const r = params.get("r");
  const q = params.get("q");
  if (r) {
    // Find record by sheet row number and display directly
    const tryShow = () => {
      if (typeof ROWS !== "undefined" && ROWS.length) {
        const rowNum = parseInt(r, 10);
        const rec = ROWS.find(x => x._sheetRow === rowNum);
        if (rec) {
          const label = rec[C.phone] || rec[C.name] || rec[C.facebook] || "Record";
          document.getElementById("result").innerHTML = renderGroup(label, [rec], false);
          document.getElementById("result").scrollIntoView({ behavior: "smooth" });
        } else {
          document.getElementById("result").innerHTML =
            `<p class="muted">Record မတွေ့ပါ</p>`;
        }
      } else {
        setTimeout(tryShow, 500);
      }
    };
    setTimeout(tryShow, 1500);
  } else if (q) {
    const input = document.getElementById("q");
    if (input) {
      input.value = q;
      const trySearch = () => {
        if (typeof renderResult === "function") {
          document.getElementById("result").innerHTML =
            `<div class="loading"><span class="spinner"></span>${t("loading")}</div>`;
          setTimeout(() => renderResult(q), 800);
        } else {
          setTimeout(trySearch, 500);
        }
      };
      setTimeout(trySearch, 1500);
    }
  }
})();
