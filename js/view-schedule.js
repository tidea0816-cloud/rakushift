/*
 * タブ0:シフト表
 * 表の描画・月の切り替え・生成ボタン
 */
"use strict";

/* ============ タブ0:シフト表 ============ */
function renderSchedule(){
  const built = buildInput(ui.year, ui.month);
  // 役割モードは目標人員数に既定値があるので、人数の設定は不要
  const hasRequirements = !!built.input.roleMode || state.staffingRequirements.some(r=>Object.values(r.items||{}).some(c=>c>0));
  const needsSetup = built.typeModels.length===0 || built.staffModels.length===0 || !hasRequirements;

  let body;
  if(needsSetup){
    body = renderSetupGuidance(built, hasRequirements);
  }else{
    body = renderLegend() + renderScheduleTable(built) + renderGenerateButton(built);
  }

  return `
  <div class="topbar" style="padding-bottom:0"></div>
  <div class="month-nav">
    <div class="month-card">
      <button class="iconbtn" style="box-shadow:none;background:var(--accent-soft)" onclick="App.shiftMonth(-1)">‹</button>
      <div class="mid">
        ${state.store.name ? `<div class="store">${esc(state.store.name)}</div>` : ""}
        <div class="ym">${ui.year}年${ui.month}月</div>
      </div>
      <button class="iconbtn" style="box-shadow:none;background:var(--accent-soft)" onclick="App.shiftMonth(1)">›</button>
    </div>
    <button class="iconbtn" onclick="App.openScheduleMenu()">⋯</button>
  </div>
  ${body}
  `;
}

function renderSetupGuidance(built, hasRequirements){
  const rows = [
    [built.staffModels.length>0, "スタッフを登録する", "「スタッフ」タブから"],
    [built.typeModels.length>0, "シフト種別を登録する(早番・遅番など)", "「設定」タブ → シフト種別"],
    [hasRequirements, "必要な人数を入れる", "「設定」タブ → 必要な人数"],
  ];
  return `<div class="card" style="text-align:center;margin-top:20px">
    <div style="font-size:34px">📋</div>
    <div style="font-weight:700;margin:10px 0 14px">シフトを作る前に、3つの準備をしましょう</div>
    <div style="text-align:left">
      ${rows.map(([done,title,place])=>`
        <div class="check-row">
          <div class="c ${done?'done':''}">${done?'✓':'○'}</div>
          <div><div style="${done?'color:var(--muted)':''}">${title}</div>${!done?`<div class="place">${place}</div>`:""}</div>
        </div>`).join("")}
    </div>
  </div>
  <div class="small-note" style="text-align:center">3つそろうと、ここに「シフトを作る」ボタンが現れます</div>`;
}

function renderLegend(){
  return `<div class="legend">
    <span>🔒 確定</span>
    <span><span class="dot" style="background:var(--warn-bg);border:1px solid var(--warn-text)"></span>人が足りない</span>
    <span><span class="dot" style="background:var(--danger-bg);border:1px solid var(--danger-text)"></span>確認が必要</span>
  </div>`;
}

function renderScheduleTable(built){
  const schedule = getSchedule(ui.year, ui.month, false);
  const typeIndex = {}; built.typeModels.forEach((t,i)=>typeIndex[t.id]=i);
  const staffIndex = {}; built.staffModels.forEach((s,i)=>staffIndex[s.id]=i);

  const contents = {}; // "day:typeIdx" -> [{id,name,isLocked}]
  const validations = [];
  const ghostNames = [];
  const ghostIndexByName = {};

  if(schedule){
    schedule.assignments.forEach(a=>{
      const [y,m,d] = a.date.split("-").map(Number);
      if(y!==ui.year || m!==ui.month) return;
      let typeIdx;
      if(a.shiftTypeId!=null && (a.shiftTypeId in typeIndex)){
        typeIdx = typeIndex[a.shiftTypeId];
        const staffIdx = (a.staffId!=null && (a.staffId in staffIndex)) ? staffIndex[a.staffId] : null;
        validations.push({day:d, typeID:typeIdx, staffID:staffIdx, isLocked:a.isLocked});
      }else{
        const name = a.shiftTypeNameSnapshot || "(不明)";
        if(!(name in ghostIndexByName)){
          ghostIndexByName[name] = built.typeModels.length + ghostNames.length;
          ghostNames.push(name);
        }
        typeIdx = ghostIndexByName[name];
      }
      const key = d+":"+typeIdx;
      contents[key] = contents[key]||[];
      const staffObj = a.staffId ? staffById(a.staffId) : null;
      contents[key].push({id:a.id, name: staffObj ? staffObj.name : a.staffNameSnapshot, isLocked:a.isLocked});
    });
  }
  Object.keys(contents).forEach(k=>contents[k].sort((a,b)=>cmpName(a.name,b.name)));

  const issues = validateSchedule(built.input, validations);

  // 役割モード:日ごとの人員数 = バイト(提出どおり)+ 表のシフトに入っている人
  // (シフトの勤務時間が「1人と数える時間」以上なら1人、未満なら0.5人)
  const roleMode = !!built.input.roleMode;
  const headcounts = {};
  if(roleMode){
    built.dayPlans.forEach(p=>{ if(p.roleDay) headcounts[p.day] = p.roleDay.partTimeHeadcount; });
    validations.forEach(v=>{
      if(v.staffID==null) return;
      headcounts[v.day] = (headcounts[v.day]||0) + (built.input.shiftTypes[v.typeID].workMinutes >= state.store.fullHeadcountMinMinutes ? 1 : 0.5);
    });
  }

  const typeNames = built.typeModels.map(t=>t.name).concat(ghostNames);
  const typeTimes = built.typeModels.map(t=>timeRangeText(t)).concat(ghostNames.map(()=> "(削除済み)"));

  let thead = `<tr><th class="datecol">日付</th>` + typeNames.map((n,i)=>`<th><span class="typename">${esc(n)}</span><span class="typetime">${esc(typeTimes[i])}</span></th>`).join("")
    + (roleMode ? `<th class="ptcol"><span class="typename">バイト</span><span class="typetime">提出どおり</span></th><th class="hccol"><span class="typename">人員</span><span class="typetime">目標</span></th>` : "")
    + `</tr>`;

  let rows = "";
  built.dayPlans.forEach(plan=>{
    const wd = plan.weekday;
    // 日曜・祝日=ローズ、土曜=ブルー。祝日は「月祝」のように曜日に添える
    const dateColor = plan.isClosed ? "var(--muted)" : ((wd===1 || plan.holidayName) ? "var(--sunday)" : wd===7 ? "var(--saturday)" : "var(--deep-brown)");
    rows += `<tr><td class="datecol" style="color:${dateColor}"${plan.holidayName?` title="${esc(plan.holidayName)}"`:""}><div>${ui.month}/${plan.day}</div><div style="font-size:9px">${DAY_LABELS[wd-1]}${plan.holidayName?"祝":""}</div></td>`;
    if(plan.isClosed){
      rows += `<td class="cell closed" colspan="${typeNames.length + (roleMode?2:0)}">お休み</td>`;
    }else{
      typeNames.forEach((n,ti)=>{
        const key = plan.day+":"+ti;
        const entries = contents[key] || [];
        const issue = issues[key];
        const required = plan.requiredCounts[ti] || 0;
        let cls = "cell";
        if(issue && issue.hasHardViolation) cls += " danger";
        else if(issue && issue.missing>0) cls += " warn";
        const isGhost = ti >= built.typeModels.length;
        let inner;
        if(required===0 && entries.length===0 && !(issue && issue.missing>0)){
          inner = `<span style="color:var(--border)">—</span>`;
        }else{
          inner = entries.map(e=>`<span class="pill ${e.isLocked?'locked':''}" data-drag-id="${e.id}" ondragstart="event.dataTransfer.setData('text/plain','${e.id}')">${e.isLocked?'🔒':''}${esc(e.name)}</span>`).join("");
          if(issue && issue.missing>0) inner += `<span class="missing">あと${issue.missing}人</span>`;
        }
        rows += `<td class="${cls}" ${isGhost?'':`data-day="${plan.day}" data-ti="${ti}" onclick="App.openCell(${plan.day},${ti})" ondragover="event.preventDefault()" ondrop="event.preventDefault();App.dropEntry(event.dataTransfer.getData('text/plain'),${plan.day},${ti})"`}>${inner}</td>`;
      });
      if(roleMode){
        // バイト(名前と時間)と、人員数(目標に届かなければアプリコット色)
        rows += `<td class="ptcell">${plan.partTimers.length ? plan.partTimers.map(e=>`<div>${esc(e.name)} ${minutesToTime(e.startMinutes)}-${minutesToTime(e.endMinutes)}</div>`).join("") : `<span style="color:var(--border)">—</span>`}</td>`;
        const value = headcounts[plan.day] || 0, target = plan.roleDay.targetHeadcount;
        rows += `<td class="hccell ${value<target?'short':''}"><b>${headcountText(value)}</b><div>/${headcountText(target)}</div></td>`;
      }
    }
    rows += `</tr>`;
  });

  // 応援の目安(人員数が目標に届かない日)。参考情報なので小さな灰色の文字で。
  // 生成前の月はバイトだけで足りないのが当たり前なので出さない
  let shortage = "";
  if(roleMode && schedule && schedule.assignments.length){
    const days = built.dayPlans.filter(p=>!p.isClosed && p.roleDay && (headcounts[p.day]||0) < p.roleDay.targetHeadcount);
    if(days.length) shortage = `<div class="small-note" style="text-align:center;margin:8px 8px 0;font-size:11px">応援の目安:人員が目標に届かない日 ${days.map(p=>`${p.day}(${DAY_LABELS[p.weekday-1]})`).join("・")}</div>`;
  }

  return `<div class="tablewrap"><table class="sched"><thead>${thead}</thead><tbody>${rows}</tbody></table></div>
  ${shortage}
  <div class="small-note" style="text-align:center;margin:8px 0 4px">マスをタップすると手直しできます(名前を長押ししてドラッグすると別のマスへ移動)</div>`;
}

function renderGenerateButton(built){
  const schedule = getSchedule(ui.year, ui.month, false);
  const lockedCount = schedule ? schedule.assignments.filter(a=>a.isLocked).length : 0;
  return `<button class="btn btn-primary" style="margin-top:10px" onclick="App.generate()">✨ ${lockedCount>0? `もう一度作る(確定${lockedCount}件はそのまま)` : "シフトを作る"}</button>`;
}

function swipeWrap(inner, label, call, color){
  return `<div class="swipe"><button class="swipe-act" style="background:${color||'#C0384A'}" onclick="${call}">${label}</button><div class="swipe-body">${inner}</div></div>`;
}


App.shiftMonth = function(delta){
  let m = ui.month + delta, y = ui.year;
  if(m<1){ m=12; y--; } if(m>12){ m=1; y++; }
  ui.month = m; ui.year = y;
  render();
};

App.openScheduleMenu = function(){
  showActionSheet([
    {label:"📤 画像で書き出す", action:()=>App.exportImage()},
    {label:"🔓 ロックを全解除", danger:true, action:()=>confirmDialog("この月のロックをすべて解除しますか?","解除すると、次の生成で全マスが組み直しの対象になります。","全解除する",()=>App.unlockAll())},
  ]);
};

App.unlockAll = function(){
  const schedule = getSchedule(ui.year, ui.month, false);
  if(!schedule) return;
  schedule.assignments.forEach(a=>a.isLocked=false);
  save(); render();
};

App.generate = function(){
  const outcome = runGeneration(ui.year, ui.month);
  showResultSheet(outcome);
  render();
};

App.openCell = function(day, typeIdx){
  showCellEditSheet(day, typeIdx);
};

App.dropEntry = function(id, day, typeIdx){
  const built = buildInput(ui.year, ui.month);
  const schedule = getSchedule(ui.year, ui.month, false);
  const a = schedule && schedule.assignments.find(x=>x.id===id);
  const type = built.typeModels[typeIdx];
  if(!a || !type) return;
  a.date = built.dateForDay(day); a.shiftTypeId = type.id; a.shiftTypeNameSnapshot = type.name; a.isLocked = true;
  save(); render();
};
App.saveExport = async function(){
  if(!window._exportBlob) return;
  const file = new File([window._exportBlob], window._exportName, {type:"image/png"});
  try{
    // スマホ:共有シート(LINE・写真に保存など)
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); return; }
    // パソコン:ダウンロード
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = window._exportName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }catch(e){ /* キャンセル等は何もしない */ }
};
App.exportImage = function(){
  const built = buildInput(ui.year, ui.month);
  exportScheduleImage(built);
};

