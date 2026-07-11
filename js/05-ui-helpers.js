import { col, COLS } from './01-config.js';
import { S, isLeader, isMember, myClanId, myClanName } from './02-state.js';
import { activateImgEager, getFlowerImg } from './03-image-cache.js';

export const setPulse = s => {
  const d=document.getElementById('pulse');
  if(!d) return;
  d.className='pulse'+(s==='loading'?' loading':s==='err'?' err':'');
  document.getElementById('synclbl').textContent=s==='loading'?'Đang tải':s==='err'?'Lỗi':'Kết nối';
};

export function toast(msg,type='ok'){
  const el=document.createElement('div');
  el.className='toast '+type;
  el.textContent=(type==='ok'?'✅ ':type==='er'?'❌ ':'ℹ️ ')+msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(),2700);
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
};
window.closeMemberFlowers=function(){
  const card=document.getElementById('mfCard');
  card.style.transition='transform .18s cubic-bezier(.4,0,1,1),opacity .14s ease';
  card.style.transform='translateY(20px) scale(.97)';
  card.style.opacity='0';
  document.getElementById('mfBg').classList.remove('on');
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

