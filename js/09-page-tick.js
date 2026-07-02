import { COLS, col, sb } from './01-config.js';
import { S, clearSession, isLeader, isMember, myClanId, myClanName } from './02-state.js';
import { getFlowerImg } from './03-image-cache.js';
import { ensureFreshSession, fsSet } from './04-api.js';
import { esc, imgTag, labelBadgeHtml, setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

window.setTcolor=function(v){
  // Tick page: dùng S.tcolor riêng — không ảnh hưởng tab Hoa
  S.tcolor=v;
  const cfbar=document.getElementById('tick-cfbar');
  if(cfbar) cfbar.innerHTML=buildTickCfbarInner();
  const tickGrid=document.getElementById('tick-grid');
  if(tickGrid){tickGrid.innerHTML=buildTickGrid();return;}
  render();
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
        <div class="fc-img">${(fi=>fi?imgTag(fi,'decoding="async"'):`<span class="fc-letter" style="color:${cv.h}">${esc(f.name.charAt(0))}</span>`)(getFlowerImg(f))}
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
    <div class="tsec-head tsec-head-hl" onclick="toggleTickSec('marked')" style="padding:0;background:none;overflow:hidden">
      <div class="tsec-ribbon" style="background:linear-gradient(90deg,#e91e8c,#c8547a);filter:drop-shadow(0 2px 5px rgba(200,84,122,.3));flex:1;min-width:0">
        <span class="tsec-ico" style="color:#fff">▾</span>
        <span class="tsec-title">🌸 Đã đánh dấu</span>
        <span class="tsec-cnt marked">${markedLabel}</span>
        <span class="tsec-hint" style="color:rgba(255,255,255,.6)">chạm để đóng/mở</span>
      </div>
    </div>
    <div class="tsec-body" id="tsec-marked-body">${buildColorGroupsHtml(markedList)}</div>
  </div>
  <div class="tsec ${unmarkedOpen?'':'closed'}" id="tsec-unmarked">
    <div class="tsec-head tsec-head-hl" onclick="toggleTickSec('unmarked')" style="padding:0;background:none;overflow:hidden">
      <div class="tsec-ribbon" style="background:linear-gradient(90deg,#5cc2ad,#3aa898);filter:drop-shadow(0 2px 5px rgba(92,194,173,.3));flex:1;min-width:0">
        <span class="tsec-ico" style="color:#fff">▾</span>
        <span class="tsec-title">⬜ Chưa đánh dấu</span>
        <span class="tsec-cnt unmarked">${unmarkedLabel}</span>
        <span class="tsec-hint" style="color:rgba(255,255,255,.6)">chạm để đóng/mở</span>
      </div>
    </div>
    <div class="tsec-body" id="tsec-unmarked-body">${unmarkedList.length?buildColorGroupsHtml(unmarkedList):`<div class="empty" style="padding:18px 0"><div class="empty-icon">🌿</div>Không tìm thấy</div>`}</div>
  </div>`;
}
window.toggleTickSec=function(key){
  S._tickSecOpen[key]=!(S._tickSecOpen[key]!==false);
  const sec=document.getElementById('tsec-'+key);
  if(!sec) return;
  const body=document.getElementById('tsec-'+key+'-body');
  const closing=S._tickSecOpen[key]===false;
  sec.classList.toggle('closed', closing);
  if(!body) return;
  if(closing){
    // Đóng: fade out opacity trước, sau đó display:none để browser skip layout
    body.style.opacity='0';
    body.style.pointerEvents='none';
    setTimeout(()=>{
      // Chỉ hide nếu vẫn còn đóng (user chưa mở lại)
      if(S._tickSecOpen[key]===false) body.style.display='none';
    }, 130); // khớp với --dur-fast
  } else {
    // Mở: display lại trước, rồi fade in
    body.style.display='';
    body.style.pointerEvents='';
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{ body.style.opacity='1'; });
    });
  }
};

// ─── TICK PAGE (MEMBER / LEADER) ──────────────────────────────────────────────
export function pageTick(){
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
  const searchBar=`<div class="sbar"><span class="sico">🔍</span><input class="fi" id="tq" value="${esc(S.tq)}" placeholder="Tìm tên hoa..." oninput="setTq(this.value);toggleClearBtn(this)"><button type="button" class="sbar-x" style="display:${S.tq?'flex':'none'}" onclick="clearSearchInput('tq','setTq')" aria-label="Xoá tìm kiếm" tabindex="-1">✕</button></div>`;

  return proxyHtml+info+`<div class="tick-sticky">${colorFilter}${searchBar}</div>`+`<div id="tick-grid">${buildTickGrid()}</div>`;
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
    const fresh = await ensureFreshSession();
    if(!fresh){toast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.','er');btn.disabled=false;btn.innerHTML='💾 Lưu';setPulse('');return;}
    // Hội trưởng tick thay: lưu vào memberId được chọn, không phải id leader
    const memberId = (isLeader() && S.proxyMemberId) ? S.proxyMemberId : S.session.id;
    const saved=[...S.msel];
    // ── Quota optimisation: skip Firestore write nếu data không đổi ──────────
    const existing=S.ticks[memberId]||[];
    const same=existing.length===saved.length && saved.every(id=>existing.includes(id));
    if(same){toast('Không có thay đổi nào 🌿','wn');btn.disabled=false;btn.innerHTML='💾 Lưu';setPulse('');return;}
    // Check clan paused trước khi lưu
    if(myClanId()){
      const {data:pauseCheck}=await sb.from('clans').select('paused').eq('id',myClanId()).single();
      if(pauseCheck?.paused){
        toast('Hội của bạn đã bị tạm dừng bởi Admin.','er');
        await sb.auth.signOut(); clearSession(); render(); return;
      }
    }
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
  } catch(e){
    // Check thẳng từ Supabase xem clan có bị paused không → force logout
    if(myClanId()){
      const {data:clanData}=await sb.from('clans').select('paused').eq('id',myClanId()).single();
      if(clanData?.paused){
        toast('Hội của bạn đã bị tạm dừng bởi Admin.','er');
        await sb.auth.signOut();
        clearSession();
        render();
        return;
      }
    }
    toast('Lỗi lưu: '+e.message,'er');
  }
  setPulse('');
  btn.disabled=false;btn.innerHTML='💾 Lưu';
};

