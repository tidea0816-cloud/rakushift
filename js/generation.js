/*
 * 生成ボタンが押されたときの処理
 * エンジン実行 → 結果を保存(ロック済みは残す)
 */
"use strict";

/* ============ GenerationService相当 ============ */
function runGeneration(year, month){
  // 生成済みの月なら、バイトの記録をいまの「入れる時間」にそろえてから組む
  syncPartTimerShifts(year, month);
  const built = buildInput(year, month);
  const result = generatePlan(built.input);

  const schedule = getSchedule(year, month, true);
  let lockedCount = 0;
  schedule.assignments = schedule.assignments.filter(a=>{
    if(a.isLocked){ lockedCount++; return true; }
    return false;
  });
  result.assignments.forEach(ea=>{
    const staff = built.staffModels[ea.staffID];
    const type = built.typeModels[ea.shiftTypeID];
    schedule.assignments.push({
      id: uid(), date: built.dateForDay(ea.day), staffId: staff.id, shiftTypeId: type.id,
      isLocked:false, staffNameSnapshot: staff.name, shiftTypeNameSnapshot: type.name,
    });
  });
  // バイトは提出どおり確定:その時点の「入れる時間」を月のシフトに記録する
  syncPartTimerShifts(year, month);
  save();

  const vacancyLines = [...result.vacancies].sort((a,b)=> (a.day-b.day) || (a.shiftTypeID-b.shiftTypeID)).map(v=>{
    const typeName = built.typeModels[v.shiftTypeID].name;
    return `${fmtMD(year,month,v.day)} ${typeName}:${v.missingCount}人不足(${VACANCY_REASON_LABEL[v.reason]||v.reason})`;
  });
  // 役割モードの注意は「空き枠」と分けて、種類ごとに報告する
  const noteLines = kind => (result.notes||[]).filter(n=>n.kind===kind)
    .map(n=> n.day!=null ? `${fmtMD(year,month,n.day)} ${n.message}` : n.message);

  return {
    assignedCount: result.assignments.length, vacancyLines,
    workDayLines: noteLines("workDays"),        // 社員の出勤日数のずれ
    shortageLines: noteLines("headcountShortage"), // 人員数が目標に届かない日(応援の目安)
    summary: result.summary, lockedCount,
  };
}
