/*
 * シフト自動生成エンジン(従来モード)
 * ハード制約で足切り → ソフト制約で採点、を複数案まわして最良案を選ぶ
 */
"use strict";

/* ============ 生成エンジン(ShiftGenerationEngine相当) ============ */
function seededRandom(seed){
  let state = (BigInt(seed) + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
  return function next(){
    state = (state + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & 0xFFFFFFFFFFFFFFFFn;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & 0xFFFFFFFFFFFFFFFFn;
    z = z ^ (z >> 31n);
    return Number(z >> 11n) * (1.0/9007199254740992.0);
  };
}

function generatePlan(input){
  if(input.roleMode) return generateRolePlan(input, input.roleMode); // 役割モード(中番ルール)
  let best = null;
  const attempts = Math.max(1, input.params.attempts);
  for(let attempt=0; attempt<attempts; attempt++){
    const result = buildOnePlan(input, attempt);
    if(!best || result.score > best.score) best = result;
  }
  return best;
}

function buildOnePlan(input, seed){
  const rand = seededRandom(seed);
  const jitterScale = seed===0 ? 0 : 2.0;

  const state = new PlanState(input);
  input.locked.forEach(lock=>state.place(lock.day, lock.shiftTypeID, lock.staffID, input, false));

  const orderedSlots = [...input.slots].sort((a,b)=>{
    const ak = slotOrderKey(a, rand, jitterScale);
    const bk = slotOrderKey(b, rand, jitterScale);
    return ak - bk;
  });

  const vacancies = [];
  orderedSlots.forEach(slot => fillSlot(slot, state, vacancies, input, rand, jitterScale));

  const [score, summary] = evaluate(state, vacancies, input);
  return {assignments: state.newAssignments, vacancies, score, summary, notes:[]};
}

function slotOrderKey(slot, rand, jitterScale){
  const base = slot.conditions.length===0 ? 1000.0 : 0.0;
  return base + slot.day + rand()*jitterScale*3.0;
}

function fillSlot(slot, state, vacancies, input, rand, jitterScale){
  let members = state.members(slot.day, slot.shiftTypeID);
  let remaining = slot.requiredCount - members.length;
  if(remaining<=0) return;

  const vacancyCounts = {};

  while(remaining>0){
    const {candidates, emptyReason} = hardFilter(slot.day, slot.shiftTypeID, state, input);
    if(candidates.length===0){
      vacancyCounts[emptyReason||"shortage"] = (vacancyCounts[emptyReason||"shortage"]||0)+remaining;
      break;
    }
    let pool = candidates;

    const hasVeteran = members.some(id=>!input.staff[id].isNewcomer);
    if(!hasVeteran && remaining===1){
      const veterans = pool.filter(id=>!input.staff[id].isNewcomer);
      if(veterans.length===0){ vacancyCounts["noVeteran"]=(vacancyCounts["noVeteran"]||0)+remaining; break; }
      pool = veterans;
    }

    let mostBinding = null;
    slot.conditions.forEach(cond=>{
      const satisfied = members.filter(id=>(input.staff[id].ratings[cond.skill]||0) >= cond.minStars).length;
      const stillNeeded = cond.minCount - satisfied;
      if(stillNeeded>0 && stillNeeded>=remaining){
        if(!mostBinding || stillNeeded > mostBinding.stillNeeded) mostBinding = {condition:cond, stillNeeded};
      }
    });
    if(mostBinding){
      const qualified = pool.filter(id=>(input.staff[id].ratings[mostBinding.condition.skill]||0) >= mostBinding.condition.minStars);
      if(qualified.length===0){ vacancyCounts["noRequiredSkill"]=(vacancyCounts["noRequiredSkill"]||0)+remaining; break; }
      pool = qualified;
    }

    let chosen = pool[0];
    for(let i=1;i<pool.length;i++){
      const ce = candidateCost(pool[i], slot, state, input, rand, jitterScale);
      const cr = candidateCost(chosen, slot, state, input, rand, jitterScale);
      if(ce < cr) chosen = pool[i];
    }

    state.place(slot.day, slot.shiftTypeID, chosen, input, true);
    members.push(chosen);
    remaining--;
  }

  Object.keys(vacancyCounts).forEach(reason=>{
    vacancies.push({day:slot.day, shiftTypeID:slot.shiftTypeID, missingCount:vacancyCounts[reason], reason});
  });
}

function hardFilter(day, typeID, state, input){
  const weekday = input.weekdayOfDay[day-1];
  const type = input.shiftTypes[typeID];

  let pool = [];
  for(let i=0;i<input.staff.length;i++){
    const s = input.staff[i];
    if(s.workableWeekdays.has(weekday) && !state.isAssigned(day,i) && s.preference(typeID)!=="不可") pool.push(i);
  }
  if(pool.length===0) return {candidates:[], emptyReason:"shortage"};

  pool = pool.filter(id=>!hasAbsoluteDayOff(id, day, type, input));
  if(pool.length===0) return {candidates:[], emptyReason:"absoluteDayOff"};

  pool = pool.filter(id=>state.runLengthIfAssigned(day,id,input) <= input.params.maxConsecutiveDays);
  if(pool.length===0) return {candidates:[], emptyReason:"consecutiveLimit"};

  pool = pool.filter(id=>{
    const limit = input.staff[id].monthlyLimitMinutes;
    if(limit==null) return true;
    return state.workedMinutes[id] + type.workMinutes <= limit;
  });
  if(pool.length===0) return {candidates:[], emptyReason:"monthlyLimit"};

  return {candidates:pool, emptyReason:null};
}

function hasAbsoluteDayOff(staffID, day, type, input){
  return input.dayOffs.some(off=>off.staffID===staffID && off.day===day && off.isAbsolute && dayOffOverlaps(off, type.startMinutes, type.endMinutes));
}
function hasPreferredDayOff(staffID, day, type, input){
  return input.dayOffs.some(off=>off.staffID===staffID && off.day===day && !off.isAbsolute && dayOffOverlaps(off, type.startMinutes, type.endMinutes));
}

function candidateCost(staffID, slot, state, input, rand, jitterScale){
  const staff = input.staff[staffID];
  const type = input.shiftTypes[slot.shiftTypeID];
  const p = input.params;
  let cost = 0;

  if(hasPreferredDayOff(staffID, slot.day, type, input)) cost += p.weightPreferredDayOff;

  const pref = staff.preference(slot.shiftTypeID);
  if(pref==="多め") cost -= p.weightPreference;
  else if(pref==="少なめ") cost += p.weightPreference;

  cost += state.workedDays[staffID] * p.weightFairness;

  const run = state.runLengthIfAssigned(slot.day, staffID, input);
  if(run>=3) cost += (run-2)*p.weightConsecutive;

  cost += restViolationsIfAssigned(staffID, slot.day, type, state, input) * p.weightRestInterval;

  cost += rand()*jitterScale;
  return cost;
}

function restViolationsIfAssigned(staffID, day, type, state, input){
  let violations = 0;
  const minRest = input.params.minRestMinutes;
  let prevEnd = null;
  if(day===1) prevEnd = input.prevTail.lastDayEndMinutes[staffID];
  else{
    const prevType = state.shiftOf(day-1, staffID);
    if(prevType!=null) prevEnd = input.shiftTypes[prevType].endMinutes;
  }
  if(prevEnd!=null){
    const rest = (1440-prevEnd) + type.startMinutes;
    if(rest < minRest) violations++;
  }
  if(day < input.daysInMonth){
    const nextType = state.shiftOf(day+1, staffID);
    if(nextType!=null){
      const rest = (1440-type.endMinutes) + input.shiftTypes[nextType].startMinutes;
      if(rest < minRest) violations++;
    }
  }
  return violations;
}

function evaluate(state, vacancies, input){
  const p = input.params;
  const summary = {preferredOffTotal:0, preferredOffViolated:0, moreAssigned:0, lessAssigned:0, minWorkDays:0, maxWorkDays:0, longestRun:0, restViolations:0};
  let penalty = 0;

  const missingTotal = vacancies.reduce((s,v)=>s+v.missingCount,0);
  penalty += missingTotal * 1000000;

  input.dayOffs.filter(o=>!o.isAbsolute).forEach(off=>{
    summary.preferredOffTotal++;
    const typeId = state.shiftOf(off.day, off.staffID);
    if(typeId!=null && dayOffOverlaps(off, input.shiftTypes[typeId].startMinutes, input.shiftTypes[typeId].endMinutes)){
      summary.preferredOffViolated++;
      penalty += p.weightPreferredDayOff;
    }
  });

  state.allAssignments.forEach(a=>{
    const pref = input.staff[a.staffID].preference(a.shiftTypeID);
    if(pref==="多め"){ summary.moreAssigned++; penalty -= p.weightPreference; }
    else if(pref==="少なめ"){ summary.lessAssigned++; penalty += p.weightPreference; }
  });

  const days = state.workedDays;
  if(days.length){
    summary.minWorkDays = Math.min(...days);
    summary.maxWorkDays = Math.max(...days);
    const mean = days.reduce((a,b)=>a+b,0)/days.length;
    const variance = days.reduce((s,d)=>s+Math.pow(d-mean,2),0)/days.length;
    penalty += Math.sqrt(variance) * p.weightFairness * 5.0;
  }

  for(let staffID=0; staffID<input.staff.length; staffID++){
    let run = input.prevTail.consecutiveDays[staffID] || 0;
    for(let day=1; day<=input.daysInMonth; day++){
      if(state.isAssigned(day,staffID)){
        run++;
        summary.longestRun = Math.max(summary.longestRun, run);
        if(run>=3) penalty += p.weightConsecutive;
      }else run=0;
    }
  }

  for(let staffID=0; staffID<input.staff.length; staffID++){
    for(let day=1; day<=input.daysInMonth; day++){
      const typeId = state.shiftOf(day, staffID);
      if(typeId==null) continue;
      let prevEnd=null;
      if(day===1) prevEnd = input.prevTail.lastDayEndMinutes[staffID];
      else{
        const prevType = state.shiftOf(day-1, staffID);
        if(prevType!=null) prevEnd = input.shiftTypes[prevType].endMinutes;
      }
      if(prevEnd!=null){
        const rest = (1440-prevEnd) + input.shiftTypes[typeId].startMinutes;
        if(rest < p.minRestMinutes){ summary.restViolations++; penalty += p.weightRestInterval; }
      }
    }
  }

  return [-penalty, summary];
}

function PlanState(input){
  this.byDay = Array.from({length:input.daysInMonth}, ()=>({}));
  this.workedDays = Array(input.staff.length).fill(0);
  this.workedMinutes = Array(input.staff.length).fill(0);
  this.newAssignments = [];
  this.allAssignments = [];
}
PlanState.prototype.place = function(day, typeID, staffID, input, isNew){
  if(this.byDay[day-1][staffID]!=null) return;
  this.byDay[day-1][staffID] = typeID;
  this.workedDays[staffID]++;
  this.workedMinutes[staffID] += input.shiftTypes[typeID].workMinutes;
  const a = {day, shiftTypeID:typeID, staffID};
  this.allAssignments.push(a);
  if(isNew) this.newAssignments.push(a);
};
PlanState.prototype.isAssigned = function(day, staffID){ return this.byDay[day-1][staffID]!=null; };
PlanState.prototype.shiftOf = function(day, staffID){ return this.byDay[day-1][staffID]; };
PlanState.prototype.members = function(day, typeID){
  const dayMap = this.byDay[day-1];
  return Object.keys(dayMap).filter(sid=>dayMap[sid]===typeID).map(Number);
};
PlanState.prototype.runLengthIfAssigned = function(day, staffID, input){
  let run=1, d=day-1;
  while(d>=1 && this.isAssigned(d,staffID)){ run++; d--; }
  if(d===0) run += (input.prevTail.consecutiveDays[staffID]||0);
  d = day+1;
  while(d<=input.daysInMonth && this.isAssigned(d,staffID)){ run++; d++; }
  return run;
};

const VACANCY_REASON_LABEL = {
  shortage:"必要人数割れ", noVeteran:"非新人不在", noRequiredSkill:"必須スキル不在",
  absoluteDayOff:"絶対休み衝突", consecutiveLimit:"連勤上限", monthlyLimit:"月間上限",
  noClosingEmployee:"閉め社員不在", noOpener:"開店担当不在",
};

