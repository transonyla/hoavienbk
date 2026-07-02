import { CK_DATA, sb } from './01-config.js';
import { S, clearSession, loadSWRCache } from './02-state.js';
import { loadAll } from './04-api.js';
import { render } from './06-render.js';

async function init(){
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
