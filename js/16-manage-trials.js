import { col, sb } from './01-config.js';
import { S, isAdmin } from './02-state.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

// ─── HỘI DÙNG THỬ (TRIAL — 7 ngày cố định) ──────────────────────────────────
const TRIAL_DAYS = 7;
export function manageTrials(){
  if(!isAdmin()) return '';
  function trialExpiry(startDate){
    const d = new Date(startDate);
    d.setDate(d.getDate() + TRIAL_DAYS);
    return d;
  }
  function trialStatus(startDate){
    const now = new Date();
    const expiry = trialExpiry(startDate);
    const msLeft = expiry.setHours(0,0,0,0) - new Date(now).setHours(0,0,0,0);
    const daysLeft = Math.round(msLeft/86400000);
    if(daysLeft < 0) return {label:'❌ Quá hạn', color:'#ef4444', bg:'#fef2f2', daysLeft};
    if(daysLeft === 0) return {label:'⏰ Đến hạn', color:'#d97706', bg:'#fffbeb', daysLeft};
    return {label:`✅ Còn hạn (${daysLeft} ngày)`, color:'#16a34a', bg:'#f0fdf4', daysLeft};
  }
  function formatDate(d){
    const dt=new Date(d);
    return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
  }

  const rows = S.trials.map(t=>{
    const clan = S.clans.find(c=>c.id===t.clanId);
    const expiry = trialExpiry(t.startDate);
    const status = trialStatus(t.startDate);
    return `<tr>
      <td><strong>${clan?esc(clan.name):'<span style="color:var(--haze)">—</span>'}</strong></td>
      <td style="font-size:.78rem">${formatDate(t.startDate)}</td>
      <td style="font-size:.78rem">${formatDate(expiry)}</td>
      <td><span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:99px;background:${status.bg};color:${status.color}">${status.label}</span></td>
      <td style="white-space:nowrap">
        <button class="ibtn" onclick="openEditTrial('${t.id}')">✏️</button>
        <button class="ibtn del" onclick="confirmDelTrial('${t.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">⏳ Hội Dùng Thử <span style="font-size:.76rem;font-weight:600;color:var(--mist)">(${S.trials.length})</span>
      <button class="btn btn-g btn-sm" style="margin-left:auto" onclick="openAddTrial()">+ Thêm</button>
    </div>
    <div style="font-size:.75rem;color:var(--mist);margin-bottom:12px;line-height:1.6">
      📌 Thời gian dùng thử cố định ${TRIAL_DAYS} ngày kể từ ngày bắt đầu. Trạng thái <b style="color:#d97706">Đến hạn</b> đúng ngày hết hạn, <b style="color:#ef4444">Quá hạn</b> sau khi hết hạn.
    </div>
    ${S.trials.length===0
      ?`<div class="empty"><div class="empty-icon">⏳</div>Chưa có hội nào dùng thử</div>`
      :`<div style="overflow-x:auto"><table class="mtbl">
          <thead><tr><th>Hội</th><th>Bắt đầu thử</th><th>Ngày hết hạn</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

window.openAddTrial=function(){
  const clanOpts = S.clans.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const today = new Date().toISOString().slice(0,10);
  openModal('⏳ Thêm Hội Dùng Thử',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Chọn Hội *</label>
        <select class="fi" id="tr-clan">${S.clans.length?clanOpts:'<option value="">— Chưa có Hội —</option>'}</select>
      </div>
      <div class="fg-col"><label class="fl">Ngày bắt đầu thử *</label>
        <input class="fi" id="tr-start" type="date" value="${today}">
      </div>
      <div class="fg-col"><label class="fl">Ghi chú</label>
        <input class="fi" id="tr-note" placeholder="Ghi chú thêm (tuỳ chọn)">
      </div>
      <div style="font-size:.74rem;color:var(--mist)">Thời gian dùng thử cố định ${TRIAL_DAYS} ngày, không thể đổi.</div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doAddTrial()">Thêm</button>`
  );
};
window.doAddTrial=async function(){
  const clanId=document.getElementById('tr-clan')?.value;
  const startDate=document.getElementById('tr-start')?.value;
  const note=document.getElementById('tr-note')?.value.trim()||'';
  if(!clanId){toast('Chọn Hội!','wn');return;}
  if(!startDate){toast('Chọn ngày bắt đầu!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const newId='tr'+Date.now();
    const { error } = await sb.from('clan_trials').upsert({
      id:newId, clan_id:clanId, start_date:startDate, note
    },{onConflict:'id'});
    if(error) throw new Error(error.message);
    S.trials.push({id:newId,clanId,startDate,note});
    closeModal();toast('Đã thêm hội dùng thử!');
    render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Thêm';}}
  setPulse('');
};
window.openEditTrial=function(id){
  const t=S.trials.find(x=>x.id===id);if(!t)return;
  const clanOpts = S.clans.map(c=>`<option value="${c.id}" ${c.id===t.clanId?'selected':''}>${esc(c.name)}</option>`).join('');
  openModal('✏️ Sửa Hội Dùng Thử',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Chọn Hội *</label>
        <select class="fi" id="tr-clan">${clanOpts}</select>
      </div>
      <div class="fg-col"><label class="fl">Ngày bắt đầu thử *</label>
        <input class="fi" id="tr-start" type="date" value="${t.startDate}">
      </div>
      <div class="fg-col"><label class="fl">Ghi chú</label>
        <input class="fi" id="tr-note" value="${esc(t.note||'')}" placeholder="Ghi chú thêm (tuỳ chọn)">
      </div>
      <div style="font-size:.74rem;color:var(--mist)">Thời gian dùng thử cố định ${TRIAL_DAYS} ngày, không thể đổi.</div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doEditTrial('${id}')">Lưu</button>`
  );
};
window.doEditTrial=async function(id){
  const clanId=document.getElementById('tr-clan')?.value;
  const startDate=document.getElementById('tr-start')?.value;
  const note=document.getElementById('tr-note')?.value.trim()||'';
  if(!clanId){toast('Chọn Hội!','wn');return;}
  if(!startDate){toast('Chọn ngày bắt đầu!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const { error } = await sb.from('clan_trials').upsert({
      id, clan_id:clanId, start_date:startDate, note
    },{onConflict:'id'});
    if(error) throw new Error(error.message);
    const t=S.trials.find(x=>x.id===id);
    if(t){ t.clanId=clanId; t.startDate=startDate; t.note=note; }
    closeModal();toast('Đã cập nhật!');render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Lưu';}}
  setPulse('');
};
window.confirmDelTrial=function(id){
  const t=S.trials.find(x=>x.id===id);
  const clan=S.clans.find(c=>c.id===t?.clanId);
  openModal('⚠️ Xóa hội dùng thử',`Xóa lượt dùng thử của <b>${clan?esc(clan.name):id}</b>?`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelTrial('${id}')">Xóa</button>`);
};
window.doDelTrial=async function(id){
  closeModal();setPulse('loading');
  try {
    const { error } = await sb.from('clan_trials').delete().eq('id',id);
    if(error) throw new Error(error.message);
    S.trials=S.trials.filter(x=>x.id!==id);
    toast('Đã xóa!');
  } catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');render();
};

