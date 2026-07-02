// ============================================================
// 01-config.js — CẤU HÌNH GỐC
// Chỉ chứa: kết nối Supabase, các URL Edge Function, hằng số,
// và bảng màu hoa. KHÔNG có logic nghiệp vụ ở đây.
// Mọi file khác import các giá trị này từ đây, không tự khai báo lại.
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://bqihlqndknrjcjvadgdo.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaWhscW5ka25yamNqdmFkZ2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTA3MTAsImV4cCI6MjA5NzEyNjcxMH0.PK8urlo-c9fkLeZ3NkPVuyIhdE5qshxh_lxlAGzzUS4';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── LOCALSTORAGE KEYS ───────────────────────────────────────────────────────
export const CK_SESSION  = 'hv5_session';
export const CK_CACHE_TS = 'hv5_cache_ts';
export const CK_DATA     = 'hv5_data_cache';
export const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── ADMIN + EDGE FUNCTION URLS ──────────────────────────────────────────────
export const ADMIN_PW_HASH = '67cec4b5d00d79ebebcffdb35234c91c785dca6d03235137aecb44d04011df51';
// GITHUB_TOKEN đã được CHUYỂN sang Supabase Edge Function (upload-image), không còn lộ ở client.
export const UPLOAD_IMAGE_URL    = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/upload-image';
export const UPLOAD_KV_URL       = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/upload-image-kv';
export const ADMIN_LOGIN_URL     = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/admin-login';
export const CREATE_USER_URL     = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/hyper-service';
export const UPDATE_PASSWORD_URL = 'https://bqihlqndknrjcjvadgdo.supabase.co/functions/v1/hyper-service';

// ─── COLORS ───────────────────────────────────────────────────────────────────
export const COLS = [
  {k:'trang',l:'Trắng/Xám', sl:'Trắng', h:'#94a3b8'},
  {k:'xanh', l:'Xanh lá',   sl:'Lá',    h:'#22c55e'},
  {k:'lam',  l:'Xanh lam',  sl:'Lam',   h:'#3b82f6'},
  {k:'tim',  l:'Tím',        sl:'Tím',  h:'#8b5cf6'},
  {k:'cam',  l:'Cam',        sl:'Cam',  h:'#f97316'},
  {k:'do',   l:'Đỏ hồng',    sl:'Đỏ',   h:'#e91e8c'},
];
export const CM = Object.fromEntries(COLS.map(c=>[c.k,c]));
export const col = k => CM[k]||{k:'trang',l:k||'?',h:'#94a3b8'};
