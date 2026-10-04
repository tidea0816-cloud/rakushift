/*
 * タッチ操作
 * 長押しドラッグ・スワイプ削除・並べ替え
 */
"use strict";

/* ============ タッチ操作 ============ */
(function(){
  let cand=null, timer=null, drag=null, ghost=null, hover=null;
  function clearHover(){ if(hover){ hover.classList.remove("drop-hover"); hover=null; } }
  function cellAt(x,y){ const el=document.elementFromPoint(x,y); return el && el.closest ? el.closest("td.cell[data-day]") : null; }
  function begin(){
    if(!cand) return;
    drag={id:cand.id}; ghost=document.createElement("div"); ghost.className="drag-ghost";
    ghost.textContent=cand.el.textContent.replace("🔒","").trim();
    document.body.appendChild(ghost); place(cand.x,cand.y);
    if(navigator.vibrate) try{navigator.vibrate(15);}catch(e){}
  }
  function place(x,y){
    ghost.style.left=x+"px"; ghost.style.top=y+"px";
    const td=cellAt(x,y); if(td!==hover){ clearHover(); if(td){ td.classList.add("drop-hover"); hover=td; } }
    const wrap=document.querySelector(".tablewrap");
    if(wrap){ const r=wrap.getBoundingClientRect();
      if(x>r.right-40) wrap.scrollLeft+=12; else if(x<r.left+40) wrap.scrollLeft-=12; }
    if(y>window.innerHeight-90) window.scrollBy(0,12); else if(y<90) window.scrollBy(0,-12);
  }
  function finish(x,y,cancel){
    clearTimeout(timer); const d=drag; drag=null; cand=null;
    if(ghost){ ghost.remove(); ghost=null; } clearHover();
    if(d){
      window._justDragged=true; setTimeout(()=>{window._justDragged=false;},350);
      if(!cancel){ const td=cellAt(x,y); if(td) App.dropEntry(d.id, Number(td.dataset.day), Number(td.dataset.ti)); }
    }
  }
  document.addEventListener("pointerdown", e=>{
    const el=e.target.closest && e.target.closest("[data-drag-id]"); if(!el) return;
    if(e.pointerType==="mouse"){ el.setAttribute("draggable","true"); return; }
    cand={id:el.dataset.dragId, el, x:e.clientX, y:e.clientY};
    timer=setTimeout(begin,380);
  });
  document.addEventListener("pointermove", e=>{
    if(drag){ place(e.clientX,e.clientY); return; }
    if(cand && Math.hypot(e.clientX-cand.x,e.clientY-cand.y)>8){ clearTimeout(timer); cand=null; }
  });
  document.addEventListener("pointerup", e=>{ if(drag||cand) finish(e.clientX,e.clientY,false); });
  document.addEventListener("pointercancel", e=>{ if(drag||cand) finish(e.clientX,e.clientY,true); });
  document.addEventListener("touchmove", e=>{ if(drag) e.preventDefault(); }, {passive:false});
  document.addEventListener("contextmenu", e=>{ if(e.target.closest && e.target.closest("[data-drag-id]")) e.preventDefault(); });

  let sw=null;
  function closeAll(except){ document.querySelectorAll(".swipe-body.open").forEach(b=>{ if(b!==except) b.classList.remove("open"); }); }
  document.addEventListener("pointerdown", e=>{
    if(e.pointerType==="mouse") return;
    const b=e.target.closest && e.target.closest(".swipe-body");
    if(!b){ closeAll(null); return; }
    closeAll(b);
    sw={b,x:e.clientX,y:e.clientY,base:b.classList.contains("open")?-88:0,locked:false,moved:false};
  });
  document.addEventListener("pointermove", e=>{
    if(!sw) return;
    const dx=e.clientX-sw.x, dy=e.clientY-sw.y;
    if(!sw.locked){ if(Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)) sw.locked=true; else return; }
    sw.moved=true; sw.b.style.transition="none";
    sw.b.style.transform="translateX("+Math.max(-88,Math.min(0,sw.base+dx))+"px)";
  });
  function endSwipe(e){
    if(!sw) return;
    if(sw.moved){
      const pos=sw.base+(e.clientX-sw.x);
      sw.b.style.transition=""; sw.b.style.transform="";
      sw.b.classList.toggle("open", pos<-44);
      window._swipeBlock=true; setTimeout(()=>{window._swipeBlock=false;},80);
    }
    sw=null;
  }
  document.addEventListener("pointerup", endSwipe);
  document.addEventListener("pointercancel", endSwipe);
  document.addEventListener("click", e=>{
    if(window._swipeBlock){ e.stopPropagation(); e.preventDefault(); return; }
    const b=e.target.closest && e.target.closest(".swipe-body.open");
    if(b){ e.stopPropagation(); e.preventDefault(); b.classList.remove("open"); }
  }, true);

  let rd=null;
  document.addEventListener("pointerdown", e=>{
    const h=e.target.closest && e.target.closest("[data-typehandle]"); if(!h) return;
    const row=h.closest("[data-typerow]"); rd={row}; row.classList.add("row-dragging");
    try{ h.setPointerCapture(e.pointerId); }catch(x){}
    e.preventDefault();
  });
  document.addEventListener("pointermove", e=>{
    if(!rd) return;
    const el=document.elementFromPoint(e.clientX,e.clientY);
    const over=el && el.closest ? el.closest("[data-typerow]") : null;
    if(over && over!==rd.row){
      const r=over.getBoundingClientRect(), before=e.clientY<r.top+r.height/2;
      over.parentNode.insertBefore(rd.row, before?over:over.nextSibling);
    }
  });
  function endReorder(){
    if(!rd) return;
    rd.row.classList.remove("row-dragging");
    const ids=[...document.querySelectorAll("[data-typerow]")].map(r=>r.dataset.typerow);
    ids.forEach((id,i)=>{ const t=typeById(id); if(t) t.sortOrder=i; });
    rd=null; save(); render();
  }
  document.addEventListener("pointerup", endReorder);
  document.addEventListener("pointercancel", endReorder);
})();
