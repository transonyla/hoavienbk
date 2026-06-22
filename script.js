import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bqihlqndknrjcjvadgdo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaWhscW5ka25yamNqdmFkZ2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTA3MTAsImV4cCI6MjA5NzEyNjcxMH0.PK8urlo-c9fkLeZ3NkPVuyIhdE5qshxh_lxlAGzzUS4';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CK_SESSION  = 'hv5_session';
const CK_CACHE_TS = 'hv5_cache_ts';
const CACHE_TTL_MS = 5 * 60 * 1000;
const ADMIN_PW_HASH = '67cec4b5d00d79ebebcffdb35234c91c785dca6d03235137aecb44d04011df51';
// GITHUB_TOKEN đã được CHUYỂN sang Supabase Edge Function (upload-image), không còn lộ ở client.
const UPLOAD_IMAGE_URL = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/upload-image';
const ADMIN_LOGIN_URL = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/admin-login';
const CREATE_USER_URL = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/hyper-service';

// ─── IMAGE CACHE (IndexedDB, lưu lâu dài, độc lập với cache 5 phút của dữ liệu Supabase ở trên) ──
// Mục đích: ảnh hoa load từ Github/jsdelivr, đôi lúc link tạm thời không load được dù ảnh vẫn còn,
// nên cache lại ảnh (dạng base64, ảnh <100kb) vào IndexedDB của trình duyệt, dùng lại được
// xuyên suốt nhiều phiên truy cập, không phụ thuộc vào việc CDN có đang lag hay không.
const IMG_CACHE_DB_NAME = 'hv5_img_cache';
const IMG_CACHE_STORE = 'images';
const IMG_CACHE_VERSION = 1;
let _imgCacheDB = null;
let _imgCacheDBPromise = null;

function openImgCacheDB(){
  if(_imgCacheDB) return Promise.resolve(_imgCacheDB);
  if(_imgCacheDBPromise) return _imgCacheDBPromise;
  _imgCacheDBPromise = new Promise((resolve, reject) => {
    if(!('indexedDB' in window)){ reject(new Error('IndexedDB not supported')); return; }
    const req = indexedDB.open(IMG_CACHE_DB_NAME, IMG_CACHE_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(IMG_CACHE_STORE)){
        db.createObjectStore(IMG_CACHE_STORE, { keyPath: 'url' });
      }
    };
    req.onsuccess = (e) => { _imgCacheDB = e.target.result; resolve(_imgCacheDB); };
    req.onerror = () => reject(req.error);
  });
  return _imgCacheDBPromise;
}

async function imgCacheGet(url){
  try {
    const db = await openImgCacheDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(IMG_CACHE_STORE, 'readonly');
      const store = tx.objectStore(IMG_CACHE_STORE);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
      req.onerror = () => resolve(null);
    });
  } catch(e){ return null; }
}

async function imgCacheSet(url, dataUrl){
  try {
    const db = await openImgCacheDB();
    await new Promise((resolve) => {
      const tx = db.transaction(IMG_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(IMG_CACHE_STORE);
      store.put({ url, dataUrl, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch(e){ /* lưu cache thất bại không quan trọng, bỏ qua im lặng */ }
}

// Theo dõi các <img data-cache-src="..."> đang chờ trong DOM, để gán cache vào đúng lúc DOM đã có
const _imgCachePending = new Map(); // url -> Set of <img> elements

// Trả về src để gán ngay (ưu tiên cache có sẵn, nếu chưa có thì trả về url gốc để hiện ảnh ngay lập tức,
// đồng thời nền sẽ tự fetch về lưu cache cho lần sau)
function cachedImgSrc(url, imgEl){
  if(!url) return '';
  // Gắn marker để biết ảnh nào cần thay bằng cache khi có
  if(imgEl){
    imgEl.setAttribute('data-cache-src', url);
    if(!_imgCachePending.has(url)) _imgCachePending.set(url, new Set());
    _imgCachePending.get(url).add(imgEl);
  }
  imgCacheGet(url).then(dataUrl => {
    if(dataUrl){
      // Đã có cache — áp dụng ngay cho mọi <img> đang chờ url này (kể cả khi render đã chạy lại nhiều lần)
      document.querySelectorAll(`img[data-cache-src="${cssEscapeAttr(url)}"]`).forEach(el => {
        if(el.src !== dataUrl) el.src = dataUrl;
      });
    } else {
      // Chưa có cache — tải về 1 lần rồi lưu, không chặn hiển thị (ảnh gốc đã hiện sẵn qua src ban đầu)
      fetchAndCacheImage(url);
    }
  });
  return url; // hiện ảnh gốc ngay lập tức, không chờ cache
}

function cssEscapeAttr(s){
  return String(s).replace(/["\\]/g, '\\$&');
}

let _fetchingUrls = new Set();
async function fetchAndCacheImage(url){
  if(_fetchingUrls.has(url)) return;
  _fetchingUrls.add(url);
  try {
    const res = await fetch(url, { mode: 'cors' });
    if(!res.ok) return;
    const blob = await res.blob();
    // Giới hạn an toàn ~300kb để tránh phình IndexedDB nếu lỡ có ảnh nặng hơn dự kiến (~100kb)
    if(blob.size > 300 * 1024) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await imgCacheSet(url, dataUrl);
    document.querySelectorAll(`img[data-cache-src="${cssEscapeAttr(url)}"]`).forEach(el => {
      if(el.src !== dataUrl) el.src = dataUrl;
    });
  } catch(e){
    // Lỗi mạng/CORS khi fetch về cache — bỏ qua im lặng, ảnh gốc vẫn đang hiển thị bằng src ban đầu
  } finally {
    _fetchingUrls.delete(url);
  }
}

// Quét toàn bộ <img data-cache-src> hiện có trong #app và kích hoạt kiểm tra cache cho từng cái.
// Gọi ở cuối render() chính, đồng thời MutationObserver bên dưới tự bắt các ảnh sinh ra
// từ những điểm innerHTML riêng lẻ khác (flowerGrid, tickGrid, mf-result, mm-result...)
// để không cần sửa từng nơi gọi và không bỏ sót ảnh nào.
function activateImageCache(){
  const app=document.getElementById('app');
  if(!app) return;
  app.querySelectorAll('img[data-cache-src]').forEach(el=>{
    const url=el.getAttribute('data-cache-src');
    if(url) cachedImgSrc(url, el);
  });
  setupImageCacheObserver();
}

let _imgCacheObserver = null;
function setupImageCacheObserver(){
  const app=document.getElementById('app');
  if(!app || _imgCacheObserver) return;
  _imgCacheObserver = new MutationObserver((mutations)=>{
    for(const m of mutations){
      m.addedNodes.forEach(node=>{
        if(node.nodeType !== 1) return;
        if(node.matches && node.matches('img[data-cache-src]')){
          const url=node.getAttribute('data-cache-src');
          if(url) cachedImgSrc(url, node);
        }
        if(node.querySelectorAll){
          node.querySelectorAll('img[data-cache-src]').forEach(el=>{
            const url=el.getAttribute('data-cache-src');
            if(url) cachedImgSrc(url, el);
          });
        }
      });
    }
  });
  _imgCacheObserver.observe(app, { childList: true, subtree: true });
}
const UPDATE_PASSWORD_URL = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/hyper-service';

// ─── COLORS ───────────────────────────────────────────────────────────────────
const COLS = [
  {k:'trang',l:'Trắng/Xám', sl:'Trắng', h:'#94a3b8'},
  {k:'xanh', l:'Xanh lá',   sl:'Lá',    h:'#22c55e'},
  {k:'lam',  l:'Xanh lam',  sl:'Lam',   h:'#3b82f6'},
  {k:'tim',  l:'Tím',        sl:'Tím',  h:'#8b5cf6'},
  {k:'cam',  l:'Cam',        sl:'Cam',  h:'#f97316'},
  {k:'do',   l:'Đỏ hồng',    sl:'Đỏ',   h:'#e91e8c'},
];
const CM = Object.fromEntries(COLS.map(c=>[c.k,c]));
const col = k => CM[k]||{k:'trang',l:k||'?',h:'#94a3b8'};

// ─── STATE ────────────────────────────────────────────────────────────────────
let S = {
  flowers:[],
  clans:[],
  leaders:[],
  members:[],
  ticks:{},
  rentals:[],        // Hội Đã Thuê
  trials:[],         // Hội Dùng Thử
  lastLogins:[],     // Last login per user (admin only)
  announcement:null, // Thông báo hệ thống {id, content, updatedAt} hoặc null nếu không có
  announcementDismissed:false, // Đã đóng banner trong phiên hiện tại chưa
  loaded:false, err:null,
  page:'flowers', fcolor:'all', tcolor:'all', fq:'', tq:'',
  msel:new Set(),
  session: null,
  loginTab: 'member',
  _editFlowerId:null, _editColor:'trang',
  proxyMemberId: null,
  _lastTickSubject: null,
  _tickSecOpen: {marked:false, unmarked:true},
  _tickMarkedSnapshot: new Set(),
};

// ─── SUPABASE CRUD ───────────────────────────────────────────────────────────
async function sbGetAll(table){
  const { data, error } = await sb.from(table).select('*');
  if(error) throw new Error(error.message);
  return data;
}
async function sbUpsert(table, row){
  const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
  if(error) throw new Error(error.message);
}
async function sbDelete(table, id){
  const { error } = await sb.from(table).delete().eq('id', id);
  if(error) throw new Error(error.message);
}

// Wrapper tương thích với code cũ dùng fsSet/fsDel
async function fsSet(colName, docId, data){
  // Map tên collection Firestore → tên bảng Supabase + convert field names
  const row = mapToRow(colName, docId, data);
  await sbUpsert(colName, row);
}
async function fsDel(colName, docId){
  await sbDelete(colName, docId);
}

function mapToRow(table, id, data){
  if(table === 'flowers'){
    return { id, name: data.name??undefined, color: data.color??undefined,
      img_url: data.imgUrl??undefined, sort_order: data.sortOrder??undefined,
      label: data.label??undefined };
  }
  if(table === 'clans'){
    return { id, name: data.name??undefined };
  }
  if(table === 'leaders'){
    return { id, username: data.username??undefined, password: data.password??undefined,
      clan_id: data.clanId??undefined, display_name: data.displayName??undefined };
  }
  if(table === 'members'){
    return { id, username: data.username??undefined, password: data.password??undefined,
      clan_id: data.clanId??undefined, leader_id: data.leaderId??undefined,
      display_name: data.displayName??undefined, alias: data.alias??undefined,
      year: data.year??undefined };
  }
  if(table === 'ticks'){
    return { id, flower_ids: data.flowerIds??[] };
  }
}

// restore session
try {
  const raw = localStorage.getItem(CK_SESSION);
  if(raw) S.session = JSON.parse(raw);
} catch(e){}

// ─── PULSE ───────────────────────────────────────────────────────────────────
const setPulse = s => {
  const d=document.getElementById('pulse');
  if(!d) return;
  d.className='pulse'+(s==='loading'?' loading':s==='err'?' err':'');
  document.getElementById('synclbl').textContent=s==='loading'?'Đang tải':s==='err'?'Lỗi':'Kết nối';
};

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(msg,type='ok'){
  const el=document.createElement('div');
  el.className='toast '+type;
  el.textContent=(type==='ok'?'✅ ':type==='er'?'❌ ':'ℹ️ ')+msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(),2700);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function openModal(t,b,f){
  document.getElementById('mttl').innerHTML=t;
  document.getElementById('mbdy').innerHTML=b;
  document.getElementById('mft').innerHTML=f||'';
  document.getElementById('modal').classList.add('on');
}
function closeModal(){document.getElementById('modal').classList.remove('on');}
window.closeModal=closeModal;

// ─── FLOWER ZOOM OVERLAY ─────────────────────────────────────────────────────
window.openFlowerZoom=function(fid){
  const f=S.flowers.find(x=>x.id===fid);
  if(!f) return;
  const cv=col(f.color);
  const card=document.getElementById('zoomCard');
  card.style.transition='none';
  card.style.transform='scale(.4)';
  card.style.opacity='0';
  card.innerHTML=`<button class="zoom-close" onclick="event.stopPropagation();closeZoom()">✕</button>
    <div class="zoom-img" style="position:relative">${f.imgUrl?imgTag(f.imgUrl):`<span class="zoom-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`}${labelBadgeHtml(f,'lg')}</div>
    <div class="zoom-body">
      <div class="zoom-name" style="color:${cv.h}">${esc(f.name)}</div>
      <span class="fc-badge" style="background:${cv.h}18;color:${cv.h}"><span class="fc-dot" style="background:${cv.h}"></span>${cv.l}</span>
      <div class="zoom-owners">${ownershipTagsHtml(fid)}</div>
    </div>`;
  card.querySelectorAll('img').forEach(img=>{ img.removeAttribute('loading'); img.setAttribute('decoding','async'); });
  document.getElementById('zoomBg').classList.add('on');
  void card.offsetHeight;
  card.style.transition='transform .38s cubic-bezier(.22,1,.36,1),opacity .28s ease';
  card.style.transform='scale(1)';
  card.style.opacity='1';
};
window.closeZoom=function(){
  const card=document.getElementById('zoomCard');
  card.style.transition='transform .38s cubic-bezier(.22,1,.36,1),opacity .28s ease';
  card.style.transform='scale(.4)';
  card.style.opacity='0';
  document.getElementById('zoomBg').classList.remove('on');
};

// ─── MEMBER OWNED FLOWERS POPUP ──────────────────────────────────────────────
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
    bodyHtml=Object.entries(groups).map(([ck,flowers])=>{
      const cv=col(ck);
      return `<div class="mf-grp"><div class="mf-grp-bar" style="background:${cv.h}"></div><h3 style="color:${cv.h}">${cv.l}</h3><span class="mf-grp-cnt">${flowers.length}</span></div>
      <div class="mf-grid">${flowers.map(f=>`<div class="mf-fc">
        <div class="mf-fc-img" style="position:relative">${f.imgUrl?imgTag(f.imgUrl,'decoding="async"'):`<span class="mf-fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`}${labelBadgeHtml(f,'sm')}</div>
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
  mfBg.classList.add('on');
  // force reflow để browser tính layout xong, rồi mới bật transition
  void card.offsetHeight;
  card.style.transition='transform .32s cubic-bezier(.22,1,.36,1),opacity .24s ease';
  card.style.transform='translateY(0) scale(1)';
  card.style.opacity='1';
};
window.closeMemberFlowers=function(){
  const card=document.getElementById('mfCard');
  card.style.transition='transform .32s cubic-bezier(.22,1,.36,1),opacity .24s ease';
  card.style.transform='translateY(24px) scale(.96)';
  card.style.opacity='0';
  document.getElementById('mfBg').classList.remove('on');
};

// ─── GPU LAYER WARM-UP ───────────────────────────────────────────────────────
// Chạy khi load và mỗi khi chuyển tab: buộc browser tạo composite layer
// sẵn cho zoom-card và mf-card, tránh chớp ở lần click đầu tiên.
function warmUpGPULayers(){
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

// ─── EXPOSED STATE SETTERS (needed by inline onclick in ES module) ────────────
window.setLoginTab=function(t){S.loginTab=t;render();};
window.setFcolor=function(v){
  // Flowers page: dùng S.fcolor
  S.fcolor=v;
  const cfbar=document.getElementById('flower-cfbar');
  if(cfbar){cfbar.innerHTML=buildFlowerCfbarInner();}
  const flowerGrid=document.getElementById('flower-grid');
  if(flowerGrid){flowerGrid.innerHTML=buildFlowerGrid();return;}
  render();
};
window.setTcolor=function(v){
  // Tick page: dùng S.tcolor riêng — không ảnh hưởng tab Hoa
  S.tcolor=v;
  const cfbar=document.getElementById('tick-cfbar');
  if(cfbar) cfbar.innerHTML=buildTickCfbarInner();
  const tickGrid=document.getElementById('tick-grid');
  if(tickGrid){tickGrid.innerHTML=buildTickGrid();return;}
  render();
};
let _fqTimer=null;
window.setFq=function(v){
  S.fq=v;
  clearTimeout(_fqTimer);
  _fqTimer=setTimeout(()=>{
    const flowerGrid=document.getElementById('flower-grid');
    if(flowerGrid){flowerGrid.innerHTML=buildFlowerGrid();return;}
    render();
  },160);
};
let _tqTimer=null;
window.setTq=function(v){
  S.tq=v;
  clearTimeout(_tqTimer);
  _tqTimer=setTimeout(()=>{
    const tickGrid=document.getElementById('tick-grid');
    if(tickGrid){tickGrid.innerHTML=buildTickGrid();}
  },160);
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// Sinh thẻ <img> cho ảnh hoa, có gắn data-cache-src để hệ thống cache ảnh (IndexedDB) tự nhận diện
// và thay bằng bản đã lưu cache khi có, mà không cần sửa lại từng nơi gọi <img> thủ công.
function imgTag(url, extraAttrs){
  return `<img src="${esc(url)}" data-cache-src="${esc(url)}" ${extraAttrs||''}>`;
}

// Helper: tạo nhãn tròn cho card hoa (size: 'sm'=mf-label, 'md'=fc-label, 'lg'=zoom-label)
function labelBadgeHtml(f, size='md'){
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
function ownershipTagsHtml(fid){
  const {clans,members}=getFlowerOwnership(fid);
  return (clans.length?`<div class="fc-clans">${clans.map(n=>`<span class="clan-tag">🏅 ${esc(n)}</span>`).join('')}</div>`:'')
    +(members.length?`<div class="fc-clans">${members.map(m=>`<span class="clan-tag" style="background:#e0f2fe;color:#0369a1">👤 ${esc(m.displayName)}</span>`).join('')}</div>`:'');
}

// ─── LOAD ALL ────────────────────────────────────────────────────────────────
async function loadAll(force=false){
  if(!force){
    const lastTs=Number(localStorage.getItem(CK_CACHE_TS)||0);
    if(lastTs && Date.now()-lastTs < CACHE_TTL_MS && S.loaded && S.flowers.length>0){
      return;
    }
  }
  S.loaded=false;S.err=null;setPulse('loading');
  try {
    if(!S.session){
      // Chưa đăng nhập: chỉ tải login_lookup (id+username, không password) để phục vụ màn login
      S.flowers=[];S.clans=[];S.leaders=[];S.members=[];S.ticks={};
      S.loaded=true; setPulse('');
      return;
    }
    // Đã đăng nhập: tải đầy đủ theo đúng quyền (RLS + view tương ứng)
    const isAdm = S.session.role==='admin';
    const leadersTable = isAdm ? 'leaders' : 'leaders_safe';
    const membersTable = isAdm ? 'members' : 'members_safe';
    // Tải các bảng cốt lõi — luôn cần cho mọi role
    const [fl,cl,ld,mb,tk]=await Promise.all([
      sbGetAll('flowers'),
      sbGetAll('clans'),
      sbGetAll(leadersTable),
      sbGetAll(membersTable),
      sbGetAll('ticks'),
    ]);
    // Admin: tải thêm rentals + last_login riêng, lỗi không crash app
    if(isAdm){
      const [rentalsRaw, trialsRaw, lastLoginRaw] = await Promise.all([
        sb.from('clan_rentals').select('*').then(r=>r.data||[]).catch(()=>[]),
        sb.from('clan_trials').select('*').then(r=>r.data||[]).catch(()=>[]),
        sb.from('user_last_login').select('*').order('last_seen',{ascending:false}).limit(10).then(r=>r.data||[]).catch(()=>[]),
      ]);
      S.rentals = rentalsRaw.map(r=>({
        id:r.id, clanId:r.clan_id, startDate:r.start_date,
        months:Number(r.months)||1, note:r.note||''
      }));
      S.trials = trialsRaw.map(r=>({
        id:r.id, clanId:r.clan_id, startDate:r.start_date, note:r.note||''
      }));
      S.lastLogins = lastLoginRaw.map(r=>({
        userId:r.user_id, username:r.username,
        displayName:r.display_name||r.username, role:r.role, lastSeen:r.last_seen
      }));
    } else { S.rentals=[]; S.trials=[]; S.lastLogins=[]; }
    // Thông báo hệ thống — tải cho MỌI role đã đăng nhập (admin/leader/member), lỗi không crash app
    try {
      const { data: annData } = await sb.from('system_announcement').select('*').eq('id','current').maybeSingle();
      S.announcement = annData ? { id: annData.id, content: annData.content, updatedAt: annData.updated_at } : null;
    } catch(e){ S.announcement = null; }
    S.flowers=fl.filter(r=>r.name).map(r=>({
      id:r.id, name:r.name, color:r.color||'trang',
      imgUrl:r.img_url||'', sortOrder:Number(r.sort_order)||0,
      label:r.label||'',
    })).sort((a,b)=>a.sortOrder-b.sortOrder);
    S.clans=cl.filter(r=>r.name).map(r=>({id:r.id,name:r.name}));
    S.leaders=ld.filter(r=>r.username).map(r=>({
      id:r.id, username:r.username, password:r.password||'',
      clanId:r.clan_id||'', displayName:r.display_name||r.username,
    }));
    S.members=mb.filter(r=>r.username).map(r=>({
      id:r.id, username:r.username, password:r.password||'',
      clanId:r.clan_id||'', leaderId:r.leader_id||'',
      displayName:r.display_name||r.username, alias:r.alias||'', year:r.year||'',
    }));
    S.ticks={};
    tk.forEach(r=>{ S.ticks[r.id]=Array.isArray(r.flower_ids)?r.flower_ids:[]; });
    S.loaded=true; setPulse('');
    localStorage.setItem(CK_CACHE_TS, Date.now().toString());
    if(S.session){
      if(S.session.role==='leader'){
        const l=S.leaders.find(x=>x.id===S.session.id);
        if(l){ S.session.displayName=l.displayName; S.session.clanId=l.clanId; saveSession(S.session); }
      } else if(S.session.role==='member'){
        const m=S.members.find(x=>x.id===S.session.id);
        if(m){S.session.displayName=m.displayName;S.session.clanId=m.clanId; saveSession(S.session);}
      }
    }
  } catch(e){
    S.err='Không tải được: '+e.message;
    S.loaded=true; setPulse('err');
  }
}

// ─── LOGIN LOOKUP (trước khi đăng nhập, dùng view công khai an toàn) ────────
async function findLoginId(username, role){
  const { data, error } = await sb.from('login_lookup').select('id, username, role').eq('username', username).eq('role', role);
  if(error || !data || data.length===0) return null;
  return data[0].id;
}

// ─── SESSION HELPERS ─────────────────────────────────────────────────────────
function saveSession(s){
  S.session=s;
  localStorage.setItem(CK_SESSION,JSON.stringify(s));
}
function clearSession(){
  S.session=null;
  localStorage.removeItem(CK_SESSION);
}
function isAdmin(){return S.session?.role==='admin';}
function isLeader(){return S.session?.role==='leader';}
function isMember(){return S.session?.role==='member';}
function mySession(){return S.session;}
function myClanId(){return S.session?.clanId||'';}
function myClanName(){
  const c=S.clans.find(x=>x.id===myClanId());
  return c?c.name:'';
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function render(){
  const app=document.getElementById('app');
  if(!app) return;
  renderBarUser();
  renderAnnouncement();
  if(!S.loaded){app.innerHTML='<div class="loading"><div class="sp"></div> Đang tải...</div>';return;}
  if(S.err){app.innerHTML=renderErr();return;}
  if(!S.session){app.innerHTML=renderLogin();return;}
  app.innerHTML=renderNav()+renderPage();
  const sb2=document.getElementById('savebar');
  if(S.page==='tick'&&(isMember()||isLeader())){
    sb2.classList.add('on');
    const sbSpan=document.querySelector('#savebar span');
    if(sbSpan){
      if(isLeader()&&S.proxyMemberId){
        const m=S.members.find(x=>x.id===S.proxyMemberId);
        sbSpan.innerHTML=`Lưu cho <strong style="color:#fff">${esc(m?.displayName||'thành viên')}</strong>: <strong style="color:#fff" id="sbc">${S.msel.size}</strong> hoa`;
      } else {
        sbSpan.innerHTML=`Đã chọn <strong style="color:#fff" id="sbc">${S.msel.size}</strong> hoa`;
      }
    }
  } else {
    sb2.classList.remove('on');
  }
  const mfEl=document.getElementById('mf-result');
  if(mfEl) mfEl.innerHTML=buildMfResult();
  const mmEl=document.getElementById('mm-result');
  if(mmEl) mmEl.innerHTML=buildMmResult();
  activateImageCache();
}

function renderBarUser(){
  const area=document.getElementById('bar-user-area');
  if(!area) return;
  if(!S.session){area.innerHTML='';return;}
  const icons={admin:'🔓',leader:'🏆',member:'🌸'};
  const icon=icons[S.session.role]||'👤';
  area.innerHTML=`<div class="bar-user" onclick="doLogout()" title="Nhấn để đăng xuất">${icon} <span>${esc(S.session.displayName)}</span> <span style="opacity:.5;font-size:.65rem">✕</span></div>`;
  // Nút hướng dẫn — chỉ hiện cho leader và member
  const guideArea=document.getElementById('bar-guide-area');
  if(guideArea){
    if(isLeader()||isMember()){
      guideArea.innerHTML=`<button class="bar-user" onclick="openGuide()" title="Hướng dẫn sử dụng" style="font-size:.82rem">❓ Hướng dẫn</button>`;
    } else {
      guideArea.innerHTML='';
    }
  }
}

// Banner thông báo hệ thống — nhỏ, nền mờ nhạt, không phải popup, không gây khó chịu.
// Hiện cho mọi role đã đăng nhập (session cũ còn hạn hoặc vừa login đều chạy qua render() sau loadAll).
// Tồn tại liên tục cho tới khi admin xóa thông báo khỏi CSDL — người dùng chỉ có thể ẩn TẠM trong phiên hiện tại (✕),
// không phải xóa khỏi hệ thống.
function renderAnnouncement(){
  const area=document.getElementById('announcement-area');
  if(!area) return;
  if(!S.session || !S.announcement || !S.announcement.content || S.announcementDismissed){
    area.innerHTML=''; return;
  }
  area.innerHTML=`<div class="ann-banner">
    <span class="ann-icon">📢</span>
    <div class="ann-marquee-wrap">
      <span class="ann-text">${esc(S.announcement.content)}</span>
    </div>
    <span class="ann-close" onclick="dismissAnnouncement()" title="Ẩn thông báo">✕</span>
  </div>`;
}
window.dismissAnnouncement=function(){
  S.announcementDismissed=true;
  renderAnnouncement();
};

window.openGuide=function(){
  const role=S.session?.role;
  const isLd=role==='leader';
  const guideLeader=isLd?`
<div style="margin-top:18px;padding-top:14px;border-top:1.5px solid var(--bd)">
  <div style="font-size:.92rem;font-weight:800;color:var(--forest);margin-bottom:10px">🏆 Tính năng riêng của Hội trưởng</div>

  <div style="font-size:.82rem;font-weight:700;color:var(--ink);margin-bottom:6px">✅ Tick hoa thay cho thành viên</div>
  <div style="font-size:.8rem;color:var(--mist);line-height:1.7;margin-bottom:10px">
    Vào tab <b>✅ Đánh dấu</b>, chọn tên thành viên trong ô <b>"Tick thay cho thành viên"</b> phía trên. Danh sách hoa sẽ hiển thị đúng trạng thái tick hiện tại của thành viên đó. Tick/bỏ tick hoa rồi bấm <b>💾 Lưu</b> — dữ liệu lưu vào tài khoản của thành viên đó, không phải của bạn.<br>
    <span style="color:var(--clan);font-size:.76rem">💡 Thanh dưới hiện "Lưu cho [Tên thành viên]: X hoa" để nhắc bạn đang lưu cho ai.</span>
  </div>

  <div style="font-size:.82rem;font-weight:700;color:var(--ink);margin-bottom:6px">⚙️ Thêm thành viên mới</div>
  <div style="font-size:.8rem;color:var(--mist);line-height:1.7">
    Vào tab <b>⚙️ Quản lý</b>, bấm <b>+ Thêm TV</b>. Điền đầy đủ: Tên hiển thị, Username, Mật khẩu (bắt buộc) và Biệt danh, Năm (tuỳ chọn). Hội tự động gán theo hội của bạn. Bấm <b>Thêm</b> — hệ thống tự tạo luôn tài khoản đăng nhập.<br>
    <span style="color:var(--clan);font-size:.76rem">⚠️ Nếu tạo lỗi, dữ liệu tự xóa để tránh tài khoản rỗng không đăng nhập được.</span>
  </div>
</div>`:''
  const body=`
<div style="font-size:.8rem;color:var(--mist);line-height:1.8">

  <div style="font-size:.92rem;font-weight:800;color:var(--forest);margin-bottom:10px">🔐 Đăng nhập & Đăng xuất</div>
  <div style="margin-bottom:14px">Nhập đúng <b>Tên đăng nhập</b> và <b>Mật khẩu</b> được cấp, bấm nút đăng nhập tương ứng. Để đăng xuất, bấm vào <b>tên của bạn</b> ở góc trên bên phải (có dấu ✕ nhỏ phía sau).</div>

  <div style="font-size:.92rem;font-weight:800;color:var(--forest);margin-bottom:10px">🌸 Tab Hoa — Xem danh sách hoa</div>
  <div style="margin-bottom:6px">Danh sách toàn bộ hoa hiển thị dưới dạng thẻ card, mỗi thẻ có ảnh, tên hoa, màu sắc và số người trong hội sở hữu.</div>
  <ul style="margin:0 0 10px 16px;padding:0">
    <li><b>Lọc theo màu:</b> Bấm nút màu phía trên (Tất cả, Trắng, Xanh lá, Xanh lam, Tím, Cam, Đỏ hồng). Số trong ngoặc là <i>hoa bạn đã tick / tổng hoa màu đó</i>.</li>
    <li><b>Tìm kiếm:</b> Gõ tên hoa vào ô tìm kiếm, kết quả lọc ngay tức thì.</li>
    <li><b>Xem ai sở hữu:</b> Bấm vào bất kỳ thẻ hoa nào để xem danh sách thành viên trong hội đã tick hoa đó.</li>
  </ul>

  <div style="font-size:.92rem;font-weight:800;color:var(--forest);margin-bottom:10px">✅ Tab Đánh dấu — Tick hoa của bạn</div>
  <ol style="margin:0 0 6px 16px;padding:0">
    <li>Vào tab <b>✅ Đánh dấu</b></li>
    <li>Dùng bộ lọc màu hoặc ô tìm kiếm để tìm hoa</li>
    <li>Bấm vào thẻ hoa để bật/tắt dấu tick (thẻ sáng lên khi đã chọn)</li>
    <li>Bấm nút <b>💾 Lưu</b> ở thanh dưới màn hình để lưu lại</li>
  </ol>
  <div style="background:#fef3c7;border-radius:8px;padding:8px 10px;margin-bottom:14px;font-size:.77rem;color:#92400e">
    ⚠️ <b>Quan trọng:</b> Nếu tick hoa nhưng <b>không bấm Lưu</b> trước khi thoát tab, dữ liệu sẽ bị mất. Thanh dưới luôn hiển thị số hoa đang chọn để bạn theo dõi.
  </div>

  <div style="font-size:.92rem;font-weight:800;color:var(--forest);margin-bottom:10px">👥 Tab Thành viên — Xem danh sách hội</div>
  <ul style="margin:0 0 14px 16px;padding:0">
    <li>Chỉ hiện thành viên <b>cùng hội</b> với bạn</li>
    <li>Thống kê nhanh đầu trang: tổng thành viên, tổng loài hoa, trung bình hoa/người</li>
    <li>Bấm vào tên thành viên để xem danh sách chi tiết các hoa họ đã tick</li>
  </ul>

  <div style="background:#f0fdf4;border-radius:8px;padding:10px 12px;font-size:.77rem;color:#166534">
    📌 <b>Nếu quên mật khẩu:</b> Liên hệ Hội trưởng hoặc Admin để được đặt lại.
  </div>
  ${guideLeader}
</div>`;
  openModal(isLd?'📖 Hướng dẫn — Hội trưởng':'📖 Hướng dẫn — Thành viên', body, `<button class="btn btn-g" onclick="closeModal()" style="min-width:100px">Đã hiểu ✓</button>`);
};

function renderNav(){
  const tabs=[];
  if(isAdmin()||isLeader()||isMember()) tabs.push({k:'flowers',l:'🌸 Hoa'});
  if(isMember()||isLeader()) tabs.push({k:'tick',l:'✅ Đánh dấu'});
  if(isAdmin()||isLeader()||isMember()) tabs.push({k:'members',l:'👥 Thành viên'});
  if(isAdmin()||isLeader()||isMember()) tabs.push({k:'rank',   l:'🏆 Xếp hạng'});
  if(isAdmin()||isLeader()) tabs.push({k:'manage',l:'⚙️ Quản lý'});
  if(isAdmin()) tabs.push({k:'settings',l:'🔧 Cài đặt'});
  return `<div class="nav nav-main">${tabs.map(t=>`<button class="nvb ${S.page===t.k?'on':''}" onclick="goto('${t.k}')">${t.l}</button>`).join('')}</div>`;
}
window.goto=function(p){
  if(S.page==='tick' && p!=='tick'){
    S.tcolor='all'; S.tq='';
    S._lastTickSubject=null; // force msel reload khi quay lại tick page
  }
  if(S.page==='flowers' && p!=='flowers'){
    S.fcolor='all'; S.fq=''; // reset bộ lọc màu khi rời tab Hoa
  }
  S.page=p;
  render();
  // Warm-up lại GPU layer sau mỗi lần chuyển tab
  requestAnimationFrame(warmUpGPULayers);
};

function renderPage(){
  try {
    if(S.page==='flowers') return pageFlowers();
    if(S.page==='tick')    return pageTick();
    if(S.page==='members') return pageMembers();
    if(S.page==='rank')    return pageRank();
    if(S.page==='manage')  return pageManage();
    if(S.page==='settings')return pageSettings();
    return pageFlowers();
  } catch(e){
    return `<div style="background:#fef2f2;border:2px solid #ef4444;padding:14px;border-radius:10px;margin:10px;font-size:.78rem;color:#dc2626;font-family:monospace;word-break:break-all">
      LỖI RENDER trang "${S.page}": ${e.message}<br>Stack: ${e.stack||''}
    </div>`;
  }
}

// ─── LOGIN SCREEN ────────────────────────────────────────────────────────────
function renderLogin(){
  return `<div class="login-wrap">
    <div class="login-box">
      <div class="login-logo">🌺</div>
      <div class="login-title">Hoa Viên</div>
      <div class="login-sub">Đăng nhập để tiếp tục</div>
      <div class="login-tabs">
        <button class="login-tab ${S.loginTab==='member'?'on':''}" onclick="setLoginTab('member')">Thành viên</button>
        <button class="login-tab ${S.loginTab==='leader'?'on':''}" onclick="setLoginTab('leader')">Hội trưởng</button>
        <button class="login-tab ${S.loginTab==='admin'?'on':''}" onclick="setLoginTab('admin')">Admin</button>
      </div>
      ${S.loginTab==='admin'?loginFormAdmin():S.loginTab==='leader'?loginFormLeader():loginFormMember()}
    </div>
  </div>`;
}

function loginFormAdmin(){
  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="fg-col"><label class="fl">Mật khẩu Admin</label><input class="fi" id="adm-pw" type="password" placeholder="Nhập mật khẩu" onkeydown="if(event.key==='Enter')doLoginAdmin()"></div>
    <button class="btn btn-g" id="login-admin-btn" style="width:100%;justify-content:center" onclick="doLoginAdmin()">🔓 Đăng nhập Admin</button>
  </div>`;
}
function loginFormLeader(){
  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="fg-col"><label class="fl">Tên đăng nhập</label><input class="fi" id="ld-u" placeholder="username" onkeydown="if(event.key==='Enter')doLoginLeader()"></div>
    <div class="fg-col"><label class="fl">Mật khẩu</label><input class="fi" id="ld-p" type="password" placeholder="password" onkeydown="if(event.key==='Enter')doLoginLeader()"></div>
    <button class="btn btn-v" id="login-leader-btn" style="width:100%;justify-content:center" onclick="doLoginLeader()">🏆 Đăng nhập Hội trưởng</button>
  </div>`;
}
function loginFormMember(){
  return `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="fg-col"><label class="fl">Tên đăng nhập</label><input class="fi" id="mb-u" placeholder="username" onkeydown="if(event.key==='Enter')doLoginMember()"></div>
    <div class="fg-col"><label class="fl">Mật khẩu</label><input class="fi" id="mb-p" type="password" placeholder="password" onkeydown="if(event.key==='Enter')doLoginMember()"></div>
    <button class="btn btn-p" id="login-member-btn" style="width:100%;justify-content:center" onclick="doLoginMember()">🌸 Đăng nhập</button>
  </div>`;
}

window.doLoginAdmin=async function(){
  const pw=document.getElementById('adm-pw')?.value;
  if(!pw){toast('Nhập mật khẩu!','wn');return;}
  const btn=document.querySelector('#login-admin-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  try {
    const res = await fetch(ADMIN_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if(!res.ok || !data.success){
      toast(data.error==='Sai mật khẩu'?'Sai mật khẩu!':'Lỗi: '+data.error,'er');
      if(btn){btn.disabled=false;btn.innerHTML='🔓 Đăng nhập Admin';}
      return;
    }
    // Set session cho Supabase client bằng token nhận từ Edge Function
    const { error: setErr } = await sb.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });
    if(setErr){ toast('Lỗi thiết lập session: '+setErr.message,'er'); if(btn){btn.disabled=false;btn.innerHTML='🔓 Đăng nhập Admin';} return; }
    saveSession({role:'admin',id:'admin',clanId:'',displayName:'Admin'});
    S.page='flowers';toast('Chào Admin! 🔓');
    // Ghi lần đăng nhập cuối cho admin TRƯỚC khi loadAll, để bảng last-login có dữ liệu mới nhất
    await writeLastLogin('admin','admin','Admin','admin');
    await loadAll(true);
    render();
    window.scrollTo({top:0});
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='🔓 Đăng nhập Admin';}
  }
};
window.doLoginLeader=async function(){
  const u=document.getElementById('ld-u')?.value.trim();
  const p=document.getElementById('ld-p')?.value;
  if(!u||!p){toast('Điền đủ tên đăng nhập và mật khẩu!','wn');return;}
  const btn=document.querySelector('#login-leader-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  try {
    const id = await findLoginId(u, 'leader');
    if(!id){ toast('Sai tên đăng nhập hoặc mật khẩu!','er'); if(btn){btn.disabled=false;btn.innerHTML='🏆 Đăng nhập Hội trưởng';} return; }
    const safePw = p.length>=6 ? p : p.padEnd(6,'0');
    const { error } = await sb.auth.signInWithPassword({ email: `${id}@app.local`, password: safePw });
    if(error){ toast('Sai tên đăng nhập hoặc mật khẩu!','er'); if(btn){btn.disabled=false;btn.innerHTML='🏆 Đăng nhập Hội trưởng';} return; }
    // Đăng nhập thành công, tải dữ liệu để lấy thông tin đầy đủ của leader
    saveSession({role:'leader',id:id,clanId:'',displayName:u});
    await loadAll(true);
    const l=S.leaders.find(x=>x.id===id);
    if(l){ S.session.clanId=l.clanId; S.session.displayName=l.displayName; saveSession(S.session); }
    S.msel=new Set(S.ticks[id]||[]);
    S.page='flowers';toast('Chào '+(l?.displayName||u)+' 🏆');
    // Ghi lần đăng nhập cuối cho leader, rồi tải lại để admin thấy ngay nếu đang xem Settings
    await writeLastLogin(id, u, l?.displayName||u, 'leader');
    await loadAll(true);
    render();
    window.scrollTo({top:0});
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='🏆 Đăng nhập Hội trưởng';}
  }
};
window.doLoginMember=async function(){
  const u=document.getElementById('mb-u')?.value.trim();
  const p=document.getElementById('mb-p')?.value;
  if(!u||!p){toast('Điền đủ tên đăng nhập và mật khẩu!','wn');return;}
  const btn=document.querySelector('#login-member-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  try {
    const id = await findLoginId(u, 'member');
    if(!id){ toast('Sai tên đăng nhập hoặc mật khẩu!','er'); if(btn){btn.disabled=false;btn.innerHTML='🌸 Đăng nhập Thành viên';} return; }
    const safePw = p.length>=6 ? p : p.padEnd(6,'0');
    const { error } = await sb.auth.signInWithPassword({ email: `${id}@app.local`, password: safePw });
    if(error){ toast('Lỗi Auth: '+error.message+' | email='+id+'@app.local','er'); if(btn){btn.disabled=false;btn.innerHTML='🌸 Đăng nhập Thành viên';} return; }
    saveSession({role:'member',id:id,clanId:'',displayName:u});
    await loadAll(true);
    const m=S.members.find(x=>x.id===id);
    if(m){ S.session.clanId=m.clanId; S.session.displayName=m.displayName; saveSession(S.session); }
    S.msel=new Set(S.ticks[id]||[]);
    S.page='tick';toast('Chào '+(m?.displayName||u)+' 🌸');
    // Ghi lần đăng nhập cuối cho member, rồi tải lại để admin thấy ngay nếu đang xem Settings
    await writeLastLogin(id, u, m?.displayName||u, 'member');
    await loadAll(true);
    render();
    window.scrollTo({top:0});
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='🌸 Đăng nhập Thành viên';}
  }
};
window.doLogout=async function(){
  try { await sb.auth.signOut(); } catch(e){}
  clearSession();
  S.msel=new Set();
  S.page='flowers';
  S.loginTab='member';
  S.proxyMemberId=null;
  S._lastTickSubject=null;
  S.tcolor='all'; S.tq='';
  S.fcolor='all'; S.fq='';
  S.flowers=[];S.clans=[];S.leaders=[];S.members=[];S.ticks={};S.loaded=false;
  toast('Đã đăng xuất');
  render();
  await loadAll(true);
  render();
};

// ─── FLOWERS PAGE ────────────────────────────────────────────────────────────
function pageFlowers(){
  const q=S.fq.trim().toLowerCase();
  let list=S.flowers;
  if(S.fcolor!=='all') list=list.filter(f=>f.color===S.fcolor);
  if(q) list=list.filter(f=>f.name.toLowerCase().includes(q));

  const groups={};
  list.forEach(f=>{(groups[f.color]||(groups[f.color]=[])).push(f);});

  // Build clan + member ownership map: for each flower, which clans/members own it
  // (Admin: bỏ qua hoàn toàn — admin không cần xem hội/thành viên trong card hoa, tránh lag)
  // Member/leader: chỉ cần xem người CÙNG HỘI, nên lọc danh sách member/leader theo hội
  // TRƯỚC khi lặp qua từng hoa — giảm tải đáng kể so với lặp toàn bộ rồi mới lọc hiển thị.
  const flowerClans={};
  const flowerMembers={}; // {flowerId: [{displayName, clanId}]}
  if(!isAdmin()){
    const myCid=myClanId();
    const scopedMembers=S.members.filter(m=>m.clanId===myCid);
    const scopedLeaders=S.leaders.filter(l=>l.clanId===myCid);
    S.flowers.forEach(f=>{
      const clanSet=new Set();
      const mList=[];
      scopedMembers.forEach(m=>{
        if((S.ticks[m.id]||[]).includes(f.id)){
          const clan=S.clans.find(c=>c.id===m.clanId);
          if(clan) clanSet.add(clan.name);
          mList.push({displayName:m.displayName,clanId:m.clanId});
        }
      });
      scopedLeaders.forEach(l=>{
        if((S.ticks[l.id]||[]).includes(f.id)){
          const clan=S.clans.find(c=>c.id===l.clanId);
          if(clan) clanSet.add(clan.name);
          mList.push({displayName:l.displayName,clanId:l.clanId});
        }
      });
      flowerClans[f.id]=[...clanSet];
      flowerMembers[f.id]=mList;
    });
  }

  // For member/leader: only show data from their own clan. Admin: never show (perf + đỡ rối card).
  const getDisplayClans = (fid) => {
    if(isAdmin()) return [];
    if(isMember()||isLeader()){
      const clanName=myClanName();
      return flowerClans[fid].filter(n=>n===clanName);
    }
    return flowerClans[fid];
  };
  const getDisplayMembers = (fid) => {
    if(isAdmin()) return [];
    if(isMember()||isLeader()){
      const cid=myClanId();
      return flowerMembers[fid].filter(m=>m.clanId===cid);
    }
    return flowerMembers[fid];
  };

  // Pre-compute owned counts per color for member/leader — now handled by buildFlowerCfbarInner()
  const colorFilter=`<div class="cfbar" id="flower-cfbar">${buildFlowerCfbarInner()}</div>`;

  const searchBar=`<div class="sbar"><span class="sico">🔍</span><input class="fi" id="fq" value="${esc(S.fq)}" placeholder="Tìm tên hoa..." oninput="setFq(this.value)"></div>`;

  // For member/leader: only show flowers that at least 1 member in their clan has ticked
  if(isMember()||isLeader()){
    const cid=myClanId();
    const clanMemberIds=S.members.filter(m=>m.clanId===cid).map(m=>m.id);
    const clanLeaderIds=S.leaders.filter(l=>l.clanId===cid).map(l=>l.id);
    const allIds=[...clanMemberIds,...clanLeaderIds];
    list=list.filter(f=>allIds.some(id=>(S.ticks[id]||[]).includes(f.id)));
    // rebuild groups after filter
    Object.keys(groups).forEach(k=>delete groups[k]);
    list.forEach(f=>{(groups[f.color]||(groups[f.color]=[])).push(f);});
  }

  if(!list.length) return colorFilter+searchBar+`<div class="empty"><div class="empty-icon">🌿</div>Chưa có hoa nào được đánh dấu trong hội</div>`;

  const html=Object.entries(groups).map(([ck,flowers])=>{
    const cv=col(ck);
    const totalInColor=S.flowers.filter(f=>f.color===ck).length;
    const grpLabel=isMember()||isLeader()?`${flowers.length}/${totalInColor}`:flowers.length;
    return `<div class="grp"><div class="grp-bar" style="background:${cv.h}"></div><h2 style="color:${cv.h}">${cv.l}</h2><span class="grp-cnt">${grpLabel}</span></div>
    <div class="fg">${flowers.map(f=>{
      const dClans=getDisplayClans(f.id);
      const dMembers=getDisplayMembers(f.id);
      return `<div class="fc zoomable" onclick="openFlowerZoom('${f.id}')">
        <div class="fc-img">${f.imgUrl?imgTag(f.imgUrl,'decoding="async"'):`<span class="fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`}${labelBadgeHtml(f)}</div>
        <div class="fc-body">
          <div class="fc-name" style="color:${cv.h}">${esc(f.name)}</div>
          <span class="fc-badge" style="background:${cv.h}18;color:${cv.h}"><span class="fc-dot" style="background:${cv.h}"></span>${cv.l}</span>
          ${dClans.length?`<div class="fc-clans">${dClans.map(n=>`<span class="clan-tag">🏅 ${esc(n)}</span>`).join('')}</div>`:''}
          ${dMembers.length?`<div class="fc-clans">${dMembers.map(m=>`<span class="clan-tag" style="background:#e0f2fe;color:#0369a1">👤 ${esc(m.displayName)}</span>`).join('')}</div>`:''}
        </div>
      </div>`;
    }).join('')}</div>`;
  }).join('');

  return colorFilter+searchBar+`<div id="flower-grid">${html}</div>`;
}

// ─── BUILD FLOWER CFBAR (reusable for live color filter) ────────────────────
function buildFlowerCfbarInner(){
  const getOwnedCount = (colorKey) => {
    if(!isMember()&&!isLeader()) return null;
    const cid=myClanId();
    const allIds=[
      ...S.members.filter(m=>m.clanId===cid).map(m=>m.id),
      ...S.leaders.filter(l=>l.clanId===cid).map(l=>l.id)
    ];
    const flowers = colorKey==='all' ? S.flowers : S.flowers.filter(f=>f.color===colorKey);
    return flowers.filter(f=>allIds.some(id=>(S.ticks[id]||[]).includes(f.id))).length;
  };
  const totalAll=S.flowers.length;
  const ownedAll=isMember()||isLeader()?getOwnedCount('all'):null;
  const allOn=S.fcolor==='all';
  const allBtn=`<button class="ctab ${allOn?'on':''}" onclick="setFcolor('all')" style="${allOn?'border-color:var(--forest);color:var(--forest)':''}"><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#cbd5e1;margin-right:4px;vertical-align:middle"></span>${ownedAll!==null?ownedAll+'/'+totalAll:totalAll}</button>`;
  const colorBtns=COLS.filter(c=>S.flowers.some(f=>f.color===c.k)).map(c=>{
    const total=S.flowers.filter(f=>f.color===c.k).length;
    const owned=isMember()||isLeader()?getOwnedCount(c.k):null;
    const on=S.fcolor===c.k;
    return `<button class="ctab ${on?'on':''}" onclick="setFcolor('${c.k}')" style="${on?`border-color:${c.h};color:${c.h}`:''}"><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${c.h};margin-right:4px;vertical-align:middle"></span>${owned!==null?owned+'/'+total:total}</button>`;
  }).join('');
  return allBtn+colorBtns;
}

// ─── BUILD FLOWER GRID (reusable for live search) ───────────────────────────
function buildFlowerGrid(){
  let list=[...S.flowers];
  const q=S.fq.trim().toLowerCase();
  if(q) list=list.filter(f=>f.name.toLowerCase().includes(q));
  if(S.fcolor!=='all') list=list.filter(f=>f.color===S.fcolor);
  if(isMember()||isLeader()){
    const cid=myClanId();
    const allIds=[...S.members.filter(m=>m.clanId===cid).map(m=>m.id),...S.leaders.filter(l=>l.clanId===cid).map(l=>l.id)];
    list=list.filter(f=>allIds.some(id=>(S.ticks[id]||[]).includes(f.id)));
  }
  if(!list.length) return `<div class="empty"><div class="empty-icon">🌿</div>${S.fq?'Không tìm thấy hoa nào':'Chưa có hoa nào được đánh dấu trong hội'}</div>`;
  const groups={};
  list.forEach(f=>{(groups[f.color]||(groups[f.color]=[])).push(f);});
  const fm={};const fc={};
  if(!isAdmin()){
    // Chỉ lặp member/leader CÙNG HỘI — member/leader chỉ cần xem người cùng hội của họ.
    const myCid=myClanId();
    const scopedMembers=S.members.filter(m=>m.clanId===myCid);
    const scopedLeaders=S.leaders.filter(l=>l.clanId===myCid);
    S.flowers.forEach(f=>{
      const cs=new Set();const ml=[];
      scopedMembers.forEach(m=>{if((S.ticks[m.id]||[]).includes(f.id)){const cl=S.clans.find(c=>c.id===m.clanId);if(cl)cs.add(cl.name);ml.push({displayName:m.displayName,clanId:m.clanId});}});
      scopedLeaders.forEach(l=>{if((S.ticks[l.id]||[]).includes(f.id)){const cl=S.clans.find(c=>c.id===l.clanId);if(cl)cs.add(cl.name);ml.push({displayName:l.displayName,clanId:l.clanId});}});
      fc[f.id]=[...cs];fm[f.id]=ml;
    });
  }
  const gClans=(fid)=>{if(isAdmin())return [];if(isMember()||isLeader()){const n=myClanName();return fc[fid].filter(x=>x===n);}return fc[fid];};
  const gMembers=(fid)=>{if(isAdmin())return [];if(isMember()||isLeader()){const cid=myClanId();return fm[fid].filter(m=>m.clanId===cid);}return fm[fid];};
  return Object.entries(groups).map(([ck,flowers])=>{
    const cv=col(ck);
    const totalInColor=S.flowers.filter(f=>f.color===ck).length;
    const grpLabel=isMember()||isLeader()?`${flowers.length}/${totalInColor}`:flowers.length;
    return `<div class="grp"><div class="grp-bar" style="background:${cv.h}"></div><h2 style="color:${cv.h}">${cv.l}</h2><span class="grp-cnt">${grpLabel}</span></div>
    <div class="fg">${flowers.map(f=>{
      const dC=gClans(f.id);const dM=gMembers(f.id);
      return `<div class="fc zoomable" onclick="openFlowerZoom('${f.id}')">
        <div class="fc-img">${f.imgUrl?imgTag(f.imgUrl,'decoding="async"'):`<span class="fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`}${labelBadgeHtml(f)}</div>
        <div class="fc-body">
          <div class="fc-name" style="color:${cv.h}">${esc(f.name)}</div>
          <span class="fc-badge" style="background:${cv.h}18;color:${cv.h}"><span class="fc-dot" style="background:${cv.h}"></span>${cv.l}</span>
          ${dC.length?`<div class="fc-clans">${dC.map(n=>`<span class="clan-tag">🏅 ${esc(n)}</span>`).join('')}</div>`:''}
          ${dM.length?`<div class="fc-clans">${dM.map(m=>`<span class="clan-tag" style="background:#e0f2fe;color:#0369a1">👤 ${esc(m.displayName)}</span>`).join('')}</div>`:''}
        </div>
      </div>`;
    }).join('')}</div>`;
  }).join('');
}

// ─── TICK PAGE HELPERS (partial-update safe) ──────────────────────────────────
function buildTickCfbarInner(){
  // Trả về innerHTML của #tick-cfbar (không bao gồm thẻ div ngoài)
  const allOn = S.tcolor==='all';
  const allBtn=`<button class="ctab ${allOn?'on':''}" onclick="setTcolor('all')" style="${allOn?'border-color:var(--forest);color:var(--forest)':''}">Tất cả</button>`;
  const colorBtns=COLS.filter(c=>S.flowers.some(f=>f.color===c.k)).map(c=>{
    const on=S.tcolor===c.k;
    return `<button class="ctab ${on?'on':''}" onclick="setTcolor('${c.k}')" style="${on?`border-color:${c.h};color:${c.h}`:''}"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c.h};margin-right:3px;vertical-align:middle"></span>${c.l}</button>`;
  }).join('');
  return allBtn+colorBtns;
}
function buildColorGroupsHtml(list){
  if(!list.length) return `<div class="empty" style="padding:18px 0"><div class="empty-icon">🌿</div>Không có hoa nào</div>`;
  const groups={};
  list.forEach(f=>{(groups[f.color]||(groups[f.color]=[])).push(f);});
  return Object.entries(groups).map(([ck,flowers])=>{
    const cv=col(ck);
    return `<div class="grp"><div class="grp-bar" style="background:${cv.h}"></div><h2 style="color:${cv.h}">${cv.l}</h2><span class="grp-cnt">${flowers.length}</span></div>
    <div class="fg">${flowers.map(f=>{
      const tk=S.msel.has(f.id);
      return `<div class="fc tc ${tk?'ticked':''}" onclick="toggleTick('${f.id}')">
        <div class="fc-img">${f.imgUrl?imgTag(f.imgUrl,'decoding="async"'):`<span class="fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`}
        ${labelBadgeHtml(f)}<div class="chk">${tk?'✓':''}</div></div>
        <div class="fc-body"><div class="fc-name">${esc(f.name)}</div>
        <span class="fc-badge" style="background:${cv.h}18;color:${cv.h}"><span class="fc-dot" style="background:${cv.h}"></span>${cv.l}</span></div>
      </div>`;
    }).join('')}</div>`;
  }).join('');
}
function buildTickGrid(){
  const q=S.tq.trim().toLowerCase();
  const total=S.flowers.length;

  // ── "Đã đánh dấu": dùng snapshot cố định (cập nhật khi vào trang / sau khi Lưu) ──
  // Không áp dụng tìm kiếm/lọc màu — luôn hiện đầy đủ hoa đã lưu.
  // Không đổi realtime khi người dùng tick/untick (chỉ đổi sau khi bấm Lưu).
  const markedList = S.flowers.filter(f=>S._tickMarkedSnapshot.has(f.id));

  // ── "Chưa đánh dấu": áp dụng tìm kiếm + lọc màu, loại các hoa đã có trong snapshot ──
  let unmarkedList = S.flowers.filter(f=>!S._tickMarkedSnapshot.has(f.id));
  if(S.tcolor!=='all') unmarkedList=unmarkedList.filter(f=>f.color===S.tcolor);
  if(q) unmarkedList=unmarkedList.filter(f=>f.name.toLowerCase().includes(q));

  const markedOpen=S._tickSecOpen.marked!==false;
  const unmarkedOpen=S._tickSecOpen.unmarked!==false;
  const markedTotalCnt=S._tickMarkedSnapshot.size;
  const unmarkedTotalCnt=total-markedTotalCnt;
  const markedLabel = markedTotalCnt===0 ? `0 Hoa` : `${markedTotalCnt}/${total} Hoa`;
  const unmarkedLabel = `${unmarkedTotalCnt}/${total} Hoa`;

  return `
  <div class="tsec ${markedOpen?'':'closed'}" id="tsec-marked">
    <div class="tsec-head tsec-head-hl" onclick="toggleTickSec('marked')">
      <span class="tsec-ico">▾</span>
      <span class="tsec-title">🌸 Đã đánh dấu</span>
      <span class="tsec-cnt marked">${markedLabel}</span>
      <span class="tsec-hint">chạm để đóng/mở</span>
    </div>
    <div class="tsec-body" id="tsec-marked-body">${buildColorGroupsHtml(markedList)}</div>
  </div>
  <div class="tsec ${unmarkedOpen?'':'closed'}" id="tsec-unmarked">
    <div class="tsec-head tsec-head-hl" onclick="toggleTickSec('unmarked')">
      <span class="tsec-ico">▾</span>
      <span class="tsec-title">⬜ Chưa đánh dấu</span>
      <span class="tsec-cnt unmarked">${unmarkedLabel}</span>
      <span class="tsec-hint">chạm để đóng/mở</span>
    </div>
    <div class="tsec-body" id="tsec-unmarked-body">${unmarkedList.length?buildColorGroupsHtml(unmarkedList):`<div class="empty" style="padding:18px 0"><div class="empty-icon">🌿</div>Không tìm thấy</div>`}</div>
  </div>`;
}
window.toggleTickSec=function(key){
  S._tickSecOpen[key]=!(S._tickSecOpen[key]!==false);
  const el=document.getElementById('tsec-'+key);
  if(el) el.classList.toggle('closed', S._tickSecOpen[key]===false);
};

// ─── TICK PAGE (MEMBER / LEADER) ──────────────────────────────────────────────
function pageTick(){
  if(!isMember()&&!isLeader()) return `<div class="empty"><div class="empty-icon">🔒</div>Chỉ thành viên mới có thể đánh dấu hoa</div>`;

  const myId = S.session.id;
  const clanName=myClanName();
  const subjectId = (isLeader() && S.proxyMemberId) ? S.proxyMemberId : myId;

  const me = isMember()
    ? S.members.find(m=>m.id===myId)
    : S.leaders.find(l=>l.id===myId);

  // Load msel chỉ khi subject thay đổi (source of truth = _lastTickSubject, không dùng msel.size)
  if(S._lastTickSubject !== subjectId){
    S._lastTickSubject = subjectId;
    S.msel = new Set(S.ticks[subjectId]||[]);
    S._tickMarkedSnapshot = new Set(S.ticks[subjectId]||[]);
    S._tickSecOpen = {marked:false, unmarked:true};
  }

  let proxyHtml='';
  if(isLeader()){
    const clanMembers=S.members.filter(m=>m.clanId===myClanId());
    const opts=clanMembers.map(m=>`<option value="${m.id}" ${S.proxyMemberId===m.id?'selected':''}>${esc(m.displayName)}${m.alias?' ('+esc(m.alias)+')':''}</option>`).join('');
    proxyHtml=`<div class="card" style="margin-bottom:12px;border-left:3px solid var(--clan)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:.82rem;font-weight:700;color:var(--clan)">🏆 Tick hoa giúp thành viên</span>
        <select class="fi" style="max-width:220px;flex:1" onchange="setProxyMember(this.value)">
          <option value="">— Tick cho chính mình —</option>
          ${clanMembers.length?opts:'<option disabled>Chưa có thành viên</option>'}
        </select>
        ${S.proxyMemberId?`<span class="role-chip role-member" style="background:#ede9fe;color:var(--clan)">👤 ${esc(S.members.find(x=>x.id===S.proxyMemberId)?.displayName||'')}</span>`:''}
      </div>
    </div>`;
  }

  const displaySubject = S.proxyMemberId ? S.members.find(x=>x.id===S.proxyMemberId) : me;
  const info=`<div class="card" style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      ${S.proxyMemberId
        ? `<span class="role-chip role-member">🌸 ${esc(displaySubject?.displayName||'')}</span><span style="font-size:.75rem;color:var(--clan);font-weight:600">← được tick bởi Hội trưởng</span>`
        : isLeader()
          ? `<span class="role-chip role-leader">🏆 ${esc(me?.displayName||'')}</span>`
          : `<span class="role-chip role-member">🌸 ${esc(me?.displayName||'')}</span>`}
      <span class="clan-tag">🏅 Hội ${esc(clanName)}</span>
      <span style="font-size:.8rem;color:var(--mist);margin-left:auto">${S.msel.size}/${S.flowers.length} hoa đã chọn</span>
    </div>
  </div>`;

  // cfbar và grid có id riêng → partial update không cần rebuild cả trang
  const colorFilter=`<div class="cfbar" id="tick-cfbar">${buildTickCfbarInner()}</div>`;
  const searchBar=`<div class="sbar"><span class="sico">🔍</span><input class="fi" id="tq" value="${esc(S.tq)}" placeholder="Tìm tên hoa..." oninput="setTq(this.value)"></div>`;

  return proxyHtml+info+colorFilter+searchBar+`<div id="tick-grid">${buildTickGrid()}</div>`;
}

window.setProxyMember=function(memberId){
  S.proxyMemberId = memberId || null;
  S._lastTickSubject = null; // force msel reload on next render
  render();
};

window.toggleTick=function(id){
  if(!isMember()&&!isLeader()){toast('Chỉ thành viên mới tick được!','wn');return;}
  S.msel.has(id)?S.msel.delete(id):S.msel.add(id);
  // Không di chuyển hoa giữa 2 danh sách ngay — chỉ đổi viền/dấu tick tại chỗ.
  // Hoa chỉ thực sự chuyển sang "Đã đánh dấu" sau khi bấm Lưu (saveTicks).
  const cards=document.querySelectorAll('.tc');
  cards.forEach(card=>{
    const fn=card.getAttribute('onclick');
    if(fn&&fn.includes(`'${id}'`)){
      const ticked=S.msel.has(id);
      card.classList.toggle('ticked',ticked);
      const chk=card.querySelector('.chk');
      if(chk) chk.textContent=ticked?'✓':'';
    }
  });
  const sbcEl=document.getElementById('sbc');
  if(sbcEl) sbcEl.textContent=S.msel.size;
};

window.saveTicks=async function(){
  if(!isMember()&&!isLeader()){toast('Chỉ thành viên mới lưu được!','wn');return;}
  const btn=document.getElementById('sbtn');
  btn.disabled=true;btn.innerHTML='<div class="sp"></div>';
  setPulse('loading');
  try {
    // Hội trưởng tick thay: lưu vào memberId được chọn, không phải id leader
    const memberId = (isLeader() && S.proxyMemberId) ? S.proxyMemberId : S.session.id;
    const saved=[...S.msel];
    // ── Quota optimisation: skip Firestore write nếu data không đổi ──────────
    const existing=S.ticks[memberId]||[];
    const same=existing.length===saved.length && saved.every(id=>existing.includes(id));
    if(same){toast('Không có thay đổi nào 🌿','wn');btn.disabled=false;btn.innerHTML='💾 Lưu';setPulse('');return;}
    await fsSet('ticks',memberId,{flowerIds:saved,updatedAt:new Date().toISOString()});
    S.ticks[memberId]=saved;
    S.msel=new Set(saved);
    S._tickMarkedSnapshot=new Set(saved);
    // Sau khi Lưu, hoa mới thực sự chuyển khối Đã đánh dấu / Chưa đánh dấu → rebuild grid
    const tickGrid=document.getElementById('tick-grid');
    if(tickGrid) tickGrid.innerHTML=buildTickGrid();
    const sbcEl=document.getElementById('sbc');
    if(sbcEl) sbcEl.textContent=S.msel.size;
    if(isLeader()&&S.proxyMemberId){
      const m=S.members.find(x=>x.id===S.proxyMemberId);
      toast(`Đã lưu hoa cho ${m?.displayName||'thành viên'} 🌸`);
    } else {
      toast('Đã lưu 🌸');
    }
  } catch(e){ toast('Lỗi lưu: '+e.message,'er'); }
  setPulse('');
  btn.disabled=false;btn.innerHTML='💾 Lưu';
};

// ─── MEMBERS PAGE (ADMIN + LEADER + MEMBER) ──────────────────────────────────
function pageMembers(){
  if(!isAdmin()&&!isLeader()&&!isMember()) return `<div class="empty"><div class="empty-icon">🔒</div>Không có quyền xem</div>`;

  // filter members to current clan if leader/member; admin sees all (or filters by chosen clan)
  if(isAdmin() && S._memClan===undefined) S._memClan='all';
  const myMembers = (isLeader()||isMember())
    ? S.members.filter(m=>m.clanId===myClanId())
    : (isAdmin() && S._memClan!=='all') ? S.members.filter(m=>m.clanId===S._memClan) : S.members;
  const myLeaders = (isLeader()||isMember())
    ? S.leaders.filter(l=>l.clanId===myClanId())
    : (isAdmin() && S._memClan!=='all') ? S.leaders.filter(l=>l.clanId===S._memClan) : S.leaders;

  const total=S.flowers.length;
  const clanName = (isLeader()||isMember()) ? myClanName() : null;

  const clanFilterHtml = isAdmin() ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    <button class="chip ${S._memClan==='all'?'on':''}" onclick="setMemClan('all')">Tất cả</button>
    ${S.clans.map(c=>`<button class="chip ${S._memClan===c.id?'on':''}" onclick="setMemClan('${c.id}')">🏅 ${esc(c.name)}</button>`).join('')}
  </div>` : '';

  const statsHtml=`<div class="stats">
    <div class="sc"><div class="sv">${myMembers.length+myLeaders.length}</div><div class="sl">${clanName?'TV Hội '+clanName:'Thành viên'}</div></div>
    <div class="sc"><div class="sv">${total}</div><div class="sl">Loài hoa</div></div>
    <div class="sc"><div class="sv">${total?Math.round([...myMembers,...myLeaders].reduce((a,m)=>a+(S.ticks[m.id]||[]).length,0)/Math.max(myMembers.length+myLeaders.length,1)):0}</div><div class="sl">TB / người</div></div>
  </div>
  ${(isLeader()||isMember()) && myLeaders.length>0 ? `<div class="card" style="margin-bottom:14px;border-left:3px solid var(--clan);background:#faf5ff">
    <div style="display:flex;align-items:flex-start;gap:9px">
      <span style="font-size:1.3rem">🏆</span>
      <div>
        <div style="font-size:.82rem;font-weight:700;color:var(--clan);margin-bottom:3px">Hội trưởng có thể tick hoa giúp thành viên!</div>
        <div style="font-size:.78rem;color:#7c3aed99;line-height:1.6">Hội trưởng <strong>${myLeaders.map(l=>esc(l.displayName)).join(', ')}</strong> có thể vào tab <em>✅ Đánh dấu</em>, chọn tên thành viên và tick hoa giúp — tiện cho những ai chưa kịp cập nhật nhé 🌸</div>
      </div>
    </div>
  </div>` : ''}`;

  // For leader/member/admin view, show leader(s) of the clan first, then members
  const leaderRows = myLeaders.map(l=>{
    const n=(S.ticks[l.id]||[]).length;
    const pct=total?Math.round(n/total*100):0;
    const clan=S.clans.find(c=>c.id===l.clanId);
    return `<tr>
      <td style="color:var(--haze);font-weight:800;width:28px">🏆</td>
      <td><div class="mb-name-link" style="font-weight:700" onclick="openMemberFlowers('${l.id}','leader')">${esc(l.displayName)}</div><div style="font-size:.72rem;color:var(--clan)">Hội trưởng</div></td>
      ${isAdmin()?`<td><span class="clan-tag">${clan?'🏅 '+esc(clan.name):'—'}</span></td>`:''}
      <td><div class="mbar-w"><div class="mbar"><div class="mbar-f" style="width:${pct}%"></div></div><span class="mlbl">${n}/${total}</span></div></td>
      ${isAdmin()?`<td></td>`:''}
    </tr>`;
  }).join('');

  const sorted=[...myMembers].sort((a,b)=>(S.ticks[b.id]||[]).length-(S.ticks[a.id]||[]).length);
  const memberRows = sorted.map((m,i)=>{
      const n=(S.ticks[m.id]||[]).length;
      const pct=total?Math.round(n/total*100):0;
      const clan=S.clans.find(c=>c.id===m.clanId);
      return `<tr>
        <td style="color:var(--haze);font-weight:800;width:28px">${i+1}</td>
        <td><div class="mb-name-link" style="font-weight:700" onclick="openMemberFlowers('${m.id}','member')">${esc(m.displayName)}</div>${m.alias||m.year?`<div style="font-size:.74rem;color:var(--mist)">${[m.alias,m.year].filter(Boolean).join(' · ')}</div>`:''}<div style="font-size:.72rem;color:var(--haze)">@${esc(m.username)}</div></td>
        ${isAdmin()?`<td><span class="clan-tag">${clan?'🏅 '+esc(clan.name):'—'}</span></td>`:''}
        <td><div class="mbar-w"><div class="mbar"><div class="mbar-f" style="width:${pct}%"></div></div><span class="mlbl">${n}/${total}</span></div></td>
        ${isAdmin()?`<td><button class="ibtn del" onclick="confirmDelMember('${m.id}')">🗑️</button></td>`:''}
      </tr>`;
  }).join('');

  const allRows=leaderRows+memberRows;
  const tableHtml=(!allRows)
    ?`<div class="empty"><div class="empty-icon">👥</div>Chưa có thành viên</div>`
    :`<div style="overflow-x:auto"><table class="mtbl"><thead><tr><th>#</th><th>Thành viên</th>${isAdmin()?'<th>Hội</th>':''}<th>Sở hữu</th>${isAdmin()?'<th></th>':''}</tr></thead><tbody>
    ${allRows}</tbody></table></div>`;
  return clanFilterHtml+statsHtml+`<div class="card">${tableHtml}</div>`;
}
window.setMemClan=function(c){
  S._memClan=c;
  render();
};

// ─── MANAGE PAGE ─────────────────────────────────────────────────────────────
function pageManage(){
  if(!isAdmin()&&!isLeader()) return `<div class="empty"><div class="empty-icon">🔒</div>Không có quyền</div>`;
  if(isLeader()) return manageLeaderSection();
  // Admin: tab-based layout
  if(!S._manageTab) S._manageTab='clans';
  const tabs=[
    {k:'clans',  l:'🏅 Hội',        fn:manageClans},
    {k:'leaders',l:'🏆 Hội trưởng', fn:manageLeaders},
    {k:'flowers',l:'🌸 Hoa',         fn:manageFlowers},
    {k:'members',l:'👥 Thành viên',  fn:manageAllMembers},
    {k:'rentals',l:'🏠 Hội Đã Thuê', fn:manageRentals},
    {k:'trials', l:'⏳ Hội Dùng Thử',fn:manageTrials},
    {k:'announcement', l:'📢 Thông Báo', fn:manageAnnouncement},
  ];
  const tabBar=`<div class="nav" style="margin-bottom:16px">${tabs.map(t=>`<button class="nvb ${S._manageTab===t.k?'on':''}" onclick="setManageTab('${t.k}')">${t.l}</button>`).join('')}</div>`;
  const active=tabs.find(t=>t.k===S._manageTab)||tabs[0];
  return tabBar+active.fn();
}
window.setManageTab=function(k){S._manageTab=k;render();};

function manageLeaderSection(){
  return manageClanMembers();
}

// ── CLANS (ADMIN) ─────────────────────────────────────────────────────────────
function manageClans(){
  const rows=S.clans.map(c=>`<tr>
    <td><strong>${esc(c.name)}</strong></td>
    <td style="font-size:.78rem;color:var(--mist)">${S.leaders.filter(l=>l.clanId===c.id).map(l=>esc(l.displayName)).join(', ')||'—'}</td>
    <td style="font-size:.78rem;color:var(--mist)">${S.members.filter(m=>m.clanId===c.id).length+S.leaders.filter(l=>l.clanId===c.id).length} thành viên</td>
    <td><button class="ibtn del" onclick="confirmDelClan('${c.id}')">🗑️</button></td>
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

// ── LEADERS (ADMIN) ───────────────────────────────────────────────────────────
function manageLeaders(){
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
        body: JSON.stringify({ action: 'delete', refId: id })
      });
      const delResult = await delRes.json();
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

// ── FLOWERS (ADMIN) ────────────────────────────────────────────────────────────
function manageFlowers(){
  if(!S._mfColor) S._mfColor='all';
  if(S._mfQuery===undefined) S._mfQuery='';
  const colorChips=`<button class="chip ${S._mfColor==='all'?'on':''}" onclick="setMfColor('all')">Tất cả</button>`+
    COLS.map(c=>`<button class="chip ${S._mfColor===c.k?'on':''}" onclick="setMfColor('${c.k}')" style="${S._mfColor===c.k?`background:${c.h};border-color:${c.h};color:#fff`:''}"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c.h};margin-right:4px"></span>${c.l}</button>`).join('');
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">🌸 Quản lý hoa <span id="mf-count" style="font-size:.76rem;font-weight:600;color:var(--mist)"></span>
      <button class="btn btn-g btn-sm" style="margin-left:auto" onclick="openAddFlower()">+ Thêm hoa</button>
    </div>
    <input class="fi" style="margin-bottom:10px" placeholder="🔍 Tìm theo tên hoa..." value="${esc(S._mfQuery)}" oninput="setMfQuery(this.value)">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${colorChips}</div>
    <div id="mf-result"></div>
  </div>`;
}
function buildMfResult(){
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
        <label class="fl">Ảnh</label>
        <input type="file" id="ef-img-file" accept="image/*" style="display:none" onchange="onImgFileChange(this)">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="ef-img" placeholder="https://... hoặc chọn ảnh từ máy" style="flex:1">
          <button class="btn btn-o btn-sm" id="ef-upload-btn" type="button" onclick="triggerImgUpload()">🖼️ Chọn ảnh</button>
        </div>
        <label style="display:flex;align-items:center;gap:7px;margin-top:8px;cursor:pointer;user-select:none;font-size:.8rem;color:var(--forest2)">
          <input type="checkbox" id="ef-ocr-toggle" style="width:15px;height:15px;accent-color:var(--leaf);cursor:pointer">
          🤖 Dùng AI nhận diện tên từ ảnh
        </label>
        <img id="ef-img-preview" src="" style="display:none;margin-top:8px;width:100%;max-height:140px;object-fit:cover;border-radius:9px;border:1px solid var(--bd)">
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
        <label class="fl">Ảnh</label>
        <input type="file" id="ef-img-file" accept="image/*" style="display:none" onchange="onImgFileChange(this)">
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="ef-img" value="${esc(f.imgUrl)}" placeholder="https://... hoặc chọn ảnh từ máy" style="flex:1">
          <button class="btn btn-o btn-sm" id="ef-upload-btn" type="button" onclick="triggerImgUpload()">🖼️ Chọn ảnh</button>
        </div>
        <label style="display:flex;align-items:center;gap:7px;margin-top:8px;cursor:pointer;user-select:none;font-size:.8rem;color:var(--forest2)">
          <input type="checkbox" id="ef-ocr-toggle" style="width:15px;height:15px;accent-color:var(--leaf);cursor:pointer">
          🤖 Dùng AI nhận diện tên từ ảnh
        </label>
        <img id="ef-img-preview" src="${esc(f.imgUrl)}" style="display:${f.imgUrl?'block':'none'};margin-top:8px;width:100%;max-height:140px;object-fit:cover;border-radius:9px;border:1px solid var(--bd)">
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
  const sortOrder=Number(document.getElementById('ef-sort')?.value)||0;
  const color=S._editColor||'trang';
  const label=document.getElementById('ef-label')?.value||'';
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    if(S._editFlowerId){
      await fsSet('flowers',S._editFlowerId,{name,color,imgUrl,sortOrder,label});
      const f=S.flowers.find(x=>x.id===S._editFlowerId);
      if(f){f.name=name;f.color=color;f.imgUrl=imgUrl;f.sortOrder=sortOrder;f.label=label;}
      toast('Đã cập nhật hoa');
    } else {
      const newId='f'+Date.now();
      await fsSet('flowers',newId,{name,color,imgUrl,sortOrder,label});
      S.flowers.push({id:newId,name,color,imgUrl,sortOrder,label});
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

// ── ALL MEMBERS (ADMIN) ───────────────────────────────────────────────────────
function manageAllMembers(){
  if(!S._mmClan) S._mmClan='all';
  if(S._mmQuery===undefined) S._mmQuery='';
  const clanChips=`<button class="chip ${S._mmClan==='all'?'on':''}" onclick="setMmClan('all')">Tất cả</button>`+
    S.clans.map(c=>`<button class="chip ${S._mmClan===c.id?'on':''}" onclick="setMmClan('${c.id}')">🏅 ${esc(c.name)}</button>`).join('');
  return `<div class="card">
    <div class="card-title">👥 Tất cả thành viên <span id="mm-count" style="font-size:.76rem;font-weight:600;color:var(--mist)"></span></div>
    <input class="fi" style="margin-bottom:10px" placeholder="🔍 Tìm theo tên, username hoặc id..." value="${esc(S._mmQuery)}" oninput="setMmQuery(this.value)">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${clanChips}</div>
    <div id="mm-result"></div>
  </div>`;
}
function buildMmResult(){
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
function manageClanMembers(){
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
        body: JSON.stringify({ action: 'delete', refId: id })
      });
      const delResult = await delRes.json();
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

// ─── HỘI ĐÃ THUÊ (ADMIN ONLY) ───────────────────────────────────────────────
function manageRentals(){
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

// ─── HỘI DÙNG THỬ (TRIAL — 7 ngày cố định) ──────────────────────────────────
const TRIAL_DAYS = 7;
function manageTrials(){
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

// ── THÔNG BÁO HỆ THỐNG (ADMIN) ─────────────────────────────────────────────
// Bảng system_announcement chỉ 1 row duy nhất (id cố định 'current').
// Thêm → insert row. Sửa → update content. Xóa → xóa hẳn row (nhẹ data, không giữ lịch sử).
// Đảm bảo JWT còn hạn trước khi ghi dữ liệu nhạy cảm (RLS).
// Cần thiết riêng cho admin vì admin login qua setSession() thủ công (token từ Edge Function admin-login),
// không qua signInWithPassword trực tiếp ở client, nên với session rất cũ (qua đêm) JWT có thể đã hết hạn
// mà cơ chế auto-refresh ngầm chưa kịp xử lý trước khi gọi insert/update/delete → bị RLS từ chối.
async function ensureFreshSession(){
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if(!session) return false;
  const expiresAt = session.expires_at; // unix timestamp (giây)
  const nowSec = Math.floor(Date.now()/1000);
  // Còn dưới 60 giây hoặc đã hết hạn → chủ động refresh trước khi ghi
  if(!expiresAt || expiresAt - nowSec < 60){
    const { error } = await sb.auth.refreshSession();
    if(error) return false;
  }
  return true;
}

function manageAnnouncement(){
  if(!isAdmin()) return '';
  const ann = S.announcement;
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-title">📢 Thông Báo Hệ Thống</div>
    <div style="font-size:.75rem;color:var(--mist);margin-bottom:14px;line-height:1.6">
      📌 Thông báo hiện dưới dạng banner nhỏ phía trên cùng trang, cho mọi người đã đăng nhập (kể cả phiên đăng nhập cũ còn hạn). Banner tồn tại cho tới khi bạn xóa thông báo này khỏi hệ thống.
    </div>
    ${ann
      ? `<div style="background:var(--bg2,#fdf3f7);border:1.5px solid var(--bd);border-radius:14px;padding:14px;margin-bottom:12px">
          <div style="font-size:.85rem;color:var(--ink);line-height:1.6;margin-bottom:8px">${esc(ann.content)}</div>
          <div style="font-size:.68rem;color:var(--mist)">Cập nhật lần cuối: ${ann.updatedAt ? new Date(ann.updatedAt).toLocaleString('vi-VN') : '—'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-g btn-sm" onclick="openEditAnnouncement()">✏️ Sửa</button>
          <button class="btn btn-r btn-sm" onclick="confirmDelAnnouncement()">🗑️ Xóa</button>
        </div>`
      : `<div class="empty"><div class="empty-icon">📢</div>Chưa có thông báo nào
          <div style="margin-top:14px"><button class="btn btn-g" onclick="openAddAnnouncement()">+ Thêm thông báo</button></div>
        </div>`
    }
  </div>`;
}
window.openAddAnnouncement=function(){
  openModal('📢 Thêm Thông Báo',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Nội dung thông báo *</label>
        <textarea class="fi" id="ann-content" rows="4" style="resize:vertical;font-family:inherit" placeholder="Nhập nội dung thông báo..."></textarea>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doAddAnnouncement()">Thêm</button>`
  );
};
window.doAddAnnouncement=async function(){
  const content=document.getElementById('ann-content')?.value.trim();
  if(!content){toast('Nhập nội dung thông báo!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const ok = await ensureFreshSession();
    if(!ok){ toast('Phiên đăng nhập đã hết hạn, vui lòng đăng xuất rồi đăng nhập lại!','er'); if(btn){btn.disabled=false;btn.innerHTML='Thêm';} setPulse(''); return; }
    const { data, error } = await sb.from('system_announcement')
      .upsert({ id:'current', content }, { onConflict:'id' })
      .select().single();
    if(error) throw new Error(error.message);
    S.announcement = { id:data.id, content:data.content, updatedAt:data.updated_at };
    S.announcementDismissed=false; // thông báo mới → hiện lại cho chính admin luôn
    closeModal();toast('Đã thêm thông báo!');
    render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Thêm';}}
  setPulse('');
};
window.openEditAnnouncement=function(){
  if(!S.announcement) return;
  openModal('✏️ Sửa Thông Báo',
    `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="fg-col"><label class="fl">Nội dung thông báo *</label>
        <textarea class="fi" id="ann-content" rows="4" style="resize:vertical;font-family:inherit">${esc(S.announcement.content)}</textarea>
      </div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-g" onclick="doEditAnnouncement()">Lưu</button>`
  );
};
window.doEditAnnouncement=async function(){
  const content=document.getElementById('ann-content')?.value.trim();
  if(!content){toast('Nhập nội dung thông báo!','wn');return;}
  const btn=document.querySelector('.mbox .btn-g');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  setPulse('loading');
  try {
    const ok = await ensureFreshSession();
    if(!ok){ toast('Phiên đăng nhập đã hết hạn, vui lòng đăng xuất rồi đăng nhập lại!','er'); if(btn){btn.disabled=false;btn.innerHTML='Lưu';} setPulse(''); return; }
    const { data, error } = await sb.from('system_announcement')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id','current').select().single();
    if(error) throw new Error(error.message);
    S.announcement = { id:data.id, content:data.content, updatedAt:data.updated_at };
    S.announcementDismissed=false; // nội dung đổi → hiện lại banner cho mọi người
    closeModal();toast('Đã cập nhật!');render();
  } catch(e){toast('Lỗi: '+e.message,'er');if(btn){btn.disabled=false;btn.innerHTML='Lưu';}}
  setPulse('');
};
window.confirmDelAnnouncement=function(){
  openModal('⚠️ Xóa thông báo',`Xóa thông báo hệ thống hiện tại? Banner sẽ biến mất khỏi trang của mọi người.`,
    `<button class="btn btn-o" onclick="closeModal()">Hủy</button><button class="btn btn-r" onclick="doDelAnnouncement()">Xóa</button>`);
};
window.doDelAnnouncement=async function(){
  closeModal();setPulse('loading');
  try {
    const ok = await ensureFreshSession();
    if(!ok){ toast('Phiên đăng nhập đã hết hạn, vui lòng đăng xuất rồi đăng nhập lại!','er'); setPulse(''); return; }
    const { error } = await sb.from('system_announcement').delete().eq('id','current');
    if(error) throw new Error(error.message);
    S.announcement=null;
    toast('Đã xóa!');
  } catch(e){toast('Lỗi: '+e.message,'er');}
  setPulse('');render();
};


// ─── LAST LOGIN WRITER — dùng REST trực tiếp, bypass RLS session ─────────────
// Supabase REST upsert với header Prefer: resolution=merge-duplicates
async function writeLastLogin(userId, username, displayName, role){
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_last_login`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
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

// ─── LAST LOGIN (ADMIN ONLY — hiển thị trong Settings) ───────────────────────
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

function renderLastLoginTable(){
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

// ─── BẢNG XẾP HẠNG ───────────────────────────────────────────────────────────
(function(){
  if(document.getElementById('rank-css')) return;
  const s=document.createElement('style');
  s.id='rank-css';
  s.textContent=`
/* ── Sub-tab ── */
.rank-tabs{display:flex;gap:8px;margin-bottom:18px}
.rank-tab{
  flex:1;padding:10px 12px;border-radius:var(--rp);font-size:.84rem;font-weight:700;
  border:2px solid var(--bd);background:var(--white);color:var(--mist);
  cursor:pointer;transition:all .14s;text-align:center;font-family:inherit;
  display:flex;align-items:center;justify-content:center;gap:7px;
}
.rank-tab:hover{border-color:var(--leaf);color:var(--ink)}
.rank-tab.on{color:#fff;border-color:transparent;
  box-shadow:0 3px 12px rgba(0,0,0,.18)}
.rank-dot{
  width:13px;height:13px;border-radius:50%;flex-shrink:0;
  box-shadow:0 1px 4px rgba(0,0,0,.2);
}

/* ── Podium ── */
.podium{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px}

/* Badge — bo tròn, KHÔNG có ::before vân mây */
.rnk-badge{
  position:relative;
  display:inline-flex;align-items:center;justify-content:center;gap:7px;
  padding:10px 24px;
  border-radius:999px;
  font-weight:800;font-size:.88rem;
  font-family:'Noto Serif SC',serif;
  letter-spacing:.02em;
  cursor:pointer;
  transition:transform .15s,box-shadow .15s;
  white-space:nowrap;
  /* Shine chỉ dùng ::after */
}
.rnk-badge:hover{transform:translateY(-2px);}
.rnk-badge::after{
  content:'';position:absolute;inset:0;border-radius:inherit;
  background:linear-gradient(180deg,rgba(255,255,255,.5) 0%,rgba(255,255,255,.1) 45%,transparent 52%);
  pointer-events:none;
}
.rnk-icon{font-size:1rem;flex-shrink:0;position:relative;z-index:1}
.rnk-name{position:relative;z-index:1}

/* VÀNG */
.rnk-gold{
  background:linear-gradient(135deg,#fff9d0 0%,#ffe566 35%,#ffd700 60%,#ffecaa 100%);
  border:2px solid #e6c200;color:#7a5800;
  box-shadow:0 0 0 1px rgba(255,220,0,.4),0 5px 18px rgba(184,134,11,.35),
    inset 0 1px 0 rgba(255,255,255,.8),inset 0 -1px 0 rgba(184,134,11,.3);
}
/* BẠC */
.rnk-silver{
  background:linear-gradient(135deg,#f4f4f4 0%,#dcdcdc 35%,#c0c0c0 60%,#e8e8e8 100%);
  border:2px solid #a8a8a8;color:#3a3a3a;
  box-shadow:0 0 0 1px rgba(200,200,200,.5),0 5px 16px rgba(100,100,100,.28),
    inset 0 1px 0 rgba(255,255,255,.9),inset 0 -1px 0 rgba(100,100,100,.18);
}
/* ĐỒNG */
.rnk-bronze{
  background:linear-gradient(135deg,#fdf0e4 0%,#e8a96a 35%,#cd7f32 60%,#f0c080 100%);
  border:2px solid #c07830;color:#5a2800;
  box-shadow:0 0 0 1px rgba(205,127,50,.35),0 5px 16px rgba(139,69,19,.28),
    inset 0 1px 0 rgba(255,255,255,.7),inset 0 -1px 0 rgba(139,69,19,.22);
}

/* ── Hàng top 4-10 ── */
.rank-list{display:flex;flex-direction:column;gap:6px}
.rank-row{
  display:flex;align-items:center;gap:10px;
  padding:9px 13px;border-radius:12px;
  background:var(--white);border:1.5px solid var(--bd);
  box-shadow:0 1px 4px rgba(168,72,122,.07);
  transition:background .12s;cursor:pointer;
}
.rank-row:hover{background:var(--sage);}
.rank-num{font-size:.8rem;font-weight:800;color:var(--mist);width:22px;text-align:center;flex-shrink:0}
.rank-name-link{flex:1;font-size:.84rem;font-weight:700;color:var(--ink)}
.rank-count{
  font-size:.74rem;font-weight:700;padding:2px 9px;border-radius:var(--rp);
  background:var(--sage);border:1px solid var(--bd);color:var(--mist);flex-shrink:0;
}
`;
  document.head.appendChild(s);
})();

function calcRankByColor(colorKey){
  // Map lookup O(1) thay cho S.flowers.find() O(N) lặp lại mỗi lần — giảm tải đáng kể khi data lớn.
  const flowerById=new Map(S.flowers.map(f=>[f.id,f]));
  const all=[];
  S.members.forEach(m=>{
    const cnt=(S.ticks[m.id]||[]).filter(fid=>{const f=flowerById.get(fid);return f&&f.color===colorKey;}).length;
    if(cnt>0) all.push({id:m.id,name:m.displayName,role:'member',cnt});
  });
  S.leaders.forEach(l=>{
    const cnt=(S.ticks[l.id]||[]).filter(fid=>{const f=flowerById.get(fid);return f&&f.color===colorKey;}).length;
    if(cnt>0) all.push({id:l.id,name:l.displayName,role:'leader',cnt});
  });
  all.sort((a,b)=>b.cnt-a.cnt);
  return all.slice(0,10);
}

function renderPodium(top3, colorHex){
  if(!top3.length) return `<div class="empty" style="padding:24px 0"><div class="empty-icon">📊</div>Chưa có dữ liệu</div>`;
  // Width chuẩn theo tên dài nhất
  const maxLen = top3.reduce((a,u)=>Math.max(a,u.name.length),0);
  const minW = `calc(${Math.max(maxLen,6)}ch + 72px)`;
  const medals=['🥇','🥈','🥉'];
  const cls=['rnk-gold','rnk-silver','rnk-bronze'];
  const badges=top3.map((u,i)=>`
    <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
      <div class="rnk-badge ${cls[i]}" style="min-width:${minW}"
           onclick="openMemberFlowers('${esc(u.id)}','${u.role}')">
        <span class="rnk-icon">${medals[i]}</span>
        <span class="rnk-name">${esc(u.name)}</span>
        <span class="rnk-icon">${medals[i]}</span>
      </div>
      <div style="font-size:.66rem;color:var(--mist)">🌸 ${u.cnt} hoa</div>
    </div>`).join('');
  return `<div class="podium">${badges}</div>`;
}

function renderRankList(ranked, colorHex){
  if(ranked.length<=3) return '';
  const rows=ranked.slice(3).map((u,i)=>`
    <div class="rank-row" onclick="openMemberFlowers('${esc(u.id)}','${u.role}')">
      <span class="rank-num">${i+4}</span>
      <span class="rank-name-link">🌸 ${esc(u.name)}</span>
      <span class="rank-count" style="background:${colorHex}18;border-color:${colorHex}44;color:${colorHex}">${u.cnt} 🌸</span>
    </div>`).join('');
  return `<div class="rank-list">${rows}</div>`;
}

window.setRankTab=function(k){
  S._rankTab=k;
  render();
};
function pageRank(){
  if(!S._rankTab) S._rankTab='do';
  const colorKey=S._rankTab;
  const cv=col(colorKey);
  const ranked=calcRankByColor(colorKey);

  // Thứ tự: đỏ trước, cam sau
  const subTabs=['do','cam'].map(k=>{
    const c=col(k);
    const on=S._rankTab===k;
    const bg=k==='do'?'#e91e8c':'#f97316';
    return `<button class="rank-tab ${on?'on':''}"
      onclick="setRankTab('${k}')"
      style="${on?`background:${bg};border-color:${bg}`:''}">
      <span class="rank-dot" style="background:${c.h}${on?';box-shadow:0 0 0 2px rgba(255,255,255,.5)':''}"></span>
      Bảng hạng ${c.sl}
    </button>`;
  }).join('');

  return `
  <div class="card cn-frame">
    <div class="card-title" style="justify-content:center">🏆 Bảng Xếp Hạng 🏆</div>
    <div class="rank-tabs">${subTabs}</div>
    ${renderPodium(ranked.slice(0,3), cv.h)}
    ${renderRankList(ranked, cv.h)}
    ${ranked.length?`<div style="font-size:.68rem;color:var(--mist);text-align:center;margin-top:14px;opacity:.7">
      💡 Nhấn tên để xem chi tiết hoa của thành viên</div>`:''}
  </div>`;
}

// ─── SETTINGS PAGE (ADMIN ONLY) ──────────────────────────────────────────────
function pageSettings(){
  if(!isAdmin()) return `<div class="empty"><div class="empty-icon">🔒</div>Chỉ Admin mới truy cập được</div>`;
  return `
  <div class="card" style="margin-bottom:14px;border-left:3px solid #22c55e">
    <div class="card-title">🗄️ Trạng thái Kết nối</div>
    <div style="padding:12px 14px;border-radius:10px;border:1.5px solid #22c55e;background:#f0fdf4;display:flex;align-items:center;gap:10px">
      <div style="width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #bbf7d0;flex-shrink:0"></div>
      <div>
        <div style="font-size:.8rem;font-weight:700;color:#15803d">☁️ Supabase</div>
        <div style="font-size:.7rem;color:#166534">Đang kết nối — bqihlqndknrjcjvadgdo.supabase.co</div>
      </div>
      <span style="margin-left:auto;font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:99px;background:#22c55e;color:#fff">ACTIVE</span>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-g btn-sm" onclick="retry()">🔄 Tải lại dữ liệu</button>
    </div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🔑 Thay đổi mật khẩu Admin</div>
    <p style="font-size:.82rem;color:var(--mist);margin-bottom:12px">Mật khẩu admin được mã hóa SHA-256 và lưu trong code. Liên hệ developer để thay đổi.</p>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🕐 Lần đăng nhập cuối — Tất cả tài khoản</div>
    <div style="font-size:.74rem;color:var(--mist);margin-bottom:12px">Chỉ Admin mới xem được mục này. Dữ liệu cập nhật mỗi lần đăng nhập thành công.</div>
    ${renderLastLoginTable()}
  </div>`;
}
window.retry=async function(){setPulse('loading');await loadAll(true);render();};

function renderErr(){
  return `<div class="errbox cn-frame">
    <h3>⚠️ Không tải được dữ liệu</h3>
    <p>${esc(S.err)}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-g btn-sm" onclick="retry()">🔄 Thử lại</button>
      <button class="btn btn-o btn-sm" onclick="goto('settings')">⚙️ Cài đặt</button>
    </div>
  </div>`;
}

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init(){
  render();
  // Đợi Supabase Auth tự khôi phục session từ localStorage (nếu có)
  const { data: { session: authSession } } = await sb.auth.getSession();
  if(!authSession && S.session){
    // localStorage có session app nhưng Supabase Auth không còn hợp lệ → đăng xuất
    clearSession();
    S.session = null;
  }
  await loadAll(true);
  render();
}
init();

// ─── Nút cuộn lên đầu trang ───────────────────────────────────────────────
(function(){
  var btn=document.getElementById('scroll-top-btn');
  window.addEventListener('scroll',function(){
    btn.classList.toggle('visible',window.scrollY>220);
  },{passive:true});
})();
