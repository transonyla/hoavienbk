import { COLS, UPLOAD_IMAGE_URL, UPLOAD_KV_URL, col, sb } from './01-config.js';
import { S } from './02-state.js';
import { fsDel, fsSet } from './04-api.js';
import { closeModal, esc, openModal, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

// ── GITHUB + JSDELIVR UPLOAD ──────────────────────────────────────────────────
window.triggerImgUpload=function(){
  document.getElementById('ef-img-file')?.click();
};
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result.split(',')[1]); // bỏ phần "data:...;base64,"
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}
window.onImgFileChange=async function(input){
  const file=input.files[0];
  if(!file) return;
  if(file.size>5*1024*1024){toast('Ảnh tối đa 5MB!','wn');return;}
  const preview=document.getElementById('ef-img-preview');
  const urlInput=document.getElementById('ef-img');
  const uploadBtn=document.getElementById('ef-upload-btn');
  if(uploadBtn){uploadBtn.disabled=true;uploadBtn.innerHTML='<div class="sp"></div> Đang upload...';}
  try {
    const base64=await fileToBase64(file);
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();

    // Lấy access token của session hiện tại (admin đang đăng nhập) để edge function xác thực
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if(!accessToken){toast('Bạn cần đăng nhập lại trước khi upload ảnh','er');throw new Error('Chưa đăng nhập');}

    const res=await fetch(UPLOAD_IMAGE_URL,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${accessToken}`,
      },
      body:JSON.stringify({ base64, ext }),
    });
    const data=await res.json();

    if(res.ok && data.success){
      urlInput.value=data.url;
      if(preview){preview.src=data.url;preview.style.display='block';}
      toast('Upload ảnh thành công! 🖼️ (có thể mất 1-2 phút để CDN cập nhật)');
    } else {
      toast('Upload thất bại: '+(data.error||'Lỗi không xác định'),'er');
    }
  } catch(e){toast('Lỗi upload: '+e.message,'er');}
  if(uploadBtn){uploadBtn.disabled=false;uploadBtn.innerHTML='🖼️ Chọn ảnh';}
};

// ── Upload URL2 (Cloudflare KV) ───────────────────────────────────────────────
window.triggerImgUpload2=function(){
  document.getElementById('ef-img2-file')?.click();
};
window.onImgFileChange2=async function(input){
  const file=input.files[0];
  if(!file) return;
  if(file.size>5*1024*1024){toast('Ảnh tối đa 5MB!','wn');return;}
  const urlInput=document.getElementById('ef-img2');
  const uploadBtn=document.getElementById('ef-upload2-btn');
  if(uploadBtn){uploadBtn.disabled=true;uploadBtn.innerHTML='<div class="sp"></div> Đang upload...';}
  try {
    const base64=await fileToBase64(file);
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if(!accessToken){toast('Bạn cần đăng nhập lại','er');throw new Error('Chưa đăng nhập');}
    const res=await fetch(UPLOAD_KV_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${accessToken}`},
      body:JSON.stringify({ base64, ext }),
    });
    const data=await res.json();
    if(res.ok && data.success){
      urlInput.value=data.url;
      toast('Upload KV thành công! ☁️');
    } else {
      toast('Upload KV thất bại: '+(data.error||'Lỗi không xác định'),'er');
    }
  } catch(e){toast('Lỗi upload KV: '+e.message,'er');}
  if(uploadBtn){uploadBtn.disabled=false;uploadBtn.innerHTML='☁️ Upload KV';}
};

// ── FLOWERS (ADMIN) ────────────────────────────────────────────────────────────
export function manageFlowers(){
  if(!S._mfColor) S._mfColor='all';
  if(S._mfQuery===undefined) S._mfQuery='';
  const colorChips=`<button class="chip ${S._mfColor==='all'?'on':''}" onclick="setMfColor('all')">Tất cả</button>`+
    COLS.map(c=>`<button class="chip ${S._mfColor===c.k?'on':''}" onclick="setMfColor('${c.k}')" style="${S._mfColor===c.k?`background:${c.h};border-color:${c.h};color:#fff`:''}"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c.h};margin-right:4px"></span>${c.l}</button>`).join('');
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">🌸 Quản lý hoa <span id="mf-count" style="font-size:.76rem;font-weight:600;color:var(--mist)"></span>
      <button class="btn btn-g btn-sm" style="margin-left:auto" onclick="openAddFlower()">+ Thêm hoa</button>
    </div>
    <div class="sbar-plain" style="margin-bottom:10px">
      <input class="fi" id="mfq" placeholder="🔍 Tìm theo tên hoa..." value="${esc(S._mfQuery)}" oninput="setMfQuery(this.value);toggleClearBtn(this)">
      <button type="button" class="sbar-x" style="display:${S._mfQuery?'flex':'none'}" onclick="clearSearchInput('mfq','setMfQuery')" aria-label="Xoá tìm kiếm" tabindex="-1">✕</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${colorChips}</div>
    <div id="mf-result"></div>
  </div>`;
}
export function buildMfResult(){
  const filtered=S.flowers.filter(f=>{
    if(S._mfColor!=='all' && f.color!==S._mfColor) return false;
    if(S._mfQuery && !f.name.toLowerCase().includes(S._mfQuery.toLowerCase())) return false;
    return true;
  });
  const cntEl=document.getElementById('mf-count');
  if(cntEl) cntEl.textContent=`(${filtered.length}/${S.flowers.length})`;
  const rows=filtered.map(f=>{
    const cv=col(f.color);
    const own=Object.values(S.ticks).filter(ids=>ids.includes(f.id)).length;
    return `<tr>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cv.h};margin-right:5px"></span><strong>${esc(f.name)}</strong></td>
      <td style="font-size:.78rem;color:var(--mist)">${cv.l}</td>
      <td style="font-size:.78rem;color:var(--mist)">${own} người</td>
      <td>
        <button class="ibtn" onclick="openEditFlower('${f.id}')">✏️</button>
        <button class="ibtn del" onclick="confirmDelFlower('${f.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  return filtered.length===0?`<div class="empty"><div class="empty-icon">🌱</div>Không tìm thấy hoa nào</div>`
    :`<div style="overflow-x:auto"><table class="mtbl"><thead><tr><th>Tên</th><th>Màu</th><th>Sở hữu</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
window.setMfColor=function(c){
  S._mfColor=c;
  render();
};
let _mfqTimer=null;
window.setMfQuery=function(v){
  S._mfQuery=v;
  clearTimeout(_mfqTimer);
  _mfqTimer=setTimeout(()=>{
    const el=document.getElementById('mf-result');
    if(el){el.innerHTML=buildMfResult();return;}
    render();
  },160);
};
window.openAddFlower=function(){
  S._editFlowerId=null;S._editColor='trang';
  const sw=COLS.map(c=>`<div class="csw ${c.k==='trang'?'on':''}" style="background:${c.h}" title="${c.l}" onclick="pickColor('${c.k}')" id="sw-${c.k}"></div>`).join('');
  openModal('🌸 Thêm hoa mới',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Tên hoa *</label><input class="fi" id="ef-name" placeholder="Hoa hồng nhung"></div>
      <div class="fg-col"><label class="fl">Màu</label><div class="cpick">${sw}</div></div>
      <div class="fg-col">
        <label class="fl">🖼️ Ảnh URL1 <span style="font-size:.72rem;color:var(--mist)">(GitHub + jsDelivr)</span></label>
        <input type="file" id="ef-img-file" accept="image/*" style="display:none" onchange="onImgFileChange(this)">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="ef-img" placeholder="https://cdn.jsdelivr.net/..." style="flex:1">
          <button class="btn btn-o btn-sm" id="ef-upload-btn" type="button" onclick="triggerImgUpload()">🖼️ Chọn ảnh</button>
        </div>
        <label style="display:flex;align-items:center;gap:7px;margin-top:8px;cursor:pointer;user-select:none;font-size:.8rem;color:var(--forest2)">
          <input type="checkbox" id="ef-ocr-toggle" style="width:15px;height:15px;accent-color:var(--leaf);cursor:pointer">
          🤖 Dùng AI nhận diện tên từ ảnh
        </label>
        <img id="ef-img-preview" src="" style="display:none;margin-top:8px;width:100%;max-height:140px;object-fit:cover;border-radius:9px;border:1px solid var(--bd)">
      </div>
      <div class="fg-col">
        <label class="fl">☁️ Ảnh URL2 <span style="font-size:.72rem;color:var(--mist)">(Cloudflare KV)</span></label>
        <input type="file" id="ef-img2-file" accept="image/*" style="display:none" onchange="onImgFileChange2(this)">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="ef-img2" placeholder="https://... (Cloudflare)" style="flex:1">
          <button class="btn btn-o btn-sm" id="ef-upload2-btn" type="button" onclick="triggerImgUpload2()">☁️ Upload KV</button>
        </div>
      </div>
      <div class="fg-col">
        <label class="fl">Hiển thị ảnh từ</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer">
            <input type="radio" name="ef-img-src" value="url1" checked style="accent-color:var(--leaf)"> 🖼️ URL1 (jsDelivr)
          </label>
          <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer">
            <input type="radio" name="ef-img-src" value="url2" style="accent-color:var(--leaf)"> ☁️ URL2 (Cloudflare)
          </label>
        </div>
      </div>
      <div class="fg-col"><label class="fl">Thứ tự</label><input class="fi" id="ef-sort" type="number" value="0"></div>
      <div class="fg-col"><label class="fl">Nhãn số <span style="font-size:.72rem;color:var(--mist)">(14 / 21 / 23 / 25 / 28 / 30)</span></label>
        <select class="fi" id="ef-label">
          <option value="">— Không có nhãn —</option>
          <option value="14">14</option>
          <option value="21">21</option>
          <option value="23">23</option>
          <option value="25">25</option>
          <option value="28">28</option>
          <option value="30">30</option>
        </select>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doSaveFlower()">💾 Lưu</button>`
  );
};
window.openEditFlower=function(id){
  const f=S.flowers.find(x=>x.id===id);if(!f)return;
  S._editFlowerId=id;S._editColor=f.color||'trang';
  const sw=COLS.map(c=>`<div class="csw ${c.k===S._editColor?'on':''}" style="background:${c.h}" title="${c.l}" onclick="pickColor('${c.k}')" id="sw-${c.k}"></div>`).join('');
  openModal('✏️ Sửa hoa',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Tên hoa *</label><input class="fi" id="ef-name" value="${esc(f.name)}"></div>
      <div class="fg-col"><label class="fl">Màu</label><div class="cpick">${sw}</div></div>
      <div class="fg-col">
        <label class="fl">🖼️ Ảnh URL1 <span style="font-size:.72rem;color:var(--mist)">(GitHub + jsDelivr)</span></label>
        <input type="file" id="ef-img-file" accept="image/*" style="display:none" onchange="onImgFileChange(this)">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="ef-img" value="${esc(f.imgUrl)}" placeholder="https://cdn.jsdelivr.net/..." style="flex:1">
          <button class="btn btn-o btn-sm" id="ef-upload-btn" type="button" onclick="triggerImgUpload()">🖼️ Chọn ảnh</button>
        </div>
        <label style="display:flex;align-items:center;gap:7px;margin-top:8px;cursor:pointer;user-select:none;font-size:.8rem;color:var(--forest2)">
          <input type="checkbox" id="ef-ocr-toggle" style="width:15px;height:15px;accent-color:var(--leaf);cursor:pointer">
          🤖 Dùng AI nhận diện tên từ ảnh
        </label>
        <img id="ef-img-preview" data-cache-src="${esc(f.imgUrl)}" style="display:${f.imgUrl?'block':'none'};margin-top:8px;width:100%;max-height:140px;object-fit:cover;border-radius:9px;border:1px solid var(--bd)">
      </div>
      <div class="fg-col">
        <label class="fl">☁️ Ảnh URL2 <span style="font-size:.72rem;color:var(--mist)">(Cloudflare KV)</span></label>
        <input type="file" id="ef-img2-file" accept="image/*" style="display:none" onchange="onImgFileChange2(this)">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="ef-img2" value="${esc(f.imgUrl2||'')}" placeholder="https://... (Cloudflare)" style="flex:1">
          <button class="btn btn-o btn-sm" id="ef-upload2-btn" type="button" onclick="triggerImgUpload2()">☁️ Upload KV</button>
        </div>
      </div>
      <div class="fg-col">
        <label class="fl">Hiển thị ảnh từ</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer">
            <input type="radio" name="ef-img-src" value="url1" ${(f.imgSrc||'url1')==='url1'?'checked':''} style="accent-color:var(--leaf)"> 🖼️ URL1 (jsDelivr)
          </label>
          <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer">
            <input type="radio" name="ef-img-src" value="url2" ${f.imgSrc==='url2'?'checked':''} style="accent-color:var(--leaf)"> ☁️ URL2 (Cloudflare)
          </label>
        </div>
      </div>
      <div class="fg-col"><label class="fl">Thứ tự</label><input class="fi" id="ef-sort" type="number" value="${f.sortOrder}"></div>
      <div class="fg-col"><label class="fl">Nhãn số <span style="font-size:.72rem;color:var(--mist)">(14 / 21 / 23 / 25 / 28 / 30)</span></label>
        <select class="fi" id="ef-label">
          <option value="">— Không có nhãn —</option>
          <option value="14" ${f.label==='14'?'selected':''}>14</option>
          <option value="21" ${f.label==='21'?'selected':''}>21</option>
          <option value="23" ${f.label==='23'?'selected':''}>23</option>
          <option value="25" ${f.label==='25'?'selected':''}>25</option>
          <option value="28" ${f.label==='28'?'selected':''}>28</option>
          <option value="30" ${f.label==='30'?'selected':''}>30</option>
        </select>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doSaveFlower()">💾 Lưu</button>`
  );
};
window.pickColor=function(k){
  S._editColor=k;
  document.querySelectorAll('.csw').forEach(el=>el.classList.remove('on'));
  const sw=document.getElementById('sw-'+k);
  if(sw) sw.classList.add('on');
};
window.doSaveFlower=async function(){
  const name=document.getElementById('ef-name')?.value.trim();
  if(!name){toast('Nhập tên hoa!','wn');return;}
  const imgUrl=document.getElementById('ef-img')?.value.trim()||'';
  const imgUrl2=document.getElementById('ef-img2')?.value.trim()||'';
  const imgSrc=document.querySelector('input[name="ef-img-src"]:checked')?.value||'url1';
  const sortOrder=Number(document.getElementById('ef-sort')?.value)||0;
  const color=S._editColor||'trang';
  const label=document.getElementById('ef-label')?.value||'';
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    if(S._editFlowerId){
      await fsSet('flowers',S._editFlowerId,{name,color,imgUrl,imgUrl2,imgSrc,sortOrder,label});
      const f=S.flowers.find(x=>x.id===S._editFlowerId);
      if(f){f.name=name;f.color=color;f.imgUrl=imgUrl;f.imgUrl2=imgUrl2;f.imgSrc=imgSrc;f.sortOrder=sortOrder;f.label=label;}
      toast('Đã cập nhật hoa');
    } else {
      const newId='f'+Date.now();
      await fsSet('flowers',newId,{name,color,imgUrl,imgUrl2,imgSrc,sortOrder,label});
      S.flowers.push({id:newId,name,color,imgUrl,imgUrl2,imgSrc,sortOrder,label});
      toast('Đã thêm hoa 🌸');
    }
    S.flowers.sort((a,b)=>a.sortOrder-b.sortOrder);
    closeModal();render();
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='💾 Lưu';}
  }
  setPulse('');
};
window.confirmDelFlower=function(id){
  const f=S.flowers.find(x=>x.id===id);
  openModal('⚠️ Xóa hoa',`Xóa <b>${esc(f?.name||id)}</b>?`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelFlower('${id}')">Xóa</button>`);
};
window.doDelFlower=async function(id){
  closeModal();setPulse('loading');
  try {
    await fsDel('flowers',id);
    S.flowers=S.flowers.filter(f=>f.id!==id);
    Object.keys(S.ticks).forEach(k=>{S.ticks[k]=(S.ticks[k]||[]).filter(fid=>fid!==id);});
    toast('Đã xóa hoa');
  }
  catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');render();
};

