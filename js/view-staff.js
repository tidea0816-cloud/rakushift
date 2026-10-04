/*
 * タブ2:スタッフ
 * 
 */
"use strict";

/* ============ タブ2:スタッフ ============ */
function renderStaffList(){
  const active = activeStaffSorted();
  const inactive = inactiveStaffSorted();
  const palette = [["#F6E3E6","#C0707E"],["#FAE8D8","#C08A52"],["#ECE4F6","#9A85C9"],["#E0ECF4","#7C9CB8"]];
  function avatarColors(s){
    if(s.employmentType==="社員") return ["#E4EBE0","#6E8465"];
    const seed = [...s.name].reduce((a,c)=>a+c.charCodeAt(0),0);
    return palette[seed % palette.length];
  }
  function row(s){
    const [bg,fg] = avatarColors(s);
    return swipeWrap(`<div class="list-row" onclick="App.openStaffEdit('${s.id}')">
      <div class="avatar" style="background:${bg};color:${fg}">${esc(s.name.slice(0,1))}</div>
      <div class="main"><div class="title">${esc(s.name)}</div><div class="sub">${esc(s.employmentType)}</div></div>
      ${s.isNewcomer?`<span class="badge newcomer">新人</span>`:""}
      <span class="chev">›</span>
    </div>`, s.isActive?"非在籍にする":"在籍に戻す", `App.toggleActiveQuick('${s.id}')`, s.isActive?"#D08A3C":"#7C9A77");
  }
  return `
  <div class="topbar"><h1>スタッフ</h1><button class="iconbtn" onclick="App.openStaffAdd()">＋</button></div>
  <div class="section-title">在籍スタッフ(${active.length}人)</div>
  <div class="card">${active.length? active.map(row).join("") : `<div class="small-note">右上の「+」からスタッフを追加してください</div>`}</div>
  ${inactive.length? `<details style="margin-top:14px"><summary class="section-title" style="cursor:pointer">非在籍(${inactive.length}人)</summary><div class="card">${inactive.map(row).join("")}</div></details>
  <div class="footnote">退職者は削除せずここに残ります(過去のシフト記録を守るため)。</div>` : ""}
  `;
}

function emptyStaff(){
  const ratings = {}; SKILLS.forEach(s=>ratings[s.id]=3);
  return {id:uid(), name:"", employmentType:"バイト", isNewcomer:false, ratings, workableWeekdays:[1,2,3,4,5,6,7], monthlyHourLimit:null, isActive:true, notes:"", preferences:{}, dayOffs:[], usualAvailabilities:{}, dailyAvailabilities:{}};
}

App.openStaffAdd = function(){
  const s = emptyStaff();
  showStaffEditSheet(s, true);
};
App.openStaffEdit = function(staffId){
  showStaffEditSheet(staffById(staffId), false);
};

function showStaffEditSheet(staff, isNew){
  const types = shiftTypesSorted();
  const html = `
  <div class="sheet-head"><h3>${isNew?"スタッフを追加":esc(staff.name)}</h3>
    <span>${isNew?`<button onclick="App.cancelStaffNew('${staff.id}')" style="margin-right:14px;color:var(--muted)">キャンセル</button><button onclick="App.saveStaffNew('${staff.id}')">保存</button>`:`<button onclick="App.closeModal()">完了</button>`}</span>
  </div>
  <div class="section-title">基本情報</div>
  <div class="card">
    <label class="field"><span class="lbl">名前</span><input type="text" id="stName" value="${esc(staff.name)}" placeholder="名前"></label>
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">区分</div>
    <div class="seg" id="stEmpSeg">
      <button class="${staff.employmentType==='社員'?'active':''}" data-val="社員" onclick="App.setEmpType(this)">社員</button>
      <button class="${staff.employmentType==='バイト'?'active':''}" data-val="バイト" onclick="App.setEmpType(this)">バイト</button>
    </div>
    <div class="toggle-row"><span>新人(ひとり立ち前)</span><label class="switch"><input type="checkbox" id="stNewcomer" ${staff.isNewcomer?'checked':''} onchange="App.setNewcomer(this.checked)"><span class="slider"></span></label></div>
  </div>
  <div class="section-title">5評価(星をタップ)</div>
  <div class="card">
    ${SKILLS.map(sk=>`<div class="list-row" style="cursor:default"><div class="main">${sk.label}</div><div class="stars" data-skill="${sk.id}">${[1,2,3,4,5].map(n=>`<span class="${n<=(staff.ratings[sk.id]||3)?'on':''}" data-n="${n}" onclick="App.setStar('${sk.id}',${n})">★</span>`).join("")}</div></div>`).join("")}
  </div>
  <div class="footnote">シフト自動生成の採点と、シフト種別の必須条件(例:店閉め★3以上)の判定に使います。</div>

  <div class="section-title">シフト種別ごとの希望度</div>
  <div class="card">
    ${types.length===0? `<div class="small-note">シフト種別が未登録です。シフト種別を登録すると、ここに希望度の設定が表示されます。</div>` :
      types.map(t=>`<div class="list-row" style="cursor:default"><div class="main">${esc(t.name)}</div>
        <select data-pref="${t.id}" onchange="App.setPref('${t.id}',this.value)">
          ${PREF_LEVELS.map(l=>`<option value="${l}" ${preferenceOf(staff,t.id)===l?'selected':''}>${l}</option>`).join("")}
        </select>
      </div>`).join("")}
  </div>
  <div class="footnote">「不可」は絶対に割り当てません。多め/少なめは自動生成の採点に反映します。</div>

  <div id="stUsualWrap" style="display:${staff.employmentType==='バイト'?'block':'none'}">
    <div class="section-title">いつもの入れる時間(バイト)</div>
    <div class="card" id="stUsual">${usualAvailabilityHtml(staff)}</div>
    <div class="footnote">曜日ごとの定型の時間です。休み希望タブの「バイトの入れる時間」で「いつもの時間を反映」すると、その月に一括で下書きされます。</div>
  </div>

  <div class="section-title">勤務条件</div>
  <div class="card">
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">勤務可能な曜日</div>
    <div class="weekday-picker" id="stWeekdays">
      ${[1,2,3,4,5,6,7].map(w=>`<div class="wd-chip ${staff.workableWeekdays.includes(w)?'on':''}" data-w="${w}" onclick="App.toggleWeekday(this)">${DAY_LABELS[w-1]}</div>`).join("")}
    </div>
    <div class="toggle-row" style="margin-top:12px"><span>月間上限時間を設定(扶養の壁対策)</span><label class="switch"><input type="checkbox" id="stLimitToggle" ${staff.monthlyHourLimit!=null?'checked':''} onchange="App.toggleLimitField(this)"><span class="slider"></span></label></div>
    <div id="stLimitField" style="display:${staff.monthlyHourLimit!=null?'block':'none'}">
      <div class="stepper"><span>上限 <b id="stLimitVal">${staff.monthlyHourLimit||80}</b> 時間/月</span>
        <div class="btns"><button onclick="App.stepLimit(-5)">−</button><button onclick="App.stepLimit(5)">＋</button></div>
      </div>
    </div>
  </div>

  <div class="section-title">備考</div>
  <div class="card"><textarea id="stNotes" placeholder="自由にメモ(例:学生・試験期間は少なめ希望)">${esc(staff.notes)}</textarea></div>

  ${!isNew? `
  <div class="card"><div class="toggle-row"><span>在籍中</span><label class="switch"><input type="checkbox" id="stActive" ${staff.isActive?'checked':''} onchange="App.setActive(this.checked)"><span class="slider"></span></label></div></div>
  <div class="footnote">退職したスタッフは削除せず「在籍中」をオフにしてください。過去のシフト記録が守られます。</div>
  <button class="btn btn-danger btn-block" style="margin-top:14px" onclick="App.deleteStaff()">このスタッフを削除</button>
  <div class="footnote">削除は元に戻せません。通常は「非在籍」がおすすめです。</div>
  ` : ""}
  `;
  window._curStaff = staff;
  window._curLimitVal = staff.monthlyHourLimit || 80;
  showSheet(html);
  bindStaffLiveEdit(staff);
}

function bindStaffLiveEdit(staff){
  document.getElementById("stName").addEventListener("input", e=>{ staff.name=e.target.value; save(); });
  document.getElementById("stNotes").addEventListener("input", e=>{ staff.notes=e.target.value; save(); });
}
App.setEmpType = function(btn){
  document.getElementById("stEmpSeg").querySelectorAll("button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  window._curStaff.employmentType = btn.dataset.val;
  document.getElementById("stUsualWrap").style.display = btn.dataset.val==="バイト" ? "block" : "none";
  save();
};
App.setNewcomer = function(checked){
  window._curStaff.isNewcomer = checked;
  save();
};
App.setStar = function(skillId, n){
  const staff = window._curStaff;
  staff.ratings[skillId] = n;
  document.querySelectorAll(`[data-skill="${skillId}"] span`).forEach(el=>{
    el.classList.toggle("on", Number(el.dataset.n)<=n);
  });
  save();
};
App.setPref = function(typeId, level){
  const staff = window._curStaff;
  staff.preferences = staff.preferences||{};
  staff.preferences[typeId] = level;
  save();
};
App.toggleWeekday = function(el){
  const staff = window._curStaff;
  const w = Number(el.dataset.w);
  const on = el.classList.toggle("on");
  if(on){ if(!staff.workableWeekdays.includes(w)) staff.workableWeekdays.push(w); }
  else{ staff.workableWeekdays = staff.workableWeekdays.filter(x=>x!==w); }
  save();
};
App.toggleLimitField = function(cb){
  const staff = window._curStaff;
  staff.monthlyHourLimit = cb.checked ? 80 : null;
  document.getElementById("stLimitField").style.display = cb.checked?"block":"none";
  window._curLimitVal = 80;
  document.getElementById("stLimitVal").textContent = 80;
  save();
};
App.stepLimit = function(delta){
  const staff = window._curStaff;
  window._curLimitVal = Math.max(10, Math.min(200, (window._curLimitVal||80)+delta));
  staff.monthlyHourLimit = window._curLimitVal;
  document.getElementById("stLimitVal").textContent = window._curLimitVal;
  save();
};
App.setActive = function(val){
  const staff = window._curStaff;
  staff.isActive = val; save(); render();
};
App.deleteStaff = function(){
  confirmDialog("本当に削除しますか?","過去のシフト表では名前の記録だけが残ります。退職の場合は「非在籍」がおすすめです。","削除する",()=>{
    state.staff = state.staff.filter(s=>s.id!==window._curStaff.id);
    save(); App.closeModal(); render();
  });
};
App.cancelStaffNew = function(id){
  App.closeModal(); render();
};
App.saveStaffNew = function(id){
  const staff = window._curStaff;
  const name = document.getElementById("stName").value.trim();
  if(!name) return;
  staff.name = name;
  state.staff.push(staff);
  save(); App.closeModal(); render();
};

