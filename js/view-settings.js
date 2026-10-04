/*
 * タブ3:設定(メニュー・シフト種別・必要な人数)
 * 
 */
"use strict";

/* ============ タブ3:設定 ============ */
function renderSettings(){
  if(ui.settingsScreen==="menu") return renderSettingsMenu();
  if(ui.settingsScreen==="types") return renderTypesList();
  if(ui.settingsScreen==="requirements") return renderRequirements();
  if(ui.settingsScreen==="reqOverrides") return renderReqOverrides();
  if(ui.settingsScreen==="tasks") return renderTasksList();
  if(ui.settingsScreen==="business") return renderBusinessSettings();
  if(ui.settingsScreen==="specialDates") return renderSpecialDates();
  return renderSettingsMenu();
}
function backHeader(title, backTo){
  return `<div class="topbar"><button class="back" onclick="App.goSettings('${backTo}')">‹ 戻る</button><h1>${esc(title)}</h1><span style="width:40px"></span></div>`;
}
App.goSettings = function(screen){ ui.settingsScreen = screen; render(); };

function renderSettingsMenu(){
  return `
  <div class="topbar"><h1>${esc(state.store.name||"設定")}</h1></div>
  <div class="section-title">シフトの設定</div>
  <div class="card">
    <div class="list-row" onclick="App.goSettings('types')"><div class="main">⏰ シフト種別</div><span class="chev">›</span></div>
    <div class="list-row" onclick="App.goSettings('requirements')"><div class="main">👥 必要な人数</div><span class="chev">›</span></div>
    <div class="list-row" onclick="App.goSettings('tasks')"><div class="main">✅ 曜日ごとの作業</div><span class="chev">›</span></div>
    <div class="list-row" onclick="App.goSettings('business')"><div class="main">🏬 お店の設定</div><span class="chev">›</span></div>
  </div>
  <div class="section-title">データ</div>
  <div class="card">
    <div class="list-row" onclick="App.saveBackup()"><div class="main">💾 バックアップを保存</div><span class="chev">›</span></div>
    <div class="list-row" onclick="document.getElementById('backupFile').click()"><div class="main">📂 バックアップから戻す</div><span class="chev">›</span></div>
    <input type="file" id="backupFile" accept="application/json,.json" style="display:none" onchange="App.loadBackup(this)">
  </div>
  <div class="footnote">データはこの端末の中だけに保存されます。機種変更や万一に備えて、月に1回くらいバックアップを「ファイル」アプリなどに保存しておくと安心です。</div>
  `;
}

/* ---- シフト種別 ---- */
function renderTypesList(){
  const types = shiftTypesSorted();
  const rm = !!ui._reorder;
  return backHeader("シフト種別","menu") + `
  <div class="topbar" style="padding-top:0;justify-content:flex-end;gap:10px">
    ${types.length>1?`<button class="btn btn-secondary btn-sm" onclick="App.toggleReorder()">${rm?'完了':'編集'}</button>`:""}
    <button class="iconbtn" onclick="App.openTypeEdit(null)">＋</button></div>
  <div class="section-title">シフト種別(${types.length}件)</div>
  <div class="card" id="typeList">
    ${types.length===0? `<div class="small-note">右上の「+」からシフト種別を追加してください\n例:A早番 10:00〜18:00</div>` :
      types.map(t=>`<div class="list-row" data-typerow="${t.id}" ${rm?'':`onclick="App.openTypeEdit('${t.id}')"`}>
        ${rm?`<span class="handle" data-typehandle="${t.id}">≡</span>`:""}
        <div class="main"><div style="display:flex;justify-content:space-between"><span class="title">${esc(t.name)}${t.role?` <span class="badge" style="background:var(--accent-soft);color:var(--accent)">${t.role}</span>`:""}</span><span class="small-note">${timeRangeText(t)}</span></div>${t.requiredSkill?`<div class="sub">必須:${skillLabel(t.requiredSkill)}★${t.requiredSkillMinStars}以上を${t.requiredSkillMinCount}人以上</div>`:""}</div>
        ${rm?"":'<span class="chev">›</span>'}
      </div>`).join("")}
  </div>
  <div class="footnote">時短勤務(例:16:00上がり)は「A時短」のような別種別として追加してください。並び順はシフト表の列の順になります(右上「編集」で並べ替え)。</div>`;
}
App.toggleReorder = function(){ ui._reorder=!ui._reorder; render(); };
function emptyType(){ return {id:uid(), name:"", startMinutes:600, endMinutes:1080, sortOrder:(state.shiftTypes.reduce((m,t)=>Math.max(m,t.sortOrder),-1))+1, requiredSkill:null, requiredSkillMinStars:null, requiredSkillMinCount:null}; }
App.openTypeEdit = function(typeId){
  const isNew = !typeId;
  const t = isNew ? emptyType() : typeById(typeId);
  window._curType = JSON.parse(JSON.stringify(t));
  const html = `
  <div class="sheet-head"><h3>${isNew?"種別を追加":esc(t.name)}</h3>
    ${isNew? `<span><button onclick="App.closeModal()" style="margin-right:14px;color:var(--muted)">キャンセル</button><button onclick="App.saveTypeNew()">保存</button></span>` : `<button onclick="App.closeModal()">完了</button>`}
  </div>
  <div class="card">
    <label class="field"><span class="lbl">名前(例:A早番)</span><input type="text" id="tyName" value="${esc(t.name)}"></label>
    <label class="field"><span class="lbl">開始</span><input type="time" id="tyStart" value="${timeInputValue(t.startMinutes)}"></label>
    <label class="field"><span class="lbl">終了</span><input type="time" id="tyEnd" value="${timeInputValue(t.endMinutes)}"></label>
    <div class="footnote" id="tyWorkTime"></div>
  </div>
  <div class="section-title">役割(中番ルールで使う)</div>
  <div class="card">
    <select id="tyRole" onchange="App.setTypeRole(this.value)">
      <option value="" ${!t.role?'selected':''}>なし</option>
      ${ROLES.map(r=>`<option value="${r}" ${t.role===r?'selected':''}>${r}</option>`).join("")}
    </select>
    <div class="footnote">開店(例:早番)・中番・閉め(例:遅番)を設定すると、バイトの入れる時間を見て社員の早番/中番/遅番を自動で振り分けます。時刻をずらした種別(例:D30)は元と同じ役割にしてください。どの種別にも役割を設定しなければ、従来どおり「種別ごとの必要人数」で組みます。</div>
  </div>
  <div class="section-title">必須条件(例:店閉め対応★3以上を1人以上)</div>
  <div class="card">
    <div class="toggle-row"><span>必須条件を設定する</span><label class="switch"><input type="checkbox" id="tyReqToggle" ${t.requiredSkill?'checked':''} onchange="App.toggleTypeReq(this)"><span class="slider"></span></label></div>
    <div id="tyReqFields" style="display:${t.requiredSkill?'block':'none'}">
      <label class="field"><span class="lbl">評価項目</span>
        <select id="tySkill">${SKILLS.map(sk=>`<option value="${sk.id}" ${t.requiredSkill===sk.id?'selected':''}>${sk.label}</option>`).join("")}</select>
      </label>
      <div class="stepper" style="margin-bottom:10px"><span>最低 ★<b id="tyStarsVal">${t.requiredSkillMinStars||3}</b> 以上</span><div class="btns"><button onclick="App.stepTypeField('stars',-1)">−</button><button onclick="App.stepTypeField('stars',1)">＋</button></div></div>
      <div class="stepper"><span>その人が最低 <b id="tyCountVal">${t.requiredSkillMinCount||1}</b> 人</span><div class="btns"><button onclick="App.stepTypeField('count',-1)">−</button><button onclick="App.stepTypeField('count',1)">＋</button></div></div>
    </div>
    <div class="footnote">設定すると、自動生成はこの条件を満たす人を必ず含めます(満たせない枠は警告付きの空きになります)。</div>
  </div>
  ${!isNew? `<button class="btn btn-danger btn-block" onclick="App.deleteType('${t.id}')">この種別を削除</button>
  <div class="footnote">削除すると、スタッフの希望度設定と必要人数の設定からも消えます。過去のシフト表には種別名の記録だけが残ります。</div>`:""}
  `;
  showSheet(html);
  if(!isNew) bindTypeLiveEdit(t);
  updateWorkTimeNote();
  document.getElementById("tyStart").addEventListener("change", updateWorkTimeNote);
  document.getElementById("tyEnd").addEventListener("change", updateWorkTimeNote);
};
function updateWorkTimeNote(){
  const s = timeToMinutes(document.getElementById("tyStart").value);
  const e = timeToMinutes(document.getElementById("tyEnd").value);
  const el = document.getElementById("tyWorkTime");
  if(e<=s) el.innerHTML = `<span class="danger-text">終了時刻は開始時刻より後にしてください。</span>`;
  else{ const wm=e-s; el.textContent = `1回の勤務時間:${Math.floor(wm/60)}時間${wm%60?wm%60+"分":""}(月間上限の集計に使います)`; }
}
function bindTypeLiveEdit(t){
  document.getElementById("tyName").addEventListener("input", e=>{ t.name=e.target.value; save(); });
  document.getElementById("tyStart").addEventListener("change", e=>{ t.startMinutes=timeToMinutes(e.target.value); if(t.endMinutes<=t.startMinutes) t.endMinutes=Math.min(t.startMinutes+30,1439); document.getElementById("tyEnd").value=timeInputValue(t.endMinutes); save(); });
  document.getElementById("tyEnd").addEventListener("change", e=>{ t.endMinutes=Math.max(timeToMinutes(e.target.value), t.startMinutes+30); document.getElementById("tyEnd").value=timeInputValue(t.endMinutes); save(); });
  document.getElementById("tySkill")?.addEventListener("change", e=>{ t.requiredSkill=e.target.value; save(); });
}
App.setTypeRole = function(value){
  // 既存の種別はその場で保存(新規は「保存」ボタンで反映)
  if(window._editingExistingType){ window._editingExistingType.role = value || null; save(); }
};
App.toggleTypeReq = function(cb){
  const isNew = !document.querySelector(".sheet-head button[onclick^='App.saveTypeNew']") ? false : true;
  document.getElementById("tyReqFields").style.display = cb.checked?"block":"none";
  if(window._editingExistingType){
    const t = window._editingExistingType;
    if(cb.checked){ t.requiredSkill="closing"; t.requiredSkillMinStars=3; t.requiredSkillMinCount=1; } else { t.requiredSkill=null; t.requiredSkillMinStars=null; t.requiredSkillMinCount=null; }
    save();
  }
};
App.stepTypeField = function(which, delta){
  const idEl = which==='stars' ? 'tyStarsVal' : 'tyCountVal';
  const el = document.getElementById(idEl);
  let v = Number(el.textContent) + delta;
  v = which==='stars' ? Math.max(1,Math.min(5,v)) : Math.max(1,Math.min(9,v));
  el.textContent = v;
  if(window._editingExistingType){
    const t = window._editingExistingType;
    if(which==='stars') t.requiredSkillMinStars = v; else t.requiredSkillMinCount = v;
    save();
  }
};
App.saveTypeNew = function(){
  const name = document.getElementById("tyName").value.trim();
  const s = timeToMinutes(document.getElementById("tyStart").value);
  const e = timeToMinutes(document.getElementById("tyEnd").value);
  if(!name || e<=s) return;
  const t = window._curType;
  t.name = name; t.startMinutes=s; t.endMinutes=e;
  t.role = document.getElementById("tyRole").value || null;
  if(document.getElementById("tyReqToggle").checked){
    t.requiredSkill = document.getElementById("tySkill").value;
    t.requiredSkillMinStars = Number(document.getElementById("tyStarsVal").textContent);
    t.requiredSkillMinCount = Number(document.getElementById("tyCountVal").textContent);
  }
  state.shiftTypes.push(t);
  save(); App.closeModal(); render();
};
App.deleteType = function(typeId){
  confirmDialog("本当に削除しますか?","","削除する",()=>{
    state.shiftTypes = state.shiftTypes.filter(t=>t.id!==typeId);
    state.staffingRequirements.forEach(r=>{ if(r.items) delete r.items[typeId]; });
    state.staff.forEach(s=>{ if(s.preferences) delete s.preferences[typeId]; });
    save(); App.closeModal(); render();
  });
};
// フックしてeditingExistingType参照させる(既存編集時のライブ編集で使用)
const _origOpenTypeEdit = App.openTypeEdit;
App.openTypeEdit = function(typeId){
  window._editingExistingType = typeId ? typeById(typeId) : null;
  _origOpenTypeEdit(typeId);
};

/* ---- 必要な人数 ---- */
function renderRequirements(){
  ui._reqKind = ui._reqKind || "平日";
  ensureTemplate("平日"); ensureTemplate("土日");
  const template = state.staffingRequirements.find(r=>r.kind===ui._reqKind);
  const types = shiftTypesSorted();
  return backHeader("必要な人数","menu") + `
  <div class="card">
    <div class="seg">
      <button class="${ui._reqKind==='平日'?'active':''}" onclick="App.setReqKind('平日')">平日</button>
      <button class="${ui._reqKind==='土日'?'active':''}" onclick="App.setReqKind('土日')">土日祝</button>
    </div>
  </div>
  <div class="section-title">${ui._reqKind==='土日'?'土日祝':'平日'}の目標人員数</div>
  <div class="card">
    ${headcountStepperHtml(template, ui._reqKind==='土日'?4:3, 'tplhc')}
    <div class="footnote">シフト種別に役割(開店/中番/閉め)を設定した店で使います。人員数は社員1人+バイト(7時間以上=1人、未満=0.5人)。届かない日は「応援の目安」としてお知らせします。祝日は土日と同じ扱いです。</div>
  </div>
  <div class="section-title">${ui._reqKind==='土日'?'土日祝':'平日'}の必要人数(役割を使わない店)</div>
  <div class="card">
    ${types.length===0? `<div class="small-note">先にシフト種別を登録してください</div>` :
      types.map(t=>`<div class="stepper" style="padding:8px 0"><span>${esc(t.name)}</span>
        <div class="btns"><button onclick="App.stepReqCount('${template.id}','${t.id}',-1)">−</button>
        <b style="min-width:22px;text-align:center;display:inline-block" id="reqcnt_${t.id}">${(template.items&&template.items[t.id])||0}</b>
        <button onclick="App.stepReqCount('${template.id}','${t.id}',1)">＋</button></div>
      </div>`).join("")}
  </div>
  <div class="footnote">0人の種別はその日はシフトなしになります。時短の人が毎日出る場合は、時短種別にも人数を入れてください。</div>
  <div class="card" style="margin-top:12px"><div class="list-row" onclick="App.goSettings('reqOverrides')"><div class="main">特定日の上書き(イベント日など)</div><span class="chev">›</span></div></div>
  <div class="footnote">セール日など、テンプレと違う人数にしたい日はここで個別に設定します。</div>
  `;
}
/** 目標人員数のステッパー(0.5人刻み。未設定なら fallback を表示) */
function headcountStepperHtml(req, fallback, elId){
  const v = req.targetHeadcount!=null ? req.targetHeadcount : fallback;
  return `<div class="stepper"><span>目標人員数:<b id="${elId}">${headcountText(v)}</b>人</span>
    <div class="btns"><button onclick="App.stepHeadcount('${req.id}',-0.5,${fallback},'${elId}')">−</button><button onclick="App.stepHeadcount('${req.id}',0.5,${fallback},'${elId}')">＋</button></div></div>`;
}
App.stepHeadcount = function(reqId, delta, fallback, elId){
  const req = state.staffingRequirements.find(r=>r.id===reqId) || (window._curOverride && window._curOverride.id===reqId ? window._curOverride : null);
  if(!req) return;
  const cur = req.targetHeadcount!=null ? req.targetHeadcount : fallback;
  req.targetHeadcount = Math.max(0, Math.min(20, cur + delta));
  document.getElementById(elId).textContent = headcountText(req.targetHeadcount);
  if(state.staffingRequirements.includes(req)) save();
};
function ensureTemplate(kind){
  if(!state.staffingRequirements.find(r=>r.kind===kind)){
    state.staffingRequirements.push({id:uid(), kind, date:null, items:{}});
    save();
  }
}
App.setReqKind = function(kind){ ui._reqKind = kind; render(); };
App.stepReqCount = function(reqId, typeId, delta){
  const req = state.staffingRequirements.find(r=>r.id===reqId);
  req.items = req.items||{};
  req.items[typeId] = Math.max(0, Math.min(20, (req.items[typeId]||0)+delta));
  document.getElementById("reqcnt_"+typeId).textContent = req.items[typeId];
  save();
};

function renderReqOverrides(){
  const overrides = state.staffingRequirements.filter(r=>r.kind==="特定日").sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  return backHeader("特定日の上書き","requirements") + `
  <div class="topbar" style="padding-top:0;justify-content:flex-end"><button class="iconbtn" onclick="App.openOverrideEdit(null)">＋</button></div>
  <div class="card">
    ${overrides.length===0? `<div class="small-note">右上の「+」から追加してください</div>` :
      overrides.map(r=>{
        const [y,m,d] = (r.date||"2000-01-01").split("-").map(Number);
        const parts = shiftTypesSorted().filter(t=>(r.items||{})[t.id]>0).map(t=>t.name+r.items[t.id]);
        const hc = r.targetHeadcount!=null ? `目標${headcountText(r.targetHeadcount)}人` : "";
        const summaryText = [hc].concat(parts).filter(Boolean).join("・") || "全種別0人(シフトなし)";
        return swipeWrap(`<div class="list-row" onclick="App.openOverrideEdit('${r.id}')"><div class="main"><div class="title">${y}/${m}/${d}</div><div class="sub">${esc(summaryText)}</div></div><span class="chev">›</span></div>`, "削除", `App.deleteOverride('${r.id}')`);
      }).join("")}
  </div>`;
}
App.openOverrideEdit = function(reqId){
  const isNew = !reqId;
  const today = new Date();
  const req = isNew ? {id:uid(), kind:"特定日", date:dateStr(today.getFullYear(),today.getMonth()+1,today.getDate()), items:{}} : state.staffingRequirements.find(r=>r.id===reqId);
  const types = shiftTypesSorted();
  const html = `
  <div class="sheet-head"><h3>特定日の上書き</h3><button onclick="App.closeModal()">${isNew?'キャンセル':'完了'}</button></div>
  <div class="card">
    <label class="field"><span class="lbl">対象日</span><input type="date" id="ovDate" value="${req.date}"></label>
    ${headcountStepperHtml(req, overrideFallback(req.date), 'ovhc')}
    <div class="footnote" style="margin-bottom:8px">目標人員数は役割を使う店で使います。下の人数は役割を使わない店の設定です。</div>
    ${types.map(t=>`<div class="stepper" style="padding:8px 0"><span>${esc(t.name)}</span>
      <div class="btns"><button onclick="App.stepOverrideCount('${req.id}','${t.id}',-1,${isNew})">−</button>
      <b style="min-width:22px;text-align:center;display:inline-block" id="ovcnt_${t.id}">${(req.items&&req.items[t.id])||0}</b>
      <button onclick="App.stepOverrideCount('${req.id}','${t.id}',1,${isNew})">＋</button></div>
    </div>`).join("")}
  </div>
  ${isNew? `<button class="btn btn-primary btn-block" onclick="App.saveOverrideNew('${req.id}')">保存</button>` :
    `<button class="btn btn-danger btn-block" onclick="App.deleteOverride('${req.id}')">この上書きを削除</button>`}
  `;
  window._curOverride = req;
  showSheet(html);
};
/** 特定日の目標人員数の既定値(その日が土日祝なら土日祝テンプレ、それ以外は平日テンプレの値) */
function overrideFallback(ds){
  const [y,m,d] = (ds||"2000-01-01").split("-").map(Number);
  const wd = weekdayOf(y,m,d);
  const weekend = wd===1 || wd===7 || !!holidayName(y,m,d);
  const tpl = state.staffingRequirements.find(r=>r.kind===(weekend?"土日":"平日"));
  return tpl && tpl.targetHeadcount!=null ? tpl.targetHeadcount : (weekend ? 4 : 3);
}
App.stepOverrideCount = function(reqId, typeId, delta, isNew){
  const req = window._curOverride;
  req.items = req.items||{};
  req.items[typeId] = Math.max(0, Math.min(20,(req.items[typeId]||0)+delta));
  document.getElementById("ovcnt_"+typeId).textContent = req.items[typeId];
  if(!isNew) save();
};
App.saveOverrideNew = function(reqId){
  const req = window._curOverride;
  req.date = document.getElementById("ovDate").value;
  state.staffingRequirements.push(req);
  save(); App.closeModal(); render();
};
App.deleteOverride = function(reqId){
  state.staffingRequirements = state.staffingRequirements.filter(r=>r.id!==reqId);
  save(); App.closeModal(); render();
};
document.addEventListener("change", e=>{ if(e.target && e.target.id==="ovDate" && window._curOverride){ window._curOverride.date=e.target.value; if(state.staffingRequirements.includes(window._curOverride)) save(); } });


/* ---- バックアップ ---- */
App.saveBackup = async function(){
  try{ await exportBackup(); }
  catch(e){ alert("バックアップを保存できませんでした。"); }
};
App.loadBackup = function(input){
  const file = input.files && input.files[0];
  input.value = ""; // 同じファイルをもう一度選べるように
  if(!file) return;
  confirmDialog("バックアップから戻しますか?", "いまこの端末にあるデータは、バックアップの内容に置き換わります。", "戻す", async ()=>{
    try{ await importBackup(file); render(); alert("バックアップから戻しました。"); }
    catch(e){ alert("読み込めませんでした:" + (e.message || "ファイルを確認してください")); }
  });
};
