import { S, isAdmin } from './02-state.js';
import { esc } from './05-ui-helpers.js';

async function writeLastLogin(userId, username, displayName, role, accessToken){
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = accessToken || session?.access_token || SUPABASE_ANON_KEY;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_last_login`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        username: username,
        display_name: displayName,
        role: role,
        last_seen: new Date().toISOString(),
      })
    });
    if(!r.ok){ const t = await r.text(); console.warn('writeLastLogin failed:', t); }
  } catch(e){
    console.warn('writeLastLogin error:', e.message);
  }
}
function relativeTime(iso){
  if(!iso) return 'Chưa rõ';
  const diff=Date.now()-new Date(iso).getTime();
  const mins=Math.floor(diff/60000);
  const hrs=Math.floor(mins/60);
  const days=Math.floor(hrs/24);
  if(mins<1)  return 'Vừa xong';
  if(mins<60) return `${mins} phút trước`;
  if(hrs<24)  return `${hrs} giờ trước`;
  return `${days} ngày trước`;
}

export function renderLastLoginTable(){
  if(!isAdmin()) return '';
  if(!S.lastLogins||S.lastLogins.length===0){
    return `<div class="empty"><div class="empty-icon">📋</div>Chưa có dữ liệu đăng nhập.<br><span style="font-size:.76rem">Dữ liệu xuất hiện sau khi mỗi tài khoản đăng nhập lần đầu.</span></div>`;
  }
  const sorted=[...S.lastLogins].sort((a,b)=>new Date(b.lastSeen)-new Date(a.lastSeen)).slice(0,10);
  const rows=sorted.map(u=>{
    const roleIcon={admin:'🔓',leader:'🏆',member:'🌸'}[u.role]||'👤';
    const displayName = u.displayName||u.username||u.userId;
    return `<tr>
      <td>${roleIcon} <strong>${esc(displayName)}</strong><div style="font-size:.7rem;color:var(--mist)">@${esc(u.username||'')}</div></td>
      <td><span style="font-size:.72rem;padding:1px 7px;border-radius:99px;background:var(--sage);color:var(--forest2);font-weight:600">${esc(u.role||'—')}</span></td>
      <td style="font-size:.8rem;color:var(--mist)">${relativeTime(u.lastSeen)}</td>
    </tr>`;
  }).join('');
  return `<div style="font-size:.72rem;color:var(--mist);margin-bottom:8px">Hiển thị 10 lượt đăng nhập gần nhất</div><div style="overflow-x:auto"><table class="mtbl">
    <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Đăng nhập lần cuối</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
