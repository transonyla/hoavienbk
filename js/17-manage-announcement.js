import { col, sb } from './01-config.js';
import { S, isAdmin } from './02-state.js';
import { ensureFreshSession } from './04-api.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

// ── THÔNG BÁO HỆ THỐNG (ADMIN) ─────────────────────────────────────────────
// Bảng system_announcement chỉ 1 row duy nhất (id cố định 'current').
// Thêm → insert row. Sửa → update content. Xóa → xóa hẳn row (nhẹ data, không giữ lịch sử).
// Đảm bảo JWT còn hạn trước khi ghi dữ liệu nhạy cảm (RLS) — dùng ensureFreshSession
// dùng chung từ 04-api.js (đã import ở trên).

export function manageAnnouncement(){
  if(!isAdmin()) return '';
  const ann = S.announcement;
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">📢 Thông Báo Hệ Thống</div>
    <div style="font-size:.75rem;color:var(--mist);margin-bottom:14px;line-height:1.6">
      📌 Thông báo hiện dưới dạng banner nhỏ phía trên cùng trang, cho mọi người đã đăng nhập (kể cả phiên đăng nhập cũ còn hạn). Banner tồn tại cho tới khi bạn xóa thông báo này khỏi hệ thống.
    </div>
    ${ann
      ? `<div style="background:var(--bg2,#fdf3f7);border:1.5px solid var(--bd);border-radius:14px;padding:14px;margin-bottom:12px">
          <div style="font-size:.85rem;color:var(--ink);line-height:1.6;margin-bottom:8px">${esc(ann.content)}</div>
          <div style="font-size:.68rem;color:var(--mist)">Cập nhật lần cuối: ${ann.updatedAt ? new Date(ann.updatedAt).toLocaleString('vi-VN') : '—'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-g btn-sm" onclick="openEditAnnouncement()">✏️ Sửa</button>
          <button class="btn btn-r btn-sm" onclick="confirmDelAnnouncement()">🗑️ Xóa</button>
        </div>`
      : `<div class="empty"><div class="empty-icon">📢</div>Chưa có thông báo nào
          <div style="margin-top:14px"><button class="btn btn-g" onclick="openAddAnnouncement()">+ Thêm thông báo</button></div>
        </div>`
    }
  </div>`;
}
window.openAddAnnouncement=function(){
  openModal('📢 Thêm Thông Báo',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Nội dung thông báo *</label>
        <textarea class="fi" id="ann-content" rows="4" style="resize:vertical;font-family:inherit" placeholder="Nhập nội dung thông báo..."></textarea>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doAddAnnouncement()">Thêm</button>`
  );
};
window.doAddAnnouncement=async function(){
  const content=document.getElementById('ann-content')?.value.trim();
  if(!content){toast('Nhập nội dung thông báo!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const ok = await ensureFreshSession();
    if(!ok){ toast('Phiên đăng nhập đã hết hạn, vui lòng đăng xuất rồi đăng nhập lại!','er'); if(btn){btn.disabled=false;btn.innerHTML='Thêm';} setPulse(''); return; }
    const { data, error } = await sb.from('system_announcement')
      .upsert({ id:'current', content }, { onConflict:'id' })
      .select().single();
    if(error) throw new Error(error.message);
    S.announcement = { id:data.id, content:data.content, updatedAt:data.updated_at };
    S.announcementDismissed=false; // thông báo mới → hiện lại cho chính admin luôn
    closeModal();toast('Đã thêm thông báo!');
    render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Thêm';}}
  setPulse('');
};
window.openEditAnnouncement=function(){
  if(!S.announcement) return;
  openModal('✏️ Sửa Thông Báo',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Nội dung thông báo *</label>
        <textarea class="fi" id="ann-content" rows="4" style="resize:vertical;font-family:inherit">${esc(S.announcement.content)}</textarea>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doEditAnnouncement()">Lưu</button>`
  );
};
window.doEditAnnouncement=async function(){
  const content=document.getElementById('ann-content')?.value.trim();
  if(!content){toast('Nhập nội dung thông báo!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const ok = await ensureFreshSession();
    if(!ok){ toast('Phiên đăng nhập đã hết hạn, vui lòng đăng xuất rồi đăng nhập lại!','er'); if(btn){btn.disabled=false;btn.innerHTML='Lưu';} setPulse(''); return; }
    const { data, error } = await sb.from('system_announcement')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id','current').select().single();
    if(error) throw new Error(error.message);
    S.announcement = { id:data.id, content:data.content, updatedAt:data.updated_at };
    S.announcementDismissed=false; // nội dung đổi → hiện lại banner cho mọi người
    closeModal();toast('Đã cập nhật!');render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Lưu';}}
  setPulse('');
};
window.confirmDelAnnouncement=function(){
  openModal('⚠️ Xóa thông báo',`Xóa thông báo hệ thống hiện tại? Banner sẽ biến mất khỏi trang của mọi người.`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelAnnouncement()">Xóa</button>`);
};
window.doDelAnnouncement=async function(){
  closeModal();setPulse('loading');
  try {
    const ok = await ensureFreshSession();
    if(!ok){ toast('Phiên đăng nhập đã hết hạn, vui lòng đăng xuất rồi đăng nhập lại!','er'); setPulse(''); return; }
    const { error } = await sb.from('system_announcement').delete().eq('id','current');
    if(error) throw new Error(error.message);
    S.announcement=null;
    toast('Đã xóa!');
  } catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');render();
};
