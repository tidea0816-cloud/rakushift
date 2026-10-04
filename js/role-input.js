/*
 * 役割モード(中番ルール)の入力づくり と バイトの「入れる時間」の補助処理
 * iOS版の RoleModeTypes.swift・RoleModeInputBuilder.swift・AvailabilityHelpers.swift・
 * PartTimerShiftSync.swift にあたる(design_decisions.md #31〜34)。
 *
 * データの形:
 *  staff.usualAvailabilities = {"2": {startMinutes, endMinutes}, ...}   曜日(1=日〜7=土)→いつもの時間
 *  staff.dailyAvailabilities = {"2026-11-03": {startMinutes, endMinutes}} 日付→その日に入れる時間(無い日=入れない)
 *  schedule.partTimerShifts  = [{id,date,staffId,staffNameSnapshot,startMinutes,endMinutes}] 月のシフトに載せたバイトの記録
 */
"use strict";

const ROLES = ["開店","中番","閉め"];

/** 人員数を「3」「3.5」のような文字列にする */
function headcountText(v){ return Number.isInteger(v) ? String(v) : v.toFixed(1); }

/** 分数を「7時間」「3.75時間」のような文字列にする */
function hoursText(minutes){
  const h = minutes / 60;
  return (Number.isInteger(h) ? String(h) : String(Math.round(h*100)/100)) + "時間";
}

/* ============ 営業日・入れる時間 ============ */

/** その日が休業日か(臨時休業、または曜日定休かつ臨時営業でない) */
function isClosedOn(ds){
  const [y,m,d] = ds.split("-").map(Number);
  const special = (state.specialDates.find(s=>s.date===ds) || {}).kind;
  const bd = state.businessDays.find(b=>b.weekday===weekdayOf(y,m,d));
  return special==="臨時休業" || ((bd && bd.isClosed) && special!=="臨時営業");
}

/** 入れる時間を新しく作るときの初期値(シフト種別の最も早い開始〜最も遅い終了) */
function defaultAvailabilityRange(){
  const types = state.shiftTypes;
  if(!types.length) return {startMinutes:600, endMinutes:1080};
  const s = Math.min(...types.map(t=>t.startMinutes)), e = Math.max(...types.map(t=>t.endMinutes));
  return e > s ? {startMinutes:Math.floor(s/15)*15, endMinutes:Math.floor(e/15)*15} : {startMinutes:600, endMinutes:1080};
}

/** 「いつもの時間」をその月に一括反映する(その月の入力済み分は上書き。休業日には作らない) */
function applyUsualAvailability(staff, y, m){
  staff.dailyAvailabilities = staff.dailyAvailabilities || {};
  const prefix = y + "-" + pad(m) + "-";
  Object.keys(staff.dailyAvailabilities).forEach(k=>{ if(k.startsWith(prefix)) delete staff.dailyAvailabilities[k]; });
  for(let d=1; d<=daysInMonth(y,m); d++){
    const ds = dateStr(y,m,d);
    const usual = (staff.usualAvailabilities||{})[weekdayOf(y,m,d)];
    if(usual && !isClosedOn(ds)) staff.dailyAvailabilities[ds] = {startMinutes:usual.startMinutes, endMinutes:usual.endMinutes};
  }
}

/* ============ バイトの提出時間の読み替え ============ */

/** 提出時間を役割と人員数に読み替える(7時間未満=補助0.5人/開店種別の開始までに入る=開店担当/それ以外=重なり最長の種別の役割) */
function classifyPartTimer(start, end, types, roles, fullMinutes){
  if(end - start < fullMinutes) return {headcount:0.5, coversOpening:false, coversMiddle:false};
  const openingStarts = types.filter((t,i)=>roles[i]==="開店").map(t=>t.startMinutes);
  if(openingStarts.length && start <= Math.min(...openingStarts)) return {headcount:1, coversOpening:true, coversMiddle:false};
  let best = null, bestOverlap = 0;
  types.forEach((t,i)=>{
    const overlap = Math.max(0, Math.min(end,t.endMinutes) - Math.max(start,t.startMinutes));
    if(overlap > bestOverlap){ bestOverlap = overlap; best = i; }
  });
  return {headcount:1, coversOpening:false, coversMiddle: best!=null && roles[best]==="中番"};
}

/* ============ 役割モードの入力 ============ */

/** 役割モードの入力を作る(dayPlans にバイト・目標人員数も書き込む) */
function buildRoleMode(o){
  const {staffModels, engineTypes, roles, dayPlans, overrideByDate, weekdayTemplate, weekendTemplate, year, month} = o;
  const isEmployee = staffModels.map(s=>s.employmentType==="社員");
  const fullMinutes = state.store.fullHeadcountMinMinutes;
  const schedule = getSchedule(year, month, false);
  const saved = schedule && schedule.partTimerShifts && schedule.partTimerShifts.length ? schedule.partTimerShifts : null;
  const staffIndex = {}; staffModels.forEach((s,i)=>staffIndex[s.id]=i);

  const days = dayPlans.map(plan=>{
    const ds = dateStr(year, month, plan.day);
    let entries = [];
    if(!plan.isClosed){
      if(saved){
        // 生成済みの月:シフトに記録したバイト(当時の名前・時間)
        saved.filter(r=>r.date===ds).forEach((r,k)=>{
          const st = r.staffId ? staffById(r.staffId) : null;
          entries.push({staffID: (r.staffId in staffIndex) ? staffIndex[r.staffId] : -(k+1),
            name: st ? st.name : r.staffNameSnapshot, startMinutes:r.startMinutes, endMinutes:r.endMinutes,
            coverage: classifyPartTimer(r.startMinutes, r.endMinutes, engineTypes, roles, fullMinutes)});
        });
      }else{
        // 未生成の月:いま提出されている「入れる時間」
        staffModels.forEach((s,i)=>{
          if(isEmployee[i]) return;
          const rec = (s.dailyAvailabilities||{})[ds];
          if(!rec) return;
          entries.push({staffID:i, name:s.name, startMinutes:rec.startMinutes, endMinutes:rec.endMinutes,
            coverage: classifyPartTimer(rec.startMinutes, rec.endMinutes, engineTypes, roles, fullMinutes)});
        });
      }
    }
    entries.sort((a,b)=>a.startMinutes-b.startMinutes);
    const isWeekend = plan.isWeekendOrHoliday;
    const template = isWeekend ? weekendTemplate : weekdayTemplate;
    const fallback = (template && template.targetHeadcount!=null) ? template.targetHeadcount : (isWeekend ? 4 : 3);
    const ov = overrideByDate[ds];
    const target = (ov && ov.targetHeadcount!=null) ? ov.targetHeadcount : fallback;
    const day = {
      isOpen: !plan.isClosed, isWeekend,
      targetHeadcount: plan.isClosed ? 0 : target,
      partTimeHeadcount: entries.reduce((s,e)=>s+e.coverage.headcount, 0),
      hasOpeningPartTimer: entries.some(e=>e.coverage.coversOpening),
      hasMiddlePartTimer: entries.some(e=>e.coverage.coversMiddle),
    };
    plan.roleDay = day;
    plan.partTimers = entries;
    return day;
  });

  // 社員の出勤日数 = 営業日 − 公休以外の休み − 公休のうち定休日で消化できない分
  const openDays = dayPlans.filter(p=>!p.isClosed).map(p=>p.day);
  const closedCount = dayPlans.length - openDays.length;
  const nonPublicOffDays = staffModels.map(s=>{
    const set = new Set();
    (s.dayOffs||[]).forEach(r=>{
      const [ry,rm,rd] = r.date.split("-").map(Number);
      if(ry===year && rm===month && (r.category||"希望休")!=="希望休") set.add(rd);
    });
    return set;
  });
  const publicOnOpenDays = Math.max(0, state.store.monthlyPublicHolidays - closedCount);
  const targetWorkDays = nonPublicOffDays.map(off=>Math.max(0, openDays.filter(d=>!off.has(d)).length - publicOnOpenDays));

  return {
    roles, isEmployee, targetWorkDays, nonPublicOffDays, days,
    weightWeekendAttendance: state.store.weightWeekendAttendance,
    weightClosingFairness: state.store.weightClosingFairness,
    weightRoleFairness: state.store.weightRoleFairness,
    primaryType(role){ const i = roles.indexOf(role); return i<0 ? null : i; },
  };
}

/* ============ 月のシフトに載せるバイトの記録 ============ */

/** 指定月のシフトが保存済みなら、在籍中の人のバイト記録を「入れる時間」から作り直す。
 *  退職(非在籍)・削除された人の記録は当時のまま残す(design_decisions.md #28) */
function syncPartTimerShifts(y, m){
  const schedule = getSchedule(y, m, false);
  if(!schedule) return;
  const isLive = r => { const s = r.staffId ? staffById(r.staffId) : null; return !!(s && s.isActive); };
  const kept = (schedule.partTimerShifts||[]).filter(r=>!isLive(r));
  const fresh = [];
  const partTimers = state.staff.filter(s=>s.isActive && s.employmentType==="バイト");
  for(let d=1; d<=daysInMonth(y,m); d++){
    const ds = dateStr(y,m,d);
    if(isClosedOn(ds)) continue;
    partTimers.forEach(s=>{
      const rec = (s.dailyAvailabilities||{})[ds];
      if(rec) fresh.push({id:uid(), date:ds, staffId:s.id, staffNameSnapshot:s.name, startMinutes:rec.startMinutes, endMinutes:rec.endMinutes});
    });
  }
  schedule.partTimerShifts = kept.concat(fresh);
}
