import { CACHE_TTL_MS, CK_CACHE_TS, SUPABASE_ANON_KEY, SUPABASE_URL, sb } from './01-config.js';
import { S, clearSession, isLeader, isMember, myClanId, saveSWRCache, saveSession } from './02-state.js';
import { setPulse, toast } from './05-ui-helpers.js';
import { render } from './06-render.js';

export async function checkHyperPaused(res, json){
  if(res.status===403 && json?.error==='CLAN_PAUSED'){
    toast('Hội của bạn đã bị tạm dừng bởi Admin.','er');
    await sb.auth.signOut();
    clearSession();
    render();
    return true; // đã xử lý
  }
  return false;
}
// ─── SUPABASE CRUD ───────────────────────────────────────────────────────────
async function sbGetAll(table){
  const { data, error } = await sb.from(table).select('*');
  if(error) throw new Error(error.message);
  return data;
}
async function sbUpsert(table, row){
  const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
  if(error) throw new Error(error.message);
}
async function sbDelete(table, id){
  const { error } = await sb.from(table).delete().eq('id', id);
  if(error) throw new Error(error.message);
}

// Wrapper tương thích với code cũ dùng fsSet/fsDel
export async function fsSet(colName, docId, data){
  // Map tên collection Firestore → tên bảng Supabase + convert field names
  const row = mapToRow(colName, docId, data);
  await sbUpsert(colName, row);
}
export async function fsDel(colName, docId){
  await sbDelete(colName, docId);
}

function mapToRow(table, id, data){
  if(table === 'flowers'){
    return { id, name: data.name??undefined, color: data.color??undefined,
      img_url: data.imgUrl??undefined, img_url2: data.imgUrl2??undefined,
      img_src: data.imgSrc??undefined,
      sort_order: data.sortOrder??undefined,
      label: data.label??undefined };
  }
  if(table === 'clans'){
    return { id, name: data.name??undefined };
  }
  if(table === 'leaders'){
    return { id, username: data.username??undefined, password: data.password??undefined,
      clan_id: data.clanId??undefined, display_name: data.displayName??undefined };
  }
  if(table === 'members'){
    return { id, username: data.username??undefined, password: data.password??undefined,
      clan_id: data.clanId??undefined, leader_id: data.leaderId??undefined,
      display_name: data.displayName??undefined, alias: data.alias??undefined,
      year: data.year??undefined };
  }
  if(table === 'ticks'){
    return { id, flower_ids: data.flowerIds??[] };
  }
}
export async function loadAll(force=false){
  if(!force){
    const lastTs=Number(localStorage.getItem(CK_CACHE_TS)||0);
    if(lastTs && Date.now()-lastTs < CACHE_TTL_MS && S.loaded && S.flowers.length>0){
      return;
    }
  }
  S.loaded=false;S.err=null;setPulse('loading');
  try {
    if(!S.session){
      // Chưa đăng nhập: chỉ tải login_lookup (id+username, không password) để phục vụ màn login
      S.flowers=[];S.clans=[];S.leaders=[];S.members=[];S.ticks={};
      S.loaded=true; setPulse('');
      return;
    }
    // Đã đăng nhập: tải đầy đủ theo đúng quyền (RLS + view tương ứng)
    const isAdm = S.session.role==='admin';
    const leadersTable = isAdm ? 'leaders' : 'leaders_safe';
    const membersTable = isAdm ? 'members' : 'members_safe';
    // Tải các bảng cốt lõi — luôn cần cho mọi role
    const [fl,cl,ld,mb,tk]=await Promise.all([
      sbGetAll('flowers'),
      sbGetAll('clans'),
      sbGetAll(leadersTable),
      sbGetAll(membersTable),
      sbGetAll('ticks'),
    ]);
    // Admin: tải thêm rentals + last_login riêng, lỗi không crash app
    if(isAdm){
      const [rentalsRaw, trialsRaw, lastLoginRaw] = await Promise.all([
        sb.from('clan_rentals').select('*').then(r=>r.data||[]).catch(()=>[]),
        sb.from('clan_trials').select('*').then(r=>r.data||[]).catch(()=>[]),
        sb.from('user_last_login').select('*').order('last_seen',{ascending:false}).limit(10).then(r=>r.data||[]).catch(()=>[]),
      ]);
      S.rentals = rentalsRaw.map(r=>({
        id:r.id, clanId:r.clan_id, startDate:r.start_date,
        months:Number(r.months)||1, note:r.note||''
      }));
      S.trials = trialsRaw.map(r=>({
        id:r.id, clanId:r.clan_id, startDate:r.start_date, note:r.note||''
      }));
      S.lastLogins = lastLoginRaw.map(r=>({
        userId:r.user_id, username:r.username,
        displayName:r.display_name||r.username, role:r.role, lastSeen:r.last_seen
      }));
    } else { S.rentals=[]; S.trials=[]; S.lastLogins=[]; }
    // Thông báo hệ thống — tải cho MỌI role đã đăng nhập (admin/leader/member), lỗi không crash app
    try {
      const { data: annData } = await sb.from('system_announcement').select('*').eq('id','current').maybeSingle();
      S.announcement = annData ? { id: annData.id, content: annData.content, updatedAt: annData.updated_at } : null;
    } catch(e){ S.announcement = null; }
    S.flowers=fl.filter(r=>r.name).map(r=>({
      id:r.id, name:r.name, color:r.color||'trang',
      imgUrl:r.img_url||'', imgUrl2:r.img_url2||'', imgSrc:r.img_src||'url1', sortOrder:Number(r.sort_order)||0,
      label:r.label||'',
    })).sort((a,b)=>a.sortOrder-b.sortOrder);
    S.clans=cl.filter(r=>r.name).map(r=>({id:r.id,name:r.name,paused:r.paused||false}));
    // Đá user ra nếu clan bị pause (áp dụng cho mọi lần loadAll kể cả đang online)
    if((isLeader()||isMember()) && myClanId()){
      const myClan=S.clans.find(c=>c.id===myClanId());
      if(myClan?.paused){
        await sb.auth.signOut();
        clearSession();
        S.loaded=false;
        toast('Hội của bạn đã bị tạm dừng bởi Admin.','er');
        clearSession(); render();
        return;
      }
    }
    S.leaders=ld.filter(r=>r.username).map(r=>({
      id:r.id, username:r.username, password:r.password||'',
      clanId:r.clan_id||'', displayName:r.display_name||r.username,
    }));
    S.members=mb.filter(r=>r.username).map(r=>({
      id:r.id, username:r.username, password:r.password||'',
      clanId:r.clan_id||'', leaderId:r.leader_id||'',
      displayName:r.display_name||r.username, alias:r.alias||'', year:r.year||'',
    }));
    S.ticks={};
    tk.forEach(r=>{ S.ticks[r.id]=Array.isArray(r.flower_ids)?r.flower_ids:[]; });
    S.loaded=true; setPulse('');
    saveSWRCache();
    localStorage.setItem(CK_CACHE_TS, Date.now().toString());
    if(S.session){
      if(S.session.role==='leader'){
        const l=S.leaders.find(x=>x.id===S.session.id);
        if(l){ S.session.displayName=l.displayName; S.session.clanId=l.clanId; saveSession(S.session); }
      } else if(S.session.role==='member'){
        const m=S.members.find(x=>x.id===S.session.id);
        if(m){S.session.displayName=m.displayName;S.session.clanId=m.clanId; saveSession(S.session);}
      }
    }
  } catch(e){
    S.err='Không tải được: '+e.message;
    S.loaded=true; setPulse('err');
  }
}
export async function findLoginId(username, role){
  const { data, error } = await sb.from('login_lookup').select('id, username, role').eq('username', username).eq('role', role);
  if(error || !data || data.length===0) return null;
  return data[0].id;
}

export async function ensureFreshSession(){
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if(!session) return false;
  const expiresAt = session.expires_at; // unix timestamp (giây)
  const nowSec = Math.floor(Date.now()/1000);
  // Còn dưới 60 giây hoặc đã hết hạn → chủ động refresh trước khi ghi
  if(!expiresAt || expiresAt - nowSec < 60){
    const { error } = await sb.auth.refreshSession();
    if(error) return false;
  }
  return true;
}

export async function writeLastLogin(userId, username, displayName, role, accessToken){
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = accessToken || session?.access_token || SUPABASE_ANON_KEY;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_last_login`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        username: username,
        display_name: displayName,
        role: role,
        last_seen: new Date().toISOString(),
      })
    });
    if(!r.ok){ const t = await r.text(); console.warn('writeLastLogin failed:', t); }
  } catch(e){
    console.warn('writeLastLogin error:', e.message);
  }
}
