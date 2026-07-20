import { col } from './01-config.js';
import { S } from './02-state.js';
import { esc, openModal } from './05-ui-helpers.js';
import { render } from './06-render.js';
import { initRankFrameCache } from './03-image-cache.js';

// Ảnh khung hoa cho bục hạng 1/2/3 — 3 URL gốc này giờ chỉ còn dùng làm
// fallback trong CSS (var(--rank-frame-x, url(...))) cho lần đầu tiên khi
// IndexedDB chưa kịp cache xong. Sau khi cache xong, initRankFrameCache()
// (03-image-cache.js) sẽ ghi đè bằng bản base64, không phải request CDN nữa.
const RANK_FRAME_GOLD   = 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/rank-frame-top1.webp';
const RANK_FRAME_SILVER = 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/rank-frame-2.webp';
const RANK_FRAME_BRONZE = 'https://cdn.jsdelivr.net/gh/transonyla/hoavien-img@main/images/rank-frame-3.webp';

// Không await: chạy ngầm giống initCornerFrameCache() ở main.js, không chặn
// render đầu tiên. Card vẫn hiện khung ngay nhờ fallback url() trong CSS,
// hàm này chỉ ghi đè bằng bản base64 từ cache khi có.
initRankFrameCache();

(function(){
  if(document.getElementById('rank-css')) return;
  const s=document.createElement('style');
  s.id='rank-css';
  s.textContent=`
/* ── Sub-tab ── */
.rank-tabs{display:flex;gap:8px;margin-bottom:18px}
.rank-tab{
  flex:1;padding:9px 6px;border-radius:var(--rp);font-size:.74rem;font-weight:700;
  border:2px solid var(--bd);background:var(--white);color:var(--mist);
  cursor:pointer;transition:all .14s;text-align:center;font-family:inherit;
  display:flex;align-items:center;justify-content:center;line-height:1.25;
}
.rank-tab:hover{border-color:var(--leaf);color:var(--ink)}
.rank-tab.on{color:#fff;border-color:transparent;box-shadow:0 3px 12px rgba(0,0,0,.18)}
.rank-dot{width:13px;height:13px;border-radius:50%;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,.2)}

/* ── Podium: top2 trái | top1 giữa cao nhất | top3 phải ── */
.podium{display:flex;align-items:flex-end;justify-content:center;gap:2px;margin-bottom:22px;padding:8px 2px 0}

.rnk-card{display:flex;flex-direction:column;align-items:center;cursor:pointer;transition:transform .22s cubic-bezier(.22,1,.36,1);flex:1;position:relative}
.rnk-card:hover{transform:translateY(-6px)}
.rnk-card:active{transform:translateY(-2px)}

/* Hào quang tỏa sáng cho top 1 */
.rnk-gold::before{
  content:'✨';position:absolute;top:-14px;left:50%;transform:translateX(-50%);
  font-size:1.3rem;animation:crown-bounce 2s ease-in-out infinite;
  filter:drop-shadow(0 0 6px #ffd700);z-index:5;
}
@keyframes crown-bounce{0%,100%{transform:translateX(-50%) translateY(0) scale(1)}50%{transform:translateX(-50%) translateY(-5px) scale(1.12)}}

/* Khung hoa (ảnh) — thay hẳn cho rnk-face + rnk-plinth vẽ bằng CSS/SVG.
   Mỗi ảnh đã có sẵn khung hoa + bục + số hạng (1/2/3), chỉ cần đặt làm nền
   và canh tên/số lượng vào đúng ô trống bên trong khung. */
.rnk-frame{
  position:relative;width:100%;
  background-repeat:no-repeat;background-position:center top;background-size:contain;
  aspect-ratio:640/533;
}
.rnk-gold .rnk-frame{background-image:var(--rank-frame-gold, url('${RANK_FRAME_GOLD}'));width:118%;margin:0 -9%}
.rnk-silver .rnk-frame{background-image:var(--rank-frame-silver, url('${RANK_FRAME_SILVER}'));width:96%}
.rnk-bronze .rnk-frame{background-image:var(--rank-frame-bronze, url('${RANK_FRAME_BRONZE}'));width:88%}

/* Ô trống bên trong khung hoa — tên + 🌸 số lượng, canh giữa. Tên "nổi bật"
   qua text-shadow/letter-spacing (KHÔNG tăng cỡ chữ) để không đụng khung ảnh;
   --nlen (số ký tự tên, set inline theo từng thẻ) dùng để tự co cỡ chữ khi tên dài. */
.rnk-win{
  position:absolute;left:6%;right:6%;top:16%;height:38%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:0 1%;
}
.rnk-name{
  font-size:clamp(.58em, calc(.84em - var(--nlen,6) * 0.014em), .74em);
  font-weight:800;line-height:1.16;font-family:'Noto Serif SC',serif;
  letter-spacing:.2px;
  overflow-wrap:anywhere;word-break:break-word;
  display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
}
/* Tên trong khung top 1/2/3: màu khối ĐẶC trùng tông khung+bục (không dùng
   chữ trắng/gradient lấp lánh nữa vì lúc gradient quét qua đoạn sáng, tên bị
   "mờ trắng" khó đọc). Chỉ thêm shadow nhẹ để tách khỏi nền, không viền trắng. */
.rnk-gold .rnk-name{
  font-size:clamp(.72em, calc(1em - var(--nlen,6) * 0.014em), .94em);
  color:#9c6b00;
  text-shadow:0 1px 0 rgba(255,244,214,.6),0 2px 3px rgba(0,0,0,.18);
}
.rnk-silver .rnk-name{
  color:#3d434a;
  text-shadow:0 1px 0 rgba(255,255,255,.6),0 2px 3px rgba(0,0,0,.15);
}
.rnk-bronze .rnk-name{
  color:#8a3e12;
  text-shadow:0 1px 0 rgba(255,225,195,.6),0 2px 3px rgba(0,0,0,.18);
}
/* Icon hoa + số lượng đặt dưới chân khung, không đè lên tên nữa */
.rnk-cnt{margin-top:6px;font-size:.68rem;font-weight:800;padding:2px 9px;border-radius:999px;background:rgba(168,72,122,.14);color:#a8487a;line-height:1.4;white-space:nowrap}
.rnk-gold .rnk-cnt{font-size:.72rem;background:rgba(200,150,10,.16);color:#a8730a}
.rnk-silver .rnk-cnt{background:rgba(100,110,120,.14);color:#5c6368}
.rnk-bronze .rnk-cnt{background:rgba(150,90,30,.16);color:#8b5a2b}

/* ── Hàng top 4-10 ── */
.rank-list{display:flex;flex-direction:column;gap:6px}
.rank-row{
  display:flex;align-items:center;gap:10px;padding:9px 13px;border-radius:12px;
  background:var(--white);border:1.5px solid var(--bd);
  box-shadow:0 1px 4px rgba(168,72,122,.07);transition:background .12s;cursor:pointer;
}
.rank-row:hover{background:var(--sage)}
.rank-num{font-size:.8rem;font-weight:800;color:var(--mist);width:22px;text-align:center;flex-shrink:0}
.rank-name-link{flex:1;font-size:.84rem;font-weight:700;color:var(--ink)}
.rank-count{font-size:.74rem;font-weight:700;padding:2px 9px;border-radius:var(--rp);background:var(--sage);border:1px solid var(--bd);color:var(--mist);flex-shrink:0}
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
  all.sort((a,b)=>
    b.cnt-a.cnt ||
    (S.ticks[b.id]||[]).length-(S.ticks[a.id]||[]).length ||
    a.id.localeCompare(b.id)
  );
  return all.slice(0,10);
}

// ─── Bách Hoa Bảng — xếp hạng LIÊN HỘI theo tổng hoa Đỏ hồng, hoà thì so tiếp Cam ──
function clanFlowerCount(clanId, colorKey){
  const flowerById=new Map(S.flowers.map(f=>[f.id,f]));
  const ids=[
    ...S.members.filter(m=>m.clanId===clanId).map(m=>m.id),
    ...S.leaders.filter(l=>l.clanId===clanId).map(l=>l.id)
  ];
  return ids.reduce((sum,id)=>sum+(S.ticks[id]||[]).filter(fid=>{
    const f=flowerById.get(fid);
    return f && f.color===colorKey;
  }).length, 0);
}
function calcClanRank(){
  const totalDo=S.flowers.filter(f=>f.color==='do').length;
  const totalCam=S.flowers.filter(f=>f.color==='cam').length;
  const all=S.clans.map(c=>{
    const memberCount=S.members.filter(m=>m.clanId===c.id).length+S.leaders.filter(l=>l.clanId===c.id).length;
    const doCnt=clanFlowerCount(c.id,'do');
    const camCnt=clanFlowerCount(c.id,'cam');
    // % sở hữu trung bình trên đầu người — công bằng giữa hội đông/ít thành viên
    const doPct=(memberCount&&totalDo)?doCnt/(memberCount*totalDo)*100:0;
    const camPct=(memberCount&&totalCam)?camCnt/(memberCount*totalCam)*100:0;
    return {id:c.id, name:c.name, doCnt, camCnt, doPct, camPct, memberCount};
  });
  all.sort((a,b)=>
    b.doPct-a.doPct ||
    b.camPct-a.camPct ||
    a.id.localeCompare(b.id)
  );
  return all.filter(c=>c.doCnt>0||c.camCnt>0).slice(0,10);
}
window.openClanRankDetail=function(clanId){
  const clan=S.clans.find(c=>c.id===clanId);
  if(!clan) return;
  const totalDo=S.flowers.filter(f=>f.color==='do').length;
  const flowerById=new Map(S.flowers.map(f=>[f.id,f]));
  const people=[
    ...S.leaders.filter(l=>l.clanId===clanId).map(l=>({...l,role:'leader'})),
    ...S.members.filter(m=>m.clanId===clanId).map(m=>({...m,role:'member'}))
  ].map(p=>({...p, doCnt:(S.ticks[p.id]||[]).filter(fid=>{const f=flowerById.get(fid);return f&&f.color==='do';}).length}))
   .sort((a,b)=>b.doCnt-a.doCnt);
  const rows=people.map(p=>{
    const pct=totalDo?Math.round(p.doCnt/totalDo*100):0;
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--bd)">
      <span style="font-size:.8rem;font-weight:700;color:var(--ink);flex:1">${p.role==='leader'?'🏆 ':'🌸 '}${esc(p.displayName)}</span>
      <div class="mbar-w"><div class="mbar"><div class="mbar-f" style="width:${pct}%;background:linear-gradient(90deg,#e91e8c,#c8547a)"></div></div><span class="mlbl">${p.doCnt}/${totalDo}</span></div>
    </div>`;
  }).join('');
  const mbox=document.querySelector('#modal .mbox');
  if(mbox) mbox.style.position='relative';
  openModal(
    `<button class="mf-close" onclick="closeModal()">✕</button>🏅 ${esc(clan.name)}`,
    `<div style="font-size:.78rem;color:var(--mist);margin-bottom:12px">${people.length} thành viên · Tiến độ hoa Đỏ hồng</div>${rows||`<div class="empty" style="padding:14px 0"><div class="empty-icon">🌿</div>Chưa có dữ liệu</div>`}`,
    ''
  );
};

function renderPodium(top3, colorHex){
  if(!top3.length) return `<div class="empty" style="padding:24px 0"><div class="empty-icon">📊</div>Chưa có dữ liệu</div>`;
  const cls=['rnk-gold','rnk-silver','rnk-bronze'];
  // Thứ tự: [1]=trái, [0]=giữa cao nhất, [2]=phải
  const order=[1,0,2];
  const cards=order.map(i=>{
    const u=top3[i];
    if(!u) return '<div style="flex:1"></div>';
    const nlen=[...u.name].length;
    return `<div class="rnk-card ${cls[i]}" onclick="openMemberFlowers('${esc(u.id)}','${u.role}')">
      <div class="rnk-frame">
        <div class="rnk-win">
          <div class="rnk-name" style="--nlen:${nlen}">${esc(u.name)}</div>
        </div>
      </div>
      <div class="rnk-cnt">🌸 ${u.cnt}</div>
    </div>`;
  }).join('');
  return `<div class="podium">${cards}</div>`;
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

function renderClanPodium(top3){
  if(!top3.length) return `<div class="empty" style="padding:24px 0"><div class="empty-icon">📊</div>Chưa có dữ liệu</div>`;
  const cls=['rnk-gold','rnk-silver','rnk-bronze'];
  const order=[1,0,2];
  const cards=order.map(i=>{
    const c=top3[i];
    if(!c) return '<div style="flex:1"></div>';
    const nlen=[...c.name].length;
    return `<div class="rnk-card ${cls[i]}" onclick="openClanRankDetail('${esc(c.id)}')">
      <div class="rnk-frame">
        <div class="rnk-win">
          <div class="rnk-name" style="--nlen:${nlen}">${esc(c.name)}</div>
        </div>
      </div>
      <div class="rnk-cnt">🌸 ${c.doPct.toFixed(1)}%</div>
    </div>`;
  }).join('');
  return `<div class="podium">${cards}</div>`;
}

window.setRankTab=function(k){
  S._rankTab=k;
  render();
};
export function pageRank(){
  if(!S._rankTab) S._rankTab='do';
  const colorKey=S._rankTab;
  const isClanTab=colorKey==='clan';
  const cv=isClanTab?{h:'#c8547a'}:col(colorKey);
  const ranked=isClanTab?[]:calcRankByColor(colorKey);
  const clanRanked=isClanTab?calcClanRank():[];

  const RANK_LABELS={do:'Hồng Diễm Bảng', cam:'Đan Cam Bảng', clan:'Bách Hoa Bảng'};
  const subTabs=['do','cam','clan'].map(k=>{
    const on=S._rankTab===k;
    const bg=k==='do'?'#e91e8c':k==='cam'?'#f97316':'#a8487a';
    return `<button class="rank-tab ${on?'on':''}" style="${on?`background:${bg};border-color:${bg}`:''}" onclick="setRankTab('${k}')">
      ${RANK_LABELS[k]}
    </button>`;
  }).join('');

  const sparkSvg=(s,delay)=>`<svg class="rank-sp" width="${s}" height="${s}" viewBox="0 0 12 12" style="animation-delay:${delay}s"><path d="M6,0 L7,5 L12,6 L7,7 L6,12 L5,7 L0,6 L5,5Z" fill="#e8c96a"/></svg>`;
  return `
  <div class="card cn-frame rank-halo">
    <div style="position:relative;text-align:center;padding:10px 0 6px">
      ${sparkSvg(11,0)}${sparkSvg(9,.8)}${sparkSvg(7,1.5)}${sparkSvg(8,.4)}
      <svg style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:230px;height:50px;opacity:.13;pointer-events:none" viewBox="0 0 240 52" fill="none">
        <defs><linearGradient id="sc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d4a843"/><stop offset=".5" stop-color="#f0d878"/><stop offset="1" stop-color="#d4a843"/></linearGradient></defs>
        <path d="M22,6 Q120,1 218,6 Q234,6 234,26 Q234,46 218,46 Q120,51 22,46 Q6,46 6,26 Q6,6 22,6Z" fill="url(#sc)" stroke="#b8892a" stroke-width="1.5"/>
        <ellipse cx="14" cy="26" rx="10" ry="22" fill="#c4900a" stroke="#b8892a" stroke-width="1"/>
        <ellipse cx="226" cy="26" rx="10" ry="22" fill="#c4900a" stroke="#b8892a" stroke-width="1"/>
        <ellipse cx="14" cy="26" rx="5" ry="18" fill="#d4a843" opacity=".5"/>
        <ellipse cx="226" cy="26" rx="5" ry="18" fill="#d4a843" opacity=".5"/>
        <line x1="24" y1="13" x2="216" y2="13" stroke="#b8892a" stroke-width=".8" opacity=".5"/>
        <line x1="24" y1="39" x2="216" y2="39" stroke="#b8892a" stroke-width=".8" opacity=".5"/>
      </svg>
      <div class="card-title" style="justify-content:center;position:relative;z-index:1">🏆 ${RANK_LABELS[colorKey]} 🏆</div>
    </div>
    <div class="rank-tabs">${subTabs}</div>
    ${isClanTab
      ? renderClanPodium(clanRanked.slice(0,3))
      : renderPodium(ranked.slice(0,3), cv.h)+renderRankList(ranked, cv.h)}
    ${(isClanTab?clanRanked.length:ranked.length)?`<div style="font-size:.68rem;color:var(--mist);text-align:center;margin-top:14px;opacity:.7">
      💡 Nhấn ${isClanTab?'tên hội':'tên'} để xem chi tiết ${isClanTab?'tiến độ':'hoa'}</div>`:''}
  </div>`;
}
