import { S, isAdmin, isLeader } from './02-state.js';
import { render } from './06-render.js';
import { manageClans } from './11-manage-clans.js';
import { manageLeaders } from './12-manage-leaders.js';
import { manageFlowers } from './13-manage-flowers.js';
import { manageAllMembers, manageClanMembers } from './14-manage-members.js';
import { manageRentals } from './15-manage-rentals.js';
import { manageTrials } from './16-manage-trials.js';
import { manageAnnouncement } from './17-manage-announcement.js';

export function pageManage(){
  if(!isAdmin()&&!isLeader()) return `<div class="empty"><div class="empty-icon">🔒</div>Không có quyền</div>`;
  if(isLeader()) return manageLeaderSection();
  // Admin: tab-based layout
  if(!S._manageTab) S._manageTab='clans';
  const tabs=[
    {k:'clans',  l:'🏅 Hội',        fn:manageClans},
    {k:'leaders',l:'🏆 Hội trưởng', fn:manageLeaders},
    {k:'flowers',l:'🌸 Hoa',         fn:manageFlowers},
    {k:'members',l:'👥 Thành viên',  fn:manageAllMembers},
    {k:'rentals',l:'🏠 Hội Đã Thuê', fn:manageRentals},
    {k:'trials', l:'⏳ Hội Dùng Thử',fn:manageTrials},
    {k:'announcement', l:'📢 Thông Báo', fn:manageAnnouncement},
  ];
  const tabBar=`<div class="nav" style="margin-bottom:16px">${tabs.map(t=>`<button class="nvb ${S._manageTab===t.k?'on':''}" onclick="setManageTab('${t.k}')">${t.l}</button>`).join('')}</div>`;
  const active=tabs.find(t=>t.k===S._manageTab)||tabs[0];
  return tabBar+active.fn();
}
window.setManageTab=function(k){S._manageTab=k;render();};

function manageLeaderSection(){
  return manageClanMembers();
}

