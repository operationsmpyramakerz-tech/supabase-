(() => {
  'use strict';
  const state = { databases: [] };
  const $ = (selector, root=document) => root.querySelector(selector);
  const clean = (value) => String(value ?? '').trim();
  const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  function icons(){ try { window.feather?.replace?.(); } catch (_) {} }
  function message(text, kind='info'){ if (!clean(text)) return; if (window.OpsSafeMessage?.show) return window.OpsSafeMessage.show(text, kind); window.alert(text); }
  async function api(url, options={}) {
    const response = await fetch(url, { credentials:'same-origin', headers:{ ...(options.body?{'Content-Type':'application/json'}:{}), ...(options.headers||{}) }, ...options });
    let payload={}; try { payload=await response.json(); } catch(_){}
    if(!response.ok || payload?.ok===false) throw new Error(payload?.error || `Request failed (${response.status}).`);
    return payload || {};
  }
  function open(){ const node=$('#b2cTableOverlay'); if(!node)return; node.hidden=false; node.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; icons(); }
  function close(){ const node=$('#b2cTableOverlay'); if(!node)return; node.hidden=true; node.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }
  function error(text=''){ const box=$('#b2cTableError'); if(!box)return; box.hidden=!text; box.textContent=text; }
  function folderCaption(db){
    const properties=Number(db?.fieldCount)||0;
    const records=Number(db?.recordCount)||0;
    return `${properties} propert${properties===1?'y':'ies'} · ${records} record${records===1?'':'s'}`;
  }
  function closeFolderActionMenus(){
    document.querySelectorAll('.b2c-folder-card.is-actions-open').forEach((card)=>{
      card.classList.remove('is-actions-open');
      const button=card.querySelector('[data-b2c-actions-toggle]');
      if(button) button.setAttribute('aria-expanded','false');
    });
  }
  function bindFolderActions(target){
    target.querySelectorAll('.b2c-folder-card').forEach((card)=>{
      const toggle=card.querySelector('[data-b2c-actions-toggle]');
      toggle?.addEventListener('click',(event)=>{
        event.preventDefault(); event.stopPropagation();
        const willOpen=!card.classList.contains('is-actions-open');
        closeFolderActionMenus();
        card.classList.toggle('is-actions-open',willOpen);
        toggle.setAttribute('aria-expanded',willOpen?'true':'false');
      });
      const copy=card.querySelector('[data-b2c-copy-database]');
      copy?.addEventListener('click',async(event)=>{
        event.preventDefault(); event.stopPropagation(); closeFolderActionMenus();
        const id=copy.dataset.b2cCopyDatabase||'';
        const db=state.databases.find((item)=>String(item.id)===String(id));
        if(!id||!db)return;
        if(!window.confirm(`Make a copy of “${db.name}”? The new table will keep its properties and linked form layouts, without copying records.`))return;
        const original=copy.innerHTML;
        try{
          copy.disabled=true; copy.textContent='Copying…';
          const payload=await api(`/api/b2c/databases/${encodeURIComponent(id)}/copy`,{method:'POST'});
          await load();
          message(`“${payload?.database?.name||db.name+' Copy'}” was created.`, 'success');
        }catch(error){ message(error.message||'Could not make a copy of this table.','error'); }
        finally{ copy.disabled=false; copy.innerHTML=original; icons(); }
      });
      const remove=card.querySelector('[data-b2c-delete-database]');
      remove?.addEventListener('click',async(event)=>{
        event.preventDefault(); event.stopPropagation(); closeFolderActionMenus();
        const id=remove.dataset.b2cDeleteDatabase||'';
        const db=state.databases.find((item)=>String(item.id)===String(id));
        if(!id||!db)return;
        const confirmed = window.OpsDeleteConfirm ? await window.OpsDeleteConfirm.confirm({ title:'Delete database?', itemType:'database', itemName:db.name, message:`You’re going to permanently delete “${db.name}”, including all properties, forms, and records. This action cannot be undone.` }) : window.confirm(`Delete “${db.name}”?`); if(!confirmed)return;
        const original=remove.innerHTML;
        try{
          remove.disabled=true; remove.textContent='Deleting…';
          await api(`/api/b2c/databases/${encodeURIComponent(id)}`,{method:'DELETE'});
          await load();
          message(`“${db.name}” was deleted.`, 'success');
        }catch(error){ message(error.message||'Could not delete this table.','error'); }
        finally{ remove.disabled=false; remove.innerHTML=original; icons(); }
      });
    });
  }
  function render(){
    $('#b2cDatabaseCount')?.replaceChildren(document.createTextNode(String(state.databases.length)));
    $('#b2cTableCountNote')?.replaceChildren(document.createTextNode(`${state.databases.length} table${state.databases.length===1?'':'s'}`));
    $('#b2cDatabaseSummary')?.replaceChildren(document.createTextNode(state.databases.length ? 'Choose a folder to open its dedicated table page.' : 'Create your first B2C database table to begin.'));
    const target=$('#b2cDatabaseList'); if(!target)return;
    if(!state.databases.length){ target.innerHTML='<div class="b2c-folder-empty"><i data-feather="folder-plus"></i><strong>No data tables yet</strong><span>Create the first B2C table to add independent records and forms.</span></div>'; icons(); return; }
    target.innerHTML = state.databases.map((db)=>`<div class="b2c-folder-card"><a class="b2c-folder" href="/b2c/database/${encodeURIComponent(db.id)}" aria-label="Open ${escapeHtml(db.name)}" title="${escapeHtml(db.description||db.name)}"><div class="b2c-folder__figure" aria-hidden="true"><span class="b2c-folder__paper b2c-folder__paper--left"></span><span class="b2c-folder__paper b2c-folder__paper--middle"></span><span class="b2c-folder__paper b2c-folder__paper--right"></span></div><div class="b2c-folder__name" title="${escapeHtml(db.name)}">${escapeHtml(db.name)}</div><div class="b2c-folder__caption">${escapeHtml(folderCaption(db))}</div></a><div class="b2c-folder-actions"><button class="b2c-folder__menu-btn" type="button" data-b2c-actions-toggle aria-label="Table actions" aria-expanded="false"><span class="b2c-folder__menu-dots" aria-hidden="true">•••</span></button><div class="b2c-folder__actions-menu" data-b2c-actions-menu><button type="button" data-b2c-copy-database="${escapeHtml(db.id)}"><i data-feather="copy"></i><span>Make a copy</span></button><button type="button" class="is-danger" data-b2c-delete-database="${escapeHtml(db.id)}"><i data-feather="trash-2"></i><span>Delete</span></button></div></div></div>`).join('');
    bindFolderActions(target);
    icons();
  }
  async function load(){ const refresh=$('#b2cRefreshBtn'); try{ refresh && (refresh.disabled=true); const payload=await api('/api/b2c/databases'); state.databases=Array.isArray(payload.databases)?payload.databases:[]; render(); }catch(error){ const target=$('#b2cDatabaseList'); if(target)target.innerHTML=`<div class="b2c-folder-empty is-error"><i data-feather="alert-circle"></i><strong>Unable to load databases</strong><span>${escapeHtml(error.message||'Please refresh and try again.')}</span></div>`; message(error.message||'Unable to load B2C databases.','error'); icons(); }finally{refresh && (refresh.disabled=false);} }
  async function create(event){ event.preventDefault(); error(''); const name=clean($('#b2cNewTableName')?.value), description=clean($('#b2cNewTableDescription')?.value); if(!name)return error('Table name is required.'); const button=$('#b2cTableForm button[type="submit"]'), original=button?.innerHTML; try{if(button){button.disabled=true;button.textContent='Creating…';} const payload=await api('/api/b2c/databases',{method:'POST',body:JSON.stringify({name,description})}); const id=payload?.database?.id; close(); if(id)window.location.assign(`/b2c/database/${encodeURIComponent(id)}`); else await load(); }catch(err){error(err.message||'Could not create table.');}finally{if(button){button.disabled=false;button.innerHTML=original;icons();}} }
  document.addEventListener('DOMContentLoaded',()=>{ icons(); load(); $('#b2cRefreshBtn')?.addEventListener('click',load); $('#b2cNewTableBtn')?.addEventListener('click',()=>{ $('#b2cTableForm')?.reset(); error(''); open(); }); $('#b2cTableForm')?.addEventListener('submit',create); document.addEventListener('click',(event)=>{if(event.target.closest('[data-b2c-close="table"]')) close(); if(!event.target.closest('.b2c-folder-actions')) closeFolderActionMenus();}); document.addEventListener('keydown',(event)=>{if(event.key==='Escape'){close();closeFolderActionMenus();}}); });
})();
