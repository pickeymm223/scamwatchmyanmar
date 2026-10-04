/* ScamWatch Myanmar — web checker (GitHub Pages, static) */
const CSV_URL = "https://docs.google.com/spreadsheets/d/1odYBdPi93Tt3oydiQquhyoTRzaeao0hyIoMv7Luv6xE/export?format=csv&gid=1156714479";

// Column indexes (Google Form → Sheet)
const C = {
  phone: 2, name: 3, facebook: 4, telegram: 5,
  scamType: 6, payType: 7, accName: 8, bankAcct: 9,
  story: 10, loss: 12, viber: 17, otherPhones: 20, tgId: 21, status: 22
};

let ROWS = [];

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
  const d = String(a || "").replace(/\D/g, "");
  if (d.length < 6) return a;
  return d.slice(0, 3) + "*".repeat(Math.max(0, d.length - 5)) + d.slice(-2);
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
  ROWS = rows.filter(r => (r[C.phone] || "").trim() !== "" || (r[C.tgId] || "").trim() !== "");
  renderStats();
}

function isVerified(r) {
  return String(r[C.status] || "").trim().toLowerCase() === "verified";
}

function renderStats() {
  const total = ROWS.length;
  const ver = ROWS.filter(isVerified);
  const pend = total - ver.length;
  const lossV = ver.reduce((s, r) => s + (parseFloat(String(r[C.loss]).replace(/[^\d.]/g, "")) || 0), 0);
  const lossP = ROWS.filter(r => !isVerified(r))
    .reduce((s, r) => s + (parseFloat(String(r[C.loss]).replace(/[^\d.]/g, "")) || 0), 0);
  document.getElementById("statsBody").innerHTML =
    `<div class="kv">📝 တိုင်ကြားမှု စုစုပေါင်း: <b>${total}</b></div>` +
    `<div class="kv">✅ အတည်ပြုပြီး: <b>${ver.length}</b></div>` +
    `<div class="kv">🔍 စစ်ဆေးဆဲ: <b>${pend}</b></div>` +
    `<div class="kv">🔍 စစ်ဆေးဆဲ ဆုံးရှုံးငွေ: <b>${fmtNum(lossP)} MMK</b></div>` +
    `<div class="kv">✔️ အတည်ပြုပြီး ဆုံးရှုံးငွေ: <b>${fmtNum(lossV)} MMK</b></div>`;
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
  if (/^\d{8,12}$/.test(digits) && !digits.startsWith("09")) {
    ROWS.forEach(r => {
      if (String(r[C.tgId] || "").trim() === digits) hits.push(r);
    });
    return { label: "🆔 " + digits, hits };
  }
  return null;
}

function renderResult(q) {
  const box = document.getElementById("result");
  const m = findMatches(q);
  if (!m) {
    box.innerHTML = `<div class="hit pending"><h3>ℹ️</h3>
      <p>ဖုန်းနံပါတ် (သို့) Telegram ID ထည့်ပေးပါ<br>ဥပမာ: 09123456789 / 123456789</p></div>`;
    return;
  }
  if (!m.hits.length) {
    box.innerHTML = `<div class="hit safe"><h3>✅ မှတ်တမ်း မတွေ့ပါ</h3>
      <p>${esc(m.label)} နဲ့ ပတ်သက်တဲ့ တိုင်ကြားချက် မရှိသေးပါ။<br>
      <span class="muted">မှတ်တမ်း မရှိတာဟာ လုံးဝ စိတ်ချရတယ်လို့ မဆိုလိုပါ — သတိထားဆက်ဆံပါ။</span></p></div>`;
    return;
  }
  // entity အလိုက် စု (bot ရဲ့ _group_entities ကို ရိုးရှင်းစွာ)
  const groups = [];
  m.hits.forEach(r => {
    const key = [r[C.facebook], r[C.name], r[C.accName]].map(s => (s || "").trim().toLowerCase()).join("|");
    let g = groups.find(g => g.key === key);
    if (!g) { g = { key, rows: [] }; groups.push(g); }
    g.rows.push(r);
  });
  box.innerHTML = groups.map(g => renderGroup(m.label, g.rows)).join("");
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
    return `<div class="hit pending"><span class="badge pending">🔍 စစ်ဆေးဆဲ</span>
      <h3>${esc(label)}</h3>
      <p>🔍 စစ်ဆေးနေဆဲဖြစ်ပါတယ်။</p>
      <p class="muted">အယူခံဝင်ရန်: Telegram Bot မှာ "admin" လို့ ရိုက်ပါ / scamwatchmyanmar@gmail.com</p></div>`;
  }
  const story = rows.map(r => r[C.story]).filter(Boolean).join("\n\n");
  return `<div class="hit"><span class="badge verified">⚠️ အတည်ပြုပြီး</span>
    <h3>${esc(label)}</h3>
    ${names.length ? `<div class="kv"><b>နာမည်:</b> ${esc(names.join(", "))}</div>` : ""}
    ${fbs.length ? `<div class="kv"><b>Facebook:</b> ${esc(fbs.join(", "))}</div>` : ""}
    ${phones.length ? `<div class="kv"><b>ဖုန်း:</b> ${phones.map(maskPhone).map(esc).join(", ")}</div>` : ""}
    ${tgIds.length ? `<div class="kv"><b>🆔 Telegram ID:</b> ${tgIds.map(esc).join(", ")}</div>` : ""}
    ${payLines.length ? `<div class="kv"><b>💳 ငွေပေးချေမှု:</b> ${payLines.map(esc).join("; ")}</div>` : ""}
    ${types.length ? `<div class="kv"><b>လိမ်နည်း:</b> ${esc(types.join(", "))}</div>` : ""}
    ${loss ? `<div class="kv"><b>💸 ဆုံးရှုံးငွေ:</b> ${fmtNum(loss)} MMK</div>` : ""}
    ${story ? `<div class="story">${esc(maskPhonesInText(story))}</div>` : ""}
  </div>`;
}

/* ---------- init ---------- */
document.getElementById("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("q").value;
  document.getElementById("result").innerHTML = `<p class="muted">⏳ စစ်ဆေးနေပါတယ်...</p>`;
  setTimeout(() => renderResult(q), 1200);
});

loadData().catch(() => {
  document.getElementById("statsBody").innerHTML =
    `<p class="muted">⚠️ Data ရယူလို့မရသေးပါ — internet စစ်ပြီး ပြန်ဖွင့်ကြည့်ပါ။</p>`;
});
