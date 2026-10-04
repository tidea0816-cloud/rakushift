/*
 * 役割モード(中番ルール)の生成エンジン(iOS版 RoleModeEngine.swift と同じ考え方)
 * バイトは提出どおり確定済みとして扱い、ここでは「社員」だけを組む。
 *   段階A 社員の出勤日を決める
 *     ① 毎日の最低人数(閉め1人。開店担当のバイトがいない日は開店の人も入れて2人)
 *     ② 目標人員数に届くまで(土日祝を先に)
 *     ③ 各社員の出勤日数(月日数−公休−公休以外の休み)に届くまで
 *   段階B その日の社員に役割を割り振る(日付順)
 *     ①閉め → ②開店担当のバイトがいなければ開店 → ③中番役のバイトがいなければ中番 → ④残りは閉め
 *     誰をどの役割にするかは、全員の並べ方を試して一番良いものを選ぶ
 * これを乱数の幅を変えて何案も作り、採点して最良案を選ぶ。
 */
"use strict";

function generateRolePlan(input, mode){
  let best = null;
  for(let attempt=0; attempt<Math.max(1, input.params.attempts); attempt++){
    const r = buildOneRolePlan(input, mode, attempt);
    if(!best || r.score > best.score) best = r;
  }
  return best;
}

/** 1案を組み立てる途中の状態(作業メモ) */
function RolePlan(input){
  this.works = Array.from({length:input.daysInMonth}, ()=>new Set()); // 日→出勤する人
  this.lockedType = Array.from({length:input.daysInMonth}, ()=>({}));  // 日→ロック済みの人→種別番号
  this.assignments = [];
  this.closingCount = Array(input.staff.length).fill(0);
}
RolePlan.prototype.workedDays = function(id){ return this.works.reduce((s,set)=>s+(set.has(id)?1:0),0); };
RolePlan.prototype.typeOf = function(day, id){
  if(day<1) return null;
  const a = this.assignments.find(x=>x.day===day && x.staffID===id);
  return a ? a.shiftTypeID : null;
};
RolePlan.prototype.runLengthIfWorking = function(day, id, input){
  let run=1, d=day-1;
  while(d>=1 && this.works[d-1].has(id)){ run++; d--; }
  if(d===0) run += input.prevTail.consecutiveDays[id] || 0;
  d = day+1;
  while(d<=input.daysInMonth && this.works[d-1].has(id)){ run++; d++; }
  return run;
};

function buildOneRolePlan(input, mode, seed){
  const rand = seededRandom(seed);
  const jitter = seed===0 ? 0 : 1.5; // 1案目は乱数の幅なし
  const plan = new RolePlan(input);
  input.locked.forEach(l=>{ plan.lockedType[l.day-1][l.staffID] = l.shiftTypeID; plan.works[l.day-1].add(l.staffID); });

  decideWorkDays(plan, input, mode, rand, jitter);
  const vacancies = [];
  assignRoles(plan, input, mode, vacancies, rand, jitter);

  const {score, summary, notes} = evaluateRolePlan(plan, vacancies, input, mode);
  const assignments = plan.assignments.filter(a=>plan.lockedType[a.day-1][a.staffID]==null);
  return {assignments, vacancies, score, summary, notes};
}

/* ---- 段階A:社員の出勤日 ---- */

function canWorkRole(id, day, plan, input, mode){
  const info = mode.days[day-1];
  const staff = input.staff[id];
  if(!mode.isEmployee[id] || !info.isOpen || plan.works[day-1].has(id)) return false;
  if(plan.workedDays(id) >= mode.targetWorkDays[id]) return false;
  if(!staff.workableWeekdays.has(input.weekdayOfDay[day-1])) return false;
  if(mode.nonPublicOffDays[id].has(day)) return false;
  // 全休の「絶対休み」(時間帯限定は段階Bで判定)
  if(input.dayOffs.some(o=>o.staffID===id && o.day===day && o.isAbsolute && o.startMinutes==null)) return false;
  return plan.runLengthIfWorking(day, id, input) <= input.params.maxConsecutiveDays;
}

function workCost(id, day, plan, input, mode, rand, jitter){
  const p = input.params;
  let cost = 0;
  if(input.dayOffs.some(o=>o.staffID===id && o.day===day && !o.isAbsolute && o.startMinutes==null)) cost += p.weightPreferredDayOff;
  cost -= (mode.targetWorkDays[id] - plan.workedDays(id)) * 0.5; // 残り日数が多い人を優先
  const run = plan.runLengthIfWorking(day, id, input);
  if(run>=3) cost += (run-2) * p.weightConsecutive;
  return cost + rand()*jitter;
}

function decideWorkDays(plan, input, mode, rand, jitter){
  const employees = input.staff.map((_,i)=>i).filter(i=>mode.isEmployee[i]);
  const days = Array.from({length:input.daysInMonth}, (_,i)=>i+1);
  const hasOpeningType = mode.primaryType("開店")!=null;
  const minimum = d => { const info = mode.days[d-1]; if(!info.isOpen) return 0; return hasOpeningType && !info.hasOpeningPartTimer ? 2 : 1; };
  const desired = d => { const info = mode.days[d-1]; if(!info.isOpen) return 0; return Math.max(minimum(d), Math.ceil(info.targetHeadcount - info.partTimeHeadcount)); };
  const current = d => [...plan.works[d-1]].filter(i=>mode.isEmployee[i]).length;
  const pick = d => {
    const cands = employees.filter(i=>canWorkRole(i, d, plan, input, mode));
    let best = null, bestCost = Infinity;
    cands.forEach(i=>{ const c = workCost(i, d, plan, input, mode, rand, jitter); if(c < bestCost){ bestCost = c; best = i; } });
    return best;
  };
  const sortBy = (arr, key) => arr.map(d=>[d, key(d)]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);

  // ① 最低人数:入れる社員が少ない日から
  sortBy(days, d=>employees.filter(i=>canWorkRole(i,d,plan,input,mode)).length + rand()*jitter).forEach(d=>{
    let c; while(current(d) < minimum(d) && (c = pick(d))!=null) plan.works[d-1].add(c);
  });
  // ② 目標人員数まで:土日祝を先に、次に不足が大きい日から
  sortBy(days, d=>(mode.days[d-1].isWeekend ? -100 : 0) - (desired(d)-current(d))*10 + rand()*jitter*10).forEach(d=>{
    let c; while(current(d) < desired(d) && (c = pick(d))!=null) plan.works[d-1].add(c);
  });
  // ③ 出勤日数の残り:1人1日ずつ順番に
  let progressed = true;
  while(progressed){
    progressed = false;
    const order = jitter>0 ? employees.map(i=>[i,rand()]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]) : employees;
    order.forEach(id=>{
      if(plan.workedDays(id) >= mode.targetWorkDays[id]) return;
      let best = null, bestKey = Infinity;
      days.filter(d=>canWorkRole(id,d,plan,input,mode)).forEach(d=>{
        const info = mode.days[d-1];
        const key = (info.isWeekend ? -100 : 0) + (current(d) + info.partTimeHeadcount - info.targetHeadcount)*10
          + workCost(id, d, plan, input, mode, rand, jitter);
        if(key < bestKey){ bestKey = key; best = d; }
      });
      if(best!=null){ plan.works[best-1].add(id); progressed = true; }
    });
  }
}

/* ---- 段階B:役割の割り振り ---- */

function assignRoles(plan, input, mode, vacancies, rand, jitter){
  const closingType = mode.primaryType("閉め"), openingType = mode.primaryType("開店"), middleType = mode.primaryType("中番");
  for(let day=1; day<=input.daysInMonth; day++){
    const info = mode.days[day-1];
    if(!info.isOpen) continue;
    const locked = plan.lockedType[day-1];
    const members = [...plan.works[day-1]].filter(i=>mode.isEmployee[i] || locked[i]!=null);
    const lockedMembers = members.filter(i=>locked[i]!=null);
    const freeMembers = members.filter(i=>locked[i]==null).sort((a,b)=>a-b);

    // 役割の並び:①閉め ②開店 ③中番 ④残りは閉め
    let roles = [];
    if(closingType!=null) roles.push(closingType);
    if(openingType!=null && !info.hasOpeningPartTimer && members.length>=2) roles.push(openingType);
    if(roles.length < members.length && !info.hasMiddlePartTimer && middleType!=null) roles.push(middleType);
    while(closingType!=null && roles.length < members.length) roles.push(closingType);

    // ロック済みの人が受け持つ役割を外す
    lockedMembers.forEach(id=>{
      const t = locked[id];
      const idx = roles.findIndex(r=>mode.roles[r]===mode.roles[t]);
      if(idx>=0) roles.splice(idx,1);
      plan.assignments.push({day, shiftTypeID:t, staffID:id});
    });
    roles = roles.slice(0, freeMembers.length);
    while(closingType!=null && roles.length < freeMembers.length) roles.push(closingType);

    // 全員の並べ方を試して一番コストが小さい割り振りを選ぶ
    let bestCost = Infinity, bestOrder = freeMembers;
    permutations(freeMembers).forEach(order=>{
      const c = arrangementCost(order, roles, day, plan, input, mode, rand, jitter);
      if(c < bestCost){ bestCost = c; bestOrder = order; }
    });
    bestOrder.forEach((id,i)=>{
      if(i >= roles.length) return;
      plan.assignments.push({day, shiftTypeID:roles[i], staffID:id});
      if(mode.roles[roles[i]]==="閉め") plan.closingCount[id]++;
    });

    // ハード制約の確認と空きの記録
    const today = plan.assignments.filter(a=>a.day===day);
    if(closingType!=null && !today.some(a=>mode.roles[a.shiftTypeID]==="閉め" && mode.isEmployee[a.staffID])){
      vacancies.push({day, shiftTypeID:closingType, missingCount:1, reason:"noClosingEmployee"});
    }
    if(openingType!=null && !info.hasOpeningPartTimer && !today.some(a=>mode.roles[a.shiftTypeID]==="開店")){
      vacancies.push({day, shiftTypeID:openingType, missingCount:1, reason:"noOpener"});
    }
    cellViolations(today, day, input).forEach(v=>vacancies.push(v));
  }
}

function arrangementCost(order, roles, day, plan, input, mode, rand, jitter){
  const p = input.params;
  let cost = 0;
  const proposed = plan.assignments.filter(a=>a.day===day);
  order.forEach((id,i)=>{
    if(i >= roles.length) return;
    const typeID = roles[i], type = input.shiftTypes[typeID], staff = input.staff[id];
    proposed.push({day, shiftTypeID:typeID, staffID:id});
    const pref = staff.preference(typeID);
    if(pref==="不可") cost += 1000000;
    input.dayOffs.forEach(o=>{
      if(o.staffID===id && o.day===day && dayOffOverlaps(o, type.startMinutes, type.endMinutes)) cost += o.isAbsolute ? 1000000 : p.weightPreferredDayOff;
    });
    if(pref==="多め") cost -= p.weightPreference; else if(pref==="少なめ") cost += p.weightPreference;
    if(mode.roles[typeID]==="閉め") cost += plan.closingCount[id] * mode.weightClosingFairness;
    let prevEnd = null;
    if(day===1) prevEnd = input.prevTail.lastDayEndMinutes[id];
    else { const pt = plan.typeOf(day-1, id); if(pt!=null) prevEnd = input.shiftTypes[pt].endMinutes; }
    if(prevEnd!=null && (1440-prevEnd) + type.startMinutes < p.minRestMinutes) cost += p.weightRestInterval;
    cost += rand()*jitter;
  });
  return cost + cellViolations(proposed, day, input).length * 1000000;
}

/** その日のマス単位のハード違反(非新人不在・必須条件未達) */
function cellViolations(assignments, day, input){
  const result = [];
  const byType = {};
  assignments.forEach(a=>{ (byType[a.shiftTypeID] = byType[a.shiftTypeID] || []).push(a.staffID); });
  Object.keys(byType).forEach(k=>{
    const typeID = Number(k), ids = byType[k];
    if(ids.every(id=>input.staff[id].isNewcomer)) result.push({day, shiftTypeID:typeID, missingCount:1, reason:"noVeteran"});
    const slot = input.slots.find(s=>s.day===day && s.shiftTypeID===typeID);
    if(slot) slot.conditions.forEach(c=>{
      if(ids.filter(id=>(input.staff[id].ratings[c.skill]||0) >= c.minStars).length < c.minCount){
        result.push({day, shiftTypeID:typeID, missingCount:1, reason:"noRequiredSkill"});
      }
    });
  });
  return result;
}

/* ---- 案全体の採点(大きいほど良い) ---- */

function evaluateRolePlan(plan, vacancies, input, mode){
  const p = input.params;
  const summary = {preferredOffTotal:0, preferredOffViolated:0, moreAssigned:0, lessAssigned:0, minWorkDays:0, maxWorkDays:0, longestRun:0, restViolations:0};
  const notes = [];
  let penalty = vacancies.length * 1000000;
  const employees = input.staff.map((_,i)=>i).filter(i=>mode.isEmployee[i]);

  for(let day=1; day<=input.daysInMonth; day++){
    const info = mode.days[day-1];
    if(!info.isOpen) continue;
    const headcount = [...plan.works[day-1]].filter(i=>mode.isEmployee[i]).length + info.partTimeHeadcount;
    if(headcount < info.targetHeadcount){
      penalty += (info.targetHeadcount - headcount) * 1000;
      notes.push({kind:"headcountShortage", day,
        message:`人員 ${headcountText(headcount)}/${headcountText(info.targetHeadcount)}(あと${headcountText(info.targetHeadcount-headcount)})`});
    }
    if(info.isWeekend) penalty += employees.filter(i=>!plan.works[day-1].has(i)).length * mode.weightWeekendAttendance;
  }

  employees.forEach(id=>{
    const worked = plan.workedDays(id), target = mode.targetWorkDays[id];
    if(worked < target){
      penalty += (target-worked) * 1000;
      notes.push({kind:"workDays", day:null, message:`${input.staff[id].name}:出勤${worked}日(予定${target}日。公休が${target-worked}日多い)`});
    }
  });

  input.dayOffs.forEach(o=>{
    if(o.isAbsolute || !mode.isEmployee[o.staffID]) return;
    summary.preferredOffTotal++;
    const t = plan.typeOf(o.day, o.staffID);
    if(t!=null && dayOffOverlaps(o, input.shiftTypes[t].startMinutes, input.shiftTypes[t].endMinutes)){
      summary.preferredOffViolated++; penalty += p.weightPreferredDayOff;
    }
  });
  plan.assignments.forEach(a=>{
    const pref = input.staff[a.staffID].preference(a.shiftTypeID);
    if(pref==="多め"){ summary.moreAssigned++; penalty -= p.weightPreference; }
    else if(pref==="少なめ"){ summary.lessAssigned++; penalty += p.weightPreference; }
  });

  const worked = employees.map(i=>plan.workedDays(i));
  summary.minWorkDays = worked.length ? Math.min(...worked) : 0;
  summary.maxWorkDays = worked.length ? Math.max(...worked) : 0;
  const closing = employees.map(i=>plan.closingCount[i]);
  if(closing.length){
    const mean = closing.reduce((a,b)=>a+b,0)/closing.length;
    penalty += Math.sqrt(closing.reduce((s,c)=>s+(c-mean)**2,0)/closing.length) * mode.weightClosingFairness * 5;
  }
  employees.forEach(id=>{
    let run = input.prevTail.consecutiveDays[id] || 0;
    for(let day=1; day<=input.daysInMonth; day++){
      if(plan.works[day-1].has(id)){
        run++; summary.longestRun = Math.max(summary.longestRun, run);
        if(run>=3) penalty += p.weightConsecutive;
      }else run = 0;
      const t = plan.typeOf(day, id), pt = plan.typeOf(day-1, id);
      if(t!=null && pt!=null && (1440 - input.shiftTypes[pt].endMinutes) + input.shiftTypes[t].startMinutes < p.minRestMinutes){
        summary.restViolations++; penalty += p.weightRestInterval;
      }
    }
  });
  return {score:-penalty, summary, notes};
}

/** 並べ方の全通り(1日の社員は数人なので全部試せる。7人を超えたら並べ替えない) */
function permutations(items){
  if(items.length<=1 || items.length>7) return [items];
  const out = [];
  items.forEach((it,i)=>{
    const rest = items.slice(0,i).concat(items.slice(i+1));
    permutations(rest).forEach(t=>out.push([it].concat(t)));
  });
  return out;
}
