import { col, sb } from './01-config.js';
import { S, isAdmin } from './02-state.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

// ─── HỘI ĐÃ THUÊ (ADMIN ONLY) ───────────────────────────────────────────────
export function manageRentals(){
  if(!isAdmin()) return '';
  // Tính kỳ thanh toán từ ngày bắt đầu + số tháng thuê
  function calcPaymentCycles(startDate, months){
    const start = new Date(startDate);
    const cycles = [];
    for(let i=1; i<=months; i++){
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      cycles.push(d);
    }
    return cycles;
  }
  function rentalStatus(startDate, months){
    const now = new Date();
    const cycles = calcPaymentCycles(startDate, months);
    const end = cycles[cycles.length-1];
    if(now >= end) return {label:'⏰ Tới kỳ thanh toán', color:'#ef4444', bg:'#fef2f2'};
    // Kiểm tra xem có cycle nào đã tới không (nhưng chưa phải cycle cuối)
    const reached = cycles.filter(c=>now>=c);
    if(reached.length>0) return {label:'⏰ Tới kỳ thanh toán', color:'#ef4444', bg:'#fef2f2'};
    return {label:'✅ Chưa tới kỳ', color:'#16a34a', bg:'#f0fdf4'};
  }
  function formatDate(d){
    const dt=new Date(d);
    return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
  }

  const rows = S.rentals.map(r=>{
    const clan = S.clans.find(c=>c.id===r.clanId);
    const cycles = calcPaymentCycles(r.startDate, r.months);
    const status = rentalStatus(r.startDate, r.months);
    const cycleStr = cycles.map((c,i)=>`<span style="background:#f3f4f6;border-radius:5px;padding:1px 6px;font-size:.68rem;margin-right:2px">${formatDate(c)}</span>`).join('');
    return `<tr>
      <td><strong>${clan?esc(clan.name):'<span style="color:var(--haze)">—</span>'}</strong></td>
      <td style="font-size:.78rem">${formatDate(r.startDate)}</td>
      <td style="font-size:.78rem">${r.months} tháng</td>
      <td style="font-size:.72rem;line-height:1.8">${cycleStr}</td>
      <td><span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:99px;background:${status.bg};color:${status.color}">${status.label}</span></td>
      <td style="white-space:nowrap">
        <button class="ibtn" onclick="openEditRental('${r.id}')">✏️</button>
        <button class="ibtn del" onclick="confirmDelRental('${r.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">🏠 Hội Đã Thuê <span style="font-size:.76rem;font-weight:600;color:var(--mist)">(${S.rentals.length})</span>
      <button class="btn btn-g btn-sm" style="margin-left:auto" onclick="openAddRental()">+ Thêm</button>
    </div>
    <div style="font-size:.75rem;color:var(--mist);margin-bottom:12px;line-height:1.6">
      📌 Kỳ thanh toán = ngày thuê / tháng thuê + X tháng / năm. Trạng thái chuyển <b style="color:#ef4444">Tới kỳ thanh toán</b> khi đến hạn kỳ gần nhất.
    </div>
    ${S.rentals.length===0
      ?`<div class="empty"><div class="empty-icon">🏠</div>Chưa có hội nào được thuê</div>`
      :`<div style="overflow-x:auto"><table class="mtbl">
          <thead><tr><th>Hội</th><th>Bắt đầu thuê</th><th>Thời hạn</th><th>Kỳ thanh toán</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
    }
  </div>`;
}

window.openAddRental=function(){
  const clanOpts = S.clans.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const today = new Date().toISOString().slice(0,10);
  openModal('🏠 Thêm Hội Đã Thuê',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Chọn Hội *</label>
        <select class="fi" id="rt-clan">${S.clans.length?clanOpts:'<option value="">— Chưa có Hội —</option>'}</select>
      </div>
      <div class="fg-col"><label class="fl">Ngày bắt đầu thuê *</label>
        <input class="fi" id="rt-start" type="date" value="${today}">
      </div>
      <div class="fg-col"><label class="fl">Thời hạn thuê *</label>
        <select class="fi" id="rt-months">
          <option value="1">1 tháng</option>
          <option value="2">2 tháng</option>
          <option value="3">3 tháng</option>
          <option value="6">6 tháng</option>
          <option value="12">12 tháng</option>
        </select>
      </div>
      <div class="fg-col"><label class="fl">Ghi chú</label>
        <input class="fi" id="rt-note" placeholder="Ghi chú thêm (tuỳ chọn)">
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doAddRental()">Thêm</button>`
  );
};
window.doAddRental=async function(){
  const clanId=document.getElementById('rt-clan')?.value;
  const startDate=document.getElementById('rt-start')?.value;
  const months=Number(document.getElementById('rt-months')?.value)||1;
  const note=document.getElementById('rt-note')?.value.trim()||'';
  if(!clanId){toast('Chọn Hội!','wn');return;}
  if(!startDate){toast('Chọn ngày bắt đầu!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const newId='rt'+Date.now();
    const { error } = await sb.from('clan_rentals').upsert({
      id:newId, clan_id:clanId, start_date:startDate, months, note
    },{onConflict:'id'});
    if(error) throw new Error(error.message);
    S.rentals.push({id:newId,clanId,startDate,months,note});
    closeModal();toast('Đã thêm hội thuê!');
    render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Thêm';}}
  setPulse('');
};
window.openEditRental=function(id){
  const r=S.rentals.find(x=>x.id===id);if(!r)return;
  const clanOpts=S.clans.map(c=>`<option value="${c.id}" ${c.id===r.clanId?'selected':''}>${esc(c.name)}</option>`).join('');
  openModal('✏️ Sửa Hội Đã Thuê',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Chọn Hội *</label>
        <select class="fi" id="rt-clan">${clanOpts}</select>
      </div>
      <div class="fg-col"><label class="fl">Ngày bắt đầu thuê *</label>
        <input class="fi" id="rt-start" type="date" value="${r.startDate}">
      </div>
      <div class="fg-col"><label class="fl">Thời hạn thuê *</label>
        <select class="fi" id="rt-months">
          ${[1,2,3,6,12].map(m=>`<option value="${m}" ${m===r.months?'selected':''}>${m} tháng</option>`).join('')}
        </select>
      </div>
      <div class="fg-col"><label class="fl">Ghi chú</label>
        <input class="fi" id="rt-note" value="${esc(r.note)}">
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doEditRental('${id}')">Lưu</button>`
  );
};
window.doEditRental=async function(id){
  const clanId=document.getElementById('rt-clan')?.value;
  const startDate=document.getElementById('rt-start')?.value;
  const months=Number(document.getElementById('rt-months')?.value)||1;
  const note=document.getElementById('rt-note')?.value.trim()||'';
  if(!clanId||!startDate){toast('Điền đủ thông tin!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const { error } = await sb.from('clan_rentals').upsert({
      id, clan_id:clanId, start_date:startDate, months, note
    },{onConflict:'id'});
    if(error) throw new Error(error.message);
    const r=S.rentals.find(x=>x.id===id);
    if(r){r.clanId=clanId;r.startDate=startDate;r.months=months;r.note=note;}
    closeModal();toast('Đã cập nhật!');render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Lưu';}}
  setPulse('');
};
window.confirmDelRental=function(id){
  const r=S.rentals.find(x=>x.id===id);
  const clan=S.clans.find(c=>c.id===r?.clanId);
  openModal('⚠️ Xóa bản thuê',`Xóa bản thuê của <b>${clan?esc(clan.name):id}</b>?`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelRental('${id}')">Xóa</button>`);
};
window.doDelRental=async function(id){
  closeModal();setPulse('loading');
  try {
    const { error } = await sb.from('clan_rentals').delete().eq('id',id);
    if(error) throw new Error(error.message);
    S.rentals=S.rentals.filter(x=>x.id!==id);
    toast('Đã xóa!');
  } catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');render();
};

