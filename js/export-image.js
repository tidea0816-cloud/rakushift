/*
 * 画像で書き出し
 * シフト表を1枚の画像にして共有する
 */
"use strict";

/* ============ 画像書き出し(canvas) ============ */
function exportScheduleImage(built){
  const schedule = getSchedule(ui.year, ui.month, false);
  const typeIndex = {}; built.typeModels.forEach((t,i)=>typeIndex[t.id]=i);
  const contents = {};
  const roleMode = !!built.input.roleMode;
  const staffIdx = {}; built.staffModels.forEach((s,i)=>staffIdx[s.id]=i);
  const headcounts = {};
  built.dayPlans.forEach(p=>{ if(p.roleDay) headcounts[p.day] = p.roleDay.partTimeHeadcount; });
  if(schedule){
    schedule.assignments.forEach(a=>{
      const [y,m,d] = a.date.split("-").map(Number);
      if(y!==ui.year||m!==ui.month) return;
      if(!(a.shiftTypeId in typeIndex)) return;
      const ti = typeIndex[a.shiftTypeId];
      const key = d+":"+ti;
      contents[key] = contents[key]||[];
      const staffObj = a.staffId?staffById(a.staffId):null;
      contents[key].push({name: staffObj?staffObj.name:a.staffNameSnapshot, isLocked:a.isLocked});
      // 役割モード:人員数を数える(シフトの勤務時間が「1人と数える時間」以上なら1人、未満なら0.5人)
      if(a.staffId && (a.staffId in staffIdx)) headcounts[d] = (headcounts[d]||0) + (workMinutes(built.typeModels[ti]) >= state.store.fullHeadcountMinMinutes ? 1 : 0.5);
    });
  }
  Object.keys(contents).forEach(k=>contents[k].sort((a,b)=>cmpName(a.name,b.name)));

  const typeNames = built.typeModels.map(t=>t.name);
  const dateColW = 50, typeColW = 92, rowH0 = 34, lineH = 16;
  const ptColW = roleMode ? 120 : 0, hcColW = roleMode ? 46 : 0; // 役割モードの追加列(バイト・人員)
  const bodyW = typeColW*typeNames.length + ptColW + hcColW;
  const width = dateColW + bodyW;
  const rowHeights = built.dayPlans.map(plan=>{
    if(plan.isClosed) return 30;
    let tallest = 0;
    typeNames.forEach((n,ti)=>{
      const key = plan.day+":"+ti; const cnt = (contents[key]||[]).length;
      tallest = Math.max(tallest, cnt*lineH + 8);
    });
    if(roleMode) tallest = Math.max(tallest, plan.partTimers.length*14 + 8);
    return Math.max(30, tallest);
  });
  const height = rowH0 + rowHeights.reduce((a,b)=>a+b,0) + 30;

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width*scale; canvas.height = height*scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale,scale);
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0,0,width,height);
  ctx.font = "bold 13px sans-serif"; ctx.fillStyle = "#5C4A4E";
  ctx.fillText(`${state.store.name||"シフト表"} ${ui.year}年${ui.month}月`, 4, 16);

  let y0 = 24;
  ctx.fillStyle = "#F4E9E7"; ctx.fillRect(0,y0,width,rowH0);
  ctx.strokeStyle = "#EBDEDB"; ctx.strokeRect(0,y0,dateColW,rowH0);
  ctx.fillStyle="#5C4A4E"; ctx.font="10px sans-serif"; ctx.textAlign="center";
  ctx.fillText("日付", dateColW/2, y0+rowH0/2+3);
  typeNames.forEach((n,ti)=>{
    const x = dateColW + ti*typeColW;
    ctx.strokeRect(x,y0,typeColW,rowH0);
    ctx.font="bold 11px sans-serif"; ctx.fillText(n, x+typeColW/2, y0+15);
    ctx.font="8px sans-serif"; ctx.fillStyle="#8a7570";
    ctx.fillText(timeRangeText(built.typeModels[ti]), x+typeColW/2, y0+27);
    ctx.fillStyle="#5C4A4E";
  });
  if(roleMode){
    const x0 = dateColW + typeColW*typeNames.length;
    ctx.strokeRect(x0,y0,ptColW,rowH0); ctx.strokeRect(x0+ptColW,y0,hcColW,rowH0);
    ctx.font="bold 11px sans-serif"; ctx.fillText("バイト", x0+ptColW/2, y0+15); ctx.fillText("人員", x0+ptColW+hcColW/2, y0+15);
    ctx.font="8px sans-serif"; ctx.fillStyle="#8a7570";
    ctx.fillText("提出どおり", x0+ptColW/2, y0+27); ctx.fillText("目標", x0+ptColW+hcColW/2, y0+27);
    ctx.fillStyle="#5C4A4E";
  }

  let y = y0+rowH0;
  built.dayPlans.forEach((plan,idx)=>{
    const h = rowHeights[idx];
    const wd = plan.weekday;
    ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,y,width,h);
    ctx.strokeStyle="#EBDEDB"; ctx.strokeRect(0,y,dateColW,h);
    ctx.fillStyle = (wd===1||plan.holidayName)?"#C4707B":wd===7?"#7C9CB8":"#5C4A4E";
    ctx.font="11px sans-serif";
    ctx.fillText(`${ui.month}/${plan.day}`, dateColW/2, y+h/2-2);
    ctx.font="9px sans-serif";
    ctx.fillText(DAY_LABELS[wd-1] + (plan.holidayName?"祝":""), dateColW/2, y+h/2+10);

    if(plan.isClosed){
      ctx.fillStyle="#F3ECEA"; ctx.fillRect(dateColW,y,bodyW,h);
      ctx.strokeRect(dateColW,y,bodyW,h);
      ctx.fillStyle="#9A8C84"; ctx.font="11px sans-serif";
      ctx.fillText("お休み", dateColW+bodyW/2, y+h/2+3);
    }else{
      typeNames.forEach((n,ti)=>{
        const x = dateColW+ti*typeColW;
        ctx.fillStyle="#FFFFFF"; ctx.fillRect(x,y,typeColW,h);
        ctx.strokeStyle="#EBDEDB"; ctx.strokeRect(x,y,typeColW,h);
        const entries = contents[plan.day+":"+ti] || [];
        ctx.font="10px sans-serif"; ctx.fillStyle="#5C4A4E";
        entries.forEach((e,i)=>{
          ctx.fillStyle = e.isLocked ? "#C97B87" : "#8a5b62";
          ctx.fillText((e.isLocked?"🔒":"")+e.name, x+typeColW/2, y+14+i*lineH);
        });
      });
      if(roleMode){
        const x0 = dateColW + typeColW*typeNames.length;
        ctx.strokeRect(x0,y,ptColW,h);
        ctx.font="9.5px sans-serif"; ctx.fillStyle="#5C4A4E"; ctx.textAlign="left";
        plan.partTimers.forEach((e,i)=>ctx.fillText(`${e.name} ${minutesToTime(e.startMinutes)}-${minutesToTime(e.endMinutes)}`, x0+5, y+13+i*14));
        ctx.textAlign="center";
        const v = headcounts[plan.day]||0, target = plan.roleDay.targetHeadcount, short = v < target;
        ctx.fillStyle = short ? "#F5E3CD" : "#FFFFFF"; ctx.fillRect(x0+ptColW,y,hcColW,h); ctx.strokeRect(x0+ptColW,y,hcColW,h);
        ctx.fillStyle = short ? "#B4632A" : "#5C4A4E"; ctx.font="bold 11px sans-serif";
        ctx.fillText(`${headcountText(v)}/${headcountText(target)}`, x0+ptColW+hcColW/2, y+h/2+4);
      }
    }
    y += h;
  });

  const dataUrl = canvas.toDataURL("image/png");
  const html = `
  <div class="sheet-head"><h3>画像で書き出し</h3><button onclick="App.closeModal()">閉じる</button></div>
  <div class="footnote" style="margin-bottom:8px">下の「共有・保存する」で LINE などに送れます(画像の長押しでも保存できます)。</div>
  <img src="${dataUrl}" style="width:100%;border-radius:8px;box-shadow:var(--shadow)">
  <button class="btn btn-primary" style="margin-top:12px" onclick="App.saveExport()">📤 共有・保存する</button>
  `;
  canvas.toBlob(b=>{ window._exportBlob=b; });
  window._exportName = `シフト表_${ui.year}-${pad(ui.month)}.png`;
  showSheet(html);
}

