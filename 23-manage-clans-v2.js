// ============================================================
// 23-manage-clans-v2.js — Tạo Hội V2 (import JSON từ game)
// Admin only. Đọc JSON game → preview → tạo hội, leader, members hàng loạt.
// ============================================================
import { CREATE_USER_URL, sb } from './01-config.js';
import { S } from './02-state.js';
import { checkHyperPaused, fsDel, fsSet } from './04-api.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Chuyển tên thành viên → username: bỏ dấu, ký tự đặc biệt, khoảng trắng */
function toUsername(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]/g, '')                     // bỏ ký tự đặc biệt + khoảng trắng
    .toLowerCase();
}

/** Lấy tên hiển thị từ chuỗi game (vd "s4.✿Danh Hà✿⁠" → "s4.✿Danh Hà✿") */
function cleanDisplayName(raw) {
  return (raw || '').trim();
}

/** Parse JSON game, trả về { clanName, leaderName, members[] } hoặc null nếu lỗi
 *
 * Cấu trúc JSON game thực tế:
 *   root.d.v["25"]["9"]  → clan info: {"4":"Black Pink", "2": leaderUid_full, "3": leaderUid_short}
 *   root.d.v["28"]["5"]  → array thành viên có tên: [{"0": uid, "1": "s6.Phương"}, ...]
 *
 * Hội trưởng: uid đầy đủ nằm ở key "2" trong clan info (vd 123126100006)
 * Tên tìm trong v["28"]["5"] theo uid đó.
 */
function parseGameJson(jsonStr) {
  try {
    const root = JSON.parse(jsonStr);
    const v = root?.d?.v ?? root?.v ?? root;

    // 1. Tìm clan info node: có key "9" là object với key "4" (tên hội)
    let clanNode9 = null;
    for (const key of Object.keys(v)) {
      const node = v[key];
      if (node?.['9'] && typeof node['9'] === 'object' && node['9']['4']) {
        clanNode9 = node['9'];
        break;
      }
    }

    // 2. Tìm membersList: key "5" là array, phần tử có key "1" (tên)
    let membersList = null;
    for (const key of Object.keys(v)) {
      const node = v[key];
      if (node?.['5'] && Array.isArray(node['5']) && node['5'].length > 0 && node['5'][0]?.['1']) {
        membersList = node['5'];
        break;
      }
    }

    if (!clanNode9 || !membersList) return null;

    const clanName = clanNode9['4'] || 'Hội mới';

    // Uid đầy đủ hội trưởng: key "2" trong clan info (số lớn như 123126100006)
    // key "3" là uid rút gọn (số nhỏ như 6) — không dùng để tìm tên
    // Hội trưởng không thể detect tự động từ JSON (có thể không có trong danh sách load về)
    // Admin sẽ nhập tên hội trưởng thủ công sau khi parse

    // Tất cả thành viên trong JSON
    const members = membersList
      .map(m => ({ displayName: cleanDisplayName(m['1'] || 'Thành viên') }));

    return { clanName, leaderName: '', members };
  } catch (e) {
    console.error('parseGameJson error:', e);
    return null;
  }
}

// ── State tạm cho V2 ──────────────────────────────────────────────────────────
let _v2 = null; // { clanName, leaderName, members[], clanId, log[] }

// ── Render chính ──────────────────────────────────────────────────────────────
export function manageClanV2() {
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">🏅 Tạo Hội V2 — Import JSON</div>
    <div style="font-size:.8rem;color:var(--mist);margin-bottom:12px;line-height:1.6">
      Dán JSON từ game vào ô bên dưới → <b>Phân tích</b> → xem preview → tạo hội, hội trưởng và thành viên hàng loạt.
    </div>
    <div class="fg-col" style="margin-bottom:10px">
      <label class="fl">JSON từ game *</label>
      <textarea class="fi" id="v2-json" rows="6" placeholder='Dán JSON game vào đây...' style="font-family:monospace;font-size:.74rem;resize:vertical"></textarea>
    </div>
    <button class="btn btn-v" onclick="v2ParseJson()">🔍 Phân tích JSON</button>
    <div id="v2-preview" style="margin-top:16px"></div>
    <div id="v2-log" style="margin-top:12px"></div>
  </div>`;
}

// ── Parse & hiển thị preview ─────────────────────────────────────────────────
window.v2ParseJson = function () {
  const raw = document.getElementById('v2-json')?.value.trim();
  if (!raw) { toast('Dán JSON vào trước!', 'wn'); return; }
  const parsed = parseGameJson(raw);
  if (!parsed) {
    toast('JSON không hợp lệ hoặc không đúng định dạng game!', 'er');
    document.getElementById('v2-preview').innerHTML =
      `<div style="color:#e53935;font-size:.82rem">❌ Không đọc được JSON. Kiểm tra lại định dạng.</div>`;
    return;
  }
  _v2 = { ...parsed, clanId: null, log: [] };
  renderV2Preview();
};

function renderV2Preview() {
  const el = document.getElementById('v2-preview');
  if (!el || !_v2) return;
  const memberRows = _v2.members.map((m, i) => {
    const un = toUsername(m.displayName);
    return `<tr>
      <td style="font-size:.8rem">${esc(m.displayName)}</td>
      <td style="font-size:.78rem;color:var(--mist)"><code>${esc(un)}</code></td>
      <td style="font-size:.78rem;color:var(--mist)"><code>${esc(un)}@123</code></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="border:2px solid var(--leaf);background:var(--sage);margin-bottom:0">
      <div style="font-weight:700;font-size:.95rem;margin-bottom:10px">📋 Preview — Xác nhận trước khi tạo</div>

      <div style="background:#fff;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:.85rem">
        <span style="color:var(--mist)">Hội:</span> <strong>${esc(_v2.clanName)}</strong>
        <button class="btn btn-v btn-sm" style="margin-left:10px" onclick="v2CreateClan()">✅ Tạo Hội này</button>
        <span id="v2-clan-status" style="margin-left:8px;font-size:.78rem"></span>
      </div>

      <div id="v2-leader-section" style="${_v2.clanId ? '' : 'opacity:.4;pointer-events:none'}">
        <div style="background:#fff;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:.85rem">
          <div style="font-weight:700;margin-bottom:8px">🏆 Hội trưởng <span style="font-size:.76rem;color:#e65100">(không thể đọc từ JSON — nhập tay)</span></div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="fi" id="v2-leader-name" placeholder="Nhập tên hiển thị hội trưởng..." style="flex:1;min-width:160px;font-size:.85rem">
            <button class="btn btn-g btn-sm" onclick="v2CreateLeader()">✅ Tạo Hội trưởng</button>
          </div>
          <div style="font-size:.74rem;color:var(--mist);margin-top:6px">Username và mật khẩu sẽ tự sinh từ tên nhập vào</div>
          <span id="v2-leader-status" style="display:block;margin-top:6px;font-size:.78rem"></span>
        </div>
      </div>

      <div id="v2-members-section" style="${_v2.clanId ? '' : 'opacity:.4;pointer-events:none'}">
        <div style="background:#fff;border-radius:10px;padding:10px 14px;font-size:.85rem">
          <div style="font-weight:700;margin-bottom:8px">👥 ${_v2.members.length} Thành viên
            <button class="btn btn-g btn-sm" style="margin-left:10px" onclick="v2CreateAllMembers()">✅ Tạo tất cả thành viên</button>
          </div>
          ${_v2.members.length === 0
            ? '<div style="color:var(--mist);font-size:.8rem">Không có thành viên nào khác ngoài hội trưởng.</div>'
            : `<div style="overflow-x:auto"><table class="mtbl">
                <thead><tr><th>Tên hiển thị</th><th>Username</th><th>Mật khẩu</th></tr></thead>
                <tbody>${memberRows}</tbody>
               </table></div>`
          }
        </div>
      </div>
    </div>`;

  // Nếu đã có clanId (sau khi tạo hội), unlock các section
  if (_v2.clanId) _v2UnlockSections();
}

function _v2UnlockSections() {
  const ls = document.getElementById('v2-leader-section');
  const ms = document.getElementById('v2-members-section');
  if (ls) { ls.style.opacity = '1'; ls.style.pointerEvents = 'auto'; }
  if (ms) { ms.style.opacity = '1'; ms.style.pointerEvents = 'auto'; }
}

// ── Tạo Hội ──────────────────────────────────────────────────────────────────
window.v2CreateClan = async function () {
  if (!_v2) return;
  if (S.clans.find(c => c.name === _v2.clanName)) {
    toast('Tên Hội đã tồn tại!', 'wn'); return;
  }
  const statusEl = document.getElementById('v2-clan-status');
  if (statusEl) statusEl.innerHTML = '<div class="sp" style="display:inline-block"></div>';
  setPulse('loading');
  try {
    const newId = 'cl' + Date.now();
    await fsSet('clans', newId, { name: _v2.clanName });
    S.clans.push({ id: newId, name: _v2.clanName });
    _v2.clanId = newId;
    if (statusEl) statusEl.innerHTML = `<span style="color:#22c55e">✅ Đã tạo Hội!</span>`;
    toast('Đã tạo Hội: ' + _v2.clanName);
    _v2UnlockSections();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#e53935">❌ ${esc(e.message)}</span>`;
    toast('Lỗi tạo Hội: ' + e.message, 'er');
  }
  setPulse('');
};

// ── Tạo Hội trưởng ───────────────────────────────────────────────────────────
window.v2CreateLeader = async function () {
  if (!_v2?.clanId) { toast('Tạo Hội trước!', 'wn'); return; }
  const dn = (document.getElementById('v2-leader-name')?.value || '').trim();
  if (!dn) { toast('Nhập tên hội trưởng trước!', 'wn'); return; }
  const un = toUsername(dn);
  const pw = un + '@123';
  const statusEl = document.getElementById('v2-leader-status');
  if (!un) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#e53935">❌ Tên không hợp lệ để tạo username</span>`;
    return;
  }
  if (statusEl) statusEl.innerHTML = '<div class="sp" style="display:inline-block"></div>';
  setPulse('loading');
  try {
    const newId = 'ld' + Date.now();
    // 1. Ghi vào bảng leaders
    await fsSet('leaders', newId, { username: un, password: pw, clanId: _v2.clanId, displayName: dn });
    // 2. Tạo Auth user
    const { data: sessData } = await sb.auth.getSession();
    const jwt = sessData?.session?.access_token;
    const res = await fetch(CREATE_USER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ username: un, password: pw, role: 'leader', refId: newId })
    });
    const authResult = await res.json();
    if (await checkHyperPaused(res, authResult)) return;
    if (!res.ok || !authResult.success) {
      await fsDel('leaders', newId);
      const msg = 'DB ✅ | Auth ❌ ' + (authResult.error || 'không rõ');
      if (statusEl) statusEl.innerHTML = `<span style="color:#e53935">❌ ${esc(msg)}</span>`;
      toast('Lỗi tạo Auth hội trưởng: ' + (authResult.error || ''), 'er');
      setPulse(''); return;
    }
    S.leaders.push({ id: newId, username: un, password: pw, clanId: _v2.clanId, displayName: dn });
    if (statusEl) statusEl.innerHTML = `<span style="color:#22c55e">✅ Tạo thành công! @${esc(un)} / ${esc(pw)}</span>`;
    toast('Đã tạo hội trưởng: ' + dn);
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#e53935">❌ ${esc(e.message)}</span>`;
    toast('Lỗi: ' + e.message, 'er');
  }
  setPulse('');
};

// ── Tạo tất cả thành viên ────────────────────────────────────────────────────
window.v2CreateAllMembers = async function () {
  if (!_v2?.clanId) { toast('Tạo Hội trước!', 'wn'); return; }
  if (_v2.members.length === 0) { toast('Không có thành viên nào!', 'wn'); return; }

  const logEl = document.getElementById('v2-log');
  if (logEl) logEl.innerHTML = `<div class="card" style="border:1px solid var(--bd);font-size:.78rem">
    <div style="font-weight:700;margin-bottom:8px">📋 Log tạo thành viên</div>
    <div id="v2-log-rows"></div>
  </div>`;

  const { data: sessData } = await sb.auth.getSession();
  const jwt = sessData?.session?.access_token;
  setPulse('loading');

  for (let i = 0; i < _v2.members.length; i++) {
    const m = _v2.members[i];
    const dn = m.displayName;
    const un = toUsername(dn);
    const pw = un + '@123';
    const logRowId = `v2lr-${i}`;
    _v2AppendLog(logRowId, `⏳ [${i + 1}/${_v2.members.length}] <b>${esc(dn)}</b> @${esc(un)} — đang tạo...`);

    if (!un) {
      _v2UpdateLog(logRowId, `⚠️ [${i + 1}] <b>${esc(dn)}</b> — username rỗng, bỏ qua`, '#e65100');
      continue;
    }
    if (S.members.find(x => x.username === un)) {
      _v2UpdateLog(logRowId, `⚠️ [${i + 1}] <b>${esc(dn)}</b> @${esc(un)} — username đã tồn tại, bỏ qua`, '#e65100');
      continue;
    }

    try {
      const newId = 'mb' + Date.now() + i;
      // 1. Ghi DB
      await fsSet('members', newId, {
        username: un, password: pw, displayName: dn,
        alias: '', year: '', clanId: _v2.clanId, leaderId: ''
      });
      // 2. Tạo Auth
      const res = await fetch(CREATE_USER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ username: un, password: pw, role: 'member', refId: newId })
      });
      const authResult = await res.json();
      if (await checkHyperPaused(res, authResult)) { setPulse(''); return; }

      if (!res.ok || !authResult.success) {
        // Rollback DB nếu Auth lỗi
        await fsDel('members', newId);
        _v2UpdateLog(logRowId,
          `❌ [${i + 1}] <b>${esc(dn)}</b> — DB ✅ → Auth ❌ ${esc(authResult.error || 'không rõ')} (đã rollback DB)`,
          '#e53935');
        continue;
      }
      S.members.push({ id: newId, username: un, password: pw, clanId: _v2.clanId, leaderId: '', displayName: dn, alias: '', year: '' });
      _v2UpdateLog(logRowId,
        `✅ [${i + 1}] <b>${esc(dn)}</b> — @${esc(un)} / <code>${esc(pw)}</code>`,
        '#15803d');
    } catch (e) {
      _v2UpdateLog(logRowId, `❌ [${i + 1}] <b>${esc(dn)}</b> — Lỗi: ${esc(e.message)}`, '#e53935');
    }

    // Nhỏ delay tránh rate-limit Edge Function
    await new Promise(r => setTimeout(r, 300));
  }

  setPulse('');
  toast('Hoàn tất tạo thành viên!');
  render();
};

function _v2AppendLog(id, html) {
  const el = document.getElementById('v2-log-rows');
  if (!el) return;
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'padding:4px 0;border-bottom:1px solid var(--bd);line-height:1.5';
  div.innerHTML = html;
  el.appendChild(div);
}
function _v2UpdateLog(id, html, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<span style="color:${color || 'inherit'}">${html}</span>`;
}
