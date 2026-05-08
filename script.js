/* ===================================================
   CAF 銷售計算工具 — script.js
   Firebase 持久化：records + discounts
   =================================================== */

let items          = [];
let discounts      = [];
let records        = [];
let appliedDiscount = null;
let refundOrder    = null;
let exchangeItems  = [];
let refundQty      = {};

/* ── 工具 ─────────────────────────────────────── */
function fmt(n) { return 'NT$ ' + Math.round(n).toLocaleString('zh-TW'); }

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/** 將任何時間值統一轉成 Date 物件 */
function toDate(val) {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  // Firestore Timestamp 物件
  if (val && typeof val.toDate === 'function') return val.toDate();
  return new Date(val);
}

/* ── Tab ──────────────────────────────────────── */
function switchTab(t) {
  const names = ['sale','discount','refund','records'];
  document.querySelectorAll('.tab').forEach((el,i) => el.classList.toggle('active', names[i] === t));
  document.querySelectorAll('.panel').forEach((el,i) => el.classList.toggle('active', names[i] === t));
  if (t === 'records') filterRecords();
  if (t === 'refund')  loadRefundSelect();
}

/* ===================================================
   銷售結帳
   =================================================== */
function addItem() {
  const n = document.getElementById('p-name').value.trim();
  const p = parseFloat(document.getElementById('p-price').value) || 0;
  const q = parseInt(document.getElementById('p-qty').value) || 1;
  if (!n || p <= 0) { showToast('請填入商品名稱與單價'); return; }
  items.push({ id: Date.now(), name: n, price: p, qty: q });
  document.getElementById('p-name').value  = '';
  document.getElementById('p-price').value = '';
  document.getElementById('p-qty').value   = '1';
  renderItems();
}

function renderItems() {
  const list = document.getElementById('item-list');
  if (!items.length) {
    list.innerHTML = '<div class="empty">尚未加入任何商品</div>';
    updateTotals();
    return;
  }
  list.innerHTML = items.map((it, i) => `
    <div class="item-row">
      <div class="item-name">${it.name}</div>
      <div class="qty-ctrl">
        <button onclick="changeQty(${i},-1)">−</button>
        <span>${it.qty}</span>
        <button onclick="changeQty(${i},1)">＋</button>
      </div>
      <div class="item-price">${fmt(it.price)}</div>
      <div class="item-sub">${fmt(it.price * it.qty)}</div>
      <button class="item-del" onclick="removeItem(${i})" title="移除">×</button>
    </div>`).join('');
  updateTotals();
}

function changeQty(i, d) { items[i].qty = Math.max(1, items[i].qty + d); renderItems(); }
function removeItem(i)    { items.splice(i, 1); renderItems(); }

function updateTotals() {
  const sub = items.reduce((s, it) => s + it.price * it.qty, 0);
  let disc = 0;
  if (appliedDiscount) {
    if (appliedDiscount.type === 'percent') disc = sub * (appliedDiscount.val / 100);
    else disc = Math.min(appliedDiscount.val, sub);
  }
  const taxable    = sub - disc;
  const taxEnabled = document.getElementById('tax-toggle').checked;
  const tax        = taxEnabled ? taxable * 0.05 : 0;
  const total      = taxable + tax;

  document.getElementById('t-subtotal').textContent = fmt(sub);
  const dr = document.getElementById('t-disc-row');
  if (disc > 0) {
    dr.style.display = 'flex';
    document.getElementById('t-disc-val').textContent = '-' + fmt(disc);
  } else {
    dr.style.display = 'none';
  }

  const taxRow = document.getElementById('t-tax-row');
  const taxLabelText = document.getElementById('tax-label-text');
  if (taxEnabled) {
    taxRow.style.opacity = '1';
    taxLabelText.textContent = '稅金 5%';
    document.getElementById('t-tax').textContent = fmt(tax);
  } else {
    taxRow.style.opacity = '0.4';
    taxLabelText.textContent = '稅金 5%（未計）';
    document.getElementById('t-tax').textContent = 'NT$ 0';
  }

  document.getElementById('t-total').textContent = fmt(total);
  calcChange();
  return { sub, disc, tax, total, taxEnabled };
}

function calcChange() {
  const paid      = parseFloat(document.getElementById('paid').value) || 0;
  const totalText = document.getElementById('t-total').textContent.replace(/[^\d]/g, '');
  const total     = parseInt(totalText) || 0;
  const ch        = paid - total;
  document.getElementById('change').value =
    ch >= 0 ? ('NT$ ' + ch.toLocaleString('zh-TW')) : '不足 NT$ ' + Math.abs(ch).toLocaleString('zh-TW');
}

function applyCode() {
  const code = document.getElementById('disc-code').value.trim().toUpperCase();
  const d = discounts.find(x => x.code.toUpperCase() === code && isDiscountActive(x));
  if (!d) { showToast('折扣碼無效或已過期'); return; }
  const sub = items.reduce((s, it) => s + it.price * it.qty, 0);
  if (d.minAmount && sub < d.minAmount) {
    showToast(`需消費滿 NT$${d.minAmount} 才可使用此折扣`);
    return;
  }
  appliedDiscount = d;
  showAppliedDisc(d);
  updateTotals();
  showToast('✓ 折扣已套用：' + d.name);
}

function isDiscountActive(d) {
  const now = new Date();
  if (d.startDate) { const s = new Date(d.startDate + 'T' + (d.startTime || '00:00')); if (now < s) return false; }
  if (d.endDate)   { const e = new Date(d.endDate   + 'T' + (d.endTime   || '23:59')); if (now > e) return false; }
  return true;
}

function showAppliedDisc(d) {
  document.getElementById('applied-disc').style.display = 'block';
  const label = d.type === 'percent' ? `折扣 ${d.val}%` : `折 NT$${d.val}`;
  document.getElementById('applied-disc-tag').innerHTML = `
    <div class="d-info">
      <div class="d-name">${d.name} <span class="badge green">${label}</span></div>
      <div class="d-detail">折扣碼：${d.code}</div>
    </div>
    <button class="btn sm danger" onclick="removeDisc()">移除</button>`;
}

function removeDisc() {
  appliedDiscount = null;
  document.getElementById('applied-disc').style.display = 'none';
  document.getElementById('disc-code').value = '';
  updateTotals();
}

function renderActiveDiscounts() {
  const active = discounts.filter(isDiscountActive);
  const el = document.getElementById('active-discounts');
  if (!active.length) {
    el.innerHTML = '<div class="empty" style="padding:0.5rem">目前無可用折扣</div>';
    return;
  }
  el.innerHTML = active.map(d => `
    <div class="disc-tag" onclick="selectDiscount(${d.id})">
      <div class="d-info">
        <div class="d-name">${d.name} <span class="badge green">${d.type === 'percent' ? d.val + '%' : 'NT$' + d.val}</span></div>
        <div class="d-detail">碼：${d.code}</div>
      </div>
    </div>`).join('');
}

function selectDiscount(id) {
  const d = discounts.find(x => x.id === id);
  if (d) { appliedDiscount = d; showAppliedDisc(d); updateTotals(); showToast('✓ 折扣已套用：' + d.name); }
}

/* ── Firebase：儲存 Record ───────────────────── */
async function saveRecordToFirebase(record) {
  try {
    // 將 Date 轉成 ISO 字串存入 Firestore
    const data = { ...record, time: toDate(record.time).toISOString() };
    await window.fb.addDoc(window.fb.collection(window.db, 'records'), data);
  } catch (e) {
    console.error('儲存 record 失敗', e);
    showToast('⚠ 資料同步失敗，請檢查網路');
  }
}

function checkout() {
  if (!items.length) { showToast('請先加入商品'); return; }
  const totals = updateTotals();
  const rec = {
    id:         '#' + (1000 + records.length + 1),
    time:       new Date(),
    type:       'sale',
    items:      JSON.parse(JSON.stringify(items)),
    discount:   appliedDiscount ? { ...appliedDiscount } : null,
    sub:        totals.sub,
    discAmt:    totals.disc,
    tax:        totals.tax,
    total:      totals.total,
    taxEnabled: totals.taxEnabled
  };
  records.unshift(rec);
  saveRecordToFirebase(rec);

  items = []; appliedDiscount = null;
  document.getElementById('applied-disc').style.display = 'none';
  document.getElementById('disc-code').value = '';
  document.getElementById('paid').value      = '';
  document.getElementById('change').value    = '';
  renderItems();
  renderActiveDiscounts();
  showToast('✓ 結帳完成！訂單 ' + rec.id, 3000);
}

/* ===================================================
   折扣管理
   =================================================== */
function updateDiscType() {
  const t = document.getElementById('d-type').value;
  document.getElementById('d-val-label').textContent = t === 'percent' ? '折扣值 (%)' : '折扣金額 (NT$)';
}

/* ── Firebase：儲存 Discount ─────────────────── */
async function saveDiscountToFirebase(discount) {
  try {
    // 以折扣碼作為文件 ID，方便之後刪除
    const docRef = window.fb.doc(window.db, 'discounts', discount.code);
    await window.fb.setDoc(docRef, discount);
  } catch (e) {
    console.error('儲存 discount 失敗', e);
    showToast('⚠ 折扣同步失敗，請檢查網路');
  }
}

async function deleteDiscountFromFirebase(code) {
  try {
    const docRef = window.fb.doc(window.db, 'discounts', code);
    await window.fb.deleteDoc(docRef);
  } catch (e) {
    console.error('刪除 discount 失敗', e);
  }
}

function addDiscount() {
  const name      = document.getElementById('d-name').value.trim();
  const code      = document.getElementById('d-code').value.trim();
  const type      = document.getElementById('d-type').value;
  const val       = parseFloat(document.getElementById('d-val').value) || 0;
  const startDate = document.getElementById('d-start').value;
  const endDate   = document.getElementById('d-end').value;
  const startTime = document.getElementById('d-stime').value;
  const endTime   = document.getElementById('d-etime').value;
  const minAmount = parseFloat(document.getElementById('d-min').value) || 0;

  if (!name || !code || val <= 0) { showToast('請填入名稱、折扣碼與折扣值'); return; }
  if (discounts.find(d => d.code.toUpperCase() === code.toUpperCase())) {
    showToast('此折扣碼已存在');
    return;
  }

  const discount = {
    id: Date.now(),
    name,
    code:      code.toUpperCase(),
    type,
    val,
    startDate,
    endDate,
    startTime,
    endTime,
    minAmount
  };
  discounts.push(discount);
  saveDiscountToFirebase(discount);

  ['d-name','d-code','d-val','d-start','d-end','d-stime','d-etime','d-min']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('d-type').value = 'percent';
  updateDiscType();
  renderDiscList();
  renderActiveDiscounts();
  showToast('✓ 折扣已建立：' + name);
}

function renderDiscList() {
  const el = document.getElementById('disc-list');
  if (!discounts.length) { el.innerHTML = '<div class="empty">尚未建立任何折扣</div>'; return; }
  el.innerHTML = discounts.map((d, i) => {
    const active    = isDiscountActive(d);
    const label     = d.type === 'percent' ? `${d.val}% 折扣` : `折 NT$${d.val}`;
    const period    = [d.startDate, d.endDate].filter(Boolean).join(' ～ ') || '長期有效';
    const timeRange = (d.startTime || d.endTime) ? ` ${d.startTime || '00:00'}–${d.endTime || '23:59'}` : '';
    return `<div class="disc-tag" style="cursor:default">
      <div class="d-info">
        <div class="d-name">${d.name} <span class="badge ${active ? 'green' : 'amber'}">${active ? '進行中' : '未啟用'}</span></div>
        <div class="d-detail">${label}${d.minAmount ? ' | 最低NT$' + d.minAmount : ''} | 碼：${d.code}</div>
        <div class="d-detail">${period}${timeRange}</div>
      </div>
      <button class="btn sm danger" onclick="deleteDiscount(${i})">刪除</button>
    </div>`;
  }).join('');
}

function deleteDiscount(i) {
  const d = discounts[i];
  deleteDiscountFromFirebase(d.code);
  discounts.splice(i, 1);
  renderDiscList();
  renderActiveDiscounts();
  showToast('已刪除折扣：' + d.name);
}

/* ===================================================
   退換貨
   =================================================== */
function loadRefundSelect() {
  const sel   = document.getElementById('ref-order');
  const sales = records.filter(r => r.type === 'sale');
  sel.innerHTML = '<option value="">— 請選擇訂單 —</option>' +
    sales.map(r => {
      const d   = toDate(r.time);
      const dStr = d.toLocaleDateString('zh-TW');
      const tStr = d.toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' });
      return `<option value="${r.id}">${r.id} | ${dStr} ${tStr} | ${fmt(r.total)}</option>`;
    }).join('');
}

function loadRefundOrder() {
  const id = document.getElementById('ref-order').value;
  if (!id) {
    document.getElementById('refund-orig').style.display   = 'none';
    document.getElementById('refund-select').innerHTML     = '<div class="empty">請先選擇訂單</div>';
    document.getElementById('refund-result').style.display = 'none';
    document.getElementById('exchange-card').style.display = 'none';
    return;
  }
  refundOrder   = records.find(r => r.id === id);
  if (!refundOrder) return;
  exchangeItems = [];
  refundQty     = {};

  document.getElementById('refund-orig').style.display   = 'block';
  document.getElementById('exchange-card').style.display = 'block';
  document.getElementById('orig-items').innerHTML = refundOrder.items.map(it =>
    `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:var(--text2)">
      <span>${it.name} ×${it.qty}</span><span>${fmt(it.price * it.qty)}</span>
    </div>`).join('');
  document.getElementById('orig-total').textContent = fmt(refundOrder.total);
  document.getElementById('refund-select').innerHTML =
    '<div class="section-title">勾選要退貨的商品</div>' +
    refundOrder.items.map((it, i) => `
      <div class="refund-check">
        <input type="checkbox" id="rck-${i}" onchange="calcRefund()" />
        <label style="flex:1;color:var(--text);cursor:pointer">${it.name}</label>
        <div class="qty-ctrl">
          <button onclick="changeRefundQty(${i}, -1)">−</button>
          <span id="rqty-${i}">1</span>
          <button onclick="changeRefundQty(${i}, 1)">＋</button>
        </div>
        <span style="color:var(--text2)">/ ${it.qty}</span>
        <span style="font-weight:500;margin-left:8px">${fmt(it.price)}</span>
      </div>`).join('');
  document.getElementById('refund-result').style.display = 'block';
  renderExchangeList();
  calcRefund();
}

function changeRefundQty(i, delta) {
  if (!refundOrder) return;
  const max    = refundOrder.items[i].qty;
  const current = refundQty[i] || 1;
  refundQty[i]  = Math.min(max, Math.max(1, current + delta));
  document.getElementById(`rqty-${i}`).textContent = refundQty[i];
  calcRefund();
}

function calcRefund() {
  if (!refundOrder) return;
  let origSum = 0;
  refundOrder.items.forEach((it, i) => {
    const el = document.getElementById('rck-' + i);
    if (el && el.checked) {
      const qty = refundQty[i] || 1;
      origSum += it.price * qty;
    }
  });
  const newSum = exchangeItems.reduce((s, x) => s + x.price * x.qty, 0);
  const diff   = origSum - newSum;
  document.getElementById('r-orig').textContent        = fmt(origSum);
  document.getElementById('r-new').textContent         = fmt(newSum);
  document.getElementById('r-diff').textContent        = fmt(Math.abs(diff));
  document.getElementById('r-diff-label').textContent  = diff >= 0 ? '應退金額' : '需補差額';
  document.getElementById('r-diff').style.color        = diff >= 0 ? 'var(--green)' : 'var(--red)';
}

function addExchangeItem() {
  const n = document.getElementById('ex-name').value.trim();
  const p = parseFloat(document.getElementById('ex-price').value) || 0;
  const q = parseInt(document.getElementById('ex-qty').value) || 1;
  if (!n || p <= 0) { showToast('請填入換貨商品名稱與單價'); return; }
  exchangeItems.push({ name: n, price: p, qty: q });
  document.getElementById('ex-name').value  = '';
  document.getElementById('ex-price').value = '';
  document.getElementById('ex-qty').value   = '1';
  renderExchangeList();
  calcRefund();
}

function renderExchangeList() {
  const el = document.getElementById('exchange-list');
  if (!exchangeItems.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="section-title">換貨商品</div>' +
    exchangeItems.map((x, i) => `
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;align-items:center">
        <span style="color:var(--text)">${x.name} ×${x.qty}</span>
        <span style="display:flex;gap:8px;align-items:center">
          ${fmt(x.price * x.qty)}
          <button class="btn sm danger" onclick="removeExchange(${i})">移除</button>
        </span>
      </div>`).join('');
}

function removeExchange(i) { exchangeItems.splice(i, 1); renderExchangeList(); calcRefund(); }

function processRefund() {
  if (!refundOrder) return;
  const retItems = [];
  refundOrder.items.forEach((it, i) => {
    const el = document.getElementById('rck-' + i);
    if (el && el.checked) {
      const qty = refundQty[i] || 1;
      retItems.push({ ...it, qty });
    }
  });
  if (!retItems.length && !exchangeItems.length) {
    showToast('請選擇退貨商品或加入換貨商品');
    return;
  }
  const origSum = retItems.reduce((s, it) => s + it.price * it.qty, 0);
  const newSum  = exchangeItems.reduce((s, x) => s + x.price * x.qty, 0);
  const diff    = origSum - newSum;
  const rec = {
    id:           '#R' + (100 + records.filter(r => r.type === 'refund').length + 1),
    time:         new Date(),
    type:         'refund',
    origOrderId:  refundOrder.id,
    returnItems:  retItems,
    exchangeItems:[...exchangeItems],
    origAmt:      origSum,
    newAmt:       newSum,
    diff,
    total:        diff
  };
  records.unshift(rec);
  saveRecordToFirebase(rec);   // ← 正確位置，rec 已宣告

  showToast(`✓ 退換貨完成！${diff >= 0 ? '應退：' : '需補：'}${fmt(Math.abs(diff))}`, 3000);
  refundOrder = null; exchangeItems = [];
  document.getElementById('ref-order').value            = '';
  document.getElementById('refund-orig').style.display  = 'none';
  document.getElementById('refund-select').innerHTML    = '<div class="empty">請先選擇訂單</div>';
  document.getElementById('refund-result').style.display= 'none';
  document.getElementById('exchange-card').style.display= 'none';
}

/* ===================================================
   銷售記錄
   =================================================== */
function filterRecords() {
  const fs  = document.getElementById('f-start').value;
  const fe  = document.getElementById('f-end').value;
  const fst = document.getElementById('f-stime').value;
  const fet = document.getElementById('f-etime').value;
  const ft  = document.getElementById('f-type').value;
  const res = records.filter(r => {
    const d = toDate(r.time);
    if (fs) { const sd = new Date(fs + 'T' + (fst || '00:00')); if (d < sd) return false; }
    if (fe) { const ed = new Date(fe + 'T' + (fet || '23:59')); if (d > ed) return false; }
    if (ft && r.type !== ft) return false;
    return true;
  });
  renderRecords(res);
}

function clearFilter() {
  ['f-start','f-end','f-stime','f-etime'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-type').value = '';
  filterRecords();
}

function renderRecords(res) {
  const saleTotal = res.filter(r => r.type === 'sale').reduce((s, r) => s + r.total, 0);
  const refTotal  = Math.abs(res.filter(r => r.type === 'refund' && r.diff > 0).reduce((s, r) => s + r.diff, 0));
  document.getElementById('rec-count').textContent = res.length;
  document.getElementById('rec-sale').textContent  = fmt(saleTotal);
  document.getElementById('rec-refund').textContent= fmt(refTotal);
  const net   = saleTotal - refTotal;
  const netEl = document.getElementById('rec-net');
  netEl.textContent = fmt(net);
  netEl.className   = 'value ' + (net >= 0 ? 'green' : 'red');

  const el = document.getElementById('record-list');
  if (!res.length) { el.innerHTML = '<div class="empty">此條件無銷售記錄</div>'; return; }
  el.innerHTML = res.map(r => {
    const d   = toDate(r.time);
    const ts  = `${d.toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'})}<br><span style="color:var(--text3)">${d.toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</span>`;
    const badge    = r.type === 'sale' ? '<span class="badge blue">銷售</span>' : '<span class="badge red">退換貨</span>';
    const desc     = r.type === 'sale'
      ? r.items.map(i => i.name).slice(0, 2).join('、') + (r.items.length > 2 ? '…' : '')
      : `退：${r.origOrderId}`;
    const discAmt  = r.type === 'sale' && r.discAmt ? `<span style="color:var(--green)">${fmt(r.discAmt)}</span>` : '—';
    const taxBadge = r.type === 'sale'
      ? (r.taxEnabled ? `<span class="badge green" style="font-size:10px;margin-left:4px">含稅</span>` : `<span class="badge amber" style="font-size:10px;margin-left:4px">未稅</span>`)
      : '';
    const total    = r.type === 'sale'
      ? `<span style="color:var(--green);font-weight:600">${fmt(r.total)}</span>${taxBadge}`
      : `<span style="color:${r.diff >= 0 ? 'var(--red)' : 'var(--green)'};font-weight:600">${r.diff >= 0 ? '-' : '+'}${fmt(Math.abs(r.diff))}</span>`;
    const origAmt  = r.type === 'sale' ? fmt(r.sub) : fmt(r.origAmt || 0);
    return `<div class="record-row">
      <div>${ts}</div>
      <div style="color:var(--text2)">${desc}</div>
      <div>${badge}</div>
      <div>${origAmt}</div>
      <div>${discAmt}</div>
      <div>${total}</div>
    </div>`;
  }).join('');
}

/* ===================================================
   Firebase 初始載入
   =================================================== */
async function loadAllFromFirebase() {
  try {
    // 載入 records
    const recSnap = await window.fb.getDocs(window.fb.collection(window.db, 'records'));
    records = [];
    recSnap.forEach(doc => records.push(doc.data()));
    records.sort((a, b) => toDate(b.time) - toDate(a.time));

    // 載入 discounts
    const discSnap = await window.fb.getDocs(window.fb.collection(window.db, 'discounts'));
    discounts = [];
    discSnap.forEach(doc => discounts.push(doc.data()));

    filterRecords();
    renderDiscList();
    renderActiveDiscounts();
    console.log('✓ Firebase 資料載入完成');
  } catch (e) {
    console.error('Firebase 載入失敗', e);
    showToast('⚠ 無法連接資料庫，請重新整理');
  } finally {
    // 隱藏載入遮罩
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}

/* ── 等 Firebase 模組就緒再初始化 ─────────────── */
function init() {
  renderItems();
  renderDiscList();
  renderActiveDiscounts();
  loadAllFromFirebase();
}

if (window.db) {
  // Firebase 已就緒（同步載入）
  init();
} else {
  // 等待 firebase-ready 事件
  window.addEventListener('firebase-ready', init, { once: true });
}
