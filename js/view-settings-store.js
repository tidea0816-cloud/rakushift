/*
 * タブ3:設定(曜日ごとの作業・お店の設定・特定日)
 * 
 */
"use strict";

/* ---- 曜日ごとの作業 ---- */
function renderTasksList(){
  const tasks = [...state.weekdayTasks].sort((a,b)=>cmpName(a.name,b.name));
  function summary(t){
    const parts=[];
    const type = typeById(t.shiftTypeId);
    if(type) parts.push(type.name);
    if(t.requiredSkill) parts.push(`${skillLabel(t.requiredSkill)}★${t.requiredMinStars}以上×${t.requiredMinCount}人`);
    if(t.extraStaffCount>0) parts.push(`+${t.extraStaffCount}人増員`);
    return parts.length?parts.join(" / "):"条件未設定";
  }
  return backHeader("曜日ごとの作業","menu") + `
  <div class="topbar" style="padding-top:0;justify-content:flex-end"><button class="iconbtn" onclick="App.openTaskEdit(null)">＋</button></div>
  <div class="card">
    ${tasks.length===0? `<div class="small-note">右上の「+」から作業を追加してください。\n例:火曜は荷受けがあるので、A早番に「動き★4以上」の人が1人必要</div>` :
      tasks.map(t=>swipeWrap(`<div class="list-row" onclick="App.openTaskEdit('${t.id}')">
        <div class="main"><div class="title">${esc(t.name)}</div><div class="sub">${summary(t)}</div></div>
        <div class="footnote">${(t.weekdays||[]).slice().sort().map(w=>DAY_LABELS[w-1]).join("・")}</div>
        <span class="chev">›</span>
      </div>`, "削除", `App.deleteTask('${t.id}')`)).join("")}
  </div>
  <div class="footnote">設定した曜日のシフト作成で、この条件を必ず守ります(守れない枠は警告付きの空きになります)。</div>
  `;
}
function emptyTask(){ return {id:uid(), name:"", weekdays:[], shiftTypeId:null, requiredSkill:null, requiredMinStars:3, requiredMinCount:1, extraStaffCount:0}; }
App.openTaskEdit = function(taskId){
  const isNew = !taskId;
  const t = isNew ? emptyTask() : state.weekdayTasks.find(x=>x.id===taskId);
  const types = shiftTypesSorted();
  window._curTask = t;
  const html = `
  <div class="sheet-head"><h3>${isNew?"作業を追加":esc(t.name)}</h3>${isNew?`<span><button onclick="App.closeModal()" style="margin-right:14px;color:var(--muted)">キャンセル</button><button onclick="App.saveTaskNew()">保存</button></span>`:`<button onclick="App.closeModal()">完了</button>`}</div>
  <div class="card">
    <label class="field"><span class="lbl">作業名(例:荷受け)</span><input type="text" id="tkName" value="${esc(t.name)}"></label>
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">行う曜日(複数選べます)</div>
    <div class="weekday-picker" id="tkWeekdays" style="margin-bottom:12px">
      ${[1,2,3,4,5,6,7].map(w=>`<div class="wd-chip ${(t.weekdays||[]).includes(w)?'on':''}" data-w="${w}" onclick="App.toggleTaskWeekday(this,${isNew})">${DAY_LABELS[w-1]}</div>`).join("")}
    </div>
    <label class="field"><span class="lbl">どのシフト帯で行うか</span>
      <select id="tkType" onchange="App.setTaskField('shiftTypeId', this.value, ${isNew})">
        <option value="">選んでください</option>
        ${types.map(ty=>`<option value="${ty.id}" ${t.shiftTypeId===ty.id?'selected':''}>${esc(ty.name)}(${timeRangeText(ty)})</option>`).join("")}
      </select>
    </label>
  </div>
  <div class="section-title">できる人の条件(任意)</div>
  <div class="card">
    <div class="toggle-row"><span>できる人の条件を付ける</span><label class="switch"><input type="checkbox" id="tkSkillToggle" ${t.requiredSkill?'checked':''} onchange="App.toggleTaskSkill(this,${isNew})"><span class="slider"></span></label></div>
    <div id="tkSkillFields" style="display:${t.requiredSkill?'block':'none'}">
      <label class="field"><span class="lbl">評価項目</span><select id="tkSkill" onchange="App.setTaskField('requiredSkill', this.value, ${isNew})">${SKILLS.map(sk=>`<option value="${sk.id}" ${t.requiredSkill===sk.id?'selected':''}>${sk.label}</option>`).join("")}</select></label>
      <div class="stepper" style="margin-bottom:10px"><span>最低 ★<b id="tkStarsVal">${t.requiredMinStars}</b> 以上</span><div class="btns"><button onclick="App.stepTaskField('requiredMinStars',-1,1,5,${isNew})">−</button><button onclick="App.stepTaskField('requiredMinStars',1,1,5,${isNew})">＋</button></div></div>
      <div class="stepper"><span>その人が最低 <b id="tkCountVal">${t.requiredMinCount}</b> 人</span><div class="btns"><button onclick="App.stepTaskField('requiredMinCount',-1,1,9,${isNew})">−</button><button onclick="App.stepTaskField('requiredMinCount',1,1,9,${isNew})">＋</button></div></div>
    </div>
    <div class="footnote">例:荷受けは力仕事なので「動き★4以上の人が1人」など。</div>
  </div>
  <div class="section-title">人数を増やす(任意)</div>
  <div class="card">
    <div class="stepper"><span>普段より +<b id="tkExtraVal">${t.extraStaffCount}</b> 人</span><div class="btns"><button onclick="App.stepTaskField('extraStaffCount',-1,0,5,${isNew})">−</button><button onclick="App.stepTaskField('extraStaffCount',1,0,5,${isNew})">＋</button></div></div>
    <div class="footnote">この作業のために、その曜日はいつもの必要人数に上乗せします。0なら人数は変えません。</div>
  </div>
  ${!isNew? `<button class="btn btn-danger btn-block" onclick="App.deleteTask('${t.id}')">この作業を削除</button>`:""}
  `;
  showSheet(html);
  if(!isNew) document.getElementById("tkName").addEventListener("input", e=>{ t.name=e.target.value; save(); });
};
App.toggleTaskWeekday = function(el, isNew){
  const t = window._curTask;
  const w = Number(el.dataset.w);
  const on = el.classList.toggle("on");
  t.weekdays = t.weekdays||[];
  if(on){ if(!t.weekdays.includes(w)) t.weekdays.push(w); } else { t.weekdays = t.weekdays.filter(x=>x!==w); }
  if(!isNew) save();
};
App.setTaskField = function(field, value, isNew){
  window._curTask[field] = value || null;
  if(!isNew) save();
};
App.toggleTaskSkill = function(cb, isNew){
  const t = window._curTask;
  t.requiredSkill = cb.checked ? "agility" : null;
  document.getElementById("tkSkillFields").style.display = cb.checked?"block":"none";
  if(!isNew) save();
};
App.stepTaskField = function(field, delta, min, max, isNew){
  const t = window._curTask;
  t[field] = Math.max(min, Math.min(max, (t[field]||0)+delta));
  const map = {requiredMinStars:"tkStarsVal", requiredMinCount:"tkCountVal", extraStaffCount:"tkExtraVal"};
  document.getElementById(map[field]).textContent = t[field];
  if(!isNew) save();
};
App.saveTaskNew = function(){
  const t = window._curTask;
  t.name = document.getElementById("tkName").value.trim();
  if(!t.name || !t.weekdays.length || !t.shiftTypeId) return;
  if(document.getElementById("tkSkillToggle").checked) t.requiredSkill = document.getElementById("tkSkill").value;
  state.weekdayTasks.push(t);
  save(); App.closeModal(); render();
};
App.deleteTask = function(taskId){
  state.weekdayTasks = state.weekdayTasks.filter(t=>t.id!==taskId);
  save(); App.closeModal(); render();
};

/* ---- お店の設定 ---- */
function renderBusinessSettings(){
  ensureBusinessDays();
  const days = [...state.businessDays].sort((a,b)=>a.weekday-b.weekday);
  return backHeader("お店の設定","menu") + `
  <div class="section-title">店舗</div>
  <div class="card"><label class="field"><span class="lbl">店名</span><input type="text" id="bsName" value="${esc(state.store.name)}" oninput="App.setStoreField('name', this.value)"></label></div>

  <div class="section-title">自動生成のルール</div>
  <div class="card">
    <div class="stepper"><span>連勤上限:<b id="bsMaxConsec">${state.store.maxConsecutiveWorkDays}</b>日まで</span><div class="btns"><button onclick="App.stepStore('maxConsecutiveWorkDays',-1,2,10)">−</button><button onclick="App.stepStore('maxConsecutiveWorkDays',1,2,10)">＋</button></div></div>
    <div class="stepper"><span>勤務間の休息:<b id="bsMinRest">${state.store.minRestHours}</b>時間以上が望ましい</span><div class="btns"><button onclick="App.stepStore('minRestHours',-1,8,24)">−</button><button onclick="App.stepStore('minRestHours',1,8,24)">＋</button></div></div>
    <div class="footnote">連勤上限は必ず守ります(ハード制約)。休息時間はソフト制約(採点)に使います。</div>
  </div>

  <div class="section-title">社員の休みと人員数</div>
  <div class="card">
    <div class="stepper"><span>社員の公休:月<b id="bsPublic">${state.store.monthlyPublicHolidays}</b>日</span><div class="btns"><button onclick="App.stepStore('monthlyPublicHolidays',-1,0,15)">−</button><button onclick="App.stepStore('monthlyPublicHolidays',1,0,15)">＋</button></div></div>
    <div class="stepper"><span>バイトを1人と数える:<b id="bsFullHc">${hoursText(state.store.fullHeadcountMinMinutes)}</b>以上</span><div class="btns"><button onclick="App.stepStore('fullHeadcountMinMinutes',-30,240,600)">−</button><button onclick="App.stepStore('fullHeadcountMinMinutes',30,240,600)">＋</button></div></div>
    <div class="footnote">社員はこの日数だけ公休をとります(有給・特休などは別に数えます)。人員数は社員1人+バイト(上の時間以上=1人、未満=0.5人)で数えます。</div>
  </div>

  <div class="section-title">営業時間の一括設定</div>
  <div class="card">
    <label class="field"><span class="lbl">開店</span><input type="time" id="bsBulkOpen" value="10:00"></label>
    <label class="field"><span class="lbl">閉店</span><input type="time" id="bsBulkClose" value="21:00"></label>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary btn-sm" style="flex:1" onclick="App.applyBulkHours([2,3,4,5,6])">平日(月〜金)に一括適用</button>
      <button class="btn btn-secondary btn-sm" style="flex:1" onclick="App.applyBulkHours([1,7])">土日に一括適用</button>
    </div>
  </div>

  <div class="section-title">曜日ごとの営業時間</div>
  <div class="card">
    ${days.map(d=>`<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="toggle-row" style="padding:0 0 6px"><span>${DAY_LABELS[d.weekday-1]}曜日を定休日にする</span><label class="switch"><input type="checkbox" ${d.isClosed?'checked':''} onchange="App.setBizClosed(${d.weekday}, this.checked)"><span class="slider"></span></label></div>
      ${!d.isClosed? `<div style="display:flex;gap:8px;align-items:center">
        <input type="time" value="${timeInputValue(d.openMinutes)}" onchange="App.setBizTime(${d.weekday},'openMinutes',this.value)">
        <span>〜</span>
        <input type="time" value="${timeInputValue(d.closeMinutes)}" onchange="App.setBizTime(${d.weekday},'closeMinutes',this.value)">
      </div>`:""}
    </div>`).join("")}
  </div>

  <div class="card"><div class="list-row" onclick="App.goSettings('specialDates')"><div class="main">臨時休業・臨時営業(特定日)</div><span class="chev">›</span></div></div>
  <div class="footnote">棚卸しや年末年始など、通常と違う日はここで指定します。</div>
  `;
}
function ensureBusinessDays(){
  if(state.businessDays.length<7){
    const existing = new Set(state.businessDays.map(d=>d.weekday));
    for(let w=1;w<=7;w++) if(!existing.has(w)) state.businessDays.push({weekday:w,isClosed:false,openMinutes:600,closeMinutes:1260});
    save();
  }
}
App.setStoreField = function(field, value){ state.store[field]=value; save(); };
App.stepStore = function(field, delta, min, max){
  state.store[field] = Math.max(min, Math.min(max, state.store[field]+delta));
  const map = {maxConsecutiveWorkDays:"bsMaxConsec", minRestHours:"bsMinRest", monthlyPublicHolidays:"bsPublic", fullHeadcountMinMinutes:"bsFullHc"};
  document.getElementById(map[field]).textContent = field==="fullHeadcountMinMinutes" ? hoursText(state.store[field]) : state.store[field];
  save();
};
App.applyBulkHours = function(weekdays){
  const open = timeToMinutes(document.getElementById("bsBulkOpen").value);
  const close = timeToMinutes(document.getElementById("bsBulkClose").value);
  state.businessDays.forEach(d=>{ if(weekdays.includes(d.weekday)){ d.openMinutes=open; d.closeMinutes=close; d.isClosed=false; } });
  save(); render();
};
App.setBizClosed = function(weekday, val){
  state.businessDays.find(d=>d.weekday===weekday).isClosed = val;
  save(); render();
};
App.setBizTime = function(weekday, field, val){
  state.businessDays.find(d=>d.weekday===weekday)[field] = timeToMinutes(val);
  save();
};

function renderSpecialDates(){
  const dates = [...state.specialDates].sort((a,b)=>a.date.localeCompare(b.date));
  return backHeader("臨時休業・臨時営業","business") + `
  <div class="topbar" style="padding-top:0;justify-content:flex-end"><button class="iconbtn" onclick="App.openSpecialEdit(null)">＋</button></div>
  <div class="card">
    ${dates.length===0? `<div class="small-note">右上の「+」から追加してください\n例:7/20 棚卸しのため臨時休業</div>` :
      dates.map(sp=>{
        const [y,m,d]=sp.date.split("-").map(Number);
        return swipeWrap(`<div class="list-row" onclick="App.openSpecialEdit('${sp.id}')">
          <div class="main"><div class="title">${y}/${m}/${d}(${DAY_LABELS[weekdayOf(y,m,d)-1]})</div>${sp.note?`<div class="sub">${esc(sp.note)}</div>`:""}</div>
          <span class="badge" style="background:var(--table-header);color:var(--muted)">${sp.kind}</span>
          <span class="chev">›</span>
        </div>`, "削除", `App.deleteSpecial('${sp.id}')`);
      }).join("")}
  </div>`;
}
App.openSpecialEdit = function(spId){
  const isNew = !spId;
  const today = new Date();
  const sp = isNew ? {id:uid(), date:dateStr(today.getFullYear(),today.getMonth()+1,today.getDate()), kind:"臨時休業", openMinutes:600, closeMinutes:1260, note:""} : state.specialDates.find(x=>x.id===spId);
  window._curSpecial = sp;
  const html = `
  <div class="sheet-head"><h3>${isNew?"特定日を追加":"特定日を編集"}</h3><button onclick="App.closeModal()">${isNew?'キャンセル':'完了'}</button></div>
  <div class="card">
    <label class="field"><span class="lbl">日付</span><input type="date" id="spDate" value="${sp.date}" onchange="App.setSpecialField('date',this.value,${isNew})"></label>
    <div class="seg" id="spKindSeg">
      <button class="${sp.kind==='臨時休業'?'active':''}" data-val="臨時休業" onclick="App.setSpKind(this,${isNew})">臨時休業</button>
      <button class="${sp.kind==='臨時営業'?'active':''}" data-val="臨時営業" onclick="App.setSpKind(this,${isNew})">臨時営業</button>
    </div>
    <div id="spHoursFields" style="display:${sp.kind==='臨時営業'?'block':'none'};margin-top:10px">
      <label class="field"><span class="lbl">開店</span><input type="time" value="${timeInputValue(sp.openMinutes||600)}" onchange="App.setSpecialField('openMinutes',App.timeVal(this),${isNew})"></label>
      <label class="field"><span class="lbl">閉店</span><input type="time" value="${timeInputValue(sp.closeMinutes||1260)}" onchange="App.setSpecialField('closeMinutes',App.timeVal(this),${isNew})"></label>
    </div>
    <label class="field" style="margin-top:10px"><span class="lbl">メモ</span><input type="text" id="spNote" value="${esc(sp.note)}" placeholder="例:棚卸しのため" oninput="App.setSpecialField('note',this.value,${isNew})"></label>
  </div>
  ${isNew? `<button class="btn btn-primary btn-block" onclick="App.saveSpecialNew()">保存</button>` :
    `<button class="btn btn-danger btn-block" onclick="App.deleteSpecial('${sp.id}')">削除</button>`}
  `;
  showSheet(html);
};
App.timeVal = function(el){ return timeToMinutes(el.value); };
App.setSpKind = function(btn, isNew){
  document.getElementById("spKindSeg").querySelectorAll("button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  window._curSpecial.kind = btn.dataset.val;
  document.getElementById("spHoursFields").style.display = btn.dataset.val==="臨時営業"?"block":"none";
  if(!isNew) save();
};
App.setSpecialField = function(field, value, isNew){
  window._curSpecial[field] = value;
  if(!isNew) save();
};
App.saveSpecialNew = function(){
  const sp = window._curSpecial;
  state.specialDates.push(sp);
  save(); App.closeModal(); render();
};
App.deleteSpecial = function(spId){
  state.specialDates = state.specialDates.filter(x=>x.id!==spId);
  save(); App.closeModal(); render();
};

