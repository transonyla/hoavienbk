import { col } from './01-config.js';
import { S } from './02-state.js';
import { esc, openModal } from './05-ui-helpers.js';
import { render } from './06-render.js';

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
.podium{display:flex;align-items:flex-end;justify-content:center;gap:8px;margin-bottom:28px;padding:8px 4px 0}

.rnk-card{display:flex;flex-direction:column;align-items:center;cursor:pointer;transition:transform .22s cubic-bezier(.22,1,.36,1);flex:1;max-width:128px;position:relative}
.rnk-card:hover{transform:translateY(-6px)}
.rnk-card:active{transform:translateY(-2px)}

/* Hào quang tỏa sáng cho top 1 */
.rnk-gold::before{
  content:'✨';position:absolute;top:-22px;left:50%;transform:translateX(-50%);
  font-size:1.3rem;animation:crown-bounce 2s ease-in-out infinite;
  filter:drop-shadow(0 0 6px #ffd700);z-index:5;
}
@keyframes crown-bounce{0%,100%{transform:translateX(-50%) translateY(0) scale(1)}50%{transform:translateX(-50%) translateY(-5px) scale(1.12)}}

/* Khung tên — nâng cấp */
.rnk-face{
  width:100%;border-radius:18px;padding:14px 10px 11px;
  display:flex;flex-direction:column;align-items:center;gap:7px;
  position:relative;overflow:hidden;border:2.5px solid transparent;
}
/* shimmer sweep */
.rnk-face::before{
  content:'';position:absolute;inset:0;border-radius:inherit;
  background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);
  background-size:200% 100%;
  animation:shimmer 3.2s ease-in-out infinite;
  pointer-events:none;z-index:2;
}
.rnk-face::after{
  content:'';position:absolute;inset:0;border-radius:inherit;
  background:linear-gradient(180deg,rgba(255,255,255,.6) 0%,rgba(255,255,255,.1) 40%,transparent 60%);
  pointer-events:none;z-index:1;
}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

.rnk-name{font-size:.8rem;font-weight:800;text-align:center;line-height:1.3;font-family:'Noto Serif SC',serif;word-break:break-word;position:relative;z-index:3}
.rnk-cnt{font-size:.7rem;font-weight:800;padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.15);position:relative;z-index:3;backdrop-filter:blur(2px)}

/* Bục vinh quang — 3D depth */
.rnk-plinth{
  width:100%;border-radius:10px 10px 5px 5px;
  display:flex;align-items:center;justify-content:center;
  border-top:3px solid rgba(255,255,255,.6);
  font-size:1.15rem;font-weight:900;
  font-family:'Noto Serif SC',serif;
  position:relative;
}
/* Cạnh bên 3D cho bục */
.rnk-plinth::after{
  content:'';position:absolute;bottom:-5px;left:4px;right:4px;height:5px;
  border-radius:0 0 5px 5px;
  filter:brightness(.6);
}
.rnk-gold .rnk-plinth::after{background:#a87200}
.rnk-silver .rnk-plinth::after{background:#666}
.rnk-bronze .rnk-plinth::after{background:#6b3510}

/* VÀNG — top 1, bục cao 72px, glow rực rỡ */
.rnk-gold .rnk-face{
  background:linear-gradient(145deg,#fffde0,#ffe97a 35%,#ffc200 65%,#ffe799);
  border-color:#f0cc00;color:#5a3a00;
  box-shadow:
    0 0 0 3px rgba(255,220,0,.25),
    0 8px 28px rgba(200,150,0,.6),
    inset 0 1px 0 rgba(255,255,255,.9);
}
.rnk-gold .rnk-plinth{
  background:linear-gradient(180deg,#ffe566 0%,#f0a500 50%,#b87800 100%);
  color:#fff8d0;height:72px;
  box-shadow:0 8px 22px rgba(180,130,0,.6),inset 0 2px 0 rgba(255,255,255,.4);
  text-shadow:0 1px 5px rgba(0,0,0,.5),0 0 16px rgba(255,230,60,1);
}

/* BẠC — top 2, bục cao 50px */
.rnk-silver .rnk-face{
  background:linear-gradient(145deg,#ffffff,#ebebeb 35%,#c8c8c8 65%,#eaeaea);
  border-color:#b0b0b0;color:#222;
  box-shadow:
    0 0 0 3px rgba(180,180,180,.2),
    0 6px 20px rgba(100,100,100,.42),
    inset 0 1px 0 rgba(255,255,255,1);
}
.rnk-silver .rnk-plinth{
  background:linear-gradient(180deg,#e8e8e8 0%,#a0a0a0 50%,#707070 100%);
  color:#fff;height:50px;
  box-shadow:0 6px 15px rgba(100,100,100,.5),inset 0 2px 0 rgba(255,255,255,.45);
  text-shadow:0 1px 4px rgba(0,0,0,.55);
}

/* ĐỒNG — top 3, bục cao 34px */
.rnk-bronze .rnk-face{
  background:linear-gradient(145deg,#fff3e6,#f0b470 35%,#c06818 65%,#f0c880);
  border-color:#c87828;color:#3a1000;
  box-shadow:
    0 0 0 3px rgba(200,120,40,.18),
    0 5px 18px rgba(140,70,15,.42),
    inset 0 1px 0 rgba(255,255,255,.75);
}
.rnk-bronze .rnk-plinth{
  background:linear-gradient(180deg,#eda060 0%,#c06020 50%,#7a3010 100%);
  color:#fff0e0;height:34px;
  box-shadow:0 5px 13px rgba(140,70,15,.5),inset 0 2px 0 rgba(255,255,255,.3);
  text-shadow:0 1px 4px rgba(0,0,0,.5);
}

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
  const nums=['①','②','③'];
  const medals=['🥇','🥈','🥉'];
  // Thứ tự: [1]=trái, [0]=giữa cao nhất, [2]=phải
  const order=[1,0,2];
  const cards=order.map(i=>{
    const u=top3[i];
    if(!u) return '<div style="flex:1;max-width:128px"></div>';
    return `<div class="rnk-card ${cls[i]}" onclick="openMemberFlowers('${esc(u.id)}','${u.role}')">
      <div class="rnk-face">
        <div class="rnk-name">${esc(u.name)}</div>
        <div class="rnk-cnt">🌸 ${u.cnt}</div>
      </div>
      <div class="rnk-plinth">${medals[i]}</div>
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
  const medals=['🥇','🥈','🥉'];
  const order=[1,0,2];
  const cards=order.map(i=>{
    const c=top3[i];
    if(!c) return '<div style="flex:1;max-width:128px"></div>';
    return `<div class="rnk-card ${cls[i]}" onclick="openClanRankDetail('${esc(c.id)}')">
      <div class="rnk-face">
        <div class="rnk-name">${esc(c.name)}</div>
        <div class="rnk-cnt">🌸 ${c.doPct.toFixed(1)}%</div>
      </div>
      <div class="rnk-plinth">${medals[i]}</div>
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
