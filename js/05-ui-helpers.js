import { col, COLS } from './01-config.js';
import { S, isLeader, isMember, myClanId, myClanName } from './02-state.js';
import { activateImgEager, getFlowerImg, imgCacheGet } from './03-image-cache.js';

// Ngữ cảnh của người đang được xem trong popup mf, dùng để xuất ảnh BST
let _snapCtx=null;

// Nhãn chức vụ dùng cho watermark khi xuất ảnh BST — role='leader' (bảng S.leaders) → Hội trưởng,
// role='member' + m.isDeputy=true (bảng S.members, đặt ở 14-manage-members.js) → Hội phó, còn lại Thành viên.
function roleLabelOf(role, person){
  if(role==='leader') return 'Hội trưởng';
  return person && person.isDeputy ? 'Hội phó' : 'Thành viên';
}

export const setPulse = s => {
  const d=document.getElementById('pulse');
  if(!d) return;
  d.className='pulse'+(s==='loading'?' loading':s==='err'?' err':'');
  document.getElementById('synclbl').textContent=s==='loading'?'Đang tải':s==='err'?'Lỗi':'Kết nối';
};

export function toast(msg,type='ok',persist=false){
  const el=document.createElement('div');
  el.className='toast '+type+(persist?' persist':'');
  el.textContent=(type==='ok'?'✅ ':type==='er'?'❌ ':'ℹ️ ')+msg;
  document.getElementById('toasts').appendChild(el);
  // persist=true → thêm class .persist (CSS bỏ animation "tout" tự fade ở giây 2.2s)
  // và không set setTimeout ở đây — caller phải tự gọi el.remove() khi xong việc
  // (dùng cho toast "đang xử lý" của tác vụ dài, tránh trường hợp toast tự biến mất
  // trước khi việc thực sự hoàn tất khiến người dùng tưởng bấm không có tác dụng).
  if(!persist) setTimeout(()=>el.remove(),2700);
  return el;
}

export function openModal(t,b,f){
  document.getElementById('mttl').innerHTML=t;
  document.getElementById('mbdy').innerHTML=b;
  document.getElementById('mft').innerHTML=f||'';
  document.getElementById('modal').classList.add('on');
}
export function closeModal(){document.getElementById('modal').classList.remove('on');}
window.closeModal=closeModal;
window.openFlowerZoom=function(fid){
  const f=S.flowers.find(x=>x.id===fid);
  if(!f) return;
  const cv=col(f.color);
  const card=document.getElementById('zoomCard');
  card.style.transition='none';
  card.style.transform='scale(.4)';
  card.style.opacity='0';
  card.innerHTML=`<button class="zoom-close" onclick="event.stopPropagation();closeZoom()">✕</button>
    <div class="zoom-img" style="position:relative">${(fi=>fi?imgTag(fi):`<span class="zoom-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`)(getFlowerImg(f))}${labelBadgeHtml(f,'lg')}</div>
    <div class="zoom-body">
      <div class="zoom-name" style="color:${cv.h}">${esc(f.name)}</div>
      <span class="fc-badge" style="background:${cv.h}18;color:${cv.h}"><span class="fc-dot" style="background:${cv.h}"></span>${cv.l}</span>
      <div class="zoom-owners">${ownershipTagsHtml(fid,f.name)}</div>
    </div>
    ${RB}`;
  card.querySelectorAll('img').forEach(img=>{ img.removeAttribute('loading'); img.setAttribute('decoding','async'); });
  activateImgEager(card);
  document.getElementById('zoomBg').classList.add('on');
  void card.offsetHeight;
  card.style.transition='transform .22s cubic-bezier(.22,1,.36,1),opacity .16s ease';
  card.style.transform='scale(1)';
  card.style.opacity='1';
};
window.closeZoom=function(){
  const card=document.getElementById('zoomCard');
  card.style.transition='transform .18s cubic-bezier(.4,0,1,1),opacity .14s ease';
  card.style.transform='scale(.4)';
  card.style.opacity='0';
  document.getElementById('zoomBg').classList.remove('on');
};
window.openMemberFlowers=function(memberId,role){
  const person = role==='leader'
    ? S.leaders.find(x=>x.id===memberId)
    : S.members.find(x=>x.id===memberId);
  if(!person) return;
  const owned=new Set(S.ticks[memberId]||[]);
  const total=S.flowers.length;
  const groups={};
  S.flowers.forEach(f=>{ if(owned.has(f.id)) (groups[f.color]||(groups[f.color]=[])).push(f); });
  const clan=S.clans.find(c=>c.id===person.clanId);

  let bodyHtml;
  if(owned.size===0){
    bodyHtml=`<div class="empty"><div class="empty-icon">🌿</div>Chưa đánh dấu hoa nào</div>`;
  } else {
    bodyHtml=Object.entries(groups).sort((a,b)=>{
      const ia=COLS.findIndex(c=>c.k===a[0]), ib=COLS.findIndex(c=>c.k===b[0]);
      return ib-ia; // COLS: trang,xanh,lam,tim,cam,do → đảo ngược = do,cam,tim,lam,xanh,trang
    }).map(([ck,flowers])=>{
      const cv=col(ck);
      return `<div class="mf-grp"><div class="mf-grp-bar" style="background:${cv.h}"></div><h3 style="color:${cv.h}">${cv.l}</h3><span class="mf-grp-cnt">${flowers.length}</span></div>
      <div class="mf-grid">${flowers.map(f=>`<div class="mf-fc">
        <div class="mf-fc-img" style="position:relative">${(fi=>fi?imgTag(fi,'decoding="async"'):`<span class="mf-fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`)(getFlowerImg(f))}${labelBadgeHtml(f,'sm')}</div>
        <div class="mf-fc-name" style="color:${cv.h}">${esc(f.name)}</div>
      </div>`).join('')}</div>`;
    }).join('');
  }

  const card=document.getElementById('mfCard');
  const mfBg=document.getElementById('mfBg');
  // Giữ card ẩn hoàn toàn, không transition trong khi set nội dung
  card.style.transition='none';
  card.style.transform='translateY(24px) scale(.96)';
  card.style.opacity='0';
  card.innerHTML=`<div class="mf-head">
      <button class="mf-close" onclick="closeMemberFlowers()">✕</button>
      <div class="mf-title">${role==='leader'?'🏆':'🌸'} ${esc(person.displayName)}</div>
      <div class="mf-sub">${clan?'🏅 Hội '+esc(clan.name)+' · ':''}${owned.size}/${total} hoa đã sở hữu</div>
    </div>
    <div class="mf-body">${bodyHtml}</div>`;
  // Đổi lazy → eager để ảnh load ngay, tránh layout shift gây chớp khi animate
  card.querySelectorAll('img').forEach(img=>{
    img.removeAttribute('loading');
    img.setAttribute('decoding','async');
  });
  activateImgEager(card);
  mfBg.classList.add('on');
  // force reflow để browser tính layout xong, rồi mới bật transition
  void card.offsetHeight;
  card.style.transition='transform .22s cubic-bezier(.22,1,.36,1),opacity .16s ease';
  card.style.transform='translateY(0) scale(1)';
  card.style.opacity='1';
  // Lưu ngữ cảnh + hiện nút nổi "Lưu ảnh BST"
  _snapCtx={memberId, role, person, clan, owned, total, roleLabel: roleLabelOf(role,person)};
  buildSnapFab();
};
window.closeMemberFlowers=function(){
  const card=document.getElementById('mfCard');
  card.style.transition='transform .18s cubic-bezier(.4,0,1,1),opacity .14s ease';
  card.style.transform='translateY(20px) scale(.97)';
  card.style.opacity='0';
  document.getElementById('mfBg').classList.remove('on');
  removeSnapFab();
  _snapCtx=null;
};
export function warmUpGPULayers(){
  const els=[
    document.getElementById('zoomCard'),
    document.getElementById('mfCard')
  ];
  els.forEach(el=>{
    if(!el) return;
    // Kích hoạt GPU layer bằng cách animate transform (không nhìn thấy thay đổi)
    el.animate([{transform:el.style.transform||'translateY(0)'},
                {transform:el.style.transform||'translateY(0)'}],
               {duration:1}).onfinish=function(){ this.effect&&this.cancel(); };
  });
}
warmUpGPULayers();
window.toggleClearBtn=function(inputEl){
  const btn=inputEl && inputEl.parentElement && inputEl.parentElement.querySelector('.sbar-x');
  if(btn) btn.style.display=inputEl.value?'flex':'none';
};
window.clearSearchInput=function(inputId,setterName){
  const el=document.getElementById(inputId);
  if(!el) return;
  el.value='';
  toggleClearBtn(el);
  if(typeof window[setterName]==='function') window[setterName]('');
  el.focus();
};

export function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const RB_URL='https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/1782207218380-1wiufzrp.png';
const RB=`<div class="ribbon-anchor"><img data-cache-src="${RB_URL}" alt="" aria-hidden="true" draggable="false"></div>`;

// Sinh thẻ <img> cho ảnh hoa.
// src="" để browser KHÔNG request jsdelivr ngay — lazy observer sẽ điền src từ cache (hoặc url gốc)
// khi ảnh sắp vào viewport. Đảm bảo ảnh đã cache KHÔNG BAO GIỜ request lại mạng.
export function imgTag(url, extraAttrs){
  return `<img data-cache-src="${esc(url)}" ${extraAttrs||''}>`;
}

// Helper: tạo nhãn tròn cho card hoa (size: 'sm'=mf-label, 'md'=fc-label, 'lg'=zoom-label)
export function labelBadgeHtml(f, size='md'){
  if(!f.label) return '';
  const cv=col(f.color);
  const h=cv.h;
  // nền = màu hoa + alpha ~40%
  const bg=h+'66'; // hex alpha 40%
  const cls=size==='lg'?'zoom-label':size==='sm'?'mf-label':'fc-label';
  return `<div class="${cls}" style="background:${bg};border-color:${h}">${esc(f.label)}</div>`;
}

// Compute which clans/members own a given flower (scoped to current user's clan if member/leader)
function getFlowerOwnership(fid){
  const clanSet=new Set();
  const mList=[];
  S.members.forEach(m=>{
    if((S.ticks[m.id]||[]).includes(fid)){
      const clan=S.clans.find(c=>c.id===m.clanId);
      if(clan) clanSet.add(clan.name);
      mList.push({displayName:m.displayName,clanId:m.clanId});
    }
  });
  S.leaders.forEach(l=>{
    if((S.ticks[l.id]||[]).includes(fid)){
      const clan=S.clans.find(c=>c.id===l.clanId);
      if(clan) clanSet.add(clan.name);
      mList.push({displayName:l.displayName,clanId:l.clanId});
    }
  });
  let clans=[...clanSet], members=mList;
  if(isMember()||isLeader()){
    const clanName=myClanName();
    const cid=myClanId();
    clans=clans.filter(n=>n===clanName);
    members=members.filter(m=>m.clanId===cid);
  }
  return {clans,members};
}
function ownershipTagsHtml(fid,flowerName){
  const {clans,members}=getFlowerOwnership(fid);
  const fn = esc(flowerName||'');
  return (clans.length?`<div class="fc-clans">${clans.map(n=>`<span class="clan-tag">🏅 ${esc(n)}</span>`).join('')}</div>`:'')
    +(members.length?`<div class="fc-clans">${members.map(m=>`<span class="clan-tag copy-tag" style="background:#e0f2fe;color:#0369a1" onclick="copyGreeting('${esc(m.displayName).replace(/'/g,"\\'")}','${fn.replace(/'/g,"\\'")}')">${esc(m.displayName)}</span>`).join('')}</div>`:'');
}

// ─── Copy lời chào nhắc thành viên làm nhiệm vụ hoa ─────────────────────────
window.copyGreeting=function(name,flowerName){
  const msg=`👋 ${name} ơi có nhiệm vụ "${flowerName}" chờ bạn làm nè`;
  const done=()=>toast('Đã sao chép lời nhắn');
  const fail=()=>{
    // fallback cho trình duyệt/webview cũ không hỗ trợ Clipboard API
    const ta=document.createElement('textarea');
    ta.value=msg; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); done(); }catch(e){ toast('Không sao chép được','er'); }
    document.body.removeChild(ta);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(msg).then(done).catch(fail);
  } else { fail(); }
};

// ============================================================
// 📸 XUẤT ẢNH BỘ SƯU TẬP — nút nổi trong suốt xuất hiện khi popup
// openMemberFlowers đang mở. Cho chọn lọc màu → chụp lại đúng bố cục
// popup (dùng html2canvas, tự tải qua CDN, không cần sửa index.html)
// → hiện preview + nút tải xuống PNG.
// ============================================================
function buildSnapFab(){
  if(document.getElementById('snapFab')) return;
  const btn=document.createElement('button');
  btn.id='snapFab';
  btn.type='button';
  btn.textContent='📸 Lưu ảnh BST';
  btn.style.cssText=`position:fixed;right:16px;bottom:88px;z-index:9999;
    padding:10px 16px;border:none;border-radius:999px;
    background:rgba(190,24,93,.55);color:#fff;font-weight:700;font-size:.82rem;
    -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);
    box-shadow:0 4px 16px rgba(0,0,0,.25);`;
  btn.onclick=openSnapFilterPanel;
  document.body.appendChild(btn);
}
function removeSnapFab(){
  document.getElementById('snapFab')?.remove();
  document.getElementById('snapFilterPanel')?.remove();
}

function openSnapFilterPanel(){
  if(document.getElementById('snapFilterPanel')) return;
  const panel=document.createElement('div');
  panel.id='snapFilterPanel';
  panel.style.cssText=`position:fixed;right:16px;bottom:150px;z-index:9999;
    background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    border-radius:16px;padding:12px 14px;box-shadow:0 6px 20px rgba(0,0,0,.25);
    display:flex;flex-direction:column;gap:6px;min-width:180px;max-height:60vh;overflow-y:auto;`;
  // Bỏ "Trắng/Xám" và "Xanh lá" khỏi bộ lọc xuất ảnh theo yêu cầu — 2 màu này
  // sẽ không xuất hiện trong ảnh BST dù chọn "Tất cả".
  const snapCols=COLS.filter(c=>c.k!=='trang' && c.k!=='xanh');
  const colorOpts=snapCols.map(c=>`<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:${col(c.k).h};font-weight:600">
    <input type="checkbox" class="snap-color-chk" value="${c.k}" checked> ${c.l}
  </label>`).join('');
  panel.innerHTML=`
    <label style="display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700;color:#333">
      <input type="checkbox" id="snapAll" checked> Tất cả
    </label>
    <div style="height:1px;background:#0002;margin:2px 0"></div>
    ${colorOpts}
    <button id="snapOkBtn" style="margin-top:6px;padding:9px;border:none;border-radius:10px;background:#be185d;color:#fff;font-weight:700;font-size:.82rem">✅ Tạo ảnh</button>
    <button id="snapCancelBtn" style="padding:7px;border:none;border-radius:10px;background:#f3f4f6;color:#666;font-weight:600;font-size:.78rem">Hủy</button>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#snapAll').onchange=e=>{
    panel.querySelectorAll('.snap-color-chk').forEach(chk=>{chk.checked=e.target.checked;});
  };
  panel.querySelectorAll('.snap-color-chk').forEach(chk=>{
    chk.onchange=()=>{
      const all=[...panel.querySelectorAll('.snap-color-chk')].every(c=>c.checked);
      panel.querySelector('#snapAll').checked=all;
    };
  });
  panel.querySelector('#snapCancelBtn').onclick=()=>panel.remove();
  panel.querySelector('#snapOkBtn').onclick=async ()=>{
    const selected=[...panel.querySelectorAll('.snap-color-chk')].filter(c=>c.checked).map(c=>c.value);
    panel.remove();
    if(!selected.length){toast('Chọn ít nhất 1 màu!','wn');return;}
    await generateSnapshotImage(selected);
  };
}

function loadHtml2Canvas(){
  return new Promise((resolve,reject)=>{
    if(window.html2canvas){resolve(window.html2canvas);return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload=()=>resolve(window.html2canvas);
    s.onerror=()=>reject(new Error('Không tải được thư viện tạo ảnh (kiểm tra mạng)'));
    document.head.appendChild(s);
  });
}

async function generateSnapshotImage(selectedColors){
  if(!_snapCtx){toast('Không tìm thấy dữ liệu, mở lại popup thử lại!','er');return;}
  const {role,person,clan,owned,total,roleLabel}=_snapCtx;
  // persist=true — toast này KHÔNG tự ẩn theo giờ (2.7s) mặc định. Ảnh nặng/nhiều hoa
  // có thể mất vài giây để resize + html2canvas render, nếu toast tự biến mất trước
  // khi popup preview + nút "Lưu ảnh" thật sự hiện ra, người dùng sẽ tưởng bấm không
  // có tác dụng gì rồi đóng popup. Chỉ ẩn thủ công ở đúng lúc preview hiện lên (hoặc lỗi).
  const loadingToast=toast('Chờ 1 xíu nha, đang tạo...','ok',true);

  const groups={};
  S.flowers.forEach(f=>{
    if(owned.has(f.id) && selectedColors.includes(f.color)) (groups[f.color]||(groups[f.color]=[])).push(f);
  });
  const filteredCount=Object.values(groups).reduce((a,g)=>a+g.length,0);

  // Tra cache IndexedDB THẬT (base64) cho từng ảnh trước khi build HTML.
  // getFlowerImg(f) chỉ trả về URL gốc jsDelivr — phải qua imgCacheGet(url)
  // Dùng thẳng ảnh gốc/cache, KHÔNG resize xuống nữa — trước đây hạ độ phân giải để
  // tránh canvas tổng quá lớn, nhưng giờ đã chụp theo dải (tile) rồi ghép nên không còn
  // giới hạn đó nữa. Giữ nguyên ảnh gốc cho độ nét tối đa, đổi lại xử lý chậm hơn chút.
  const allFlowersToRender=Object.values(groups).flat();
  const srcMap=new Map();
  await Promise.all(allFlowersToRender.map(async f=>{
    const url=getFlowerImg(f);
    if(!url) return;
    const cached=await imgCacheGet(url);
    srcMap.set(f.id, cached || url);
  }));

  let bodyHtml;
  if(filteredCount===0){
    bodyHtml=`<div class="empty" style="padding:30px 0"><div class="empty-icon">🌿</div>Không có hoa nào khớp bộ lọc</div>`;
  } else {
    bodyHtml=Object.entries(groups).sort((a,b)=>{
      const ia=COLS.findIndex(c=>c.k===a[0]), ib=COLS.findIndex(c=>c.k===b[0]);
      return ib-ia;
    }).map(([ck,flowers])=>{
      const cv=col(ck);
      return `<div class="mf-grp"><div class="mf-grp-bar" style="background:${cv.h}"></div><h3 style="color:${cv.h}">${cv.l}</h3><span class="mf-grp-cnt">${flowers.length}</span></div>
      <div class="mf-grid">${flowers.map(f=>{
        const src=srcMap.get(f.id);
        return `<div class="mf-fc">
          <div class="mf-fc-img" style="position:relative">${src?`<img src="${src}" crossorigin="anonymous">`:`<span class="mf-fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`}${labelBadgeHtml(f,'sm')}</div>
          <div class="mf-fc-name" style="color:${cv.h}">${esc(f.name)}</div>
        </div>`;
      }).join('')}</div>`;
    }).join('');
  }

  const container=document.createElement('div');
  container.id='snapExportBox';
  // Khung xuất ảnh rộng hơn hẳn popup gốc (380px) để ảnh không bị dài-hẹp khi
  // hoa nhiều — ép lưới hoa thành 9 cột CHỈ trong khung xuất này (không đụng
  // đến giao diện popup thật trên điện thoại, vẫn giữ nguyên 3 cột như cũ).
  container.style.cssText='position:fixed;left:-9999px;top:0;width:1500px;background:#fff;';
  container.innerHTML=`<style>
      #snapExportBox .mf-grid{grid-template-columns:repeat(9,1fr) !important}
      #snapExportBox .mf-fc-name{font-size:.92em}
    </style>
    <div class="mf-head">
      <div class="mf-title">${role==='leader'?'🏆':'🌸'} ${esc(person.displayName)}</div>
      <div class="mf-sub">${clan?'🏅 Hội '+esc(clan.name)+' · ':''}${filteredCount}/${total} hoa đã sở hữu${selectedColors.length<(COLS.length-2)?' (đã lọc màu)':''}</div>
    </div>
    <div class="mf-body">${bodyHtml}</div>`;
  document.body.appendChild(container);

  // Đợi toàn bộ ảnh trong khung xuất load xong (kể cả lỗi) trước khi chụp
  const imgs=[...container.querySelectorAll('img')];
  await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(res=>{img.onload=res;img.onerror=res;})));

  // Luôn giữ scale:2 (nét tối đa) bất kể BST nhiều hay ít hoa. Thay vì chụp nguyên
  // container trong 1 lần (dễ vượt giới hạn canvas an toàn ~16 triệu px của trình
  // duyệt/GPU khi container quá cao, khiến trình duyệt ÂM THẦM co nhỏ buffer → mờ),
  // ta CHIA container thành nhiều dải ngang đủ nhỏ để mỗi dải luôn nằm trong ngưỡng an
  // toàn, chụp riêng từng dải ở scale:2 rồi ghép (drawImage) lại thành 1 canvas hoàn
  // chỉnh — độ phân giải cuối cùng luôn full scale:2, không đánh đổi gì.
  const SAFE_CANVAS_PX = 15_000_000; // chừa biên an toàn dưới mốc 16MP phổ biến
  const scale=2;
  const cw=container.scrollWidth, ch=container.scrollHeight;
  // Chiều cao mỗi dải (đơn vị CSS px, chưa nhân scale) sao cho (cw*scale)*(tileH*scale) <= SAFE_CANVAS_PX
  const tileH=Math.max(200, Math.floor(SAFE_CANVAS_PX/((cw*scale)*scale)));
  const tileCount=Math.max(1, Math.ceil(ch/tileH));

  try{
    const html2canvas=await loadHtml2Canvas();
    const outCanvas=document.createElement('canvas');
    outCanvas.width=Math.round(cw*scale);
    outCanvas.height=Math.round(ch*scale);
    const outCtx=outCanvas.getContext('2d');
    outCtx.fillStyle='#ffffff';
    outCtx.fillRect(0,0,outCanvas.width,outCanvas.height);

    // Chụp tuần tự từng dải (không chạy song song để tránh dồn nhiều canvas lớn vào bộ nhớ cùng lúc)
    for(let i=0;i<tileCount;i++){
      const y=i*tileH;
      const h=Math.min(tileH, ch-y);
      const tileCanvas=await html2canvas(container,{backgroundColor:'#ffffff',scale,useCORS:true,x:0,y,width:cw,height:h});
      outCtx.drawImage(tileCanvas, 0, Math.round(y*scale));
    }

    container.remove();
    showSnapshotPreview(outCanvas, person.displayName);
  }catch(err){
    container.remove();
    toast('Lỗi tạo ảnh: '+(err.message||err),'er');
  }finally{
    // Luôn ẩn toast "đang tạo" ở bước cuối, dù thành công hay lỗi — không bao giờ
    // để nó kẹt lại (kể cả nếu html2canvas ném lỗi bất ngờ không nằm trong catch trên).
    loadingToast.remove();
  }
}

function showSnapshotPreview(canvas,name){
  // JPEG chất lượng cao thay vì PNG — ảnh dạng photo (nhiều hoa, nhiều màu)
  // JPEG nén nhẹ hơn PNG rất nhiều (thường giảm 70-90% dung lượng) mà mắt
  // thường khó phân biệt khác biệt ở quality 0.85. Nền ảnh vốn đã trắng nên
  // JPEG không có nền trong suốt cũng không ảnh hưởng gì.
  const dataUrl=canvas.toDataURL('image/jpeg', 0.97);
  const overlay=document.createElement('div');
  overlay.id='snapPreviewOverlay';
  overlay.style.cssText=`position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.78);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;`;
  overlay.innerHTML=`
    <div id="snapPreviewImgWrap" style="max-width:100%;max-height:70vh;overflow:auto;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4)">
      <img src="${dataUrl}" style="display:block;width:100%;height:auto">
    </div>
    <div style="display:flex;gap:10px">
      <button id="snapDownloadBtn" style="padding:10px 18px;border:none;border-radius:12px;background:#16a34a;color:#fff;font-weight:700">💾 Lưu ảnh về máy</button>
      <button id="snapCloseBtn" style="padding:10px 18px;border:none;border-radius:12px;background:#fff;color:#333;font-weight:700">✕ Đóng</button>
    </div>
  `;
  document.body.appendChild(overlay);
  // Chạm ra ngoài vùng ảnh/nút (tức trúng overlay nền) → đóng popup
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelector('#snapDownloadBtn').onclick=()=>{
    const a=document.createElement('a');
    a.href=dataUrl;
    a.download=`BST-${String(name||'thanhvien').replace(/[^\p{L}\p{N}]+/gu,'_')}.jpg`;
    a.click();
  };
  overlay.querySelector('#snapCloseBtn').onclick=()=>overlay.remove();
}

