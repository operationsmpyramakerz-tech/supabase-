(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { nodes: [], edges: [], connectingFrom: '', drag: null, zoom: 1, canvas: { width: 1280, height: 820 } };
  const overlay = $('lmsBuilderOverlay');
  const board = $('lmsBuilderBoard');
  const arrows = $('lmsBuilderArrows');
  const wrap = $('lmsBuilderCanvasWrap');
  const menu = $('lmsAddBlockMenu');
  const status = $('lmsBuilderStatus');

  function iconify(root = document) { if (window.feather) window.feather.replace({ root }); }
  function uid() { return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function label(kind) { return ({ school:'School', instructor:'Instructor', co_instructor:'Co-Instructor' })[kind] || 'Block'; }
  function openOverlay() { overlay.hidden = false; overlay.setAttribute('aria-hidden','false'); document.body.classList.add('tm-modal-open'); menu.hidden = true; setTimeout(() => wrap?.focus(), 0); }
  function closeOverlay() { overlay.hidden = true; overlay.setAttribute('aria-hidden','true'); document.body.classList.remove('tm-modal-open'); menu.hidden = true; }
  function nextPosition() { const i = state.nodes.length; return { x: 70 + (i % 3) * 360, y: 80 + Math.floor(i / 3) * 210 }; }
  function addNode(kind) { const p = nextPosition(); state.nodes.push({ id:uid(), kind, x:p.x, y:p.y }); menu.hidden = true; render(); setStatus(`${label(kind)} block added. Edit details will be configured in the next step.`); }
  function setStatus(text) { if (status) status.textContent = text; }
  function edgeKey(a,b){return `${a}::${b}`;}
  function toggleConnection(id, side) {
    if (side === 'out') { state.connectingFrom = state.connectingFrom === id ? '' : id; render(); setStatus(state.connectingFrom ? 'Now select the input point on another block.' : 'Connection cancelled.'); return; }
    if (!state.connectingFrom || state.connectingFrom === id) return;
    if (!state.edges.some(e => edgeKey(e.from,e.to) === edgeKey(state.connectingFrom,id))) state.edges.push({from:state.connectingFrom,to:id});
    state.connectingFrom = ''; render(); setStatus('Blocks connected.');
  }
  function render() {
    board.querySelectorAll('[data-lms-node]').forEach(el => el.remove());
    $('lmsBuilderEmpty').hidden = state.nodes.length > 0;
    state.nodes.forEach((node, index) => {
      const el = document.createElement('article');
      el.className = `tm-builder-block lms-builder-block${state.connectingFrom===node.id?' is-connect-source':''}`;
      el.dataset.lmsNode = node.id; el.dataset.kind = node.kind;
      el.style.left = `${node.x}px`; el.style.top = `${node.y}px`;
      el.innerHTML = `<div class="tm-builder-block__head" data-drag-handle><div class="tm-builder-block__number">${index+1}</div><div class="tm-builder-block__title"><b>${esc(label(node.kind))}</b><small>Needs configuration</small></div><div class="tm-builder-block__actions"><button type="button" class="tm-builder-icon-btn" data-edit-node="${esc(node.id)}" aria-label="Edit block"><i data-feather="edit-3"></i></button><button type="button" class="tm-builder-icon-btn tm-builder-icon-btn--danger" data-delete-node="${esc(node.id)}" aria-label="Delete block"><i data-feather="trash-2"></i></button></div></div><div class="tm-builder-block__body"><span class="lms-builder-block__type">${esc(label(node.kind))}</span><strong>Click Edit to configure this block</strong><span class="lms-builder-block__hint">Details will be added in the next development step.</span></div><button type="button" class="tm-builder-socket tm-builder-socket--in" data-socket="in" data-node="${esc(node.id)}" aria-label="Incoming connection"></button><button type="button" class="tm-builder-socket tm-builder-socket--out" data-socket="out" data-node="${esc(node.id)}" aria-label="Outgoing connection"></button>`;
      board.appendChild(el);
    });
    drawEdges(); iconify(board);
  }
  function center(el, side) { const b=board.getBoundingClientRect(), r=el.getBoundingClientRect(); return {x:(side==='out'?r.right:r.left)-b.left+wrap.scrollLeft,y:r.top-b.top+wrap.scrollTop+r.height/2}; }
  function drawEdges() {
    arrows.innerHTML = '<defs><marker id="lmsArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#d06a2b"/></marker></defs>';
    state.edges.forEach(e => { const a=board.querySelector(`[data-lms-node="${CSS.escape(e.from)}"]`), b=board.querySelector(`[data-lms-node="${CSS.escape(e.to)}"]`); if(!a||!b)return; const p1=center(a,'out'),p2=center(b,'in'),dx=Math.max(70,Math.abs(p2.x-p1.x)*.5); const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',`M ${p1.x} ${p1.y} C ${p1.x+dx} ${p1.y}, ${p2.x-dx} ${p2.y}, ${p2.x} ${p2.y}`); path.setAttribute('class','tm-builder-arrow'); path.setAttribute('marker-end','url(#lmsArrow)'); arrows.appendChild(path); });
  }
  async function saveStructure() {
    const name = $('lmsStructureName').value.trim() || 'Untitled LMS Structure';
    if (!state.nodes.length) { setStatus('Add at least one block before saving.'); return; }
    const btn=$('lmsSaveStructureBtn'); btn.disabled=true;
    try {
      const res=await fetch('/api/lms/structures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,nodes:state.nodes.map(({id,kind,x,y})=>({clientId:id,kind,x,y})),edges:state.edges})});
      const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||'Unable to save structure.');
      setStatus('Structure saved successfully.');
    } catch(err){ setStatus(err.message||'Unable to save structure.'); } finally { btn.disabled=false; }
  }

  $('lmsAddStructureBtn')?.addEventListener('click',()=>{ state.nodes=[];state.edges=[];state.connectingFrom='';$('lmsStructureName').value='';render();openOverlay(); });
  $('lmsAddBlockBtn')?.addEventListener('click',(e)=>{ e.stopPropagation(); menu.hidden=!menu.hidden; });
  menu?.addEventListener('click',(e)=>{const b=e.target.closest('[data-add-kind]');if(b)addNode(b.dataset.addKind);});
  document.addEventListener('click',(e)=>{if(!e.target.closest('#lmsAddBlockWrap'))menu.hidden=true;});
  document.querySelectorAll('[data-lms-close="builder"]').forEach(b=>b.addEventListener('click',closeOverlay));
  $('lmsSaveStructureBtn')?.addEventListener('click',saveStructure);
  board?.addEventListener('click',(e)=>{const del=e.target.closest('[data-delete-node]');if(del){const id=del.dataset.deleteNode;state.nodes=state.nodes.filter(n=>n.id!==id);state.edges=state.edges.filter(x=>x.from!==id&&x.to!==id);render();return;}const edit=e.target.closest('[data-edit-node]');if(edit){setStatus(`${label(state.nodes.find(n=>n.id===edit.dataset.editNode)?.kind)} edit form will be added in the next step.`);return;}const socket=e.target.closest('[data-socket]');if(socket)toggleConnection(socket.dataset.node,socket.dataset.socket);});
  board?.addEventListener('pointerdown',(e)=>{const h=e.target.closest('[data-drag-handle]');if(!h||e.target.closest('button'))return;const el=h.closest('[data-lms-node]'),node=state.nodes.find(n=>n.id===el.dataset.lmsNode);if(!node)return;state.drag={id:node.id,startX:e.clientX,startY:e.clientY,x:node.x,y:node.y,pointerId:e.pointerId};el.setPointerCapture?.(e.pointerId);e.preventDefault();});
  board?.addEventListener('pointermove',(e)=>{if(!state.drag||state.drag.pointerId!==e.pointerId)return;const n=state.nodes.find(x=>x.id===state.drag.id);if(!n)return;n.x=Math.max(16,state.drag.x+(e.clientX-state.drag.startX));n.y=Math.max(16,state.drag.y+(e.clientY-state.drag.startY));const el=board.querySelector(`[data-lms-node="${CSS.escape(n.id)}"]`);if(el){el.style.left=`${n.x}px`;el.style.top=`${n.y}px`;drawEdges();}});
  const endDrag=()=>{state.drag=null;}; board?.addEventListener('pointerup',endDrag);board?.addEventListener('pointercancel',endDrag);
  $('lmsZoomInBtn')?.addEventListener('click',()=>{state.zoom=Math.min(1.6,state.zoom+.1);board.style.zoom=state.zoom;$('lmsZoomLabel').textContent=`${Math.round(state.zoom*100)}%`;});
  $('lmsZoomOutBtn')?.addEventListener('click',()=>{state.zoom=Math.max(.5,state.zoom-.1);board.style.zoom=state.zoom;$('lmsZoomLabel').textContent=`${Math.round(state.zoom*100)}%`;});
  $('lmsZoomResetBtn')?.addEventListener('click',()=>{state.zoom=1;board.style.zoom='1';$('lmsZoomLabel').textContent='100%';});
  iconify(); render();
})();
