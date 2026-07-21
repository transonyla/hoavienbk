import { COLS, col } from './01-config.js';
import { S, isAdmin, isLeader, isMember, myClanId, myClanName } from './02-state.js';
import { getFlowerImg } from './03-image-cache.js';
import { esc, imgTag, labelBadgeHtml } from './05-ui-helpers.js';
import { render } from './06-render.js';

window.setFcolor=function(v){
  // Flowers page: dùng S.fcolor
  S.fcolor=v;
  const cfbar=document.getElementById('flower-cfbar');
  if(cfbar){cfbar.innerHTML=buildFlowerCfbarInner();}
  const flowerGrid=document.getElementById('flower-grid');
  if(flowerGrid){flowerGrid.innerHTML=buildFlowerGrid();return;}
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
export function pageFlowers(){
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

  const searchBar=`<div class="sbar"><span class="sico">🔍</span><input class="fi" id="fq" value="${esc(S.fq)}" placeholder="Tìm tên hoa..." oninput="setFq(this.value);toggleClearBtn(this)"><button type="button" class="sbar-x" style="display:${S.fq?'flex':'none'}" onclick="clearSearchInput('fq','setFq')" aria-label="Xoá tìm kiếm" tabindex="-1">✕</button></div>`;

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
      return `<div class="fc zoomable" onclick="openFlowerZoom('${f.id}')"><div class="fc-phoenix"></div>
        <div class="fc-img">${(fi=>fi?imgTag(fi,'decoding="async"'):`<span class="fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`)(getFlowerImg(f))}${labelBadgeHtml(f)}</div>
        <div class="fc-body">
          <div class="fc-name" style="color:${cv.h}">${esc(f.name)}</div>
          <span class="fc-badge" style="background:${cv.h}18;color:${cv.h}"><span class="fc-dot" style="background:${cv.h}"></span>${cv.l}</span>
          ${dClans.length?`<div class="fc-clans">${dClans.map(n=>`<span class="clan-tag">🏅 ${esc(n)}</span>`).join('')}</div>`:''}
          ${dMembers.length?`<div class="fc-clans">${dMembers.map(m=>`<span class="clan-tag copy-tag" style="background:#e0f2fe;color:#0369a1" onclick="event.stopPropagation();copyGreeting('${esc(m.displayName).replace(/'/g,"\\'")}','${esc(f.name).replace(/'/g,"\\'")}')">${esc(m.displayName)}</span>`).join('')}</div>`:''}
        </div>
      </div>`;
    }).join('')}</div>`;
  }).join('');

  return colorFilter+searchBar+`<div id="flower-grid">${html}</div>`;
}
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
      return `<div class="fc zoomable" onclick="openFlowerZoom('${f.id}')"><div class="fc-phoenix"></div>
        <div class="fc-img">${(fi=>fi?imgTag(fi,'decoding="async"'):`<span class="fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`)(getFlowerImg(f))}${labelBadgeHtml(f)}</div>
        <div class="fc-body">
          <div class="fc-name" style="color:${cv.h}">${esc(f.name)}</div>
          <span class="fc-badge" style="background:${cv.h}18;color:${cv.h}"><span class="fc-dot" style="background:${cv.h}"></span>${cv.l}</span>
          ${dC.length?`<div class="fc-clans">${dC.map(n=>`<span class="clan-tag">🏅 ${esc(n)}</span>`).join('')}</div>`:''}
          ${dM.length?`<div class="fc-clans">${dM.map(m=>`<span class="clan-tag copy-tag" style="background:#e0f2fe;color:#0369a1" onclick="event.stopPropagation();copyGreeting('${esc(m.displayName).replace(/'/g,"\\'")}','${esc(f.name).replace(/'/g,"\\'")}')">${esc(m.displayName)}</span>`).join('')}</div>`:''}
        </div>
      </div>`;
    }).join('')}</div>`;
  }).join('');
}
