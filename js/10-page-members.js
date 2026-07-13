import { S, isAdmin, isLeader, isMember, myClanId, myClanName } from './02-state.js';
import { esc } from './05-ui-helpers.js';
import { render } from './06-render.js';
import { cardMyInfo, cardRareFlowers } from './24-page-dashboard.js';

export function pageMembers(){
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
  </div>`;

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

  // ── Thành Viên/Quản Lý: bố cục kiểu Dashboard ──────────────────────────────
  if(isMember()||isLeader()){
    const scopeIds=[...myLeaders.map(l=>l.id),...myMembers.map(m=>m.id)];
    const ownedIds=new Set();
    scopeIds.forEach(id=>(S.ticks[id]||[]).forEach(fid=>ownedIds.add(fid)));
    const headerLine=`<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:4px 2px 14px">
      <span style="font-size:1.05rem;font-weight:800;color:var(--forest2)">🌷 ${esc(clanName||'')}</span>
      <span style="font-size:.78rem;color:var(--mist)">${scopeIds.length} thành viên · ${total} hoa</span>
    </div>`;
    const membersCard=`<div class="card cn-frame">
      <div class="card-title">👥 Thành Viên Của Hội</div>
      ${tableHtml}
    </div>`;
    return headerLine+cardMyInfo()+membersCard+cardRareFlowers(scopeIds, ownedIds);
  }

  // ── Admin: giữ nguyên luồng hiện tại ────────────────────────────────────────
  return clanFilterHtml+statsHtml+`<div class="card">${tableHtml}</div>`;
}
window.setMemClan=function(c){
  S._memClan=c;
  render();
};
