'use strict';
/* =========================================================
 * ระบบบันทึกข้อมูลการตรวจสุขภาพผู้สูงอายุ — Web App (PWA)
 * รอบที่ 2: ฟอร์มกรอก + คิว offline + ค้นเลขบัตร + ล็อกอิน PIN
 * ========================================================= */

/* ---------- ตั้งค่าที่แก้ได้ ---------- */
const DEFAULT_API = '';      // วาง Web App URL (ลงท้าย /exec) ที่นี่ เจ้าหน้าที่จะไม่ต้องตั้งค่าเอง
const ORG_NAME = '';         // ชื่อหน่วยงาน แสดงใต้ชื่อแอป
const LOCK_AFTER_MIN = 10;   // ออกจากแอปเกินกี่นาทีให้ล็อกหน้าจอ
const SYNC_BATCH = 20;
const APP_VERSION = '1.0.0';

/* ---------- แบบฟอร์ม ---------- */
const TH_MON = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DISEASES = ['เบาหวาน','ความดันโลหิตสูง','ไขมันในเลือดสูง','โรคหัวใจ','โรคไต','โรคหลอดเลือดสมอง','ข้อเข่าเสื่อม'];
const INFO_KEYS = ['cid','prefix','fname','lname','dob','sex','address','moo','phone','emer_name','emer_relation',
  'emer_phone','chronic','chronic_detail','surgery','allergy','meds','smoking','alcohol'];

const SECTIONS = [
  { title: 'ข้อมูลทั่วไป', fields: [
    { k: 'visit_date', label: 'วันที่ตรวจ', type: 'date', req: 1 },
    { k: 'cid', label: 'เลขบัตรประชาชน 13 หลัก', type: 'cid', req: 1 },
    { k: 'prefix', label: 'คำนำหน้า', type: 'radio', opts: ['นาย', 'นาง', 'นางสาว'] },
    { k: 'fname', label: 'ชื่อ', type: 'text', req: 1, half: 1 },
    { k: 'lname', label: 'นามสกุล', type: 'text', half: 1 },
    { k: 'dob', label: 'วัน/เดือน/ปีเกิด', type: 'date' },
    { k: 'sex', label: 'เพศ', type: 'radio', opts: ['ชาย', 'หญิง', 'อื่น ๆ'] },
    { k: 'address', label: 'ที่อยู่', type: 'text', ph: 'บ้านเลขที่ ซอย ถนน ตำบล' },
    { k: 'moo', label: 'หมู่ที่', type: 'text', im: 'numeric', half: 1 },
    { k: 'phone', label: 'เบอร์โทรศัพท์', type: 'tel', half: 1 },
    { k: 'emer_name', label: 'ผู้ติดต่อฉุกเฉิน', type: 'text' },
    { k: 'emer_relation', label: 'ความสัมพันธ์', type: 'text', half: 1, ph: 'เช่น บุตร' },
    { k: 'emer_phone', label: 'เบอร์โทรผู้ติดต่อ', type: 'tel', half: 1 }
  ]},
  { title: 'ประวัติสุขภาพ', fields: [
    { k: 'chronic', label: 'โรคประจำตัว', type: 'radio', opts: ['ไม่มี', 'มี'] },
    { k: 'chronic_detail', label: 'ระบุโรค (เลือกได้หลายข้อ)', type: 'tags', opts: DISEASES, show: ['chronic', 'มี'] },
    { k: 'surgery', label: 'ประวัติการผ่าตัด', type: 'text', ph: 'ไม่มี หรือระบุ' },
    { k: 'allergy', label: 'ประวัติการแพ้ยา/อาหาร', type: 'text', ph: 'ไม่มี หรือระบุ' },
    { k: 'meds', label: 'ยาที่ใช้อยู่ประจำ', type: 'textarea' },
    { k: 'smoking', label: 'การสูบบุหรี่', type: 'radio', opts: ['ไม่สูบ', 'สูบ', 'เลิกแล้ว'] },
    { k: 'alcohol', label: 'การดื่มแอลกอฮอล์', type: 'radio', opts: ['ไม่ดื่ม', 'ดื่ม'] }
  ]},
  { title: 'การตรวจร่างกายเบื้องต้น', fields: [
    { k: 'weight', label: 'น้ำหนัก', type: 'num', unit: 'กก.', min: 25, max: 200, half: 1 },
    { k: 'height', label: 'ส่วนสูง', type: 'num', unit: 'ซม.', min: 100, max: 210, half: 1 },
    { k: 'bmi', label: 'BMI (คำนวณให้)', type: 'calc' },
    { k: 'sbp', label: 'ความดันตัวบน', type: 'num', unit: 'mmHg', min: 60, max: 260, half: 1 },
    { k: 'dbp', label: 'ความดันตัวล่าง', type: 'num', unit: 'mmHg', min: 30, max: 160, half: 1 },
    { k: 'pulse', label: 'ชีพจร', type: 'num', unit: 'ครั้ง/นาที', min: 30, max: 200, half: 1 },
    { k: 'temp', label: 'อุณหภูมิร่างกาย', type: 'num', unit: '°C', min: 34, max: 42, half: 1 },
    { k: 'dtx', label: 'ระดับน้ำตาลปลายนิ้ว', type: 'num', unit: 'mg/dL', min: 20, max: 600, hint: 'เกณฑ์แบบอดอาหาร: ปกติต่ำกว่า 100' }
  ]},
  { title: 'การประเมินสุขภาพทั่วไป', fields: [
    { k: 'vision', label: 'การมองเห็น', type: 'radio', opts: ['ปกติ', 'ผิดปกติ'] },
    { k: 'vision_detail', label: 'ระบุความผิดปกติของการมองเห็น', type: 'text', show: ['vision', 'ผิดปกติ'] },
    { k: 'hearing', label: 'การได้ยิน', type: 'radio', opts: ['ปกติ', 'มีปัญหา'] },
    { k: 'hearing_detail', label: 'ระบุปัญหาการได้ยิน', type: 'text', show: ['hearing', 'มีปัญหา'] },
    { k: 'oral', label: 'สุขภาพช่องปาก (เลือกได้หลายข้อ)', type: 'checks', opts: ['ปกติ', 'ฟันผุ', 'ใส่ฟันปลอม', 'อื่น ๆ'], excl: 'ปกติ' },
    { k: 'oral_other', label: 'ระบุปัญหาช่องปากอื่น ๆ', type: 'text', show: ['oral', 'อื่น ๆ'] }
  ]},
  { title: 'ภาวะทางกายและการเคลื่อนไหว', fields: [
    { k: 'walking', label: 'เดินได้เอง', type: 'radio', opts: ['ได้', 'ต้องใช้อุปกรณ์', 'ไม่ได้'] },
    { k: 'fall', label: 'ประวัติหกล้มใน 1 ปีที่ผ่านมา', type: 'radio', opts: ['ไม่มี', 'มี'] },
    { k: 'joint_pain', label: 'อาการปวดข้อ/กล้ามเนื้อ', type: 'radio', opts: ['ไม่มี', 'มี'] },
    { k: 'joint_detail', label: 'ระบุตำแหน่ง/อาการ', type: 'text', show: ['joint_pain', 'มี'] }
  ]},
  { title: 'ภาวะโภชนาการ', fields: [
    { k: 'appetite', label: 'รับประทานอาหารได้', type: 'radio', opts: ['ปกติ', 'ลดลง'] },
    { k: 'weight_change', label: 'น้ำหนักเปลี่ยนแปลงใน 6 เดือน', type: 'radio', opts: ['ไม่เปลี่ยน', 'ลด', 'เพิ่ม'] },
    { k: 'chewing', label: 'ปัญหาการเคี้ยว/กลืน', type: 'radio', opts: ['ไม่มี', 'มี'] }
  ]},
  { title: 'สุขภาพจิต', fields: [
    { k: 'mood', label: 'อารมณ์ทั่วไป', type: 'radio', opts: ['ปกติ', 'ซึมเศร้า', 'วิตกกังวล'] },
    { k: 'sleep', label: 'การนอนหลับ', type: 'radio', opts: ['ปกติ', 'มีปัญหา'] },
    { k: 'memory', label: 'ความจำ', type: 'radio', opts: ['ปกติ', 'มีปัญหา'] }
  ]},
  { title: 'การคัดกรองโรคเรื้อรัง', note: 'กรอกเฉพาะเมื่อมีผลตรวจ', fields: [
    { k: 'fbs', label: 'น้ำตาลในเลือด (FBS)', type: 'num', unit: 'mg/dL', min: 20, max: 600 },
    { k: 'lipid', label: 'ไขมันในเลือด', type: 'text', ph: 'เช่น Chol 210, TG 150, LDL 130' },
    { k: 'kidney', label: 'การทำงานของไต', type: 'text', ph: 'เช่น eGFR 75, Cr 1.0' }
  ]},
  { title: 'พฤติกรรมสุขภาพ', fields: [
    { k: 'exercise', label: 'การออกกำลังกาย', type: 'radio', opts: ['ไม่ออก', 'ออกกำลังกาย'] },
    { k: 'exercise_per_week', label: 'จำนวนครั้งต่อสัปดาห์', type: 'num', unit: 'ครั้ง', min: 1, max: 14, show: ['exercise', 'ออกกำลังกาย'] },
    { k: 'diet', label: 'การรับประทานอาหาร', type: 'radio', opts: ['ครบ 5 หมู่', 'ไม่ครบ'] },
    { k: 'med_use', label: 'การใช้ยา', type: 'radio', opts: ['ถูกต้อง', 'ไม่สม่ำเสมอ', 'ไม่ได้ใช้ยา'] }
  ]},
  { title: 'สรุปผลและคำแนะนำ', fields: [
    { k: 'summary', label: 'สรุปผลสุขภาพ', type: 'textarea', auto: 1 },
    { k: 'advice', label: 'คำแนะนำ', type: 'textarea' },
    { k: 'next_appt', label: 'นัดหมายครั้งถัดไป', type: 'date' }
  ]}
];
const REVIEW = SECTIONS.length;
const FIELD = {}, SEC_OF = {};
SECTIONS.forEach((s, i) => s.fields.forEach(f => { FIELD[f.k] = f; SEC_OF[f.k] = i; }));
const DEPS = { weight: ['bmi'], height: ['bmi'], dbp: ['sbp'], visit_date: ['dob', 'next_appt'] };

/* ---------- เกณฑ์แปลผล ---------- */
const bmiFlag = b => b === '' ? null : b < 18.5 ? ['ผอม', 'warn'] : b < 23 ? ['ปกติ', 'ok'] : b < 25 ? ['ท้วม', 'warn'] : b < 30 ? ['อ้วนระดับ 1', 'bad'] : ['อ้วนระดับ 2', 'bad'];
const bpFlag = (s, d) => (s === '' || d === '') ? null : (s >= 180 || d >= 110) ? ['สูงมาก ควรส่งต่อ', 'bad'] : (s >= 140 || d >= 90) ? ['สูง', 'bad'] : (s >= 130 || d >= 85) ? ['เสี่ยง', 'warn'] : (s < 90 || d < 60) ? ['ต่ำ', 'warn'] : ['ปกติ', 'ok'];
const sugarFlag = v => v === '' ? null : v < 70 ? ['ต่ำ', 'bad'] : v < 100 ? ['ปกติ', 'ok'] : v < 126 ? ['เสี่ยง', 'warn'] : v < 200 ? ['สูง', 'bad'] : ['สูงมาก', 'bad'];
const pulseFlag = v => v === '' ? null : v < 60 ? ['ช้า', 'warn'] : v > 100 ? ['เร็ว', 'warn'] : ['ปกติ', 'ok'];
const tempFlag = v => v === '' ? null : v >= 37.5 ? ['มีไข้', 'bad'] : v < 35.5 ? ['ต่ำ', 'warn'] : ['ปกติ', 'ok'];

/* ---------- state ---------- */
let session = loadJSON('eh_session');
let unlocked = false;
let view = '';
let F = null;           // แบบที่กำลังกรอก
let counts = { pending: 0, error: 0 };
let installEvt = null;
let syncing = false;
let needLogin = false;
let lastHidden = 0;
let resumeForm = false;
let draftTimer = null;
const $view = document.getElementById('view');
const $top = document.getElementById('top');
const $ = s => document.querySelector(s);

/* ---------- utils ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function saveSession() { session ? localStorage.setItem('eh_session', JSON.stringify(session)) : localStorage.removeItem('eh_session'); }
function getApi() { return localStorage.getItem('eh_api') || DEFAULT_API; }
function todayIso() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowLocal() { const d = new Date(); return `${todayIso()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function thDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${TH_MON[m - 1]} ${y + 543}`; }
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function validCid(c) {
  if (!/^\d{13}$/.test(c || '')) return false;
  let s = 0; for (let i = 0; i < 12; i++) s += +c[i] * (13 - i);
  return (11 - (s % 11)) % 10 === +c[12];
}
const maskCid = c => c ? '•' + String(c).slice(-4) : '';
function ageAt(dob, on) {
  const [y1, m1, d1] = dob.split('-').map(Number), [y2, m2, d2] = on.split('-').map(Number);
  return y2 - y1 - ((m2 < m1 || (m2 === m1 && d2 < d1)) ? 1 : 0);
}
function toast(msg, ms = 2800) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function err(code, message) { const e = new Error(message); e.code = code; return e; }

/* ---------- IndexedDB ---------- */
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('elderly-health', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('queue', { keyPath: 'record_id' }); r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode); const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error);
    });
  };
  return {
    all: s => run(s, 'readonly', st => st.getAll()),
    get: (s, k) => run(s, 'readonly', st => st.get(k)),
    put: (s, v, k) => run(s, 'readwrite', st => k === undefined ? st.put(v) : st.put(v, k)),
    del: (s, k) => run(s, 'readwrite', st => st.delete(k)),
    clear: s => run(s, 'readwrite', st => st.clear())
  };
})();

/* ---------- API ---------- */
async function api(action, data = {}, opt = {}) {
  const url = opt.url || getApi();
  if (!url) throw err('NO_API', 'ยังไม่ได้ตั้งค่าที่อยู่ระบบ');
  const body = Object.assign({ action }, data);
  if (!opt.noToken && session) body.token = session.token;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30000);
  let res;
  try { res = await fetch(url, { method: 'POST', body: JSON.stringify(body), signal: ctrl.signal }); }
  catch (e) { throw err('NETWORK', 'เชื่อมต่อระบบไม่ได้ ตรวจสอบอินเทอร์เน็ต'); }
  finally { clearTimeout(timer); }
  let j;
  try { j = await res.json(); }
  catch (e) { throw err('NETWORK', 'ระบบตอบกลับผิดรูปแบบ ตรวจสอบ Web App URL และสิทธิ์การเข้าถึง "ทุกคน"'); }
  if (!j.ok) throw err(j.code, j.message);
  return j;
}
const hasToken = () => !!(session && session.token && session.exp > Date.now());

/* ---------- router ---------- */
function go(v) {
  if ((v === 'home' || v === 'form') && !unlocked) v = session ? 'unlock' : 'login';
  view = v;
  renderTop();
  ({ settings: renderSettings, login: renderLogin, unlock: renderUnlock, home: renderHome, form: renderForm })[v]();
  window.scrollTo(0, 0);
}

function renderTop() {
  if (view === 'form') { $top.hidden = true; return; }
  $top.hidden = false;
  const online = navigator.onLine;
  const pill = unlocked ? `<button class="pill" data-act="sync" aria-label="สถานะการส่งข้อมูล แตะเพื่อส่งตอนนี้">
      <i class="dot ${online ? '' : 'off'} ${syncing ? 'busy' : ''}"></i>${syncing ? 'กำลังส่ง' : !online ? 'ออฟไลน์' : counts.pending + counts.error ? 'รอส่ง ' + (counts.pending + counts.error) : 'ส่งครบแล้ว'}</button>
      <button class="icon-btn" data-act="lock" aria-label="ล็อกหน้าจอ">${ICON.lock}</button>` : '';
  $top.innerHTML = `<div class="top-in"><div class="title">ตรวจสุขภาพผู้สูงอายุ${ORG_NAME ? `<small>${esc(ORG_NAME)}</small>` : ''}</div>${pill}</div>`;
}

const ICON = {
  lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="currentColor" opacity=".18"/><path d="M22 12v20M12 22h20" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  mark: '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0D6B5D"/><path d="M32 16v32M16 32h32" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>'
};

/* ---------- auth ---------- */
function renderLogin() {
  $view.innerHTML = `<div class="auth">${ICON.mark}<h1>เข้าสู่ระบบ</h1>
    <p class="muted" style="margin:0">ใช้ชื่อผู้ใช้และ PIN ที่ผู้ดูแลระบบให้ไว้ ต้องเชื่อมต่ออินเทอร์เน็ตในการเข้าสู่ระบบครั้งแรก</p>
    <div><label class="lbl" for="u">ชื่อผู้ใช้</label><input id="u" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
    <div><label class="lbl" for="p">PIN</label><input id="p" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" data-enter="login"></div>
    <button class="btn big" data-act="login">เข้าสู่ระบบ</button>
    <p class="msg" id="authMsg" role="alert"></p>
    <button class="link" data-act="settings">ตั้งค่าการเชื่อมต่อ</button></div>`;
  $('#u').focus();
}

function renderUnlock() {
  $view.innerHTML = `<div class="auth">${ICON.mark}<h1>สวัสดี ${esc(session.display_name)}</h1>
    <p class="muted" style="margin:0">${needLogin ? 'ยืนยัน PIN อีกครั้งเพื่อส่งข้อมูลขึ้นระบบ' : 'ใส่ PIN เพื่อเปิดใช้งาน'}</p>
    <div><label class="lbl" for="p">PIN</label><input id="p" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" data-enter="unlock"></div>
    <button class="btn big" data-act="unlock">เปิดใช้งาน</button>
    <p class="msg" id="authMsg" role="alert"></p>
    <button class="link" data-act="logout">เปลี่ยนผู้ใช้</button></div>`;
  $('#p').focus();
}

async function doLogin(username, pin) {
  const r = await api('login', { username, pin }, { noToken: true });
  const salt = uuid();
  session = Object.assign({}, r.user, { token: r.token, exp: Date.now() + r.expires_in_hours * 3600e3, salt, pinHash: await sha(salt + ':' + pin) });
  saveSession();
  localStorage.removeItem('eh_fail');
  needLogin = false; unlocked = true;
}

async function onLogin() {
  const u = $('#u').value.trim().toLowerCase(), p = $('#p').value;
  const msg = $('#authMsg');
  if (!u || !p) { msg.className = 'msg bad'; msg.textContent = 'กรอกชื่อผู้ใช้และ PIN'; return; }
  msg.className = 'msg'; msg.textContent = 'กำลังตรวจสอบ…';
  try { await doLogin(u, p); afterUnlock(); }
  catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}

async function onUnlock() {
  const p = $('#p').value, msg = $('#authMsg');
  if (!p) return;
  const localOk = (await sha(session.salt + ':' + p)) === session.pinHash;
  const needRefresh = !session.token || session.exp - Date.now() < 2 * 3600e3 || needLogin;
  if (navigator.onLine && (needRefresh || !localOk)) {
    msg.className = 'msg'; msg.textContent = 'กำลังตรวจสอบ…';
    try { await doLogin(session.username, p); return afterUnlock(); }
    catch (e) {
      if (e.code !== 'NETWORK') { msg.className = 'msg bad'; msg.textContent = e.message; return; }
    }
  }
  if (localOk) { localStorage.removeItem('eh_fail'); unlocked = true; return afterUnlock(); }
  const fails = +(localStorage.getItem('eh_fail') || 0) + 1;
  localStorage.setItem('eh_fail', fails);
  if (fails >= 5) { session = null; saveSession(); localStorage.removeItem('eh_fail'); toast('ใส่ PIN ผิดหลายครั้ง กรุณาเข้าสู่ระบบใหม่'); return go('login'); }
  msg.className = 'msg bad'; msg.textContent = `PIN ไม่ถูกต้อง (เหลือ ${5 - fails} ครั้ง)`;
}

async function afterUnlock() {
  const draft = await idb.get('kv', 'draft');
  if (draft && F && resumeForm) go('form'); else go('home');
  resumeForm = false;
  syncNow();
}

function lockApp() {
  resumeForm = view === 'form';
  if (resumeForm) saveDraftNow();
  unlocked = false; go('unlock');
}

async function logout() {
  await refreshCounts();
  const n = counts.pending + counts.error;
  const q = n ? `มีข้อมูลรอส่ง ${n} รายการ ข้อมูลจะยังเก็บในเครื่องและส่งเมื่อมีผู้ใช้เข้าสู่ระบบ ต้องการออกจากระบบไหม?` : 'ออกจากระบบ?';
  if (!confirm(q)) return;
  session = null; saveSession(); unlocked = false; F = null;
  await idb.del('kv', 'draft');
  go('login');
}

/* ---------- settings ---------- */
function renderSettings() {
  $view.innerHTML = `<div class="wrap settings">
    <h2>ตั้งค่าการเชื่อมต่อ</h2>
    <div><label class="lbl" for="apiUrl">Web App URL</label>
      <input id="apiUrl" type="url" value="${esc(getApi())}" placeholder="https://script.google.com/macros/s/…/exec" spellcheck="false">
      <p class="muted" style="margin:6px 0 0;font-size:.9rem">คัดลอกจาก Apps Script หน้า "การทำให้ใช้งานได้" ลงท้ายด้วย /exec</p></div>
    <div class="row"><button class="btn ghost" data-act="testapi">ทดสอบการเชื่อมต่อ</button><button class="btn" data-act="saveapi">บันทึก</button></div>
    <p class="msg" id="apiMsg" role="status"></p>
    <div class="card"><h3>ข้อมูลในเครื่องนี้</h3>
      <p style="margin:0" id="devInfo">กำลังตรวจสอบ…</p>
      <div class="row"><button class="btn danger" data-act="wipe">ล้างข้อมูลทั้งหมดในเครื่อง</button></div></div>
    <p class="muted" style="font-size:.85rem">เวอร์ชัน ${APP_VERSION}</p>
    <div><button class="btn ghost" data-act="back">กลับ</button></div></div>`;
  refreshCounts().then(() => { $('#devInfo').textContent = `รอส่ง ${counts.pending} รายการ ส่งไม่สำเร็จ ${counts.error} รายการ`; });
}

async function testApi(save) {
  const url = $('#apiUrl').value.trim(), msg = $('#apiMsg');
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { msg.className = 'msg bad'; msg.textContent = 'URL ต้องขึ้นต้นด้วย https://script.google.com/ และลงท้ายด้วย /exec'; return; }
  msg.className = 'msg'; msg.textContent = 'กำลังทดสอบ…';
  try {
    await api('ping', {}, { url, noToken: true });
    msg.className = 'msg ok'; msg.textContent = 'เชื่อมต่อระบบได้';
    if (save) { localStorage.setItem('eh_api', url); toast('บันทึกการตั้งค่าแล้ว'); go(session ? (unlocked ? 'home' : 'unlock') : 'login'); }
  } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}

async function wipeDevice() {
  await refreshCounts();
  const n = counts.pending + counts.error;
  if (!confirm(n ? `ยังมีข้อมูลที่ยังไม่ได้ส่ง ${n} รายการ ถ้าล้างข้อมูลจะหายถาวร ยืนยันไหม?` : 'ล้างข้อมูลผู้ใช้และแบบที่กรอกค้างในเครื่องนี้?')) return;
  await idb.clear('queue'); await idb.clear('kv');
  localStorage.removeItem('eh_session'); localStorage.removeItem('eh_fail');
  session = null; unlocked = false; F = null;
  toast('ล้างข้อมูลในเครื่องแล้ว'); go(getApi() ? 'login' : 'settings');
}

/* ---------- home ---------- */
async function refreshCounts() {
  const q = await idb.all('queue');
  counts = { pending: q.filter(r => r._status !== 'error').length, error: q.filter(r => r._status === 'error').length };
  if (view !== 'form') renderTop();
  return q;
}

async function renderHome() {
  const q = await refreshCounts();
  const draft = await idb.get('kv', 'draft');
  if (view !== 'home') return;
  const last = localStorage.getItem('eh_lastsync');
  const online = navigator.onLine;
  const dName = draft ? [draft.v.prefix, draft.v.fname, draft.v.lname].filter(Boolean).join(' ') || 'ยังไม่ได้กรอกชื่อ' : '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
  $view.innerHTML = `<div class="wrap home">
    <p class="hello full">สวัสดี ${esc(session.display_name)}</p>
    ${needLogin ? `<div class="card alert full"><h3>ยืนยัน PIN เพื่อส่งข้อมูล</h3><p style="margin:0">การเข้าสู่ระบบหมดอายุ ข้อมูลยังเก็บอยู่ในเครื่องอย่างปลอดภัย</p><div class="row"><button class="btn" data-act="relogin">ยืนยัน PIN</button></div></div>` : ''}
    <div>
      ${draft ? `<div class="card draft" style="margin-bottom:16px"><h3>มีแบบที่กรอกค้างไว้</h3>
        <p style="margin:0">${esc(dName)} <span class="muted">หมวด ${Math.min(draft.step + 1, REVIEW)} จาก ${REVIEW}</span></p>
        <div class="row"><button class="btn" data-act="resume">กรอกต่อ</button><button class="btn ghost" data-act="discard">ทิ้งแบบนี้</button></div></div>` : ''}
      <button class="start" data-act="new">${ICON.plus}<span><b>เริ่มตรวจรายใหม่</b><small>กรอกแบบบันทึกการตรวจสุขภาพผู้สูงอายุ</small></span></button>
    </div>
    <div class="card">
      <h3>การส่งข้อมูลขึ้น Google Sheet</h3>
      <div class="stat"><div><b>${counts.pending}</b><span>รอส่ง</span></div><div><b>${counts.error}</b><span>ส่งไม่สำเร็จ</span></div></div>
      <p class="muted" style="margin:6px 0 0;font-size:.9rem">${online ? 'ออนไลน์' : 'ออฟไลน์ ข้อมูลจะส่งเองเมื่อมีอินเทอร์เน็ต'}${last ? ` ส่งล่าสุด ${esc(last)}` : ''}</p>
      <div class="row"><button class="btn ghost" data-act="sync" ${syncing ? 'disabled' : ''}>${syncing ? 'กำลังส่ง…' : 'ส่งข้อมูลตอนนี้'}</button></div>
    </div>
    ${q.length ? `<div class="card full"><h3>รายการในเครื่องที่ยังไม่ได้ส่ง</h3><ul class="qlist">${q.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(r => `
      <li><div><b>${esc([r.prefix, r.fname, r.lname].filter(Boolean).join(' '))}</b>
        <div class="meta">บัตร ${maskCid(r.cid)} ตรวจ ${thDate(r.visit_date)}</div>
        ${r._status === 'error' ? `<span class="err">${esc(r._err || 'ส่งไม่สำเร็จ')}</span>` : ''}</div>
        ${r._status === 'error' ? `<div class="row" style="margin:0"><button class="btn ghost" data-act="editq" data-id="${esc(r.record_id)}">แก้ไข</button><button class="link" data-act="delq" data-id="${esc(r.record_id)}">ลบ</button></div>` : '<span class="flag warn">รอส่ง</span>'}
      </li>`).join('')}</ul></div>` : ''}
    <div class="links full">
      ${installEvt ? '<button class="link" data-act="install">ติดตั้งเป็นแอปบนเครื่องนี้</button>' : ''}
      ${ios ? '<span class="muted" style="font-size:.9rem">ติดตั้งบน iPhone: กดปุ่มแชร์ แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"</span>' : ''}
      <button class="link" data-act="settings">ตั้งค่า</button>
      <button class="link" data-act="logout">ออกจากระบบ</button>
    </div></div>`;
}

/* ---------- form state ---------- */
function newForm() {
  F = { v: { visit_date: todayIso() }, meta: { record_id: uuid(), created_at: nowLocal() }, prev: null, step: 0, dp: {}, lk: {} };
}
function formFromRecord(rec) {
  const v = {};
  Object.keys(rec).forEach(k => { if (k[0] !== '_') v[k] = rec[k]; });
  splitTags(v, 'chronic_detail');
  if (typeof v.oral === 'string') v.oral = v.oral ? v.oral.split(', ') : [];
  F = { v, meta: { record_id: rec.record_id, created_at: rec.created_at, examiner_user: rec.examiner_user, examiner_name: rec._examiner_name }, prev: null, step: 0, dp: {}, lk: {} };
}
function splitTags(v, k) {
  const parts = String(v[k] || '').split(',').map(s => s.trim()).filter(Boolean);
  v[k + '__tags'] = parts.filter(p => FIELD[k].opts.includes(p));
  v[k + '__other'] = parts.filter(p => !FIELD[k].opts.includes(p)).join(', ');
}
const nv = k => (F.v[k] === undefined || F.v[k] === null) ? '' : F.v[k];
function visible(f) {
  if (!f.show) return true;
  const x = F.v[f.show[0]];
  return Array.isArray(x) ? x.includes(f.show[1]) : x === f.show[1];
}
function derive() {
  F.v.age = F.v.dob && F.v.visit_date ? ageAt(F.v.dob, F.v.visit_date) : '';
  const w = nv('weight'), h = nv('height');
  F.v.bmi = (w !== '' && h !== '' && h > 0) ? Math.round(w / Math.pow(h / 100, 2) * 10) / 10 : '';
}
function isFilled(f) {
  if (f.type === 'tags') return (F.v[f.k + '__tags'] || []).length > 0 || !!F.v[f.k + '__other'];
  const x = F.v[f.k];
  return Array.isArray(x) ? x.length > 0 : x !== undefined && x !== null && String(x).trim() !== '';
}
function progress(i) {
  const fs = SECTIONS[i].fields.filter(f => f.type !== 'calc' && visible(f));
  return [fs.filter(isFilled).length, fs.length];
}
function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 400); }
function saveDraftNow() { clearTimeout(draftTimer); if (F) idb.put('kv', F, 'draft'); }

function vitals() {
  const out = [];
  const add = (k, short, text, fl) => { if (fl) out.push({ k, short, text, flag: fl[0], cls: fl[1] }); };
  add('bmi', 'BMI', nv('bmi'), bmiFlag(nv('bmi')));
  add('sbp', 'BP', `${nv('sbp')}/${nv('dbp')}`, bpFlag(nv('sbp'), nv('dbp')));
  add('dtx', 'DTX', nv('dtx'), sugarFlag(nv('dtx')));
  add('fbs', 'FBS', nv('fbs'), sugarFlag(nv('fbs')));
  add('pulse', 'ชีพจร', nv('pulse'), pulseFlag(nv('pulse')));
  add('temp', 'T', nv('temp'), tempFlag(nv('temp')));
  return out;
}

/* ---------- date parts (วว/ดด/ปปปป พ.ศ.) ---------- */
function dparts(k) {
  if (!F.dp[k]) {
    const iso = F.v[k];
    F.dp[k] = iso ? (([y, m, d]) => ({ d: String(+d), m: String(+m), y: String(+y + 543) }))(iso.split('-')) : { d: '', m: '', y: '' };
  }
  return F.dp[k];
}
function partsToIso(p) {
  if (!p.d || !p.m || p.y.length !== 4) return '';
  let y = +p.y; if (y > 2400) y -= 543;
  const m = +p.m, d = +p.d, dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}
const dateBroken = k => { const p = F.dp[k]; return !!p && (p.d || p.m || p.y) && !F.v[k]; };

/* ---------- form rendering ---------- */
function renderForm() {
  $view.innerHTML = `<div class="band" id="band"></div>
    <div class="wrap form-wrap"><nav class="steps" id="steps" aria-label="หมวดของแบบบันทึก"></nav>
    <section class="sec" id="sec" tabindex="-1" aria-live="off"></section></div>
    <div class="bar"><div class="bar-in"><button class="btn ghost" data-act="prev" id="bPrev">ย้อนกลับ</button><button class="btn" data-act="next" id="bNext">ถัดไป</button></div></div>`;
  derive();
  renderStep(true);
}

function renderStep(top) {
  renderBand(); renderSteps();
  const sec = $('#sec');
  if (F.step === REVIEW) sec.innerHTML = reviewHTML();
  else {
    const s = SECTIONS[F.step];
    sec.innerHTML = `<p class="sec-no">หมวด ${F.step + 1} จาก ${SECTIONS.length}${s.note ? ` ${esc(s.note)}` : ''}</p><h2>${s.title}</h2>
      <div class="grid">${s.fields.map(fieldHTML).join('')}</div>`;
  }
  $('#bPrev').disabled = F.step === 0;
  $('#bNext').hidden = F.step === REVIEW;
  $('#bNext').textContent = F.step === REVIEW - 1 ? 'ตรวจทาน' : 'ถัดไป';
  if (top) { window.scrollTo(0, 0); sec.focus({ preventScroll: true }); }
}

function renderBand() {
  const name = [nv('prefix'), nv('fname'), nv('lname')].filter(Boolean).join(' ') || 'ยังไม่ได้กรอกชื่อ';
  const sub = [F.v.age !== '' ? `อายุ ${F.v.age} ปี` : '', nv('sex'), validCid(nv('cid')) ? `บัตร ${maskCid(nv('cid'))}` : '']
    .filter(Boolean).map(s => `<span>${esc(s)}</span>`).join('');
  const vit = vitals().map(o => `<span class="v ${o.cls}" title="${esc(o.flag)}"><small>${o.short}</small><b>${esc(o.text)}</b><small>${esc(o.flag)}</small></span>`).join('');
  $('#band').innerHTML = `<div class="band-in">
    <button class="icon-btn" data-act="home" aria-label="กลับหน้าหลัก (เก็บแบบที่กรอกไว้)" style="color:inherit;background:none;border:0;cursor:pointer;margin-left:-8px">${ICON.back}</button>
    <div class="who"><b>${esc(name)}</b>${sub}</div>${vit ? `<div class="vit">${vit}</div>` : ''}</div>`;
}

function renderSteps() {
  const items = SECTIONS.map((s, i) => {
    const [a, b] = progress(i);
    return `<button class="step ${i === F.step ? 'on' : ''} ${a === b && b ? 'done' : ''}" data-act="goto" data-i="${i}" ${i === F.step ? 'aria-current="step"' : ''}>
      <span class="n">${i + 1}</span><span class="t">${s.title}</span><span class="p">${a}/${b}</span></button>`;
  });
  items.push(`<button class="step ${F.step === REVIEW ? 'on' : ''}" data-act="goto" data-i="${REVIEW}" ${F.step === REVIEW ? 'aria-current="step"' : ''}><span class="n">✓</span><span class="t">ตรวจทานและบันทึก</span></button>`);
  $('#steps').innerHTML = items.join('');
  const on = $('#steps .on'); if (on && on.scrollIntoView && window.innerWidth < 900) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function fieldHTML(f) {
  if (!visible(f)) return '';
  const k = f.k, id = 'f_' + k, v = nv(k);
  const req = f.req ? ' <b class="req" aria-hidden="true">*</b>' : '';
  const lbl = `<label class="lbl" for="${id}">${esc(f.label)}${req}</label>`;
  const grp = `<div class="lbl" id="l_${k}">${esc(f.label)}${req}</div>`;
  let inner = '', head = lbl;
  switch (f.type) {
    case 'text': case 'tel':
      inner = `<input id="${id}" data-k="${k}" type="${f.type === 'tel' ? 'tel' : 'text'}" ${f.im ? `inputmode="${f.im}"` : ''} value="${esc(v)}" placeholder="${esc(f.ph || '')}" autocomplete="off" ${f.req ? 'aria-required="true"' : ''}>`;
      break;
    case 'textarea':
      inner = `<textarea id="${id}" data-k="${k}" rows="3">${esc(v)}</textarea>`;
      if (f.auto) inner += `<div class="row" style="margin-top:8px"><button type="button" class="btn ghost" data-act="autosum">เติมสรุปจากผลตรวจ</button></div>`;
      break;
    case 'num':
      inner = `<div class="unit-in"><input id="${id}" data-k="${k}" type="text" inputmode="decimal" value="${esc(v)}" autocomplete="off"><span>${f.unit}</span></div>`;
      break;
    case 'cid':
      inner = `<div class="cid-row"><input id="${id}" data-k="${k}" type="text" inputmode="numeric" maxlength="13" value="${esc(v)}" autocomplete="off" aria-required="true" aria-describedby="ft_cid">
        <button type="button" class="btn ghost" data-act="lookup">ค้นประวัติ</button></div>`;
      break;
    case 'date': {
      const p = dparts(k); head = grp;
      inner = `<div class="date" role="group" aria-labelledby="l_${k}">
        <input type="text" inputmode="numeric" maxlength="2" placeholder="วัน" aria-label="วัน" data-date="${k}" data-part="d" value="${esc(p.d)}">
        <input type="text" inputmode="numeric" maxlength="2" placeholder="เดือน" aria-label="เดือน" data-date="${k}" data-part="m" value="${esc(p.m)}">
        <input type="text" inputmode="numeric" maxlength="4" placeholder="ปี พ.ศ." aria-label="ปี พ.ศ." data-date="${k}" data-part="y" value="${esc(p.y)}"></div>`;
      break;
    }
    case 'radio':
      head = grp;
      inner = `<div class="chips" role="radiogroup" aria-labelledby="l_${k}">${f.opts.map(o =>
        `<label class="chip"><input type="radio" name="${k}" value="${esc(o)}" data-k="${k}" ${v === o ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
      break;
    case 'checks': {
      head = grp; const arr = F.v[k] || [];
      inner = `<div class="chips sq" role="group" aria-labelledby="l_${k}">${f.opts.map(o =>
        `<label class="chip"><input type="checkbox" value="${esc(o)}" data-k="${k}" ${arr.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
      break;
    }
    case 'tags': {
      head = grp; const arr = F.v[k + '__tags'] || [];
      inner = `<div class="chips sq" role="group" aria-labelledby="l_${k}">${f.opts.map(o =>
        `<label class="chip"><input type="checkbox" value="${esc(o)}" data-tag="${k}" ${arr.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>
        <label class="lbl" for="${id}_o" style="margin-top:12px;font-weight:500">โรคอื่น ๆ</label>
        <input id="${id}_o" type="text" data-k="${k}__other" value="${esc(F.v[k + '__other'] || '')}" autocomplete="off">`;
      break;
    }
    case 'calc':
      head = `<div class="lbl">${esc(f.label)}</div>`;
      inner = `<div class="calc"><b id="calc_${k}">${v === '' ? '–' : v}</b><span class="muted">${v === '' ? 'กรอกน้ำหนักและส่วนสูง' : 'กก./ม²'}</span></div>`;
      break;
  }
  return `<div class="field ${f.half ? 'half' : ''}">${head}${inner}<div class="foot" id="ft_${k}" data-foot="${k}">${footHTML(f)}</div></div>`;
}

function footHTML(f) {
  const k = f.k;
  if (f.type === 'date') return dateMsg(k);
  if (f.type === 'cid') return cidMsg();
  let h = '';
  if (f.type === 'num' || f.type === 'calc') {
    const x = nv(k);
    if (f.type === 'num' && x !== '' && (x < f.min || x > f.max)) h += `<span class="flag bad">นอกช่วงที่เป็นไปได้ ${f.min}–${f.max}</span>`;
    else { const o = vitals().find(o => o.k === k); if (o) h += `<span class="flag ${o.cls}">${k === 'sbp' ? 'ความดัน ' : ''}${esc(o.flag)}</span>`; }
    const p = F.prev;
    if (p && k !== 'dbp' && p[k] !== undefined && p[k] !== '' && p[k] !== null) h += `<span class="prev">ครั้งก่อน ${k === 'sbp' ? `${p.sbp}/${p.dbp}` : p[k]}</span>`;
  }
  if (f.hint) h += `<span class="hint">${esc(f.hint)}</span>`;
  return h;
}

function dateMsg(k) {
  const iso = F.v[k];
  if (dateBroken(k)) { const p = F.dp[k]; return (p.d && p.m && p.y.length === 4) ? '<span class="flag bad">วันที่ไม่ถูกต้อง</span>' : ''; }
  if (!iso) return '';
  let h = `<span>${thDate(iso)}</span>`;
  if (k === 'dob' && F.v.age !== '') h += `<span class="flag ${F.v.age < 60 ? 'warn' : 'ok'}">อายุ ${F.v.age} ปี${F.v.age < 60 ? ' ต่ำกว่า 60' : ''}</span>`;
  if (k === 'visit_date' && iso > todayIso()) h += '<span class="flag bad">เป็นวันในอนาคต</span>';
  if (k === 'visit_date' && iso === todayIso()) h += '<span class="muted">วันนี้</span>';
  return h;
}

function cidMsg() {
  const c = nv('cid');
  if (c.length === 13 && !validCid(c)) return '<span class="flag bad">เลขบัตรไม่ถูกต้อง ตรวจสอบอีกครั้ง</span>';
  const s = F.lk.cid === c ? F.lk : {};
  const box = (cls, t) => `<div class="lookup ${cls}" style="width:100%">${t}</div>`;
  switch (s.status) {
    case 'loading': return box('info', 'กำลังค้นประวัติ…');
    case 'found': return box('found', `พบข้อมูลเดิม ตรวจมาแล้ว ${s.count} ครั้ง ล่าสุด ${thDate(s.last)} เติมข้อมูลทั่วไปและประวัติสุขภาพให้แล้ว ตรวจสอบว่ายังเป็นปัจจุบัน`);
    case 'new': return box('info', 'ยังไม่มีประวัติในระบบ เป็นผู้รับบริการรายใหม่');
    case 'offline': return box('warn', 'ออฟไลน์ กรอกข้อมูลเองได้เลย ระบบจะรวมประวัติให้ตอนส่งข้อมูล');
    case 'nologin': return box('warn', 'ต้องยืนยัน PIN อีกครั้งจึงจะค้นประวัติได้ กรอกข้อมูลเองต่อได้');
    case 'error': return box('bad', esc(s.msg));
  }
  return c.length < 13 && c.length > 0 ? `<span class="muted">${c.length}/13 หลัก</span>` : '';
}

function updateFoot(k) {
  const el = document.querySelector(`[data-foot="${k}"]`);
  if (el) el.innerHTML = footHTML(FIELD[k]);
  if (k === 'bmi') {
    const c = $('#calc_bmi');
    if (c) { c.textContent = nv('bmi') === '' ? '–' : nv('bmi'); c.nextElementSibling.textContent = nv('bmi') === '' ? 'กรอกน้ำหนักและส่วนสูง' : 'กก./ม²'; }
  }
}

function afterChange(k) {
  derive();
  updateFoot(k); (DEPS[k] || []).forEach(updateFoot);
  renderBand(); renderSteps();
  saveDraftSoon();
}

/* ---------- lookup ---------- */
async function doLookup() {
  const cid = nv('cid');
  if (!validCid(cid)) { updateFoot('cid'); return; }
  if (!navigator.onLine) { F.lk = { cid, status: 'offline' }; return updateFoot('cid'); }
  if (!hasToken()) { F.lk = { cid, status: 'nologin' }; needLogin = true; return updateFoot('cid'); }
  F.lk = { cid, status: 'loading' }; updateFoot('cid');
  try {
    const r = await api('lookup', { cid });
    if (!F || nv('cid') !== cid) return;
    if (r.found) {
      const p = Object.assign({}, r.patient); splitTags(p, 'chronic_detail');
      const empty = x => x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length);
      Object.keys(p).forEach(key => { if (empty(F.v[key]) && !empty(p[key])) F.v[key] = p[key]; });
      delete F.dp.dob;
      F.prev = r.last_visit;
      F.lk = { cid, status: 'found', count: r.visit_count, last: r.last_visit && r.last_visit.visit_date };
      derive(); renderStep(false); saveDraftNow();
      toast('เติมข้อมูลจากประวัติเดิมแล้ว');
    } else { F.lk = { cid, status: 'new' }; updateFoot('cid'); }
  } catch (e) {
    if (e.code === 'AUTH') { session.token = null; saveSession(); needLogin = true; F.lk = { cid, status: 'nologin' }; }
    else F.lk = { cid, status: e.code === 'NETWORK' ? 'offline' : 'error', msg: e.message };
    updateFoot('cid');
  }
}

/* ---------- validation & review ---------- */
function check() {
  const errors = [], warns = [], v = F.v;
  const E = (s, msg) => errors.push({ s, msg }), W = (s, msg) => warns.push({ s, msg });
  if (!v.cid) E(0, 'ยังไม่ได้กรอกเลขบัตรประชาชน'); else if (!validCid(v.cid)) E(0, 'เลขบัตรประชาชนไม่ถูกต้อง');
  if (!String(v.fname || '').trim()) E(0, 'ยังไม่ได้กรอกชื่อ');
  if (!v.visit_date) E(0, 'วันที่ตรวจไม่ครบหรือไม่ถูกต้อง'); else if (v.visit_date > todayIso()) E(0, 'วันที่ตรวจเป็นวันในอนาคต');
  ['dob', 'next_appt'].forEach(k => { if (dateBroken(k)) E(SEC_OF[k], `${FIELD[k].label} ไม่ครบหรือไม่ถูกต้อง`); });
  if (v.dob && v.visit_date && v.dob > v.visit_date) E(0, 'วันเกิดอยู่หลังวันที่ตรวจ');
  if (v.next_appt && v.visit_date && v.next_appt < v.visit_date) E(9, 'วันนัดอยู่ก่อนวันที่ตรวจ');
  Object.values(FIELD).filter(f => f.type === 'num' && visible(f)).forEach(f => {
    const x = nv(f.k); if (x !== '' && (x < f.min || x > f.max)) E(SEC_OF[f.k], `${f.label} ${x} ${f.unit} อยู่นอกช่วงที่เป็นไปได้ (${f.min}–${f.max})`);
  });
  if (nv('sbp') !== '' && nv('dbp') !== '' && nv('sbp') <= nv('dbp')) E(2, 'ความดันตัวบนต้องมากกว่าตัวล่าง');
  if (v.age !== '' && v.age < 60) W(0, `อายุ ${v.age} ปี ต่ำกว่าเกณฑ์ 60 ปีของแบบบันทึกนี้`);
  vitals().filter(o => o.cls !== 'ok').forEach(o => W(SEC_OF[o.k], `${o.short} ${o.text} ${o.flag}`));
  return { errors, warns };
}

function reviewHTML() {
  const { errors, warns } = check();
  const rows = SECTIONS.map((s, i) => { const [a, b] = progress(i); return `<tr><td>${i + 1}. ${s.title}</td><td class="c">${a}/${b}</td><td class="a"><button class="link" data-act="goto" data-i="${i}">แก้ไข</button></td></tr>`; }).join('');
  const exName = F.meta.examiner_name || session.display_name, exPos = F.meta.examiner_name ? '' : session.position;
  return `<h2>ตรวจทานและบันทึก</h2><div style="height:14px"></div>
    ${errors.length ? `<div class="box bad"><h3>ต้องแก้ก่อนบันทึก</h3><ul>${errors.map(e => `<li>${esc(e.msg)} <button class="link" data-act="goto" data-i="${e.s}">ไปแก้</button></li>`).join('')}</ul></div>` : ''}
    ${warns.length ? `<div class="box warn"><h3>ค่าที่ควรใส่ใจ</h3><ul>${warns.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul></div>` : ''}
    <div class="box"><h3>ความครบถ้วน</h3><table class="fill">${rows}</table></div>
    <div class="box"><h3>ผู้ตรวจ</h3><p style="margin:4px 0 0">${esc(exName)}${exPos ? `<br><span class="muted">${esc(exPos)}</span>` : ''}</p>
      <p class="muted" style="margin:4px 0 0">วันที่ตรวจ ${thDate(F.v.visit_date) || '-'}</p></div>
    <button class="btn big" data-act="save" ${errors.length ? 'disabled' : ''}>บันทึกผลตรวจ</button>
    <p class="muted" style="font-size:.9rem;margin:10px 0 0">ข้อมูลจะเก็บในเครื่องก่อน แล้วส่งขึ้น Google Sheet อัตโนมัติเมื่อมีอินเทอร์เน็ต</p>`;
}

function autoSummary() {
  const v = F.v, p = [];
  vitals().filter(o => o.cls !== 'ok').forEach(o => p.push(`${o.short} ${o.text} (${o.flag})`));
  if (v.vision === 'ผิดปกติ') p.push('การมองเห็นผิดปกติ' + (v.vision_detail ? ` (${v.vision_detail})` : ''));
  if (v.hearing === 'มีปัญหา') p.push('มีปัญหาการได้ยิน');
  const oral = (v.oral || []).filter(x => x !== 'ปกติ'); if (oral.length) p.push('ช่องปาก: ' + oral.map(x => x === 'อื่น ๆ' ? (v.oral_other || 'อื่น ๆ') : x).join(', '));
  if (v.walking && v.walking !== 'ได้') p.push(v.walking === 'ไม่ได้' ? 'เดินเองไม่ได้' : 'เดินต้องใช้อุปกรณ์ช่วย');
  if (v.fall === 'มี') p.push('มีประวัติหกล้มใน 1 ปี');
  if (v.joint_pain === 'มี') p.push('ปวดข้อ/กล้ามเนื้อ' + (v.joint_detail ? ` (${v.joint_detail})` : ''));
  if (v.appetite === 'ลดลง') p.push('รับประทานอาหารได้ลดลง');
  if (v.weight_change === 'ลด') p.push('น้ำหนักลดใน 6 เดือน');
  if (v.chewing === 'มี') p.push('มีปัญหาการเคี้ยว/กลืน');
  if (v.mood && v.mood !== 'ปกติ') p.push(`อารมณ์${v.mood}`);
  if (v.sleep === 'มีปัญหา') p.push('มีปัญหาการนอน');
  if (v.memory === 'มีปัญหา') p.push('มีปัญหาความจำ');
  if (v.smoking === 'สูบ') p.push('สูบบุหรี่');
  if (v.alcohol === 'ดื่ม') p.push('ดื่มแอลกอฮอล์');
  if (v.exercise === 'ไม่ออก') p.push('ไม่ออกกำลังกาย');
  if (v.diet === 'ไม่ครบ') p.push('รับประทานอาหารไม่ครบ 5 หมู่');
  if (v.med_use === 'ไม่สม่ำเสมอ') p.push('ใช้ยาไม่สม่ำเสมอ');
  const text = p.length ? 'พบ: ' + p.join(', ') : 'ผลการตรวจโดยรวมอยู่ในเกณฑ์ปกติ';
  if (v.summary && !confirm('แทนที่สรุปผลเดิมด้วยข้อความที่สร้างจากผลตรวจ?')) return;
  F.v.summary = text; $('#f_summary').value = text; afterChange('summary');
}

function buildPayload() {
  const r = { record_id: F.meta.record_id, created_at: F.meta.created_at, examiner_user: F.meta.examiner_user || session.username };
  Object.values(FIELD).forEach(f => {
    if (!visible(f)) { r[f.k] = f.type === 'checks' ? [] : ''; return; }
    if (f.type === 'tags') r[f.k] = [...(F.v[f.k + '__tags'] || []), F.v[f.k + '__other'] || ''].map(s => String(s).trim()).filter(Boolean).join(', ');
    else if (f.type === 'checks') r[f.k] = F.v[f.k] || [];
    else { const x = nv(f.k); r[f.k] = typeof x === 'string' ? x.trim() : x; }
  });
  r.age = F.v.age;
  if (r.chronic === 'ไม่มี') r.chronic_detail = '';
  return r;
}

async function saveRecord() {
  if (check().errors.length) return renderStep(true);
  const rec = buildPayload();
  rec._status = 'pending'; rec._err = ''; rec._examiner_name = F.meta.examiner_name || session.display_name;
  await idb.put('queue', rec);
  await idb.del('kv', 'draft');
  F = null;
  toast(navigator.onLine ? 'บันทึกแล้ว กำลังส่งขึ้นระบบ' : 'บันทึกในเครื่องแล้ว จะส่งเมื่อมีอินเทอร์เน็ต');
  go('home');
  syncNow();
}

/* ---------- sync ---------- */
async function syncNow(manual) {
  if (syncing || !unlocked) return;
  const q = await idb.all('queue');
  const todo = q.filter(r => r._status !== 'error' || manual);
  if (!todo.length) { if (manual) toast('ไม่มีข้อมูลรอส่ง'); return refreshCounts(); }
  if (!navigator.onLine) { if (manual) toast('ไม่มีอินเทอร์เน็ต ข้อมูลยังเก็บอยู่ในเครื่อง'); return; }
  if (!hasToken()) { needLogin = true; if (view === 'home') renderHome(); if (manual) { unlocked = false; go('unlock'); } return; }
  syncing = true; renderTop();
  let sent = 0, failed = 0;
  try {
    for (let i = 0; i < todo.length; i += SYNC_BATCH) {
      const batch = todo.slice(i, i + SYNC_BATCH);
      const r = await api('save', { records: batch.map(x => { const o = {}; Object.keys(x).forEach(k => { if (k[0] !== '_') o[k] = x[k]; }); return o; }) });
      for (const res of r.results) {
        if (res.status === 'saved' || res.status === 'duplicate') { await idb.del('queue', res.record_id); sent++; }
        else {
          const rec = batch.find(x => x.record_id === res.record_id);
          if (rec) { rec._status = 'error'; rec._err = res.message; await idb.put('queue', rec); failed++; }
        }
      }
    }
    localStorage.setItem('eh_lastsync', thDate(todayIso()) + ' ' + nowLocal().slice(11, 16) + ' น.');
    if (sent || manual) toast(`ส่งข้อมูลแล้ว ${sent} รายการ${failed ? ` ไม่สำเร็จ ${failed} รายการ` : ''}`);
  } catch (e) {
    if (e.code === 'AUTH') { session.token = null; saveSession(); needLogin = true; }
    if (manual || e.code === 'AUTH') toast('ส่งไม่สำเร็จ: ' + e.message);
  } finally {
    syncing = false;
    await refreshCounts();
    if (view === 'home') renderHome();
  }
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  switch (a) {
    case 'login': return onLogin();
    case 'unlock': return onUnlock();
    case 'relogin': unlocked = false; return go('unlock');
    case 'logout': return logout();
    case 'lock': return lockApp();
    case 'settings': return go('settings');
    case 'back': return go(session ? (unlocked ? 'home' : 'unlock') : 'login');
    case 'testapi': return testApi(false);
    case 'saveapi': return testApi(true);
    case 'wipe': return wipeDevice();
    case 'sync': return syncNow(true);
    case 'install': if (installEvt) { installEvt.prompt(); installEvt = null; } return;
    case 'new': {
      const d = await idb.get('kv', 'draft');
      if (d && !confirm('มีแบบที่กรอกค้างไว้ ต้องการทิ้งแบบเดิมแล้วเริ่มใหม่ไหม?')) return;
      newForm(); saveDraftNow(); return go('form');
    }
    case 'resume': F = await idb.get('kv', 'draft'); return F ? go('form') : renderHome();
    case 'discard':
      if (!confirm('ทิ้งแบบที่กรอกค้างไว้? ข้อมูลในแบบนี้จะหายถาวร')) return;
      await idb.del('kv', 'draft'); F = null; return renderHome();
    case 'editq': {
      const rec = await idb.get('queue', b.dataset.id); if (!rec) return;
      const d = await idb.get('kv', 'draft');
      if (d && !confirm('มีแบบที่กรอกค้างไว้ ต้องการทิ้งแบบนั้นเพื่อแก้รายการนี้ไหม?')) return;
      formFromRecord(rec); F.step = REVIEW; saveDraftNow(); return go('form');
    }
    case 'delq':
      if (!confirm('ลบรายการนี้ออกจากเครื่อง? ข้อมูลจะไม่ถูกส่งขึ้นระบบ')) return;
      await idb.del('queue', b.dataset.id); return renderHome();
    case 'home': saveDraftNow(); return go('home');
    case 'prev': if (F.step > 0) { F.step--; saveDraftNow(); renderStep(true); } return;
    case 'next': if (F.step < REVIEW) { F.step++; saveDraftNow(); renderStep(true); } return;
    case 'goto': F.step = +b.dataset.i; saveDraftNow(); return renderStep(true);
    case 'lookup': F.lk = {}; return doLookup();
    case 'autosum': return autoSummary();
    case 'save': return saveRecord();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); e.target.dataset.enter === 'login' ? onLogin() : onUnlock(); }
});

$view.addEventListener('input', e => {
  if (view !== 'form' || !F) return;
  const el = e.target;
  if (el.dataset.date) {
    const k = el.dataset.date, part = el.dataset.part, p = dparts(k);
    el.value = el.value.replace(/\D/g, ''); p[part] = el.value;
    if ((part === 'd' || part === 'm') && el.value.length === 2) el.nextElementSibling && el.nextElementSibling.focus();
    F.v[k] = partsToIso(p);
    return afterChange(k);
  }
  const k = el.dataset.k; if (!k || el.type === 'radio' || el.type === 'checkbox') return;
  const f = FIELD[k];
  if (f && f.type === 'num') {
    const s = el.value.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    if (s !== el.value) el.value = s;
    const n = parseFloat(s); F.v[k] = isNaN(n) ? '' : n;
  } else if (f && f.type === 'cid') {
    el.value = el.value.replace(/\D/g, '').slice(0, 13); F.v[k] = el.value;
    if (validCid(el.value) && F.lk.cid !== el.value) { afterChange(k); return doLookup(); }
  } else if (f && f.type === 'tel') {
    el.value = el.value.replace(/[^\d\-+ ]/g, ''); F.v[k] = el.value;
  } else F.v[k] = el.value;
  afterChange(k);
});

$view.addEventListener('change', e => {
  if (view !== 'form' || !F) return;
  const el = e.target;
  if (el.dataset.tag) {
    const key = el.dataset.tag + '__tags', set = new Set(F.v[key] || []);
    el.checked ? set.add(el.value) : set.delete(el.value);
    F.v[key] = DISEASES.filter(d => set.has(d)); return afterChange(el.dataset.tag);
  }
  const k = el.dataset.k; if (!k) return;
  const f = FIELD[k];
  if (el.type === 'radio') F.v[k] = el.value;
  else if (el.type === 'checkbox') {
    let arr = new Set(F.v[k] || []);
    el.checked ? arr.add(el.value) : arr.delete(el.value);
    if (f.excl) { if (el.checked && el.value === f.excl) arr = new Set([f.excl]); else if (el.checked) arr.delete(f.excl); }
    F.v[k] = f.opts.filter(o => arr.has(o));
  } else return;
  const controls = SECTIONS[F.step].fields.some(x => x.show && x.show[0] === k);
  if (controls || f.excl) { derive(); renderStep(false); saveDraftSoon(); const again = document.querySelector(`input[data-k="${k}"][value="${CSS.escape(el.value)}"]`); if (again) again.focus(); }
  else afterChange(k);
});

window.addEventListener('online', () => { renderTop(); if (view === 'home') renderHome(); syncNow(); });
window.addEventListener('offline', () => { renderTop(); if (view === 'home') renderHome(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { lastHidden = Date.now(); if (view === 'form') saveDraftNow(); }
  else if (unlocked && lastHidden && Date.now() - lastHidden > LOCK_AFTER_MIN * 60000) lockApp();
  else if (unlocked) syncNow();
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'home') renderHome(); });
setInterval(() => { if (unlocked && navigator.onLine) syncNow(); }, 120000);

/* ---------- start ---------- */
(async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try { F = await idb.get('kv', 'draft') || null; } catch (e) { F = null; }
  if (!getApi()) return go('settings');
  go(session ? 'unlock' : 'login');
})();
