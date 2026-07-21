// ─── IMG SOURCE: mỗi hoa tự quyết dùng url1 hay url2 (lưu cột img_src) ──────
// Không có global setting — cục bộ từng hoa.
export function getFlowerImg(f){
  if(!f) return '';
  if(f.imgSrc === 'url2') return f.imgUrl2 || f.imgUrl || '';
  return f.imgUrl || f.imgUrl2 || '';
}

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

export async function imgCacheGet(url){
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

export async function imgCacheSet(url, dataUrl){
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

// Activate cache cho 1 phần tử <img data-cache-src>:
// - Cache hit  → gán dataUrl từ IndexedDB ngay, KHÔNG BAO GIỜ request CDN
// - Cache miss → fetch 1 lần duy nhất qua fetchAndCacheImage(),
//               nếu thất bại mới fallback sang src=url để browser tự load.
async function cachedImgSrc(url, imgEl){
  if(!url) return;
  const dataUrl = await imgCacheGet(url);
  if(dataUrl){
    // Cache hit — dataUrl từ IndexedDB, 0 request CDN
    document.querySelectorAll(`img[data-cache-src="${cssEscapeAttr(url)}"]`).forEach(el => {
      if(el.src !== dataUrl) el.src = dataUrl;
      el.classList.add('img-ready');
    });
  } else {
    // Cache miss — 1 request duy nhất qua fetchAndCacheImage.
    // Không set imgEl.src=url trực tiếp — tránh request CDN thứ 2.
    // Nếu fetch thất bại, fetchAndCacheImage sẽ tự fallback sang src=url.
    fetchAndCacheImage(url);
  }
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
    if(!res.ok) throw new Error('not ok');
    const blob = await res.blob();
    // Không giới hạn size — cache tất cả kể cả webp animation.
    // IndexedDB dùng disk storage của browser, không bị giới hạn nhỏ.
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await imgCacheSet(url, dataUrl);
    // Fetch thành công → set dataUrl cho tất cả img cùng url đang trong DOM
    document.querySelectorAll(`img[data-cache-src="${cssEscapeAttr(url)}"]`).forEach(el => {
      if(el.src !== dataUrl) el.src = dataUrl;
      el.classList.add('img-ready');
    });
  } catch(e){
    // Fetch thất bại (CDN lỗi, timeout, ảnh quá lớn...) →
    // fallback: set src=url gốc cho tất cả img đang chờ, để browser tự xử lý.
    // Không lưu cache → lần sau vẫn thử fetch lại bình thường.
    document.querySelectorAll(`img[data-cache-src="${cssEscapeAttr(url)}"]`).forEach(el => {
      if(!el.src || el.src === window.location.href){
        el.onload  = () => el.classList.add('img-ready');
        el.onerror = () => el.classList.add('img-ready');
        el.src = url;
      }
    });
  } finally {
    _fetchingUrls.delete(url);
  }
}

// ─── CORNER FRAME IMAGE CACHE — dùng CHUNG IndexedDB (hv5_img_cache) với ảnh hoa ──
// Khác với ảnh hoa (hàng trăm ảnh khác nhau, cache theo từng <img data-cache-src>),
// ảnh góc khung chỉ có DUY NHẤT 1 file, dùng chung cho MỌI card qua CSS
// background-image (không phải <img> riêng lẻ), nên không cần <img>/observer,
// chỉ cần: tải 1 lần → lưu base64 vào IndexedDB → gán vào CSS variable
// --corner-frame-img → toàn bộ card đọc lại từ 1 biến CSS này, 0 request thêm.
const CORNER_FRAME_URL = 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/1784516376219-emaufg97.webp';

// ─── Helper dùng CHUNG: cache 1 ảnh nền (background-image, không phải <img>) ──
// vào IndexedDB (hv5_img_cache) rồi gán base64 vào 1 CSS variable dùng chung
// cho mọi nơi cần ảnh đó qua background-image:var(--xxx). Dùng cho corner-frame
// và 3 khung hạng (gold/silver/bronze) ở trang xếp hạng — tránh lặp code.
async function cacheSingleBgImage(url, cssVarName){
  try {
    let dataUrl = await imgCacheGet(url);
    if(!dataUrl){
      // Cache miss (lần đầu mở web, hoặc IndexedDB bị xoá) — fetch 1 lần duy nhất
      const res = await fetch(url, { mode: 'cors' });
      if(!res.ok) throw new Error('not ok');
      const blob = await res.blob();
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await imgCacheSet(url, dataUrl);
    }
    // Cache hit hoặc fetch xong — gán base64 vào CSS variable, mọi nơi
    // dùng var(--cssVarName, url(...gốc...)) sẽ tự đọc lại, 0 request thêm.
    document.documentElement.style.setProperty(cssVarName, `url("${dataUrl}")`);
  } catch(e){
    // Fetch lỗi (mất mạng lần đầu...) — im lặng bỏ qua, CSS đã có sẵn
    // fallback url() gốc trong var(--xxx, url(...)) nên vẫn hiện bình thường,
    // chỉ là phải tải qua CDN thay vì từ cache.
  }
}

export async function initCornerFrameCache(){
  await cacheSingleBgImage(CORNER_FRAME_URL, '--corner-frame-img');
}

// ─── Chim phượng góc trên-phải của popup phóng to (.zoom-card) ──
// Cùng cơ chế cache như corner-frame-img: tải 1 lần, lưu IndexedDB,
// gán vào --zoom-corner-img, popup zoom đọc lại qua CSS variable.
const ZOOM_CORNER_URL = 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/topright.webp';

export async function initZoomCornerCache(){
  await cacheSingleBgImage(ZOOM_CORNER_URL, '--zoom-corner-img');
}

// ─── Ảnh khung hoa cho bục hạng 1/2/3 ở trang xếp hạng ──
// Trước đây 20-page-rank.js gán url() trực tiếp vào CSS → luôn tải qua CDN.
// Giờ cache giống corner-frame: tải 1 lần, lưu base64 vào IndexedDB, gán vào
// 3 CSS variable riêng, trang rank chỉ cần đọc lại qua var(--rank-frame-...).
const RANK_FRAME_URLS = {
  gold:   'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/rank-frame-1.webp',
  silver: 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/rank-frame-2.webp',
  bronze: 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/rank-frame-3.webp',
};

export async function initRankFrameCache(){
  await Promise.all([
    cacheSingleBgImage(RANK_FRAME_URLS.gold,   '--rank-frame-gold'),
    cacheSingleBgImage(RANK_FRAME_URLS.silver, '--rank-frame-silver'),
    cacheSingleBgImage(RANK_FRAME_URLS.bronze, '--rank-frame-bronze'),
  ]);
}

let _imgLazyObserver = null;
function getImgLazyObserver(){
  if(_imgLazyObserver) return _imgLazyObserver;
  _imgLazyObserver = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      const el = entry.target;
      _imgLazyObserver.unobserve(el);
      el.removeAttribute('data-lazy-pending');
      const url = el.getAttribute('data-cache-src');
      if(url) cachedImgSrc(url, el);
    });
  }, { rootMargin: '200px' });
  return _imgLazyObserver;
}

function registerImgLazy(el){
  if(el.getAttribute('data-lazy-pending')) return;
  el.setAttribute('data-lazy-pending','1');
  getImgLazyObserver().observe(el);
}

// Kích hoạt cache ngay lập tức (không qua lazy observer) cho container popup/overlay
// Dùng khi ảnh đã visible ngay (zoom card, member flowers popup...)
export function activateImgEager(container){
  container.querySelectorAll('img[data-cache-src]').forEach(el=>{
    const url = el.getAttribute('data-cache-src');
    if(url) cachedImgSrc(url, el);
  });
}

// Quét toàn bộ <img data-cache-src> hiện có:
// - Nav bar (#navMain): eager ngay vì đã visible, không cần chờ lazy observer
// - Phần còn lại (#app): lazy load qua IntersectionObserver
// MutationObserver bên dưới tự bắt ảnh mới sinh ra từ innerHTML động.
export function activateImageCache(){
  // Nav tab images — luôn visible ngay sau render, phải eager để cache ngay lần đầu
  const nav=document.getElementById('navMain');
  if(nav) nav.querySelectorAll('img[data-cache-src]').forEach(el=>{
    const url=el.getAttribute('data-cache-src');
    if(url) cachedImgSrc(url, el);
  });
  // Phần còn lại trong #app — lazy theo viewport
  const app=document.getElementById('app');
  if(!app) return;
  app.querySelectorAll('img[data-cache-src]').forEach(el=>{
    if(!el.getAttribute('data-lazy-pending')) registerImgLazy(el);
  });
  setupImageCacheObserver();
}

let _imgCacheObserver = null;
function setupImageCacheObserver(){
  // Observe document.body thay vì #app để không miss ảnh sau khi
  // innerHTML của #app bị replace toàn bộ (nav, overlay, announcement...).
  if(_imgCacheObserver) return;
  _imgCacheObserver = new MutationObserver((mutations)=>{
    for(const m of mutations){
      m.addedNodes.forEach(node=>{
        if(node.nodeType !== 1) return;
        if(node.matches && node.matches('img[data-cache-src]')){
          registerImgLazy(node);
        }
        if(node.querySelectorAll){
          node.querySelectorAll('img[data-cache-src]').forEach(el=>registerImgLazy(el));
        }
      });
    }
  });
  _imgCacheObserver.observe(document.body, { childList: true, subtree: true });
}
