/*
 * 店舗データ → 生成エンジン用の入力
 * iOS版の EngineInputBuilder にあたる
 */
"use strict";

/* ============ EngineInputBuilder相当:店舗データ→エンジン入力 ============ */
function buildInput(year, month){
  const dim = daysInMonth(year, month);
  const typeModels = shiftTypesSorted();
  const staffModels = activeStaffSorted();
  const typeIndex = {}; typeModels.forEach((t,i)=>typeIndex[t.id]=i);
  const staffIndex = {}; staffModels.forEach((s,i)=>staffIndex[s.id]=i);

  const engineTypes = typeModels.map(t=>({name:t.name,startMinutes:t.startMinutes,endMinutes:t.endMinutes,workMinutes:workMinutes(t)}));

  // 役割モード:どれか1つの種別に役割(開店/中番/閉め)があれば中番ルールで組む(#32)
  const roles = typeModels.map(t=>t.role || null);
  const usesRoleMode = roles.some(r=>r!=null);

  const baseConditionByType = {};
  typeModels.forEach((t,i)=>{
    if(t.requiredSkill){
      baseConditionByType[i] = {label:"必須条件", skill:t.requiredSkill, minStars:t.requiredSkillMinStars||1, minCount:t.requiredSkillMinCount||1};
    }
  });
  const tasksByWeekdayAndType = {}; // weekday -> typeIndex -> [task]
  state.weekdayTasks.forEach(task=>{
    if(task.shiftTypeId==null || !(task.shiftTypeId in typeIndex)) return;
    const ti = typeIndex[task.shiftTypeId];
    (task.weekdays||[]).forEach(wd=>{
      tasksByWeekdayAndType[wd] = tasksByWeekdayAndType[wd] || {};
      tasksByWeekdayAndType[wd][ti] = tasksByWeekdayAndType[wd][ti] || [];
      tasksByWeekdayAndType[wd][ti].push(task);
    });
  });

  const engineStaff = staffModels.map(s=>{
    const prefs = {};
    Object.keys(s.preferences||{}).forEach(tid=>{
      if(tid in typeIndex) prefs[typeIndex[tid]] = s.preferences[tid];
    });
    const ratings = {};
    SKILLS.forEach(sk=>ratings[sk.id] = (s.ratings && s.ratings[sk.id]) || 3);
    return {
      name:s.name, isNewcomer:!!s.isNewcomer, ratings,
      workableWeekdays: new Set(s.workableWeekdays || [1,2,3,4,5,6,7]),
      monthlyLimitMinutes: s.monthlyHourLimit!=null ? s.monthlyHourLimit*60 : null,
      preferences: prefs,
      preference(typeIdx){ return this.preferences[typeIdx] || "普通"; }
    };
  });

  const closedWeekdays = new Set(state.businessDays.filter(d=>d.isClosed).map(d=>d.weekday));
  const specialByDate = {};
  state.specialDates.forEach(sp=>{ specialByDate[sp.date] = sp.kind; });

  const weekdayTemplate = state.staffingRequirements.find(r=>r.kind==="平日");
  const weekendTemplate = state.staffingRequirements.find(r=>r.kind==="土日");
  const overrideByDate = {};
  state.staffingRequirements.filter(r=>r.kind==="特定日").forEach(r=>{ if(r.date) overrideByDate[r.date]=r; });

  function countsFrom(req){
    const result = {};
    if(!req) return result;
    Object.keys(req.items||{}).forEach(tid=>{
      if(tid in typeIndex && req.items[tid]>0) result[typeIndex[tid]] = req.items[tid];
    });
    return result;
  }

  // 非在籍・リンク切れの手編集ロックが埋めている枠を数える
  const inactiveLocked = {}; // "day:typeIdx" -> count
  const currentSched = getSchedule(year, month, false);
  if(currentSched){
    currentSched.assignments.filter(a=>a.isLocked).forEach(a=>{
      const isActive = a.staffId!=null && (a.staffId in staffIndex);
      if(isActive) return;
      if(!(a.shiftTypeId in typeIndex)) return;
      const ti = typeIndex[a.shiftTypeId];
      const d = Number(a.date.split("-")[2]);
      if(d<1||d>dim) return;
      const key = d+":"+ti;
      inactiveLocked[key] = (inactiveLocked[key]||0)+1;
    });
  }

  const dayPlans = [];
  const slots = [];
  for(let day=1; day<=dim; day++){
    const wd = weekdayOf(year,month,day);
    const ds = dateStr(year,month,day);
    const special = specialByDate[ds];
    const holiday = holidayName(year, month, day); // 祝日は土日と同じ扱い
    const isClosed = (special==="臨時休業") || (closedWeekdays.has(wd) && special!=="臨時営業");
    let requiredCounts = {};
    if(!isClosed){
      if(overrideByDate[ds]) requiredCounts = countsFrom(overrideByDate[ds]);
      else if(wd===1 || wd===7 || holiday) requiredCounts = countsFrom(weekendTemplate);
      else requiredCounts = countsFrom(weekdayTemplate);

      const dayTasks = tasksByWeekdayAndType[wd] || {};
      Object.keys(dayTasks).forEach(tiStr=>{
        const ti = Number(tiStr);
        const extra = dayTasks[ti].reduce((s,t)=>s+(t.extraStaffCount||0),0);
        if(extra>0 || requiredCounts[ti]!=null) requiredCounts[ti] = (requiredCounts[ti]||0)+extra;
      });

      // 役割モード:人数は役割ルールで決まる。必須条件・作業の条件だけを役割つき種別の枠(人数0)として渡す
      if(usesRoleMode){
        requiredCounts = {};
        roles.forEach((r,i)=>{ if(r) requiredCounts[i] = 0; });
      }

      Object.keys(requiredCounts).forEach(tiStr=>{
        const ti = Number(tiStr);
        const count = requiredCounts[ti];
        if(count<=0 && !usesRoleMode) return;
        const conditions = [];
        if(baseConditionByType[ti]) conditions.push(baseConditionByType[ti]);
        (dayTasks[ti]||[]).forEach(task=>{
          if(task.requiredSkill){
            conditions.push({label:task.name, skill:task.requiredSkill, minStars:task.requiredMinStars, minCount:task.requiredMinCount});
          }
        });
        const already = inactiveLocked[day+":"+ti] || 0;
        const engineCount = Math.max(0, count - already);
        if(engineCount>0 || usesRoleMode) slots.push({day, shiftTypeID:ti, requiredCount:engineCount, conditions});
      });
    }
    dayPlans.push({day, weekday:wd, isClosed, requiredCounts: usesRoleMode ? {} : requiredCounts,
      holidayName: holiday, isWeekendOrHoliday: wd===1 || wd===7 || !!holiday, roleDay:null, partTimers:[]});
  }

  const dayOffs = [];
  staffModels.forEach(s=>{
    const si = staffIndex[s.id];
    (s.dayOffs||[]).forEach(req=>{
      const [ry,rm,rd] = req.date.split("-").map(Number);
      if(ry!==year || rm!==month) return;
      dayOffs.push({
        staffID:si, day:rd, isAbsolute: req.strength==="絶対",
        startMinutes: req.kind==="時間帯限定" ? req.startMinutes : null,
        endMinutes: req.kind==="時間帯限定" ? req.endMinutes : null,
      });
    });
  });

  const locked = [];
  if(currentSched){
    currentSched.assignments.filter(a=>a.isLocked).forEach(a=>{
      if(a.staffId==null || !(a.staffId in staffIndex)) return;
      if(!(a.shiftTypeId in typeIndex)) return;
      const d = Number(a.date.split("-")[2]);
      if(d<1||d>dim) return;
      locked.push({day:d, shiftTypeID:typeIndex[a.shiftTypeId], staffID:staffIndex[a.staffId]});
    });
  }

  // 前月末の連勤・インターバル
  let prevTail = {consecutiveDays:{}, lastDayEndMinutes:{}};
  const prevYear = month===1 ? year-1 : year;
  const prevMonth = month===1 ? 12 : month-1;
  const prevSched = state.schedules[scheduleKey(prevYear,prevMonth)];
  if(prevSched){
    const prevDim = daysInMonth(prevYear, prevMonth);
    const workedDaysByStaff = {}; // staffId -> Set(day)
    const lastDayEndByStaff = {};
    prevSched.assignments.forEach(a=>{
      if(a.staffId==null) return;
      const st = staffById(a.staffId);
      if(!st || !st.isActive) return;
      const d = Number(a.date.split("-")[2]);
      workedDaysByStaff[a.staffId] = workedDaysByStaff[a.staffId] || new Set();
      workedDaysByStaff[a.staffId].add(d);
      if(d===prevDim){
        const t = typeById(a.shiftTypeId);
        if(t) lastDayEndByStaff[a.staffId] = t.endMinutes;
      }
    });
    Object.keys(workedDaysByStaff).forEach(sid=>{
      if(!(sid in staffIndex)) return;
      const si = staffIndex[sid];
      let run=0, d=prevDim;
      while(d>=1 && workedDaysByStaff[sid].has(d)){ run++; d--; }
      if(run>0) prevTail.consecutiveDays[si]=run;
      if(lastDayEndByStaff[sid]!=null) prevTail.lastDayEndMinutes[si]=lastDayEndByStaff[sid];
    });
  }

  const params = {
    maxConsecutiveDays: state.store.maxConsecutiveWorkDays,
    minRestMinutes: state.store.minRestHours*60,
    weightPreferredDayOff: state.store.weightPreferredDayOff,
    weightPreference: state.store.weightShiftPreference,
    weightFairness: state.store.weightFairness,
    weightConsecutive: state.store.weightConsecutive,
    weightRestInterval: state.store.weightRestInterval,
    attempts: 40,
  };

  // 役割モードの入力(バイトの提出時間・目標人員数・社員の出勤日数)
  const roleMode = usesRoleMode ? buildRoleMode({staffModels, engineTypes, roles, dayPlans, overrideByDate,
    weekdayTemplate, weekendTemplate, year, month}) : null;

  return {
    input:{
      daysInMonth:dim,
      weekdayOfDay: dayPlans.map(p=>p.weekday),
      shiftTypes: engineTypes,
      staff: engineStaff,
      slots, dayOffs, locked, prevTail, params, roleMode,
    },
    staffModels, typeModels, dayPlans, year, month,
    dateForDay(day){ return dateStr(year,month,day); },
    conditionTexts(day, typeIdx){
      const slot = slots.find(s=>s.day===day && s.shiftTypeID===typeIdx);
      if(!slot) return [];
      return slot.conditions.map(c=>`${c.label}:${skillLabel(c.skill)}★${c.minStars}以上×${c.minCount}人`);
    },
  };
}
function skillLabel(id){ const s=SKILLS.find(x=>x.id===id); return s?s.label:id; }

