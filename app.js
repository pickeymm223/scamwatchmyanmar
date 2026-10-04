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
  [/kbz\s*pay/i, "logos/kbzpay.png", "KBZPay"],
  [/wave/i, "logos/wavepay.jpg", "WavePay"],
  [/kbz\s*bank/i, "logos/kbzbank.png", "KBZ Bank"],
  [/binance/i, "logos/binance.png", "Binance"],
];
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
  PAY_LOGOS.forEach(([re, logo, name]) => {
    for (const p of seen) {
      if (re.test(p)) { items.push([logo, name]); break; }
    }
  });
  grid.innerHTML = items.map(([logo, name]) =>
    `<div class="pay-logo"><img src="${logo}" alt="${esc(name)}" loading="lazy"></div>`
  ).join("");
}
function fmtLossTotals(byCcy) {
  const parts = Object.entries(byCcy).filter(([, a]) => a > 0)
    .map(([c, a]) => fmtNum(a) + " " + c);
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
  ROWS = rows.filter(r => {
    const st = String(r[C.status] || "").trim().toLowerCase();
    if (IGNORED.has(st)) return false;
    // bot နဲ့ အတူ: ဖုန်း / TG ID / ဘဏ်အကောင့် တခုခု ရှိရင် ထည့်
    return (r[C.phone] || "").trim() !== ""
        || (r[C.tgId] || "").trim() !== ""
        || (r[C.bankAcct] || "").trim() !== "";
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
  const ll = document.getElementById("lossLine");
  if (ll) ll.textContent = t("loss_line").replace("{p}", fmtLossTotals(lossPccy)).replace("{v}", fmtLossTotals(lossVccy));
}


/* ---------- search ---------- */
function findMatches(q) {
  const t = q.trim();
  const digits = t.replace(/\D/g, "");
  const hits = [];
  const ph = normPhone(t);
  if (ph) {
    ROWS.forEach(r => {
      if (rowPhones(r).includes(ph)) hits.push(r);
    });
    return { label: "📱 " + maskPhone(ph), hits };
  }
  if (/^\d{8,}$/.test(digits) && !digits.startsWith("09") && !digits.startsWith("959")) {
    ROWS.forEach(r => {
      if (String(r[C.tgId] || "").trim() === digits) hits.push(r);
    });
    if (hits.length) return { label: "\uD83C\uDD94 " + digits, hits };
    // Binance UID အနေနဲ့ စစ်
    const uhits = [];
    ROWS.forEach(r => {
      if (binanceUids(r[C.othPh]).includes(digits)) uhits.push(r);
    });
    if (uhits.length) return { label: "🟡 Binance UID " + digits, hits: uhits };
    // bank account အနေနဲ့လည်း စစ်
    const bhits = [];
    ROWS.forEach(r => {
      if (bankDigitsList(r[C.bankAcct]).includes(digits)) bhits.push(r);
    });
    if (bhits.length) return { label: "\uD83C\uDFE6 " + maskAcct(digits), hits: bhits };
    return { label: "\uD83C\uDD94 " + digits, hits: [] };
  }
  return null;
}

function renderResult(q) {
  const box = document.getElementById("result");
  const m = findMatches(q);
  if (!m) {
    box.innerHTML = `<div class="rcard warn"><div class="rhead"><span class="badge warn">ℹ️</span></div>
      <p class="rnote">${t("invalid_input")}</p></div>`;
    return;
  }
  // stats beacon: type from label icon, hit/miss only (no query value)
  const st = m.label.startsWith("📱") ? "phone"
    : m.label.startsWith("🆔") ? "tg_id"
    : m.label.includes("Binance UID") ? "binance" : "bank";
  logWebSearch(st, m.hits.length > 0);
  if (!m.hits.length) {
    box.innerHTML = `<div class="rcard ok">
      <div class="rhead"><span class="badge ok">${t("badge_notfound")}</span></div>
      <div class="rtitle">${esc(m.label)}</div>
      <p class="rnote">${t("nf_p1")}</p>
      <p class="rnote">${t("nf_p2")}</p></div>`;
    return;
  }
  // entity အလိုက် စု (bot နဲ့ အတူတူ union-find)
  const ents = m.hits.map(r => ({
    fb: r[C.facebook], name: r[C.name], acc: r[C.accName],
    phones: rowPhones(r), row: r
  }));
  const groups = groupEntities(ents);
  box.innerHTML = groups.map(g => renderGroup(m.label, g.map(i => ents[i].row))).join("");
}

function renderGroup(label, rows) {
  const verified = rows.some(isVerified);
  const names = [...new Set(rows.map(r => r[C.name]).filter(Boolean))];
  const fbs = [...new Set(rows.map(r => r[C.facebook]).filter(Boolean))];
  const phones = [...new Set(rows.flatMap(rowPhones))];
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
  const row = (k, v) => v ? `<div class="rrow"><span class="k">${k}</span><span class="v">${v}</span></div>` : "";
  return `<div class="rcard danger">
    <div class="rhead"><span class="badge danger">${t("badge_verified")}</span></div>
    <div class="rtitle">${esc(label)}</div>
    <div class="rrows">
      ${row(t("lbl_name"), esc(names.join(", ")))}
      ${row(t("lbl_fb"), esc(fbs.join(", ")))}
      ${row(t("lbl_phone"), phones.map(maskPhone).map(esc).join(", "))}
      ${row(t("lbl_tgid"), tgIds.map(esc).join(", "))}
      ${row("🟡 Binance UID", [...new Set(rows.flatMap(r => binanceUids(r[C.othPh])))].map(esc).join(", "))}
      ${row(t("lbl_pay"), payLines.map(esc).join("; "))}
      ${row(t("lbl_type"), esc(types.join(", ")))}
      ${row(t("lbl_loss"), lossStr !== "0 MMK" ? lossStr : "")}
    </div>
    ${descs.map(d => `<div class="story"><b>${t("story_h")}</b><br>${esc(maskPhonesInText(summarize(d)))}</div>`).join("")}
    ${tgUrls.length ? `<a class="readmore" href="${esc(tgUrls[0])}" target="_blank" rel="noopener">${t("readmore")}</a>` : ""}
    <p class="rnote">${t("warn_dont")}</p>
    <p class="rnote">${t("note_label")} ${t("pend_p1")}</p>
    <p class="rnote">${t("pend_p2")}</p>
  </div>`;
}

/* ---------- init ---------- */
document.getElementById("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("q").value;
  document.getElementById("result").innerHTML =
    `<div class="loading"><span class="spinner"></span>${t("loading")}</div>`;
  setTimeout(() => renderResult(q), 1200);
});

loadData().catch(() => {
  document.getElementById("statsBody").innerHTML =
    `<p class="muted">${t("data_error")}</p>`;
});

// page visit beacon (unique user မဟုတ် — page view အရေအတွက်သာ)
logWebStats("visit", "-");
