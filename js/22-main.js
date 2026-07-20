import { CK_DATA, sb, BG_MUSIC_URL, CK_MUSIC_ON } from './01-config.js';
import { S, clearSession, loadSWRCache } from './02-state.js';
import { loadAll } from './04-api.js';
import { render } from './06-render.js';
import { initCornerFrameCache } from './03-image-cache.js';

async function init(){
  // Ảnh góc khung card hoa — cache riêng qua IndexedDB (giống ảnh hoa).
  // Không await: chạy ngầm, không chặn render đầu tiên. Card vẫn hiện
  // góc ngay lập tức nhờ fallback url() trong :root, hàm này chỉ ghi đè
  // bằng bản base64 từ cache khi có, để lần sau mở web = 0 request mạng.
  initCornerFrameCache();

  // SWR: nếu có cache cũ → hydrate S ngay, render lập tức (0 delay)
  const hadCache = S.session && loadSWRCache();
  if(hadCache){
    S.loaded = true;
    render();
  } else {
    render(); // render loading spinner
  }
  // Đợi Supabase Auth tự khôi phục session từ localStorage (nếu có)
  const { data: { session: authSession } } = await sb.auth.getSession();
  if(!authSession && S.session){
    clearSession();
    S.session = null;
  }
  // Chụp snapshot trước khi fetch để so sánh
  const snapBefore = S.session ? localStorage.getItem(CK_DATA) : null;
  await loadAll(true);
  // Nếu data mới khác cache cũ → render lại UI
  const snapAfter = S.session ? localStorage.getItem(CK_DATA) : null;
  if(!hadCache || snapBefore !== snapAfter){
    render();
  }
}
init();

// ─── Nút cuộn lên đầu trang ───────────────────────────────────────────────
(function(){
  var btn=document.getElementById('scroll-top-btn');
  window.addEventListener('scroll',function(){
    btn.classList.toggle('visible',window.scrollY>220);
  },{passive:true});
})();

// ─── Nhạc nền: dùng từ IndexedDB cache nếu có ───────────────────────────
(function(){
  var musicBtn=document.getElementById('music-toggle-btn');
  if(!musicBtn) return;

  var audio = new Audio();
  audio.loop = true;
  audio.volume = 0.4;
  audio.preload = 'auto';

  var saved = localStorage.getItem(CK_MUSIC_ON);
  var wantsMusic = saved === null ? true : saved === '1';
  var musicUrlSet = false;
  var playAttempted = false;
  var listenersAttached = false;

  function updateBtnUI(){
    musicBtn.textContent = wantsMusic ? '🔊' : '🔇';
    musicBtn.classList.toggle('muted', !wantsMusic);
  }
  updateBtnUI();

  function tryPlay(){
    if(!wantsMusic || playAttempted) return;
    if(!audio.src) return; // chưa có URL
    playAttempted = true;
    
    audio.play().then(function(){
      removeListeners();
    }).catch(function(){
      attachListeners();
    });
  }

  function attachListeners(){
    if(listenersAttached) return;
    listenersAttached = true;
    document.addEventListener('click', handleUserInteraction, {once: true});
    document.addEventListener('touchstart', handleUserInteraction, {once: true, passive: true});
  }

  function removeListeners(){
    if(!listenersAttached) return;
    listenersAttached = false;
    document.removeEventListener('click', handleUserInteraction);
    document.removeEventListener('touchstart', handleUserInteraction);
  }

  function handleUserInteraction(){
    playAttempted = false;
    tryPlay();
  }

  // ── Lắng nghe sự kiện từ cache ảnh ──
  window.addEventListener('music-cached', function(e) {
    if (!musicUrlSet) {
      audio.src = e.detail.url;
      musicUrlSet = true;
      if (wantsMusic) tryPlay();
    }
  });

  // ── Fallback: nếu sau 3s chưa có cache, dùng URL gốc ──
  setTimeout(function() {
    if (!musicUrlSet) {
      audio.src = BG_MUSIC_URL;
      musicUrlSet = true;
      if (wantsMusic) tryPlay();
    }
  }, 3000);

  // ── Nút nhạc ──
  musicBtn.addEventListener('click', function(e){
    e.stopPropagation();
    wantsMusic = !wantsMusic;
    localStorage.setItem(CK_MUSIC_ON, wantsMusic ? '1' : '0');
    updateBtnUI();
    
    if(wantsMusic){
      playAttempted = false;
      tryPlay();
    } else {
      audio.pause();
      removeListeners();
    }
  });

  // ── KHỞI CHẠY: thử phát ngay nếu đã có URL ──
  if(wantsMusic && musicUrlSet){
    tryPlay();
  }

  // ── Dự phòng: sau 2s nếu chưa phát, gắn listeners ──
  setTimeout(function(){
    if(!playAttempted && wantsMusic && musicUrlSet){
      attachListeners();
    }
  }, 2000);

  // ── Khi quay lại tab ──
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden && wantsMusic && audio.paused && musicUrlSet){
      playAttempted = false;
      tryPlay();
    }
  });

})();
