/*
 * タブ1:休み希望
 * 
 */
"use strict";

/* ============ タブ1:休み希望 ============ */
function renderDayOffList(){
  const all = [];
  state.staff.forEach(s=>{ (s.dayOffs||[]).forEach(r=>all.push(Object.assign({staffId:s.id, staffName:s.name}, r))); });
  all.sort((a,b)=>a.date.localeCompare(b.date));

  const groups = {};
  const order = [];
  all.forEach(r=>{
    const [y,m] = r.date.split("-");
    const key = `${y}年${Number(m)}月`;
    if(!groups[key]){ groups[key]=[]; order.push(key); }
    groups[key].push(r);
  });

  let body;
  if(all.length===0){
    body = `<div class="empty-hint">右上の「+」から休み希望を追加してください。\nLINEや口頭で受け取った希望をここにまとめます。</div>`;
  }else{
    body = order.map(key=>{
      return `<div class="section-title">${key}</div><div class="card">${groups[key].map(r=>{
        const [y,m,d] = r.date.split("-").map(Number);
        const isMust = r.strength==="絶対";
        return swipeWrap(`<div class="list-row" onclick="App.editDayOff('${r.staffId}','${r.id}')">
          <div class="main">
            <div>${fmtMD(y,m,d)}</div>
            <div class="sub">${esc(r.staffName)}</div>
          </div>
          ${r.kind==="時間帯限定"?`<div class="footnote">${minutesToTime(r.startMinutes)}〜${minutesToTime(r.endMinutes)}</div>`:""}
          ${(r.category||"希望休")!=="希望休"?`<span class="badge" style="background:var(--table-header);color:var(--muted)">${esc(r.category)}</span>`:""}
          <span class="badge ${isMust?'must':'prefer'}">${isMust?'絶対休み':'できれば休み'}</span>
          <span class="chev">›</span>
        </div>`, "削除", `App.deleteDayOffQuick('${r.staffId}','${r.id}')`);
      }).join("")}</div>`;
    }).join("");
  }

  return `
  <div class="topbar"><h1>休み希望</h1><button class="iconbtn" onclick="App.openDayOffAdd()">＋</button></div>
  <div class="card"><div class="list-row" onclick="App.openAvailability()"><div class="main">🕒 バイトの入れる時間</div><span class="chev">›</span></div></div>
  <div class="footnote" style="margin:-4px 4px 10px">毎月まずバイトの入れる時間を入力し、そのあと社員の休み希望を入れます。</div>
  ${body}
  `;
}

App.openDayOffAdd = function(){
  const staffList = activeStaffSorted();
  const today = new Date();
  const defDate = dateStr(today.getFullYear(), today.getMonth()+1, today.getDate());
  const html = `
  <div class="sheet-head"><h3>休み希望を追加</h3><button onclick="App.closeModal()">✕</button></div>
  <label class="field"><span class="lbl">日付</span><input type="date" id="doDate" value="${defDate}"></label>
  <div class="section-title">休むスタッフ(複数選択可)</div>
  <div class="card" id="doStaffList">
    ${staffList.length===0? `<div class="small-note">先に「スタッフ」を登録してください</div>` :
      staffList.map(s=>`<div class="list-row" data-staffchk="${s.id}" onclick="App.toggleDoStaff('${s.id}')">
        <div class="main">${esc(s.name)}</div><div class="chkmark" style="color:var(--accent)"></div>
      </div>`).join("")}
  </div>
  <div class="card">
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">種別</div>
    <div class="seg" id="doKindSeg">
      <button class="active" data-val="全休" onclick="App.setSeg('doKindSeg',this,'doKindVal')">全休</button>
      <button data-val="時間帯限定" onclick="App.setSeg('doKindSeg',this,'doKindVal');App.toggleTimeFields()">時間帯限定</button>
    </div>
    <div id="doTimeFields" style="display:none;margin-top:10px">
      <label class="field"><span class="lbl">休みたい時間(開始)</span><input type="time" id="doStart" value="10:00"></label>
      <label class="field"><span class="lbl">休みたい時間(終了)</span><input type="time" id="doEnd" value="18:00"></label>
    </div>
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 6px">強さ</div>
    <div class="seg" id="doStrengthSeg">
      <button class="active" data-val="絶対" onclick="App.setSeg('doStrengthSeg',this,'doStrengthVal')">絶対</button>
      <button data-val="できれば" onclick="App.setSeg('doStrengthSeg',this,'doStrengthVal')">できれば</button>
    </div>
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 6px">区分</div>
    <select id="doCategory">${DAYOFF_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join("")}</select>
    <div class="footnote">区分は社員の公休日数の計算に使います(希望休だけが公休に数え、有給・特休・社外業務は数えません)。「絶対」はその枠に必ず割り当てません。「できれば」はなるべく避けます(どうしても人が足りない日は入ることがあります)。</div>
  </div>
  <button class="btn btn-primary" id="doAddBtn" onclick="App.submitDayOffAdd()" disabled>追加(0人)</button>
  `;
  window._doSelected = new Set();
  showSheet(html);
};
App.toggleDoStaff = function(staffId){
  window._doSelected = window._doSelected || new Set();
  const row = document.querySelector(`[data-staffchk="${staffId}"]`);
  if(window._doSelected.has(staffId)){ window._doSelected.delete(staffId); row.querySelector(".chkmark").textContent=""; }
  else{ window._doSelected.add(staffId); row.querySelector(".chkmark").textContent="✓"; }
  const btn = document.getElementById("doAddBtn");
  btn.textContent = `追加(${window._doSelected.size}人)`;
  btn.disabled = window._doSelected.size===0;
};
App.setSeg = function(segId, btn, storeVar){
  document.getElementById(segId).querySelectorAll("button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  window[storeVar] = btn.dataset.val;
};
App.toggleTimeFields = function(){
  const seg = document.getElementById("doKindSeg");
  const isRange = seg.querySelector(".active").dataset.val==="時間帯限定";
  document.getElementById("doTimeFields").style.display = isRange? "block":"none";
};
App.submitDayOffAdd = function(){
  const date = document.getElementById("doDate").value;
  const kindBtn = document.getElementById("doKindSeg").querySelector(".active").dataset.val;
  const strengthBtn = document.getElementById("doStrengthSeg").querySelector(".active").dataset.val;
  const startMinutes = kindBtn==="時間帯限定" ? timeToMinutes(document.getElementById("doStart").value) : null;
  const endMinutes = kindBtn==="時間帯限定" ? timeToMinutes(document.getElementById("doEnd").value) : null;
  const category = document.getElementById("doCategory").value;
  window._doSelected.forEach(staffId=>{
    const s = staffById(staffId);
    s.dayOffs = s.dayOffs||[];
    s.dayOffs.push({id:uid(), date, kind:kindBtn, startMinutes, endMinutes, strength:strengthBtn, category});
  });
  save(); App.closeModal(); render();
};

App.editDayOff = function(staffId, reqId){
  const s = staffById(staffId);
  const r = (s.dayOffs||[]).find(x=>x.id===reqId);
  if(!r) return;
  const html = `
  <div class="sheet-head"><h3>休み希望を編集</h3><button onclick="App.closeModal()">完了</button></div>
  <div class="card">
    <div style="font-weight:700;margin-bottom:8px">${esc(s.name)}</div>
    <label class="field"><span class="lbl">日付</span><input type="date" id="edDate" value="${r.date}"></label>
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px">種別</div>
    <div class="seg" id="edKindSeg">
      <button class="${r.kind==='全休'?'active':''}" data-val="全休" onclick="App.setSeg('edKindSeg',this,'edKindVal');App.toggleEdTimeFields()">全休</button>
      <button class="${r.kind==='時間帯限定'?'active':''}" data-val="時間帯限定" onclick="App.setSeg('edKindSeg',this,'edKindVal');App.toggleEdTimeFields()">時間帯限定</button>
    </div>
    <div id="edTimeFields" style="display:${r.kind==='時間帯限定'?'block':'none'};margin-top:10px">
      <label class="field"><span class="lbl">開始</span><input type="time" id="edStart" value="${timeInputValue(r.startMinutes??600)}"></label>
      <label class="field"><span class="lbl">終了</span><input type="time" id="edEnd" value="${timeInputValue(r.endMinutes??1080)}"></label>
    </div>
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 6px">強さ</div>
    <div class="seg" id="edStrengthSeg">
      <button class="${r.strength==='絶対'?'active':''}" data-val="絶対" onclick="App.setSeg('edStrengthSeg',this,'edStrengthVal')">絶対</button>
      <button class="${r.strength==='できれば'?'active':''}" data-val="できれば" onclick="App.setSeg('edStrengthSeg',this,'edStrengthVal')">できれば</button>
    </div>
    <div class="lbl" style="font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 6px">区分</div>
    <select id="edCategory">${DAYOFF_CATEGORIES.map(c=>`<option value="${c}" ${(r.category||"希望休")===c?'selected':''}>${c}</option>`).join("")}</select>
  </div>
  <button class="btn btn-secondary btn-block" onclick="App.saveDayOffEdit('${staffId}','${reqId}')">保存</button>
  <button class="btn btn-danger btn-block" onclick="App.deleteDayOff('${staffId}','${reqId}')">この休み希望を削除</button>
  `;
  showSheet(html);
};
App.toggleEdTimeFields = function(){
  const isRange = document.getElementById("edKindSeg").querySelector(".active").dataset.val==="時間帯限定";
  document.getElementById("edTimeFields").style.display = isRange?"block":"none";
};
App.saveDayOffEdit = function(staffId, reqId){
  const s = staffById(staffId); const r = (s.dayOffs||[]).find(x=>x.id===reqId);
  r.date = document.getElementById("edDate").value;
  r.kind = document.getElementById("edKindSeg").querySelector(".active").dataset.val;
  r.strength = document.getElementById("edStrengthSeg").querySelector(".active").dataset.val;
  r.category = document.getElementById("edCategory").value;
  if(r.kind==="時間帯限定"){
    r.startMinutes = timeToMinutes(document.getElementById("edStart").value);
    r.endMinutes = timeToMinutes(document.getElementById("edEnd").value);
  }else{ r.startMinutes=null; r.endMinutes=null; }
  save(); App.closeModal(); render();
};
App.deleteDayOffQuick = function(staffId, reqId){
  const st = staffById(staffId); st.dayOffs = (st.dayOffs||[]).filter(x=>x.id!==reqId); save(); render();
};
App.toggleActiveQuick = function(id){ const st=staffById(id); st.isActive=!st.isActive; save(); render(); };
App.deleteDayOff = function(staffId, reqId){
  const s = staffById(staffId);
  s.dayOffs = (s.dayOffs||[]).filter(x=>x.id!==reqId);
  save(); App.closeModal(); render();
};

