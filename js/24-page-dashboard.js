// ============================================================
// 24-page-dashboard.js — Các card Dashboard được NHÚNG vào tab
// "👥 Thành viên" (không phải tab riêng). Được import trực tiếp
// bởi 10-page-members.js theo đúng thứ tự nó tự sắp xếp.
// Chỉ dùng cho Thành Viên/Quản Lý — Admin không dùng các card này.
// ============================================================
import { col } from './01-config.js';
import { S, isLeader } from './02-state.js';
import { esc } from './05-ui-helpers.js';

// ─── Card thông tin cá nhân (tên, vai trò, Bộ sưu tập, Đăng xuất) ─────────────
export function cardMyInfo(){
  const s=S.session;
  const roleLabel = isLeader() ? 'Quản Lý' : 'Thành Viên';
  return `<div class="card cn-frame">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:.95rem;font-weight:800;color:var(--ink)">👤 ${esc(s?.displayName||'')}</div>
        <div style="font-size:.76rem;color:var(--mist);margin-top:2px">${roleLabel}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-p btn-sm" onclick="goto('tick')">🌸 Bộ sưu tập</button>
        <button class="btn btn-o btn-sm" onclick="doLogout()">🚪 Đăng xuất</button>
      </div>
    </div>
  </div>`;
}

// ─── Card Hoa Hiếm — hoa ít người trong hội sở hữu nhất ───────────────────────
export function cardRareFlowers(scopeIds, ownedIds){
  const counts=[...ownedIds].map(fid=>{
    const cnt=scopeIds.filter(id=>(S.ticks[id]||[]).includes(fid)).length;
    return {fid,cnt};
  }).sort((a,b)=>a.cnt-b.cnt).slice(0,6);
  const flowerById=new Map(S.flowers.map(f=>[f.id,f]));
  const rows=counts.map(c=>{
    const f=flowerById.get(c.fid);
    if(!f) return '';
    const cv=col(f.color);
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bd)">
      <span style="font-size:.82rem;color:${cv.h};font-weight:700">${esc(f.name)}</span>
      <span style="margin-left:auto;font-size:.75rem;color:var(--mist)">${c.cnt} người sở hữu</span>
    </div>`;
  }).join('');
  return `<div class="card cn-frame">
    <div class="card-title">💎 Hoa Hiếm</div>
    ${rows||`<div class="empty" style="padding:14px 0"><div class="empty-icon">🌿</div>Chưa có dữ liệu</div>`}
  </div>`;
}
