// ============================================================
// 02-state.js — "BỘ NHỚ" DUY NHẤT CỦA TOÀN APP
// Object S chứa toàn bộ dữ liệu hiện tại (hoa, hội, thành viên,
// phiên đăng nhập, trang đang xem...). MỌI file khác import S từ
// đây để đọc/sửa — không có file nào tự tạo bản S riêng.
// Sửa S.gì đó ở file A thì file B import S cũng thấy thay đổi ngay
// (vì cùng 1 object, không phải bản sao).
// ============================================================
import { CK_SESSION, CK_CACHE_TS, CK_DATA } from './01-config.js';

// ─── SWR DATA CACHE helpers (cache 5 phút vào localStorage) ─────────────────
export const SWR_FIELDS = ['flowers','clans','leaders','members','ticks','rentals','trials','lastLogins','announcement'];

export function saveSWRCache(){
  try {
    const snap = {};
    SWR_FIELDS.forEach(k => { snap[k] = S[k]; });
    localStorage.setItem(CK_DATA, JSON.stringify(snap));
  } catch(e){ /* quota đầy — bỏ qua */ }
}

export function loadSWRCache(){
  try {
    const raw = localStorage.getItem(CK_DATA);
    if(!raw) return false;
    const snap = JSON.parse(raw);
    SWR_FIELDS.forEach(k => { if(snap[k] !== undefined) S[k] = snap[k]; });
    // ticks được lưu dạng object thường — giữ nguyên
    return true;
  } catch(e){ return false; }
}

export function swrDataChanged(snap){
  // So sánh nhanh bằng JSON — đủ dùng cho data size này
  return JSON.stringify(snap) !== localStorage.getItem(CK_DATA);
}

// ─── STATE ────────────────────────────────────────────────────────────────────
export let S = {
  flowers:[],
  clans:[],
  leaders:[],
  members:[],
  ticks:{},
  rentals:[],        // Hội Đã Thuê
  trials:[],         // Hội Dùng Thử
  lastLogins:[],     // Last login per user (admin only)
  announcement:null, // Thông báo hệ thống {id, content, updatedAt} hoặc null nếu không có
  announcementDismissed:false, // Đã đóng banner trong phiên hiện tại chưa
  loaded:false, err:null,
  page:'flowers', fcolor:'all', tcolor:'all', fq:'', tq:'',
  msel:new Set(),
  session: null,
  loginTab: 'member',
  _editFlowerId:null, _editColor:'trang',
  proxyMemberId: null,
  _lastTickSubject: null,
  _tickSecOpen: {marked:false, unmarked:true},
  _tickMarkedSnapshot: new Set(),
};

// restore session ngay khi module này được load lần đầu
try {
  const raw = localStorage.getItem(CK_SESSION);
  if(raw) S.session = JSON.parse(raw);
} catch(e){}

// ─── SESSION HELPERS ─────────────────────────────────────────────────────────
export function saveSession(s){
  S.session=s;
  localStorage.setItem(CK_SESSION,JSON.stringify(s));
}
export function clearSession(){
  S.session=null;
  localStorage.removeItem(CK_SESSION);
}
export function isAdmin(){return S.session?.role==='admin';}
export function isLeader(){return S.session?.role==='leader';}
export function isMember(){return S.session?.role==='member';}
export function mySession(){return S.session;}
export function myClanId(){return S.session?.clanId||'';}
export function myClanName(){
  const c=S.clans.find(x=>x.id===myClanId());
  return c?c.name:'';
}
