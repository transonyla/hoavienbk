import { ADMIN_LOGIN_URL, SUPABASE_ANON_KEY, col, sb } from './01-config.js';
import { S, clearSession, saveSession } from './02-state.js';
import { findLoginId, loadAll, writeLastLogin } from './04-api.js';
import { setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

// ─── SHARE LINK LOGIN (xem list hoa của 1 thành viên qua link chia sẻ) ────────
// Không cần chọn role/username — id thành viên đã nằm sẵn trong URL (#share=<id>),
// chỉ cần đúng mật khẩu của chính tài khoản đó.
//
// Chống dò mật khẩu (brute-force) khi ai đó đổi id trong link để thử sang thành
// viên hội khác: đếm số lần sai theo từng memberId, lưu localStorage. Sai quá
// SHARE_MAX_FAIL lần → khoá nhập trong SHARE_LOCK_MS, thời gian khoá tăng dần
// mỗi lần bị khoá thêm (chống thử lại bằng cách đổi id khác rồi quay lại).
const SHARE_MAX_FAIL = 5;
const SHARE_LOCK_MS = 5*60*1000; // 5 phút mỗi lần khoá
function shareAttemptKey(id){ return 'hv_share_att_'+id; }
function getShareAttempt(id){
  try { return JSON.parse(localStorage.getItem(shareAttemptKey(id))||'null') || {fails:0, lockedUntil:0}; }
  catch(e){ return {fails:0, lockedUntil:0}; }
}
function setShareAttempt(id, data){
  try { localStorage.setItem(shareAttemptKey(id), JSON.stringify(data)); } catch(e){}
}
function shareLockRemaining(id){
  const a=getShareAttempt(id);
  const left=a.lockedUntil-Date.now();
  return left>0?left:0;
}
function fmtLockTime(ms){
  const s=Math.ceil(ms/1000);
  const m=Math.floor(s/60), ss=s%60;
  return m>0?`${m} phút ${ss}s`:`${ss}s`;
}

export function renderShareLogin(){
  const id=S.shareMemberId;
  if(!S.shareLinkValid){
    return `<div class="login-wrap">
      <div class="login-box">
        <div class="login-logo">⚠️</div>
        <div class="login-title">Link không hợp lệ</div>
        <div class="login-sub">Link chia sẻ này không đúng định dạng.<br>Vui lòng lấy lại link từ trang Quản lý.</div>
      </div>
    </div>`;
  }
  const lockLeft=id?shareLockRemaining(id):0;
  if(lockLeft>0){
    return `<div class="login-wrap">
      <div class="login-box">
        <div class="login-logo">🔒</div>
        <div class="login-title">Tạm khoá</div>
        <div class="login-sub">Bạn đã nhập sai quá nhiều lần.<br>Vui lòng thử lại sau <strong>${fmtLockTime(lockLeft)}</strong>.</div>
      </div>
    </div>`;
  }
  return `<div class="login-wrap">
    <div class="login-box">
      <div class="login-logo">🌸</div>
      <div class="login-title">Danh sách hoa</div>
      <div class="login-sub">Nhập mật khẩu để xem hoa đã đánh dấu</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="fg-col"><label class="fl">Mật khẩu</label><input class="fi" id="share-pw" type="password" placeholder="password" onkeydown="if(event.key==='Enter')doLoginShare()"></div>
        <button class="btn btn-p" id="login-share-btn" style="width:100%;justify-content:center" onclick="doLoginShare()">🌸 Xem hoa</button>
      </div>
    </div>
  </div>`;
}

window.doLoginShare=async function(){
  const id=S.shareMemberId;
  if(!id || !S.shareLinkValid){toast('Link chia sẻ không hợp lệ!','er');return;}
  if(shareLockRemaining(id)>0){ render(); return; } // đang bị khoá, không cho thử
  const pw=document.getElementById('share-pw')?.value;
  if(!pw){toast('Nhập mật khẩu!','wn');return;}
  const btn=document.querySelector('#login-share-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="sp"></div>';}
  try {
    // Nếu đang login sẵn 1 tài khoản khác → đăng xuất trước khi vào bằng link chia sẻ
    if(S.session && S.session.id!==id){ try{ await sb.auth.signOut(); }catch(e){} clearSession(); }
    const safePw = pw.length>=6 ? pw : pw.padEnd(6,'0');
    const { data: signInData, error } = await sb.auth.signInWithPassword({ email: `${id}@app.local`, password: safePw });
    if(error){
      // Ghi nhận lần sai — sau SHARE_MAX_FAIL lần thì khoá tạm
      const a=getShareAttempt(id);
      a.fails=(a.fails||0)+1;
      if(a.fails>=SHARE_MAX_FAIL){
        const strikes=(a.strikes||0)+1; // số lần đã từng bị khoá — khoá lần sau lâu hơn
        a.strikes=strikes;
        a.lockedUntil=Date.now()+SHARE_LOCK_MS*strikes;
        a.fails=0;
        setShareAttempt(id, a);
        toast('Sai quá nhiều lần, đã tạm khoá!','er');
        render();
        return;
      }
      setShareAttempt(id, a);
      toast(`Sai mật khẩu! (còn ${SHARE_MAX_FAIL-a.fails} lần thử)`,'er');
      if(btn){btn.disabled=false;btn.innerHTML='🌸 Xem hoa';}
      return;
    }
    // Đúng mật khẩu → xoá bộ đếm sai của id này
    try { localStorage.removeItem(shareAttemptKey(id)); } catch(e){}
    saveSession({role:'member',id,clanId:'',displayName:''});
    await loadAll(true);
    const m=S.members.find(x=>x.id===id);
    if(!m){ toast('Không tìm thấy thành viên này!','er'); await sb.auth.signOut(); clearSession(); render(); return; }
    S.session.clanId=m.clanId; S.session.displayName=m.displayName; S.session.isDeputy=m.isDeputy||false; saveSession(S.session);
    // Check clan paused
    if(S.session.clanId){
      const {data:clanData}=await sb.from('clans').select('paused').eq('id',S.session.clanId).single();
      if(clanData?.paused){ clearSession(); toast('Hội của bạn đang tạm dừng. Vui lòng liên hệ Admin.','er'); setPulse(''); render(); return; }
    }
    S.msel=new Set(S.ticks[id]||[]);
    S.page='tick';
    toast('Chào '+(m.displayName||'')+' 🌸');
    writeLastLogin(id, m.username, m.displayName, 'member', signInData?.session?.access_token);
    render();
    window.scrollTo({top:0});
  } catch(e){
    toast('Lỗi: '+e.message,'er');
    if(btn){btn.disabled=false;btn.innerHTML='🌸 Xem hoa';}
  }
};

window.setLoginTab=function(t){S.loginTab=t;render();};
export function renderLogin(){
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
    const { data: signInData, error } = await sb.auth.signInWithPassword({ email: `${id}@app.local`, password: safePw });
    if(error){ toast('Sai tên đăng nhập hoặc mật khẩu!','er'); if(btn){btn.disabled=false;btn.innerHTML='🏆 Đăng nhập Hội trưởng';} return; }
    // Đăng nhập thành công, tải dữ liệu để lấy thông tin đầy đủ của leader
    saveSession({role:'leader',id:id,clanId:'',displayName:u});
    await loadAll(true);
    const l=S.leaders.find(x=>x.id===id);
    if(l){ S.session.clanId=l.clanId; S.session.displayName=l.displayName; saveSession(S.session); }
    // Check clan paused
    if(S.session.clanId){
      const {data:clanData}=await sb.from('clans').select('paused').eq('id',S.session.clanId).single();
      if(clanData?.paused){ clearSession(); toast('Hội của bạn đang tạm dừng. Vui lòng liên hệ Admin.','er'); setPulse(''); render(); return; }
    }
    S.msel=new Set(S.ticks[id]||[]);
    S.page='flowers';toast('Chào '+(l?.displayName||u)+' 🏆');
    // Ghi lần đăng nhập cuối (fire-and-forget, không chờ) để không delay render
    writeLastLogin(id, u, l?.displayName||u, 'leader', signInData?.session?.access_token);
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
    const { data: signInData, error } = await sb.auth.signInWithPassword({ email: `${id}@app.local`, password: safePw });
    if(error){ toast('Lỗi Auth: '+error.message+' | email='+id+'@app.local','er'); if(btn){btn.disabled=false;btn.innerHTML='🌸 Đăng nhập Thành viên';} return; }
    saveSession({role:'member',id:id,clanId:'',displayName:u});
    await loadAll(true);
    const m=S.members.find(x=>x.id===id);
    if(m){ S.session.clanId=m.clanId; S.session.displayName=m.displayName; S.session.isDeputy=m.isDeputy||false; saveSession(S.session); }
    // Check clan paused
    if(S.session.clanId){
      const {data:clanData}=await sb.from('clans').select('paused').eq('id',S.session.clanId).single();
      if(clanData?.paused){ clearSession(); toast('Hội của bạn đang tạm dừng. Vui lòng liên hệ Admin.','er'); setPulse(''); render(); return; }
    }
    S.msel=new Set(S.ticks[id]||[]);
    S.page='flowers';toast('Chào '+(m?.displayName||u)+' 🌸');
    // Ghi lần đăng nhập cuối (fire-and-forget, không chờ) để không delay render
    writeLastLogin(id, u, m?.displayName||u, 'member', signInData?.session?.access_token);
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
