// ============================================================
// 02-state.js — "BỘ NHỚ" DUY NHẤT CỦA TOÀN APP
// Object S chứa toàn bộ dữ liệu hiện tại (hoa, hội, thành viên,
// phiên đăng nhập, trang đang xem...). MỌI file khác import S từ
// đây để đọc/sửa — không có file nào tự tạo bản S riêng.
// Sửa S.gì đó ở file A thì file B import S cũng thấy thay đổi ngay
// (vì cùng 1 object, không phải bản sao).
// ============================================================
import { CK_SESSION, CK_CACHE_TS, CK_DATA } from './01-config.js';

// ─── SHARE LINK TOKEN ────────────────────────────────────────────────────────
// Link chia sẻ "list hoa" phải mang đúng "chữ ký" được tạo ra khi bấm 🔗 trong
// trang quản lý — nếu ai đó tự gõ/sửa id thủ công trên URL mà không có đúng
// token đi kèm, link bị coi là KHÔNG HỢP LỆ ngay từ đầu (chưa cho nhập mật khẩu).
// Đây không phải mã hoá bảo mật cấp cao, chỉ là lớp chặn "gõ tay id" đơn giản.
const SHARE_SALT = 'hv5-share-v1-🌺';
export function shareToken(memberId){
  let h = 0;
  const s = memberId + SHARE_SALT;
  for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) | 0; }
  return (h>>>0).toString(36);
}

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
  shareMemberId: null, // Nếu vào app qua link chia sẻ "#share=<id>:<token>" → id thành viên cần xem
  shareLinkValid: false, // Token trong URL có khớp với id không (chống tự chế link)
  _lastTickSubject: null,
  _tickSecOpen: {marked:false, unmarked:true},
  _tickMarkedSnapshot: new Set(),
};

// restore session ngay khi module này được load lần đầu
try {
  const raw = localStorage.getItem(CK_SESSION);
  if(raw) S.session = JSON.parse(raw);
} catch(e){}

// Đọc link chia sẻ "#share=<memberId>:<token>" ngay khi app khởi động (nếu có).
// Link chỉ hợp lệ nếu token khớp đúng với id — link tự gõ/sửa tay sẽ bị đánh dấu invalid.
try {
  const m = location.hash.match(/^#share=([^:]+):(.+)$/);
  if(m){
    const mid = decodeURIComponent(m[1]);
    const tok = decodeURIComponent(m[2]);
    S.shareMemberId = mid;
    S.shareLinkValid = (tok === shareToken(mid));
  }
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
// Hội phó: 1 member đặc biệt được leader gắn cờ is_deputy — về quyền hạn giống
// hệt member, CHỈ khác là được phép tick hoa giúp thành viên khác (như leader).
export function isDeputy(){return S.session?.role==='member' && S.session?.isDeputy===true;}
// Ai được phép chọn "tick hoa giúp thành viên" ở tab Đánh dấu
export function canProxyTick(){return isLeader() || isDeputy();}
export function mySession(){return S.session;}
export function myClanId(){return S.session?.clanId||'';}
export function myClanName(){
  const c=S.clans.find(x=>x.id===myClanId());
  return c?c.name:'';
}
