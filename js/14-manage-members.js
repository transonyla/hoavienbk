import { CREATE_USER_URL, UPDATE_PASSWORD_URL, col, sb } from './01-config.js';
import { S, clearSession, isAdmin, isLeader, myClanId, myClanName } from './02-state.js';
import { checkHyperPaused, fsDel, fsSet } from './04-api.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

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
      <td style="white-space:nowrap"><button class="ibtn" onclick="openEditAccount('member','${m.id}')">✏️</button> <button class="ibtn del" onclick="confirmDelMember('${m.id}')">🗑️</button></td>
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

// ── CLAN MEMBERS (LEADER) ─────────────────────────────────────────────────────
export function manageClanMembers(){
  const clanId=myClanId();
  const clanName=myClanName();
  const myMembers=S.members.filter(m=>m.clanId===clanId);
  const rows=myMembers.map(m=>`<tr>
    <td><strong>${esc(m.displayName)}</strong>${m.alias?`<span style="font-size:.74rem;color:var(--mist);margin-left:6px">${esc(m.alias)}</span>`:''}<div style="font-size:.72rem;color:var(--haze)">@${esc(m.username)}</div></td>
    <td style="font-size:.78rem;color:var(--mist)">${m.year||'—'}</td>
    <td style="font-size:.78rem;color:var(--mist)">${(S.ticks[m.id]||[]).length} hoa</td>
    <td><button class="ibtn del" onclick="confirmDelMember('${m.id}')">🗑️</button></td>
  </tr>`).join('');
  const noteHtml=`<div class="card" style="margin-bottom:14px;border:1.5px solid #f59e0b;background:#fffbeb">
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:1.4rem;flex-shrink:0">⚠️</span>
      <div style="font-size:.8rem;color:#92400e;line-height:1.65">
        <div style="font-weight:800;margin-bottom:4px;font-size:.84rem">Lưu ý quan trọng khi tạo Username / Mật khẩu cho thành viên!</div>
        Hội trưởng cần <strong>nhớ và nhập đúng chính xác</strong> Username và Mật khẩu (bao gồm cả <strong>chữ HOA / chữ thường</strong>) để thành viên đăng nhập đúng. Tuyệt đối <strong>không dùng ký tự đặc biệt</strong> (@ # $ % &amp; * ! ...), <strong>không dấu tiếng Việt</strong> và <strong>không có khoảng trắng</strong> trong Username/Mật khẩu — chỉ nên dùng chữ cái không dấu (a-z, A-Z) và số (0-9).
      </div>
    </div>
  </div>`;
  return noteHtml+`<div class="card">
    <div class="card-title">👥 Thành viên Hội ${esc(clanName)} <span style="font-size:.76rem;font-weight:600;color:var(--mist)">(${myMembers.length})</span>
      <button class="btn btn-g btn-sm" style="margin-left:auto" onclick="openAddMember()">+ Thêm TV</button>
    </div>
    ${myMembers.length===0?`<div class="empty"><div class="empty-icon">👤</div>Chưa có thành viên</div>`
    :`<div style="overflow-x:auto"><table class="mtbl"><thead><tr><th>Tên</th><th>Năm sinh</th><th>Hoa</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`}
  </div>`;
}

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
    await fsSet('members',newId,{username:u,password:p,displayName:d,alias:a,year:y,clanId:cl,leaderId});
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
    S.members.push({id:newId,username:u,password:p,clanId:cl,leaderId,displayName:d,alias:a,year:y});
    closeModal();toast('Đã thêm: '+d);
    render();
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='Thêm';}
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

