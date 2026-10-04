/*
 * 共通の小道具
 * 時刻・日付の変換、並べ替え、休み希望の重なり判定など
 */
"use strict";

/* ============ 共通ユーティリティ ============ */
function minutesToTime(m){
  m = ((m%1440)+1440)%1440;
  const h = Math.floor(m/60), mm = m%60;
  return h + ":" + String(mm).padStart(2,"0");
}
// 時刻入力欄(type="time")用。入力欄は「09:30」のような2桁の形しか受け付けないので0を足す
function timeInputValue(m){
  return minutesToTime(m).padStart(5,"0");
}
function timeToMinutes(t){
  const [h,m] = t.split(":").map(Number);
  return h*60+m;
}
function pad(n){ return String(n).padStart(2,"0"); }
function dateStr(y,m,d){ return y+"-"+pad(m)+"-"+pad(d); }
function weekdayOf(y,m,d){ return new Date(y,m-1,d).getDay()+1; } // 1=日〜7=土
function daysInMonth(y,m){ return new Date(y,m,0).getDate(); }
function fmtMD(y,m,d){ return m+"/"+d+"("+DAY_LABELS[weekdayOf(y,m,d)-1]+")"; }

function cmpName(a,b){ return a<b?-1:a>b?1:0; }
function shiftTypesSorted(){ return [...state.shiftTypes].sort((a,b)=>a.sortOrder-b.sortOrder); }
function activeStaffSorted(){ return state.staff.filter(s=>s.isActive).sort((a,b)=>cmpName(a.name,b.name)); }
function inactiveStaffSorted(){ return state.staff.filter(s=>!s.isActive).sort((a,b)=>cmpName(a.name,b.name)); }
function typeById(id){ return state.shiftTypes.find(t=>t.id===id); }
function staffById(id){ return state.staff.find(s=>s.id===id); }
function workMinutes(t){ return Math.max(0, t.endMinutes - t.startMinutes); }
function timeRangeText(t){ return minutesToTime(t.startMinutes)+"〜"+minutesToTime(t.endMinutes); }
function scheduleKey(y,m){ return y+"-"+m; }
function getSchedule(y,m,create){
  const key = scheduleKey(y,m);
  if(!state.schedules[key]){
    if(!create) return null;
    state.schedules[key] = {assignments:[]};
  }
  return state.schedules[key];
}
function preferenceOf(staff, typeId){ return (staff.preferences && staff.preferences[typeId]) || "普通"; }

/* ============ 休み希望とシフト時間帯の重なり判定 ============ */
function dayOffOverlaps(off, start, end){
  if(off.startMinutes==null || off.endMinutes==null) return true;
  return start < off.endMinutes && off.startMinutes < end;
}

