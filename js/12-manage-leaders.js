import { CREATE_USER_URL, col, sb } from './01-config.js';
import { S } from './02-state.js';
import { checkHyperPaused, fsDel, fsSet } from './04-api.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

export function manageLeaders(){
  const rows=S.leaders.map(l=>{
    const clan=S.clans.find(c=>c.id===l.clanId);
    return `<tr>
      <td><strong>${esc(l.displayName)}</strong><div style="font-size:.72rem;color:var(--haze)">@${esc(l.username)}</div></td>
      <td>${clan?`<span class="clan-tag">🏅 ${esc(clan.name)}</span>`:'<span style="color:var(--haze)">—</span>'}</td>
      <td style="white-space:nowrap"><button class="ibtn" onclick="openEditAccount('leader','${l.id}')">✏️</button> <button class="ibtn del" onclick="confirmDelLeader('${l.id}')">🗑️</button></td>
    </tr>`;
  }).join('');
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">🏆 Quản lý Hội trưởng <span style="font-size:.76rem;font-weight:600;color:var(--mist)">(${S.leaders.length})</span>
      <button class="btn btn-g btn-sm" style="margin-left:auto" onclick="openAddLeader()">+ Thêm HT</button>
    </div>
    ${S.leaders.length===0?`<div class="empty"><div class="empty-icon">🏆</div>Chưa có hội trưởng</div>`
    :`<div style="overflow-x:auto"><table class="mtbl"><thead><tr><th>Tên / Username</th><th>Hội</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`}
  </div>`;
}
window.openAddLeader=function(){
  const clanOpts=S.clans.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  openModal('🏆 Thêm Hội trưởng',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Tên hiển thị *</label><input class="fi" id="ld-dn" placeholder="Nguyễn Văn A"></div>
      <div class="fg-col"><label class="fl">Username *</label><input class="fi" id="ld-un" placeholder="nguyenvana"></div>
      <div class="fg-col"><label class="fl">Mật khẩu *</label><input class="fi" id="ld-pw" type="password" placeholder="••••••"></div>
      <div class="fg-col"><label class="fl">Hội quản lý *</label><select class="fi" id="ld-cl">${S.clans.length?clanOpts:'<option value="">— Chưa có Hội nào —</option>'}</select></div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doAddLeader()">Thêm</button>`
  );
};
window.doAddLeader=async function(){
  const dn=document.getElementById('ld-dn')?.value.trim();
  const un=document.getElementById('ld-un')?.value.trim();
  const pw=document.getElementById('ld-pw')?.value;
  const cl=document.getElementById('ld-cl')?.value;
  if(!dn||!un||!pw){toast('Điền đủ thông tin!','wn');return;}
  if(!cl){toast('Chọn Hội cho hội trưởng!','wn');return;}
  if(S.leaders.find(l=>l.username===un)){toast('Username đã tồn tại!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const newId='ld'+Date.now();
    await fsSet('leaders',newId,{username:un,password:pw,clanId:cl,displayName:dn});
    // Tạo Auth user song song qua Edge Function (chỉ admin mới tạo được leader)
    const { data: sessData } = await sb.auth.getSession();
    const jwt = sessData?.session?.access_token;
    const res = await fetch(CREATE_USER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ username: un, password: pw, role: 'leader', refId: newId })
    });
    const authResult = await res.json();
    if(await checkHyperPaused(res, authResult)) return;
    if(!res.ok || !authResult.success){
      await fsDel('leaders', newId);
      toast('Lỗi tạo tài khoản đăng nhập: '+(authResult.error||'không rõ'),'er');
      if(btn){btn.disabled=false;btn.innerHTML='Thêm';}
      setPulse('');
      return;
    }
    S.leaders.push({id:newId,username:un,password:pw,clanId:cl,displayName:dn});
    closeModal();toast('Đã thêm hội trưởng: '+dn);
    render();
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='Thêm';}
  }
  setPulse('');
};
window.confirmDelLeader=function(id){
  const l=S.leaders.find(x=>x.id===id);
  const affectedMembers=S.members.filter(m=>m.leaderId===id);
  const warnTxt=affectedMembers.length>0
    ? ` <br><span style="color:#e65100;font-size:.82rem">⚠️ ${affectedMembers.length} thành viên đang thuộc hội trưởng này sẽ bị xóa liên kết leaderId (vẫn còn tài khoản, chỉ mất liên kết).</span>`
    : '';
  openModal('⚠️ Xóa Hội trưởng',`Xóa hội trưởng <b>${esc(l?.displayName||id)}</b>?${warnTxt}`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelLeader('${id}')">Xóa</button>`);
};
window.doDelLeader=async function(id){
  closeModal();setPulse('loading');
  try {
    // Xóa tài khoản Auth TRƯỚC (lúc row leaders vẫn còn, đề phòng sau này thêm check clan_id)
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
    // Clear leaderId of members linked to this leader — giữ đầy đủ field khác để tránh null
    const affectedMembers=S.members.filter(m=>m.leaderId===id);
    const clearPromises=affectedMembers.map(m=>fsSet('members',m.id,{
      username:m.username, password:m.password, displayName:m.displayName,
      alias:m.alias, year:m.year, clanId:m.clanId, leaderId:''
    }));
    await Promise.all([fsDel('leaders',id),fsDel('ticks',id),...clearPromises]);
    S.leaders=S.leaders.filter(l=>l.id!==id);
    delete S.ticks[id];
    affectedMembers.forEach(m=>{m.leaderId='';});
    toast('Đã xóa hội trưởng');
  }
  catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');
  render();
};

