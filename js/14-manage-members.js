import { CREATE_USER_URL, UPDATE_PASSWORD_URL, col, sb } from './01-config.js';
import { S, clearSession, isAdmin, isLeader, myClanId, myClanName, shareToken } from './02-state.js';
import { checkHyperPaused, fsDel, fsSet } from './04-api.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';
import { calcEndDate, calcTrialEndDate, formatDate } from './15-manage-rentals.js';

// Card nhỏ hiển thị trạng thái thuê/dùng thử của hội (chỉ Leader thấy, ở tab Quản lý)
// Dữ liệu lấy từ S.rentals / S.trials — đã được 04-api.js tải riêng cho Leader
// (chỉ đúng 1 dòng của hội mình, xem loadAll() nhánh isLeader()).
// clan_trials không có cột end_date → hạn dùng thử = start_date + 7 ngày (calcTrialEndDate).
// ⚠️ Cần đảm bảo RLS Supabase cho phép Leader SELECT clan_rentals/clan_trials
// theo đúng clan_id của mình.
function cardRentalTrialStatus(){
  const clanId = myClanId();
  const rental = (S.rentals||[]).find(r=>r.clanId===clanId);
  const trial = (S.trials||[]).find(t=>t.clanId===clanId);
  const clanName = esc(myClanName());
  let text, icon, borderColor, bgColor;
  if(rental){
    const end = calcEndDate(rental.startDate, rental.months);
    text = `Hội <b>${clanName}</b> còn hạn đến <b>${formatDate(end)}</b> (${rental.months} tháng)`;
    icon='🏠'; borderColor='#16a34a'; bgColor='#f0fdf4';
  } else if(trial){
    const end = calcTrialEndDate(trial.startDate);
    text = `Hội <b>${clanName}</b> dùng thử đến <b>${formatDate(end)}</b>`;
    icon='⏳'; borderColor='#0ea5e9'; bgColor='#f0f9ff';
  } else {
    text = `Hội <b>${clanName}</b> đã kích hoạt vĩnh viễn`;
    icon='♾️'; borderColor='#8b5cf6'; bgColor='#f5f3ff';
  }
  // Có thể ẩn tạm — nhớ trạng thái theo ngày (localStorage), tự hiện lại vào ngày hôm sau
  // để leader không quên mất hạn hội nếu để lâu không xem.
  const dismissKey='hv_rentalcard_dismiss_'+clanId;
  let dismissedToday=false;
  try { dismissedToday = localStorage.getItem(dismissKey)===new Date().toDateString(); } catch(e){}
  if(dismissedToday){
    return `<div id="rental-status-mini" style="display:flex;align-items:center;gap:6px;font-size:.72rem;color:${borderColor};margin-bottom:10px;cursor:pointer" onclick="showRentalCard()">
      <span>${icon}</span><span style="text-decoration:underline dotted">Xem trạng thái hội</span>
    </div>`;
  }
  return `<div id="rental-status-card" style="display:flex;align-items:center;gap:8px;font-size:.78rem;line-height:1.5;border:1.3px solid ${borderColor};background:${bgColor};border-radius:10px;padding:8px 10px;margin-bottom:10px">
    <span style="font-size:1.05rem;flex-shrink:0">${icon}</span>
    <div style="flex:1">${text}</div>
    <button type="button" onclick="dismissRentalCard('${clanId}')" title="Ẩn" style="background:none;border:none;color:${borderColor};opacity:.6;font-size:.9rem;cursor:pointer;padding:2px 4px;flex-shrink:0">✕</button>
  </div>`;
}
window.dismissRentalCard=function(clanId){
  try { localStorage.setItem('hv_rentalcard_dismiss_'+clanId, new Date().toDateString()); } catch(e){}
  render();
};
window.showRentalCard=function(clanId){
  try { localStorage.removeItem('hv_rentalcard_dismiss_'+myClanId()); } catch(e){}
  render();
};

// ── ALL MEMBERS (ADMIN) ───────────────────────────────────────────────────────
export function manageAllMembers(){
  if(!S._mmClan) S._mmClan='all';
  if(S._mmQuery===undefined) S._mmQuery='';
  const clanChips=`<button class="chip ${S._mmClan==='all'?'on':''}" onclick="setMmClan('all')">Tất cả</button>`+
    S.clans.map(c=>`<button class="chip ${S._mmClan===c.id?'on':''}" onclick="setMmClan('${c.id}')">🏅 ${esc(c.name)}</button>`).join('');
  return `<div class="card">
    <div class="card-title">👥 Tất cả thành viên <span id="mm-count" style="font-size:.76rem;font-weight:600;color:var(--mist)"></span></div>
    <div class="sbar-plain" style="margin-bottom:10px">
      <input class="fi" id="mmq" placeholder="🔍 Tìm theo tên, username hoặc id..." value="${esc(S._mmQuery)}" oninput="setMmQuery(this.value);toggleClearBtn(this)">
      <button type="button" class="sbar-x" style="display:${S._mmQuery?'flex':'none'}" onclick="clearSearchInput('mmq','setMmQuery')" aria-label="Xoá tìm kiếm" tabindex="-1">✕</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${clanChips}</div>
    <div id="mm-result"></div>
  </div>`;
}
export function buildMmResult(){
  const filtered=S.members.filter(m=>{
    if(S._mmClan!=='all' && m.clanId!==S._mmClan) return false;
    if(S._mmQuery){
      const q=S._mmQuery.toLowerCase();
      const hit=m.displayName.toLowerCase().includes(q)||m.username.toLowerCase().includes(q)||m.id.toLowerCase().includes(q)||(m.alias||'').toLowerCase().includes(q);
      if(!hit) return false;
    }
    return true;
  });
  const cntEl=document.getElementById('mm-count');
  if(cntEl) cntEl.textContent=`(${filtered.length}/${S.members.length})`;
  const rows=filtered.map(m=>{
    const clan=S.clans.find(c=>c.id===m.clanId);
    return `<tr>
      <td><strong>${esc(m.displayName)}</strong>${m.alias?`<span style="font-size:.74rem;color:var(--mist);margin-left:6px">${esc(m.alias)}</span>`:''}<div style="font-size:.72rem;color:var(--haze)">@${esc(m.username)}</div></td>
      <td>${clan?`<span class="clan-tag">🏅 ${esc(clan.name)}</span>`:'<span style="color:var(--haze)">—</span>'}</td>
      <td style="font-size:.78rem;color:var(--mist)">${(S.ticks[m.id]||[]).length} hoa</td>
      <td style="white-space:nowrap"><button class="ibtn" onclick="copyShareLink('${m.id}')" title="Copy link chia sẻ cho ${esc(m.displayName)}">🔗</button> <button class="ibtn" onclick="openEditAccount('member','${m.id}')" title="Sửa thông tin ${esc(m.displayName)}" style="margin:0 4px">✏️</button> <button class="ibtn del" onclick="confirmDelMember('${m.id}')" title="Xoá ${esc(m.displayName)} (không hoàn tác)">🗑️</button></td>
    </tr>`;
  }).join('');
  return filtered.length===0?`<div class="empty"><div class="empty-icon">👤</div>Không tìm thấy thành viên nào</div>`
    :`<div style="overflow-x:auto"><table class="mtbl"><thead><tr><th>Tên</th><th>Hội</th><th>Hoa</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
window.setMmClan=function(c){
  S._mmClan=c;
  render();
};
let _mmqTimer=null;
window.setMmQuery=function(v){
  S._mmQuery=v;
  clearTimeout(_mmqTimer);
  _mmqTimer=setTimeout(()=>{
    const el=document.getElementById('mm-result');
    if(el){el.innerHTML=buildMmResult();return;}
    render();
  },160);
};

// ── EDIT ACCOUNT (ADMIN ONLY) — xem/sửa username + password + tên hiển thị ──
window.openEditAccount=function(type, id){
  if(!isAdmin()){toast('Chỉ Admin mới có quyền này!','er');return;}
  const list = type==='leader' ? S.leaders : S.members;
  const acc = list.find(x=>x.id===id);
  if(!acc){toast('Không tìm thấy tài khoản','er');return;}
  openModal(type==='leader'?'✏️ Sửa Hội trưởng':'✏️ Sửa Thành viên',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Tên hiển thị</label><input class="fi" id="ea-d" value="${esc(acc.displayName)}"></div>
      <div class="fg-col"><label class="fl">Username</label><input class="fi" id="ea-u" value="${esc(acc.username)}"></div>
      <div class="fg-col"><label class="fl">Mật khẩu mới (để trống nếu không đổi)</label><input class="fi" id="ea-p" type="text" placeholder="Nhập mật khẩu mới...">
        <div style="font-size:.72rem;color:var(--mist);margin-top:4px">Mật khẩu hiện tại: <code style="background:var(--sage);padding:2px 6px;border-radius:6px">${esc(acc.password||'(trống)')}</code></div>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doEditAccount('${type}','${id}')">💾 Lưu</button>`
  );
};
window.doEditAccount=async function(type, id){
  if(!isAdmin()){toast('Chỉ Admin mới có quyền này!','er');return;}
  const d=document.getElementById('ea-d')?.value.trim();
  const u=document.getElementById('ea-u')?.value.trim();
  const newPw=document.getElementById('ea-p')?.value;
  if(!d||!u){toast('Điền đủ tên hiển thị và username!','wn');return;}
  const table = type==='leader' ? 'leaders' : 'members';
  const list = type==='leader' ? S.leaders : S.members;
  const acc = list.find(x=>x.id===id);
  if(!acc){toast('Không tìm thấy tài khoản','er');return;}
  // Check username trùng (trừ chính nó)
  const dup = list.find(x=>x.id!==id && x.username===u);
  if(dup){toast('Username đã tồn tại!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const updateData = type==='leader'
      ? {username:u, displayName:d, clanId:acc.clanId, password: newPw||acc.password}
      : {username:u, displayName:d, clanId:acc.clanId, leaderId:acc.leaderId, alias:acc.alias, year:acc.year, password: newPw||acc.password};
    await fsSet(table, id, updateData);
    acc.username=u; acc.displayName=d;
    if(newPw) acc.password=newPw;

    // Nếu đổi password, cần cập nhật password Auth tương ứng qua Edge Function
    if(newPw){
      const { data: sessData } = await sb.auth.getSession();
      const jwt = sessData?.session?.access_token;
      const res = await fetch(UPDATE_PASSWORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ action: 'updatePassword', refId: id, newPassword: newPw })
      });
      const result = await res.json();
      if(!res.ok || !result.success){
        toast('Đã lưu thông tin, nhưng lỗi cập nhật mật khẩu đăng nhập: '+(result.error||'không rõ'),'wn');
        closeModal();render();setPulse('');
        return;
      }
    }
    closeModal();toast('Đã lưu thay đổi: '+d);
    render();
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='💾 Lưu';}
  }
  setPulse('');
};

// ── Tooltip nhỏ cho các nút hành động (🔗 ✏️ 🗑️) — hiện khi hover (chuột) hoặc
// chạm (mobile). Hover dùng CSS thuần; chạm dùng JS toggle class vì :hover
// không đáng tin cậy trên touch. Style chỉ inject 1 lần vào <head>.
if(typeof document!=='undefined' && !document.getElementById('ibtn-label-style')){
  const st=document.createElement('style');
  st.id='ibtn-label-style';
  st.textContent=`
    .ibtn-label{
      position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);
      background:#1f2937;color:#fff;font-size:.66rem;line-height:1;white-space:nowrap;
      padding:4px 7px;border-radius:6px;pointer-events:none;opacity:0;
      transition:opacity .12s ease;z-index:20;
    }
    .ibtn-label::after{
      content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);
      border:4px solid transparent;border-top-color:#1f2937;
    }
    .ibtn-wrap:hover .ibtn-label,
    .ibtn-wrap.show-label .ibtn-label{opacity:1}
  `;
  document.head.appendChild(st);
}
window._ibtnTouchTimer=null;
window.handleIbtnTouch=function(wrapEl){
  if(!wrapEl) return;
  document.querySelectorAll('.ibtn-wrap.show-label').forEach(el=>{ if(el!==wrapEl) el.classList.remove('show-label'); });
  wrapEl.classList.add('show-label');
  clearTimeout(window._ibtnTouchTimer);
  window._ibtnTouchTimer=setTimeout(()=>wrapEl.classList.remove('show-label'),1400);
};

// ── CLAN MEMBERS (LEADER) ─────────────────────────────────────────────────────
export function manageClanMembers(){
  const clanId=myClanId();
  const clanName=myClanName();
  const myMembers=S.members.filter(m=>m.clanId===clanId);
  const rows=myMembers.map(m=>`<tr>
    <td><strong>${esc(m.displayName)}</strong>${m.isDeputy?`<span style="font-size:.68rem;font-weight:700;background:#ede9fe;color:var(--clan);padding:1px 7px;border-radius:99px;margin-left:6px">🎖️ Hội phó</span>`:''}${m.alias?`<span style="font-size:.74rem;color:var(--mist);margin-left:6px">${esc(m.alias)}</span>`:''}<div style="font-size:.72rem;color:var(--haze)">@${esc(m.username)}</div></td>
    <td style="white-space:nowrap">
      <span class="ibtn-wrap" ontouchstart="handleIbtnTouch(this)" style="position:relative;display:inline-block">
        <button class="ibtn" onclick="copyShareLink('${m.id}')" aria-label="Copy link chia sẻ cho ${esc(m.displayName)}">🔗</button>
        <span class="ibtn-label">Copy link</span>
      </span>
      <span class="ibtn-wrap" ontouchstart="handleIbtnTouch(this)" style="position:relative;display:inline-block;margin:0 4px">
        <button class="ibtn" onclick="openEditMemberLeader('${m.id}')" aria-label="Sửa thông tin ${esc(m.displayName)}">✏️</button>
        <span class="ibtn-label">Sửa</span>
      </span>
      <span class="ibtn-wrap" ontouchstart="handleIbtnTouch(this)" style="position:relative;display:inline-block">
        <button class="ibtn del" onclick="confirmDelMember('${m.id}')" aria-label="Xoá ${esc(m.displayName)} (không hoàn tác)">🗑️</button>
        <span class="ibtn-label">Xoá</span>
      </span>
    </td>
  </tr>`).join('');
  // Khối cảnh báo dài dòng gây rối màn hình đầu — thu gọn thành 1 dòng, bấm vào
  // mới bung chi tiết đầy đủ. Nhớ "đã đọc" qua localStorage để lần sau không
  // che mất bảng thành viên ngay từ đầu (chỉ hiện lại nếu bấm ✏️/"+ Thêm TV").
  let noteExpanded = S._noteExpanded;
  if(noteExpanded===undefined){
    let seen=false;
    try { seen = localStorage.getItem('hv_note_username_seen')==='1'; } catch(e){}
    noteExpanded = !seen;
    S._noteExpanded = noteExpanded;
  }
  const noteHtml = noteExpanded
    ? `<div class="card" style="margin-bottom:10px;border:1.5px solid #f59e0b;background:#fffbeb;cursor:pointer" onclick="toggleUserNote(false)">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:1.3rem;flex-shrink:0">⚠️</span>
        <div style="font-size:.79rem;color:#92400e;line-height:1.6;flex:1">
          <div style="font-weight:800;margin-bottom:4px;font-size:.83rem">Lưu ý khi tạo Username / Mật khẩu</div>
          Nhập <strong>đúng chữ HOA/thường</strong>, <strong>không</strong> ký tự đặc biệt, dấu tiếng Việt hay khoảng trắng — chỉ dùng chữ cái không dấu (a-z, A-Z) và số (0-9).
        </div>
        <span style="font-size:.7rem;color:#92400e;opacity:.6;flex-shrink:0">✕ ẩn</span>
      </div>
    </div>`
    : `<div style="display:flex;align-items:center;gap:6px;font-size:.72rem;color:#92400e;margin-bottom:10px;cursor:pointer" onclick="toggleUserNote(true)">
      <span>⚠️</span><span style="text-decoration:underline dotted">Lưu ý khi đặt Username/Mật khẩu — bấm để xem lại</span>
    </div>`;
  return cardRentalTrialStatus()+noteHtml+`<div class="card">
    <div class="card-title">👥 Thành viên Hội ${esc(clanName)} <span style="font-size:.76rem;font-weight:600;color:var(--mist)">(${myMembers.length})</span>
      <button class="btn btn-g btn-sm" style="margin-left:auto" onclick="openAddMember()">+ Thêm TV</button>
    </div>
    ${myMembers.length===0?`<div class="empty"><div class="empty-icon">👤</div>Chưa có thành viên</div>`
    :`<div style="overflow-x:auto"><table class="mtbl"><thead><tr><th>Tên</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`}
  </div>`;
}

window.toggleUserNote=function(expand){
  S._noteExpanded=expand;
  if(!expand){ try { localStorage.setItem('hv_note_username_seen','1'); } catch(e){} }
  render();
};
window.openAddMember=function(){
  // If leader: auto-assign to their clan. If admin: can pick clan.
  const clanSelect = isAdmin()
    ? `<div class="fg-col"><label class="fl">Hội *</label><select class="fi" id="am-cl">${S.clans.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>`
    : `<input type="hidden" id="am-cl" value="${myClanId()}">`;
  openModal('👤 Thêm thành viên',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:.74rem;color:#92400e;background:#fffbeb;border:1px solid #f59e0b;border-radius:9px;padding:9px 11px;line-height:1.55"><strong>⚠️ Lưu ý:</strong> Nhớ chính xác Username/Mật khẩu (đúng chữ HOA/thường). Không dùng ký tự đặc biệt, dấu tiếng Việt hoặc khoảng trắng.</div>
      <div class="fg-col"><label class="fl">Tên hiển thị *</label><input class="fi" id="am-d" placeholder="Khánh Ly"></div>
      <div class="fg-col"><label class="fl">Username *</label><input class="fi" id="am-u" placeholder="khanhly"></div>
      <div class="fg-col"><label class="fl">Mật khẩu *</label><input class="fi" id="am-p" type="password" placeholder="••••••"></div>
      <div class="fg-col"><label class="fl">Tên game / bí danh</label><input class="fi" id="am-a" placeholder="Mẫn"></div>
      <div class="fg-col"><label class="fl">Năm sinh</label><input class="fi" id="am-y" placeholder="1991" maxlength="4" type="number"></div>
      <div class="fg-col"><label class="fl">Vai trò</label>
        <select class="fi" id="am-role">
          <option value="member">Thành viên</option>
          <option value="deputy">🎖️ Hội phó (được tick hoa giúp thành viên)</option>
        </select>
      </div>
      ${clanSelect}
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doAddMember()">Thêm</button>`
  );
};
window.doAddMember=async function(){
  const d=document.getElementById('am-d')?.value.trim();
  const u=document.getElementById('am-u')?.value.trim();
  const p=document.getElementById('am-p')?.value;
  const a=document.getElementById('am-a')?.value.trim()||'';
  const y=document.getElementById('am-y')?.value.trim()||'';
  const cl=document.getElementById('am-cl')?.value;
  const isDep=document.getElementById('am-role')?.value==='deputy';
  if(!d||!u||!p){toast('Điền đủ thông tin bắt buộc!','wn');return;}
  if(!cl){toast('Chọn Hội!','wn');return;}
  if(S.members.find(m=>m.username===u)){toast('Username đã tồn tại!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const leaderId = isLeader() ? S.session.id : '';
    // Check clan paused trước khi insert vào DB
    if(isLeader() && myClanId()){
      const {data:pauseCheck}=await sb.from('clans').select('paused').eq('id',myClanId()).single();
      if(pauseCheck?.paused){
        toast('Hội của bạn đang tạm dừng bởi Admin.','er');
        await sb.auth.signOut(); clearSession(); render(); return;
      }
    }
    const newId='mb'+Date.now();
    await fsSet('members',newId,{username:u,password:p,displayName:d,alias:a,year:y,clanId:cl,leaderId,isDeputy:isDep});
    // Tạo Auth user song song qua Edge Function (cần JWT hiện tại của admin/leader)
    const { data: sessData } = await sb.auth.getSession();
    const jwt = sessData?.session?.access_token;
    const res = await fetch(CREATE_USER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ username: u, password: p, role: 'member', refId: newId })
    });
    const authResult = await res.json();
    if(await checkHyperPaused(res, authResult)) return;
    if(!res.ok || !authResult.success){
      // Rollback: xóa row members vừa tạo nếu tạo Auth thất bại, tránh tài khoản "mồ côi"
      await fsDel('members', newId);
      toast('Lỗi tạo tài khoản đăng nhập: '+(authResult.error||'không rõ'),'er');
      if(btn){btn.disabled=false;btn.innerHTML='Thêm';}
      setPulse('');
      return;
    }
    S.members.push({id:newId,username:u,password:p,clanId:cl,leaderId,displayName:d,alias:a,year:y,isDeputy:isDep});
    closeModal();toast('Đã thêm: '+d);
    render();
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='Thêm';}
  }
  setPulse('');
};
// ── EDIT MEMBER (LEADER) — sửa tên hiển thị + mật khẩu + vai trò, giới hạn cùng clanId ──
window.openEditMemberLeader=function(id){
  const clanId = myClanId();
  const m = S.members.find(x=>x.id===id && x.clanId===clanId);
  if(!m){toast('Không tìm thấy hoặc không có quyền!','er');return;}
  openModal('✏️ Sửa thành viên',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Tên hiển thị</label><input class="fi" id="elm-d" value="${esc(m.displayName)}"></div>
      <div class="fg-col"><label class="fl">Mật khẩu mới (để trống nếu không đổi)</label>
        <input class="fi" id="elm-p" type="text" placeholder="Nhập mật khẩu mới...">
        <div style="font-size:.72rem;color:var(--mist);margin-top:4px">Hiện tại: <code style="background:var(--sage);padding:2px 6px;border-radius:6px">${esc(m.password||'(trống)')}</code></div>
      </div>
      <div class="fg-col"><label class="fl">Vai trò</label>
        <select class="fi" id="elm-role">
          <option value="member" ${!m.isDeputy?'selected':''}>Thành viên</option>
          <option value="deputy" ${m.isDeputy?'selected':''}>🎖️ Hội phó (được tick hoa giúp thành viên)</option>
        </select>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doEditMemberLeader('${id}')">💾 Lưu</button>`
  );
};
window.doEditMemberLeader=async function(id){
  const clanId = myClanId();
  const m = S.members.find(x=>x.id===id && x.clanId===clanId);
  if(!m){toast('Không tìm thấy hoặc không có quyền!','er');return;}
  const d = document.getElementById('elm-d')?.value.trim();
  const newPw = document.getElementById('elm-p')?.value;
  const isDep = document.getElementById('elm-role')?.value==='deputy';
  if(!d){toast('Nhập tên hiển thị!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const updateData = {
      username:m.username, displayName:d, clanId:m.clanId,
      leaderId:m.leaderId, alias:m.alias, year:m.year,
      password: newPw||m.password, isDeputy: isDep
    };
    await fsSet('members', id, updateData);
    m.displayName=d;
    m.isDeputy=isDep;
    if(newPw){
      m.password=newPw;
      const { data: sessData } = await sb.auth.getSession();
      const jwt = sessData?.session?.access_token;
      const res = await fetch(UPDATE_PASSWORD_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt},
        body:JSON.stringify({action:'updatePassword',refId:id,newPassword:newPw})
      });
      const result = await res.json();
      if(!res.ok||!result.success){
        toast('Đã lưu tên, nhưng lỗi đổi mật khẩu đăng nhập: '+(result.error||'không rõ'),'wn');
        closeModal();render();setPulse('');return;
      }
    }
    closeModal();toast('Đã lưu: '+d);render();
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='💾 Lưu';}
  }
  setPulse('');
};

window.confirmDelMember=function(id){
  const m=S.members.find(x=>x.id===id);
  openModal('⚠️ Xóa thành viên',`Xóa <b>${esc(m?.displayName||id)}</b>? Dữ liệu tick cũng bị xóa.`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelMember('${id}')">Xóa</button>`);
};
window.doDelMember=async function(id){
  closeModal();setPulse('loading');
  try {
    // Xóa tài khoản Auth TRƯỚC (lúc row members vẫn còn để Edge Function check quyền/clan_id)
    try {
      const { data: sessData } = await sb.auth.getSession();
      const jwt = sessData?.session?.access_token;
      const delRes = await fetch(CREATE_USER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ action: 'deleteUser', refId: id })
      });
      const delResult = await delRes.json();
      if(await checkHyperPaused(delRes, delResult)) return;
      if(!delRes.ok || !delResult.success){
        toast('⚠️ Xóa Auth thất bại: '+(delResult.error||'lỗi không rõ'),'er');
      }
    } catch(authErr) {
      toast('⚠️ Xóa Auth lỗi network: '+authErr.message,'er');
    }
    // Sau đó mới xóa row members + ticks
    await Promise.all([fsDel('members',id),fsDel('ticks',id)]);
    S.members=S.members.filter(m=>m.id!==id);
    delete S.ticks[id];
    toast('Đã xóa thành viên');
  } catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');
  render();
};

// ── SHARE LINK: copy link "xem list hoa" của 1 thành viên (Admin + Leader dùng chung) ──
// Người nhận link chỉ cần đúng mật khẩu của thành viên đó (không cần biết username) để
// vào thẳng tab Đánh dấu và xem hoa đã tick.
window.copyShareLink=async function(memberId){
  const token=shareToken(memberId);
  const url=`${location.origin}${location.pathname}#share=${encodeURIComponent(memberId)}:${encodeURIComponent(token)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Đã copy link chia sẻ 🔗');
  } catch(e){
    // Fallback cho trình duyệt/webview không hỗ trợ Clipboard API
    const ta=document.createElement('textarea');
    ta.value=url; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Đã copy link chia sẻ 🔗'); }
    catch(e2){ toast('Không copy được, link: '+url,'er'); }
    document.body.removeChild(ta);
  }
};

