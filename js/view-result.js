/*
 * 生成結果のシート
 * 
 */
"use strict";

/* ============ 生成結果シート ============ */
function showResultSheet(outcome){
  const html = `
  <div class="sheet-head"><h3></h3><button onclick="App.closeModal()">閉じる</button></div>
  <div class="result-icon">✅</div>
  <div style="text-align:center;font-weight:700;font-size:18px">シフトができました!</div>
  <div style="text-align:center;color:var(--muted);font-size:13px;margin-top:4px">新しく${outcome.assignedCount}件を割り当てました${outcome.lockedCount>0?`(確定${outcome.lockedCount}件はそのまま)`:""}</div>
  ${outcome.vacancyLines.length===0 ? `<div class="card" style="margin-top:16px"><b>👏 すべての枠が埋まりました</b></div>` :
    `<div class="card" style="margin-top:16px">
      <b class="warn-text">あと少し!埋まらなかった枠が${outcome.vacancyLines.length}件</b>
      ${outcome.vacancyLines.slice(0,6).map(l=>`<div class="footnote">${esc(l)}</div>`).join("")}
      ${outcome.vacancyLines.length>6?`<div class="footnote">…ほか${outcome.vacancyLines.length-6}件</div>`:""}
      <div class="footnote" style="color:var(--accent)">表のオレンジ色のマスをタップすると、理由と入れる候補が見られます</div>
    </div>`}
  ${(outcome.workDayLines||[]).length ? `<div class="card"><b>出勤日数の確認</b>
    ${outcome.workDayLines.map(l=>`<div class="footnote">${esc(l)}</div>`).join("")}</div>` : ""}
  <div class="statgrid">
    ${outcome.summary.preferredOffTotal>0?`<div class="statcard"><div class="t">できれば休み</div><div class="v">${outcome.summary.preferredOffTotal-outcome.summary.preferredOffViolated}/${outcome.summary.preferredOffTotal}件 尊重</div></div>`:""}
    <div class="statcard"><div class="t">希望シフト</div><div class="v">多めに${outcome.summary.moreAssigned}回応えた</div></div>
    <div class="statcard"><div class="t">勤務日数</div><div class="v">${outcome.summary.minWorkDays}〜${outcome.summary.maxWorkDays}日</div></div>
    <div class="statcard"><div class="t">最長連勤</div><div class="v">${outcome.summary.longestRun}日</div></div>
  </div>
  ${(outcome.shortageLines||[]).length ? `<div style="color:var(--muted);font-size:11.5px;line-height:1.7;margin:4px 4px 14px">
    <div>👥 応援の目安:人員が目標に届かない日 ${outcome.shortageLines.length}日</div>
    ${outcome.shortageLines.map(l=>`<div style="font-size:10.5px">${esc(l)}</div>`).join("")}
  </div>` : ""}
  <button class="btn btn-primary" onclick="App.closeModal()">シフト表を見る</button>
  `;
  showSheet(html);
}

