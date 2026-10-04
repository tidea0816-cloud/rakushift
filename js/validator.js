/*
 * シフト表の検査
 * マスごとの空き・ルール違反の警告と、手編集の候補の注意
 */
"use strict";

/* ============ ScheduleValidator相当 ============ */
function validateSchedule(input, assignments){
  const issues = {}; // "day:typeId" -> {messages, missing, hasHardViolation}
  function addIssue(day, typeID, message, hard, missing){
    missing = missing||0;
    const key = day+":"+typeID;
    const issue = issues[key] || {messages:[], missing:0, hasHardViolation:false};
    issue.messages.push(message);
    issue.missing += missing;
    issue.hasHardViolation = issue.hasHardViolation || hard;
    issues[key] = issue;
  }

  const byCell = {};
  assignments.forEach(a=>{
    const key = a.day+":"+a.typeID;
    byCell[key] = byCell[key]||[];
    byCell[key].push(a);
  });

  const requiredByCell = {}, conditionsByCell = {};
  input.slots.forEach(slot=>{
    const key = slot.day+":"+slot.shiftTypeID;
    requiredByCell[key] = slot.requiredCount;
    conditionsByCell[key] = slot.conditions;
  });
  const cellsToCheck = new Set([...Object.keys(requiredByCell), ...Object.keys(byCell)]);

  cellsToCheck.forEach(key=>{
    const [dayStr, typeStr] = key.split(":");
    const day = Number(dayStr), typeID = Number(typeStr);
    const members = byCell[key] || [];
    const required = requiredByCell[key] || 0;
    if(typeID<0 || typeID>=input.shiftTypes.length) return;

    if(members.length < required){
      addIssue(day, typeID, `空き${required-members.length}人`, false, required-members.length);
    }
    const knownStaff = members.filter(m=>m.staffID!=null).map(m=>m.staffID);
    if(members.length>0 && knownStaff.length>0 && knownStaff.every(id=>input.staff[id].isNewcomer)){
      addIssue(day, typeID, "非新人がいません", true);
    }
    if(members.length>0){
      (conditionsByCell[key]||[]).forEach(cond=>{
        const qualified = knownStaff.filter(id=>(input.staff[id].ratings[cond.skill]||0) >= cond.minStars).length;
        if(qualified < cond.minCount){
          addIssue(day, typeID, `${cond.label}未達(${skillLabel(cond.skill)}★${cond.minStars}以上×${cond.minCount}人)`, true);
        }
      });
    }
  });

  const assignedDaysOfStaff = {}; // staffID -> day -> count
  assignments.forEach(a=>{
    if(a.staffID==null) return;
    assignedDaysOfStaff[a.staffID] = assignedDaysOfStaff[a.staffID]||{};
    assignedDaysOfStaff[a.staffID][a.day] = (assignedDaysOfStaff[a.staffID][a.day]||0)+1;

    const staff = input.staff[a.staffID];
    const type = input.shiftTypes[a.typeID];
    const weekday = input.weekdayOfDay[a.day-1];

    const hitsAbsolute = input.dayOffs.some(off=>off.staffID===a.staffID && off.day===a.day && off.isAbsolute && dayOffOverlaps(off, type.startMinutes, type.endMinutes));
    if(hitsAbsolute) addIssue(a.day, a.typeID, `${staff.name}:絶対休みと衝突`, true);

    if(staff.preference(a.typeID)==="不可") addIssue(a.day, a.typeID, `${staff.name}:不可シフト`, true);
    if(!staff.workableWeekdays.has(weekday)) addIssue(a.day, a.typeID, `${staff.name}:勤務不可曜日`, true);
  });

  Object.keys(assignedDaysOfStaff).forEach(staffID=>{
    const days = assignedDaysOfStaff[staffID];
    Object.keys(days).forEach(day=>{
      if(days[day]>1){
        assignments.filter(a=>String(a.staffID)===staffID && String(a.day)===day).forEach(a=>{
          addIssue(a.day, a.typeID, `${input.staff[a.staffID].name}:同日に複数シフト`, true);
        });
      }
    });
  });

  Object.keys(assignedDaysOfStaff).forEach(staffIDStr=>{
    const staffID = Number(staffIDStr);
    const workedDays = new Set(Object.keys(assignedDaysOfStaff[staffID]).map(Number));
    let day=1;
    while(day<=input.daysInMonth){
      if(workedDays.has(day)){
        const runDays=[]; let d=day;
        while(d<=input.daysInMonth && workedDays.has(d)){ runDays.push(d); d++; }
        let run = runDays.length;
        if(runDays[0]===1) run += (input.prevTail.consecutiveDays[staffID]||0);
        if(run > input.params.maxConsecutiveDays){
          runDays.forEach(rd=>{
            assignments.filter(a=>a.staffID===staffID && a.day===rd).forEach(a=>{
              addIssue(rd, a.typeID, `${input.staff[staffID].name}:${run}連勤(上限${input.params.maxConsecutiveDays})`, true);
            });
          });
        }
        day = d;
      } else day++;
    }
  });

  // 役割モード:閉めの社員・開店担当(ハード制約8・9)
  const mode = input.roleMode;
  if(mode){
    mode.days.forEach((info, idx)=>{
      if(!info.isOpen) return;
      const day = idx+1;
      const today = assignments.filter(a=>a.day===day);
      const closingType = mode.primaryType("閉め"), openingType = mode.primaryType("開店");
      if(closingType!=null && !today.some(a=>a.staffID!=null && mode.roles[a.typeID]==="閉め" && mode.isEmployee[a.staffID])){
        addIssue(day, closingType, "閉めの社員がいません", true, 1);
      }
      if(openingType!=null && !info.hasOpeningPartTimer && !today.some(a=>mode.roles[a.typeID]==="開店")){
        addIssue(day, openingType, "開店担当がいません", true, 1);
      }
    });
  }

  for(let staffID=0; staffID<input.staff.length; staffID++){
    const limit = input.staff[staffID].monthlyLimitMinutes;
    if(limit==null) continue;
    const total = assignments.filter(a=>a.staffID===staffID).reduce((s,a)=>s+input.shiftTypes[a.typeID].workMinutes,0);
    if(total > limit){
      assignments.filter(a=>a.staffID===staffID).forEach(a=>{
        addIssue(a.day, a.typeID, `${input.staff[staffID].name}:月間上限超過(${Math.round(total/60)}h/${Math.round(limit/60)}h)`, true);
      });
    }
  }

  return issues;
}

function candidateWarnings(staffID, day, typeID, input, assignments){
  const warnings = [];
  const staff = input.staff[staffID];
  const type = input.shiftTypes[typeID];
  const weekday = input.weekdayOfDay[day-1];

  if(staff.preference(typeID)==="不可") warnings.push("不可シフト");
  if(!staff.workableWeekdays.has(weekday)) warnings.push("勤務不可の曜日");
  input.dayOffs.filter(off=>off.staffID===staffID && off.day===day).forEach(off=>{
    if(dayOffOverlaps(off, type.startMinutes, type.endMinutes)) warnings.push(off.isAbsolute?"絶対休み":"できれば休み");
  });

  const workedDays = new Set(assignments.filter(a=>a.staffID===staffID).map(a=>a.day));
  let run=1, d=day-1;
  while(d>=1 && workedDays.has(d)){ run++; d--; }
  if(d===0) run += (input.prevTail.consecutiveDays[staffID]||0);
  d=day+1;
  while(d<=input.daysInMonth && workedDays.has(d)){ run++; d++; }
  if(run > input.params.maxConsecutiveDays) warnings.push(`${run}連勤になります(上限${input.params.maxConsecutiveDays})`);

  const limit = staff.monthlyLimitMinutes;
  if(limit!=null){
    const total = assignments.filter(a=>a.staffID===staffID).reduce((s,a)=>s+input.shiftTypes[a.typeID].workMinutes,0);
    if(total + type.workMinutes > limit) warnings.push("月間上限を超えます");
  }
  return warnings;
}

