import { col, sb } from './01-config.js';
import { S } from './02-state.js';
import { fsDel, fsSet } from './04-api.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

export function manageClans(){
  const rows=S.clans.map(c=>`<tr>
    <td><strong>${esc(c.name)}</strong>${c.paused?'<span style="font-size:.7rem;color:#e65100;margin-left:4px">⏸ Tạm dừng</span>':''}</td>
    <td style="font-size:.78rem;color:var(--mist)">${S.leaders.filter(l=>l.clanId===c.id).map(l=>esc(l.displayName)).join(', ')||'—'}</td>
    <td style="font-size:.78rem;color:var(--mist)">${S.members.filter(m=>m.clanId===c.id).length+S.leaders.filter(l=>l.clanId===c.id).length} thành viên</td>
    <td style="display:flex;gap:4px">
      <button class="ibtn" style="font-size:.8rem;padding:2px 6px;background:${c.paused?'#e8f5e9':'#fff3e0'};border:1px solid ${c.paused?'#66bb6a':'#ffa726'};border-radius:6px" onclick="togglePauseClan('${c.id}',${c.paused})">${c.paused?'▶ Mở':'⏸ Dừng'}</button>
      <button class="ibtn del" onclick="confirmDelClan('${c.id}')">🗑️</button>
    </td>
  </tr>`).join('');
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">🏅 Quản lý Hội (Clan) <span style="font-size:.76rem;font-weight:600;color:var(--mist)">(${S.clans.length})</span>
      <button class="btn btn-v btn-sm" style="margin-left:auto" onclick="openAddClan()">+ Thêm Hội</button>
    </div>
    ${S.clans.length===0?`<div class="empty"><div class="empty-icon">🏅</div>Chưa có Hội nào</div>`
    :`<div style="overflow-x:auto"><table class="mtbl"><thead><tr><th>Tên Hội</th><th>Hội trưởng</th><th>Thành viên</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`}
  </div>`;
}

window.openAddClan=function(){
  openModal('🏅 Thêm Hội mới',
    `<div class="fg-col"><label class="fl">Tên Hội *</label><input class="fi" id="cl-name" placeholder="Hội Hoa Hồng"></div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-v" onclick="doAddClan()">Thêm</button>`
  );
};
window.doAddClan=async function(){
  const name=document.getElementById('cl-name')?.value.trim();
  if(!name){toast('Nhập tên Hội!','wn');return;}
  if(S.clans.find(c=>c.name===name)){toast('Tên Hội đã tồn tại!','wn');return;}
  const btn=document.querySelector('.mbox .btn-v');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const newId='cl'+Date.now();
    await fsSet('clans',newId,{name});
    S.clans.push({id:newId,name});
    closeModal();toast('Đã thêm Hội: '+name);
    render();
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='Thêm';}
  }
  setPulse('');
};
window.confirmDelClan=function(id){
  const c=S.clans.find(x=>x.id===id);
  const affectedLeaders=S.leaders.filter(l=>l.clanId===id);
  const affectedMembers=S.members.filter(m=>m.clanId===id);
  const warnParts=[];
  if(affectedLeaders.length>0) warnParts.push(`${affectedLeaders.length} hội trưởng`);
  if(affectedMembers.length>0) warnParts.push(`${affectedMembers.length} thành viên`);
  const warnTxt=warnParts.length>0
    ? `<br><span style="color:#e65100;font-size:.82rem">⚠️ ${warnParts.join(' và ')} sẽ bị xóa liên kết hội (tài khoản vẫn còn, chỉ mất clanId).</span>`
    : '';
  openModal('⚠️ Xóa Hội',`Xóa Hội <b>${esc(c?.name||id)}</b>?${warnTxt}`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelClan('${id}')">Xóa</button>`);
};
window.doDelClan=async function(id){
  closeModal();setPulse('loading');
  try {
    const affectedLeaders=S.leaders.filter(l=>l.clanId===id);
    const affectedMembers=S.members.filter(m=>m.clanId===id);
    const clearPromises=[
      ...affectedLeaders.map(l=>fsSet('leaders',l.id,{username:l.username,password:l.password,displayName:l.displayName,clanId:''})),
      ...affectedMembers.map(m=>fsSet('members',m.id,{username:m.username,password:m.password,displayName:m.displayName,alias:m.alias,year:m.year,clanId:'',leaderId:''})),
    ];
    await Promise.all([fsDel('clans',id),...clearPromises]);
    S.clans=S.clans.filter(c=>c.id!==id);
    affectedLeaders.forEach(l=>{l.clanId='';});
    affectedMembers.forEach(m=>{m.clanId='';m.leaderId='';});
    toast('Đã xóa Hội');
  } catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');
  render();
};

window.togglePauseClan=async function(id, currentPaused){
  const c=S.clans.find(x=>x.id===id);
  if(!c) return;
  const newPaused=!currentPaused;
  openModal(
    newPaused?'⏸ Tạm dừng Hội':'▶ Mở lại Hội',
    newPaused
      ?`Tạm dừng Hội <b>${esc(c.name)}</b>?<br><span style="font-size:.82rem;color:#e65100">⚠️ Tất cả thành viên và hội trưởng sẽ bị đăng xuất ngay và không thể đăng nhập lại cho đến khi mở.</span>`
      :`Mở lại Hội <b>${esc(c.name)}</b>? Thành viên sẽ đăng nhập được trở lại.`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button>
     <button class="btn ${newPaused?'btn-r':'btn-v'}" onclick="doPauseClan('${id}',${newPaused})">${newPaused?'⏸ Tạm dừng':'▶ Mở lại'}</button>`
  );
};
window.doPauseClan=async function(id, newPaused){
  closeModal(); setPulse('loading');
  try {
    const {error}=await sb.from('clans').update({paused:newPaused}).eq('id',id);
    if(error) throw error;
    const c=S.clans.find(x=>x.id===id);
    if(c) c.paused=newPaused;
    toast(newPaused?'Đã tạm dừng Hội — thành viên sẽ bị đăng xuất':'Đã mở lại Hội');
  } catch(e){ toast('Lỗi: '+e.message,'er'); }
  setPulse('');
  render();
};

