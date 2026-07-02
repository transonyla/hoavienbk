import { isAdmin } from './02-state.js';
import { loadAll } from './04-api.js';
import { setPulse } from './05-ui-helpers.js';
import { render } from './06-render.js';
import { renderLastLoginTable } from './19-lastlogin.js';

export function pageSettings(){
  if(!isAdmin()) return `<div class="empty"><div class="empty-icon">🔒</div>Chỉ Admin mới truy cập được</div>`;
  return `
  <div class="card" style="margin-bottom:14px;border-left:3px solid #22c55e">
    <div class="card-title">🗄️ Trạng thái Kết nối</div>
    <div style="padding:12px 14px;border-radius:10px;border:1.5px solid #22c55e;background:#f0fdf4;display:flex;align-items:center;gap:10px">
      <div style="width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #bbf7d0;flex-shrink:0"></div>
      <div>
        <div style="font-size:.8rem;font-weight:700;color:#15803d">☁️ Supabase</div>
        <div style="font-size:.7rem;color:#166534">Đang kết nối — bqihlqndknrjcjvadgdo.supabase.co</div>
      </div>
      <span style="margin-left:auto;font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:99px;background:#22c55e;color:#fff">ACTIVE</span>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-g btn-sm" onclick="retry()">🔄 Tải lại dữ liệu</button>
    </div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🔑 Thay đổi mật khẩu Admin</div>
    <p style="font-size:.82rem;color:var(--mist);margin-bottom:12px">Mật khẩu admin được mã hóa SHA-256 và lưu trong code. Liên hệ developer để thay đổi.</p>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🕐 Lần đăng nhập cuối — Tất cả tài khoản</div>
    <div style="font-size:.74rem;color:var(--mist);margin-bottom:12px">Chỉ Admin mới xem được mục này. Dữ liệu cập nhật mỗi lần đăng nhập thành công.</div>
    ${renderLastLoginTable()}
  </div>`;
}
window.retry=async function(){setPulse('loading');await loadAll(true);render();};
