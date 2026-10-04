/*
 * 休み希望タブ →「バイトの入れる時間」
 * 月の最初に、バイトの「その日に入れる時間」(1日1枠・15分単位)を記録する。提出どおりにシフトに確定する(#31)。
 *  ・いつもの時間(スタッフ編集で登録)を月へ一括反映
 *  ・日ごとの修正(入れる/入れない・時間)
 * 生成済みの月で直したときは、シフト表のバイト欄にもすぐ反映する。
 */
"use strict";

App.openAvailability = function(){
  ui.dayoffScreen = "availability";
  ui.availYear = ui.availYear || ui.year;
  ui.availMonth = ui.availMonth || ui.month;
  render();
};
App.closeAvailability = function(){ ui.dayoffScreen = "list"; render(); };

function activePartTimers(){ return activeStaffSorted().filter(s=>s.employmentType==="バイト"); }

function renderAvailability(){
  const y = ui.availYear, m = ui.availMonth;
  const pts = activePartTimers();
  const sel = pts.find(s=>s.id===ui.availStaffId) || pts[0];
  const header = `<div class="topbar"><button class="back" onclick="App.closeAvailability()">‹ 戻る</button><h1>バイトの入れる時間</h1><span style="width:48px"></span></div>`;
  if(!sel){
    return header + `<div class="empty-hint">在籍中のバイトがいません。\n「スタッフ」タブで区分を「バイト」にした人がここに表示されます。</div>`;
  }

  // 月の合計(入れる日数・合計時間・月間上限との比較)
  const recs = [];
  for(let d=1; d<=daysInMonth(y,m); d++){ const r = (sel.dailyAvailabilities||{})[dateStr(y,m,d)]; if(r) recs.push(r); }
  const total = recs.reduce((s,r)=>s+(r.endMinutes-r.startMinutes),0);
  const limit = sel.monthlyHourLimit;
  const over = limit!=null && total > limit*60;

  let rows = "";
  for(let d=1; d<=daysInMonth(y,m); d++){
    const ds = dateStr(y,m,d), wd = weekdayOf(y,m,d);
    const closed = isClosedOn(ds), hol = holidayName(y,m,d);
    const r = (sel.dailyAvailabilities||{})[ds];
    const color = closed ? "var(--muted)" : (wd===1||hol) ? "var(--sunday)" : wd===7 ? "var(--saturday)" : "var(--deep-brown)";
    rows += `<div class="list-row" onclick="App.editAvailabilityDay('${sel.id}','${ds}')">
      <div style="width:74px;color:${color}">${d}日(${DAY_LABELS[wd-1]})${hol?`<div style="font-size:10px;white-space:nowrap">${esc(hol)}</div>`:""}</div>
      <div class="main">${closed?'<span class="small-note">休業日</span>':""}</div>
      ${r ? `<div>${minutesToTime(r.startMinutes)}〜${minutesToTime(r.endMinutes)}</div><div class="small-note" style="width:52px;text-align:right">${hoursText(r.endMinutes-r.startMinutes)}</div>`
          : `<div class="small-note">×</div>`}
      <span class="chev">›</span>
    </div>`;
  }

  return header + `
  <div class="month-nav">
    <div class="month-card">
      <button class="iconbtn" style="box-shadow:none;background:var(--accent-soft)" onclick="App.shiftAvailMonth(-1)">‹</button>
      <div class="mid"><div class="ym">${y}年${m}月</div></div>
      <button class="iconbtn" style="box-shadow:none;background:var(--accent-soft)" onclick="App.shiftAvailMonth(1)">›</button>
    </div>
  </div>
  <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px">
    ${pts.map(s=>`<button class="btn btn-sm ${s.id===sel.id?'btn-primary':'btn-secondary'}" style="width:auto;flex-shrink:0;box-shadow:none" onclick="App.selectAvailStaff('${s.id}')">${esc(s.name)}</button>`).join("")}
  </div>
  <button class="btn btn-secondary btn-block" style="margin-bottom:12px" onclick="App.openApplyUsual()">いつもの時間を反映</button>
  <div class="card">
    <div>入れる日 ${recs.length}日 ・ 合計 ${hoursText(total)}</div>
    ${limit!=null?`<div class="footnote ${over?'warn-text':''}">${over?`月間上限 ${limit}時間を超えています(提出どおり確定のため、警告のみ)`:`月間上限 ${limit}時間`}</div>`:""}
    ${Object.keys(sel.usualAvailabilities||{}).length===0?`<div class="footnote">「いつもの入れる時間」が未登録です(スタッフ編集で登録できます)</div>`:""}
  </div>
  <div class="card">${rows}</div>`;
}

App.shiftAvailMonth = function(delta){
  let m = ui.availMonth + delta, y = ui.availYear;
  if(m<1){ m=12; y--; } if(m>12){ m=1; y++; }
  ui.availMonth = m; ui.availYear = y; render();
};
App.selectAvailStaff = function(id){ ui.availStaffId = id; render(); };

/* ---- いつもの時間を反映 ---- */
App.openApplyUsual = function(){
  const pts = activePartTimers();
  const sel = pts.find(s=>s.id===ui.availStaffId) || pts[0];
  const title = `${ui.availYear}年${ui.availMonth}月`;
  const run = targets => confirmDialog("いつもの時間を反映しますか?",
    `${title}を「いつもの入れる時間」で作り直します。この月に入力済みの時間は上書きされます。休業日は空けておきます。`, "反映する", ()=>{
      targets.forEach(s=>applyUsualAvailability(s, ui.availYear, ui.availMonth));
      syncPartTimerShifts(ui.availYear, ui.availMonth); // 生成済みの月なら、シフト表のバイト欄にも反映
      save(); render();
    });
  showActionSheet([
    {label:"バイト全員に反映", action:()=>run(pts)},
    ...(sel ? [{label:`${sel.name}さんだけ反映`, action:()=>run([sel])}] : []),
  ]);
};

/* ---- 1日分の修正 ---- */
App.editAvailabilityDay = function(staffId, ds){
  const s = staffById(staffId);
  const r = (s.dailyAvailabilities||{})[ds];
  const def = r || defaultAvailabilityRange();
  const [y,m,d] = ds.split("-").map(Number);
  showSheet(`
  <div class="sheet-head"><h3>${fmtMD(y,m,d)} ${esc(s.name)}</h3>
    <span><button onclick="App.closeModal()" style="margin-right:14px;color:var(--muted)">キャンセル</button><button onclick="App.saveAvailabilityDay('${staffId}','${ds}')">保存</button></span></div>
  <div class="card">
    <div class="toggle-row"><span>この日は入れる</span><label class="switch"><input type="checkbox" id="avCan" ${r?'checked':''} onchange="document.getElementById('avTimes').style.display=this.checked?'block':'none'"><span class="slider"></span></label></div>
    <div id="avTimes" style="display:${r?'block':'none'}">
      <label class="field"><span class="lbl">開始</span><input type="time" step="900" id="avStart" value="${minutesToTime(def.startMinutes)}"></label>
      <label class="field"><span class="lbl">終了</span><input type="time" step="900" id="avEnd" value="${minutesToTime(def.endMinutes)}"></label>
      <div class="footnote" id="avNote"></div>
    </div>
    <div class="footnote">提出された時間は、そのままシフトに確定します(自動生成では変えません)。</div>
  </div>`);
};
App.saveAvailabilityDay = function(staffId, ds){
  const s = staffById(staffId);
  s.dailyAvailabilities = s.dailyAvailabilities || {};
  if(document.getElementById("avCan").checked){
    const start = roundTo15(timeToMinutes(document.getElementById("avStart").value));
    const end = roundTo15(timeToMinutes(document.getElementById("avEnd").value));
    if(end <= start){ document.getElementById("avNote").innerHTML = `<span class="danger-text">終了は開始より後の時刻にしてください</span>`; return; }
    s.dailyAvailabilities[ds] = {startMinutes:start, endMinutes:end};
  }else{
    delete s.dailyAvailabilities[ds];
  }
  const [y,m] = ds.split("-").map(Number);
  syncPartTimerShifts(y, m); // 生成済みの月なら、シフト表のバイト欄にも反映
  save(); App.closeModal(); render();
};

/** 15分単位にそろえる */
function roundTo15(min){ return Math.round(min/15)*15; }

/* ---- スタッフ編集の「いつもの入れる時間」(曜日ごと) ---- */
function usualAvailabilityHtml(staff){
  const u = staff.usualAvailabilities || {};
  return [1,2,3,4,5,6,7].map(w=>{
    const v = u[w];
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
      <div class="toggle-row" style="padding:2px 0"><span>${DAY_LABELS[w-1]}曜日</span><label class="switch"><input type="checkbox" ${v?'checked':''} onchange="App.toggleUsual(${w},this.checked)"><span class="slider"></span></label></div>
      ${v?`<div style="display:flex;gap:8px;align-items:center">
        <input type="time" step="900" value="${minutesToTime(v.startMinutes)}" onchange="App.setUsualTime(${w},'startMinutes',this.value)">
        <span>〜</span>
        <input type="time" step="900" value="${minutesToTime(v.endMinutes)}" onchange="App.setUsualTime(${w},'endMinutes',this.value)">
      </div>`:""}
    </div>`;
  }).join("");
}
App.toggleUsual = function(w, on){
  const s = window._curStaff;
  s.usualAvailabilities = s.usualAvailabilities || {};
  if(on){ const def = defaultAvailabilityRange(); s.usualAvailabilities[w] = {startMinutes:def.startMinutes, endMinutes:def.endMinutes}; }
  else delete s.usualAvailabilities[w];
  if(state.staff.includes(s)) save();
  document.getElementById("stUsual").innerHTML = usualAvailabilityHtml(s);
};
App.setUsualTime = function(w, field, value){
  const s = window._curStaff, v = s.usualAvailabilities[w];
  const min = roundTo15(timeToMinutes(value));
  // 終了が開始より前になる入力は受け付けず、元の時刻に戻す
  const ok = field==="startMinutes" ? min < v.endMinutes : min > v.startMinutes;
  if(ok) v[field] = min;
  document.getElementById("stUsual").innerHTML = usualAvailabilityHtml(s);
  if(!ok) return;
  if(state.staff.includes(s)) save();
};
