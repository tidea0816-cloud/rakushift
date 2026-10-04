/*
 * マスの編集シート
 * タップしたマスの割り当ての追加・削除・ロック
 */
"use strict";

/* ============ セル編集シート ============ */
function showCellEditSheet(day, typeIdx){
  const built = buildInput(ui.year, ui.month);
  const typeModel = built.typeModels[typeIdx];
  if(!typeModel) return;
  const dateS = built.dateForDay(day);
  const required = built.dayPlans[day-1].requiredCounts[typeIdx] || 0;
  const schedule = getSchedule(ui.year, ui.month, false);
  const current = schedule ? schedule.assignments.filter(a=>a.date===dateS && a.shiftTypeId===typeModel.id).sort((a,b)=>{
    const na = a.staffId?staffById(a.staffId)?.name:a.staffNameSnapshot; const nb=b.staffId?staffById(b.staffId)?.name:b.staffNameSnapshot;
    return cmpName(na||"",nb||"");
  }) : [];

  // 候補計算
  const typeIndex = {}; built.typeModels.forEach((t,i)=>typeIndex[t.id]=i);
  const staffIndex = {}; built.staffModels.forEach((s,i)=>staffIndex[s.id]=i);
  const assignedToday = new Set((schedule?schedule.assignments:[]).filter(a=>a.date===dateS).map(a=>a.staffId).filter(x=>x!=null));
  const validations = [];
  (schedule?schedule.assignments:[]).forEach(a=>{
    const [ay,am,ad] = a.date.split("-").map(Number);
    if(ay!==ui.year||am!==ui.month) return;
    if(!(a.shiftTypeId in typeIndex)) return;
    validations.push({day:ad, typeID:typeIndex[a.shiftTypeId], staffID:a.staffId!=null?staffIndex[a.staffId]:null, isLocked:a.isLocked});
  });

  const selectable = [], blocked = [];
  built.staffModels.forEach((staff,si)=>{
    if(assignedToday.has(staff.id)){ blocked.push({staff, warnings:["同日の別シフトに割り当て済み"]}); return; }
    const warnings = candidateWarnings(si, day, typeIdx, built.input, validations);
    const isBlocking = warnings.some(w=>w==="不可シフト"||w==="絶対休み"||w==="勤務不可の曜日");
    if(isBlocking) blocked.push({staff, warnings}); else selectable.push({staff, warnings});
  });
  selectable.sort((a,b)=> (a.warnings.length-b.warnings.length) || cmpName(a.staff.name,b.staff.name));

  const conditionTexts = built.conditionTexts(day, typeIdx);

  let vacancyReasonText = "";
  if(current.length < required){
    if(selectable.length>0){
      const clean = selectable.filter(c=>c.warnings.length===0);
      vacancyReasonText = clean.length>0 ? "追加できるスタッフがいます。下の一覧から選んで割り当ててください。" : "全員なんらかの注意点(連勤・休み希望・上限など)があります。下の候補の理由を確認してください。";
    }else{
      const reasons = new Set();
      blocked.forEach(c=>c.warnings.forEach(w=>{
        if(w.includes("連勤")) reasons.add("連勤上限");
        else if(w.includes("絶対休み")) reasons.add("絶対休み");
        else if(w.includes("できれば休み")) reasons.add("できれば休み");
        else if(w.includes("上限")) reasons.add("月間上限");
        else if(w.includes("不可")) reasons.add("不可シフト");
        else if(w.includes("曜日")) reasons.add("勤務不可の曜日");
        else if(w.includes("同日")) reasons.add("同日に別シフト勤務");
        else reasons.add(w);
      }));
      vacancyReasonText = reasons.size ? `追加できる人がいません。理由:${[...reasons].sort().join("・")}` : "割り当てられるスタッフがいません。";
    }
  }

  const [y,m,d] = dateS.split("-").map(Number);

  const html = `
  <div class="sheet-head"><h3>マスの編集</h3><button onclick="App.closeModal()">完了</button></div>
  <div class="card">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-weight:700">${fmtMD(y,m,d)} ${esc(typeModel.name)}</div>
      <div style="margin-left:auto;color:${current.length<required?'var(--warn-text)':'var(--muted)'}">${current.length}/${required}人</div>
    </div>
    ${conditionTexts.map(t=>`<div class="footnote">${esc(t)}</div>`).join("")}
  </div>
  ${current.length<required ? `<div class="card">
    <div class="warn-text" style="font-weight:700">空き${required-current.length}人</div>
    <div class="footnote">${esc(vacancyReasonText)}</div>
  </div>` : ""}
  <div class="section-title">現在の割り当て</div>
  <div class="card">
    ${current.length===0 ? `<div class="small-note">まだ誰も入っていません</div>` :
      current.map(a=>{
        const name = a.staffId?staffById(a.staffId)?.name:a.staffNameSnapshot;
        return `<div class="list-row" style="cursor:default">
          <button class="iconbtn" style="box-shadow:none;background:none;color:${a.isLocked?'var(--accent)':'var(--muted)'}" onclick="App.toggleLock('${a.id}')">${a.isLocked?'🔒':'🔓'}</button>
          <div class="main">${esc(name)}</div>
          <button class="iconbtn" style="box-shadow:none;background:none;color:#C0384A" onclick="App.deleteAssignment('${a.id}')">🗑</button>
        </div>`;
      }).join("")}
  </div>
  <div class="footnote">🔒 = 確定(再生成しても動かしません)。手で追加した人は自動的に確定になります。</div>

  <div class="section-title">追加できるスタッフ</div>
  <div class="card">
    ${selectable.length===0 ? `<div class="small-note">追加できるスタッフがいません</div>` :
      selectable.map(c=>`<div class="list-row" onclick="App.addAssignment('${dateS}','${typeModel.id}','${c.staff.id}')">
        <div class="main">
          <div style="display:flex;align-items:center;gap:6px">${esc(c.staff.name)} ${c.staff.isNewcomer?'<span class="badge" style="background:var(--table-header);color:var(--muted)">新人</span>':''}</div>
          ${c.warnings.length? `<div class="footnote warn-text">${esc(c.warnings.join("・"))}</div>`:""}
        </div>
        <div style="color:var(--accent);font-size:20px">＋</div>
      </div>`).join("")}
  </div>
  ${blocked.length? `<div class="section-title">選べない人(${blocked.length}人)</div>
  <div class="card">
    ${blocked.map(c=>`<div class="list-row" style="cursor:default;opacity:.7">
      <div class="main">
        <div>${esc(c.staff.name)} ${c.staff.isNewcomer?'<span class="badge" style="background:var(--table-header);color:var(--muted)">新人</span>':''}</div>
        <div class="footnote danger-text">${esc(c.warnings.join("・"))}</div>
      </div>
    </div>`).join("")}
  </div>
  <div class="footnote">不可シフト・絶対休み・勤務不可曜日・同日勤務済みの人はここに入ります。</div>` : ""}
  `;
  showSheet(html);
}

App.toggleLock = function(assignmentId){
  const schedule = getSchedule(ui.year, ui.month, false);
  if(!schedule) return;
  const a = schedule.assignments.find(x=>x.id===assignmentId);
  if(a){ a.isLocked = !a.isLocked; save(); render(); refreshOpenCellSheet(); }
};
App.deleteAssignment = function(assignmentId){
  const schedule = getSchedule(ui.year, ui.month, false);
  if(!schedule) return;
  schedule.assignments = schedule.assignments.filter(x=>x.id!==assignmentId);
  save(); render(); refreshOpenCellSheet();
};
App.addAssignment = function(dateS, typeId, staffId){
  const schedule = getSchedule(ui.year, ui.month, true);
  const staff = staffById(staffId), type = typeById(typeId);
  schedule.assignments.push({id:uid(), date:dateS, staffId, shiftTypeId:typeId, isLocked:true, staffNameSnapshot:staff.name, shiftTypeNameSnapshot:type.name});
  save(); render(); refreshOpenCellSheet();
};
let openCellRef = null;
function refreshOpenCellSheet(){
  if(openCellRef){ showCellEditSheet(openCellRef.day, openCellRef.typeIdx); }
}
const _origOpenCell = App.openCell;
App.openCell = function(day, typeIdx){ if(window._justDragged) return; openCellRef = {day,typeIdx}; _origOpenCell(day, typeIdx); };
const _origCloseModal = ()=>{};

