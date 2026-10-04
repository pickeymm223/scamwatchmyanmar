/* ScamWatch Myanmar — web checker (GitHub Pages, static) */
const CSV_URL = "https://docs.google.com/spreadsheets/d/1odYBdPi93Tt3oydiQquhyoTRzaeao0hyIoMv7Luv6xE/export?format=csv&gid=1156714479";

// Column indexes (Google Form → Sheet)
const C = {
  phone: 2, name: 3, facebook: 4, telegram: 5,
  scamType: 6, payType: 7, accName: 8, bankAcct: 9,
  story: 10, loss: 12, viber: 17, otherPhones: 20, tgId: 21, status: 22, tgUrl: 23
};

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
  const rows = parseCSV(text).slice(1); // header ဖြုတ်
  ROWS = rows.filter(r => {
    const st = String(r[C.status] || "").trim().toLowerCase();
    if (IGNORED.has(st)) return false;
    return (r[C.phone] || "").trim() !== "" || (r[C.tgId] || "").trim() !== "";
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
    loss: parseFloat(String(r[C.loss]).replace(/[^\d.]/g, "")) || 0
  }));
  const groups = groupEntities(ents);
  const total = groups.length;
  const verCount = groups.filter(g => g.some(i => ents[i].verified)).length;
  const pend = total - verCount;
  const lossV = ents.filter(e => e.verified).reduce((s, e) => s + e.loss, 0);
  const lossP = ents.reduce((s, e) => s + e.loss, 0) - lossV;
  const cards = [
    [total, "\uD83D\uDCDD တိုင်ကြားမှု"],
    [verCount, "✅ အတည်ပြုပြီး"],
    [pend, "\uD83D\uDD0D စစ်ဆေးဆဲ"],
    [fmtNum(lossV) + " MMK", "\uD83D\uDCB8 အတည်ပြုပြီး ဆုံးရှုံးငွေ"],
  ];
  document.getElementById("statsBody").innerHTML = cards.map(([n, l]) =>
    `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`
  ).join("");
  const ll = document.getElementById("lossLine");
  if (ll) ll.textContent = `စစ်ဆေးဆဲ: ${fmtNum(lossP)} MMK · အတည်ပြုပြီး: ${fmtNum(lossV)} MMK`;
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
      <p class="rnote">ဖုန်းနံပါတ် / Telegram ID / ဘဏ်အကောင့်နံပါတ် ထည့်ပေးပါ<br>ဥပမာ: 09123456789</p></div>`;
    return;
  }
  if (!m.hits.length) {
    box.innerHTML = `<div class="rcard ok">
      <div class="rhead"><span class="badge ok">✅ မှတ်တမ်း မတွေ့ပါ</span></div>
      <div class="rtitle">${esc(m.label)}</div>
      <p class="rnote">ဒီအချက်အလက်နဲ့ ပတ်သက်တဲ့ တိုင်ကြားချက် မရှိသေးပါ။<br>မှတ်တမ်း မရှိတာဟာ လုံးဝ စိတ်ချရတယ်လို့ မဆိုလိုပါ — သတိထားဆက်ဆံပါ။</p></div>`;
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
  const loss = rows.reduce((s, r) => s + (parseFloat(String(r[C.loss]).replace(/[^\d.]/g, "")) || 0), 0);
  const types = [...new Set(rows.map(r => r[C.scamType]).filter(Boolean))];
  const tgIds = [...new Set(rows.map(r => String(r[C.tgId] || "").trim()).filter(Boolean))];

  if (!verified) {
    return `<div class="rcard warn">
      <div class="rhead"><span class="badge warn">🔍 စစ်ဆေးဆဲ</span></div>
      <div class="rtitle">${esc(label)}</div>
      <p class="rnote">ဒီအချက်အလက်ကို တိုင်ကြားခံထားရပြီး <b>စစ်ဆေးနေဆဲဖြစ်ပါတယ်</b>။<br>သတိထားဆက်ဆံပါ။</p>
      <p class="rnote">အယူခံဝင်ရန်: Telegram Bot မှာ "admin" လို့ ရိုက်ပါ / scamwatchmyanmar@gmail.com</p></div>`;
  }
  const descs = [...new Set(rows.map(r => r[C.story]).filter(Boolean))];
  const tgUrls = [...new Set(rows.map(r => (r[C.tgUrl] || "").trim()).filter(Boolean))];
  const row = (k, v) => v ? `<div class="rrow"><span class="k">${k}</span><span class="v">${v}</span></div>` : "";
  return `<div class="rcard danger">
    <div class="rhead"><span class="badge danger">⚠️ အတည်ပြုပြီး လိမ်လည်မှု</span></div>
    <div class="rtitle">${esc(label)}</div>
    <div class="rrows">
      ${row("နာမည်", esc(names.join(", ")))}
      ${row("Facebook", esc(fbs.join(", ")))}
      ${row("ဖုန်း", phones.map(maskPhone).map(esc).join(", "))}
      ${row("Telegram ID", tgIds.map(esc).join(", "))}
      ${row("ငွေပေးချေမှု", payLines.map(esc).join("; "))}
      ${row("လိမ်နည်း", esc(types.join(", ")))}
      ${row("ဆုံးရှုံးငွေ", loss ? fmtNum(loss) + " MMK" : "")}
    </div>
    ${descs.map(d => `<div class="story"><b>ဖြစ်စဉ် အကျဉ်းချုပ်</b><br>${esc(maskPhonesInText(summarize(d)))}</div>`).join("")}
    ${tgUrls.length ? `<a class="readmore" href="${esc(tgUrls[0])}" target="_blank" rel="noopener">📖 အပြည့်အစုံဖတ်ရန်</a>` : ""}
    <p class="rnote">⛔ ဒီအချက်အလက်နဲ့ ဆက်သွယ်မှု / ငွေလွှဲ မလုပ်ပါနဲ့။</p>
  </div>`;
}

/* ---------- init ---------- */
document.getElementById("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("q").value;
  document.getElementById("result").innerHTML =
    `<div class="loading"><span class="spinner"></span>စစ်ဆေးနေပါတယ်...</div>`;
  setTimeout(() => renderResult(q), 1200);
});

loadData().catch(() => {
  document.getElementById("statsBody").innerHTML =
    `<p class="muted">⚠️ Data ရယူလို့မရသေးပါ — internet စစ်ပြီး ပြန်ဖွင့်ကြည့်ပါ။</p>`;
});
