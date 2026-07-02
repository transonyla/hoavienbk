import { S, isAdmin, isLeader, isMember } from './02-state.js';
import { activateImageCache } from './03-image-cache.js';
import { esc, openModal, warmUpGPULayers } from './05-ui-helpers.js';
import { renderLogin } from './07-page-login.js';
import { pageFlowers } from './08-page-flowers.js';
import { pageTick } from './09-page-tick.js';
import { pageMembers } from './10-page-members.js';
import { buildMfResult } from './13-manage-flowers.js';
import { buildMmResult } from './14-manage-members.js';
import { pageManage } from './18-page-manage.js';
import { pageRank } from './20-page-rank.js';
import { pageSettings } from './21-page-settings.js';

export function render(){
  const app=document.getElementById('app');
  if(!app) return;
  renderBarUser();
  renderAnnouncement();
  if(!S.loaded){app.innerHTML='<div class="loading"><div class="sp"></div> Đang tải...</div>';return;}
  if(S.err){app.innerHTML=renderErr();return;}
  if(!S.session){app.innerHTML=renderLogin();return;}
  app.innerHTML=renderNav()+`<div class="page-fade">${renderPage()}</div>`;
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
  initNavScroll();
}

function initNavScroll(){
  const nav=document.getElementById('navMain');
  const arL=document.getElementById('navArrowLeft');
  const arR=document.getElementById('navArrowRight');
  if(!nav||!arL||!arR) return;
  const isMobile=window.matchMedia('(max-width:600px)').matches;
  if(!isMobile){ arL.style.display='none'; arR.style.display='none'; return; }
  function updateArrows(){
    const atStart=nav.scrollLeft<=4;
    const atEnd=nav.scrollLeft>=nav.scrollWidth-nav.clientWidth-4;
    arL.classList.toggle('nav-arrow-visible',!atStart);
    arR.classList.toggle('nav-arrow-visible',!atEnd);
    if(!atStart) arR.classList.remove('nav-arrow-hint');
  }
  if(nav._scrollHandler) nav.removeEventListener('scroll',nav._scrollHandler);
  nav._scrollHandler=updateArrows;
  nav.addEventListener('scroll',updateArrows,{passive:true});
  // Scroll nút active vào giữa tầm nhìn
  const activeBtn=nav.querySelector('.nvb.on');
  if(activeBtn){
    const scrollTo=activeBtn.offsetLeft-(nav.clientWidth/2)+(activeBtn.offsetWidth/2);
    nav.scrollLeft=Math.max(0,scrollTo);
  }
  arR.classList.toggle('nav-arrow-hint', nav.scrollLeft<=4);
  updateArrows();
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
    <span class="ann-text">${esc(S.announcement.content)}</span>
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
  const TAB_IMG={
    flowers:'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/1782219549043-fkq1yzq5.webp',
    tick:   'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/1782220653457-hj4dzq0w.webp',
    members:'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/1782219582078-frxffe0i.webp',
    rank:   'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/1782219609683-327m780r.webp',
    manage: 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/1782258543826-rjw4f7si.webp',
  };
  const tabs=[];
  if(isAdmin()||isLeader()||isMember()) tabs.push({k:'flowers',l:'🌸 Hoa'});
  if(isMember()||isLeader()) tabs.push({k:'tick',l:'✅ Đánh dấu'});
  if(isAdmin()||isLeader()||isMember()) tabs.push({k:'members',l:'👥 Thành viên'});
  if(isAdmin()||isLeader()||isMember()) tabs.push({k:'rank',   l:'🏆 Xếp hạng'});
  if(isAdmin()||isLeader()) tabs.push({k:'manage',l:'⚙️ Quản lý'});
  if(isAdmin()) tabs.push({k:'settings',l:'🔧 Cài đặt'});
  const navInner=tabs.map(t=>{
    const on=S.page===t.k?'on':'';
    const imgUrl=TAB_IMG[t.k];
    const inner=imgUrl
      ?`<img class="nvb-img" data-cache-src="${imgUrl}" alt="${t.l}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="nvb-txt" style="display:none">${t.l}</span>`
      :t.l;
    return `<button class="nvb ${t.k in TAB_IMG?'nvb-has-img':''} ${on}" data-tab="${t.k}" onclick="goto('${t.k}')">${inner}</button>`;
  }).join('');
  return `<div class="nav-scroll-wrap">
    <div class="nav-arrow nav-arrow-left" id="navArrowLeft">&#10094;</div>
    <div class="nav nav-main" id="navMain">${navInner}</div>
    <div class="nav-arrow nav-arrow-right" id="navArrowRight">&#10095;</div>
  </div>`;
}
window.goto=function(p){
  if(S.page===p) return;
  const pageEl=document.querySelector('.page-fade');
  const doSwitch=()=>{
    if(S.page==='tick' && p!=='tick'){
      S.tcolor='all'; S.tq='';
      S._lastTickSubject=null;
    }
    if(S.page==='flowers' && p!=='flowers'){
      S.fcolor='all'; S.fq='';
    }
    S.page=p;
    render();
    requestAnimationFrame(warmUpGPULayers);
  };
  if(pageEl){
    pageEl.style.transition='opacity .09s ease, transform .09s ease';
    pageEl.style.opacity='0';
    pageEl.style.transform='translateY(4px)';
    setTimeout(doSwitch, 90);
  } else {
    doSwitch();
  }
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
