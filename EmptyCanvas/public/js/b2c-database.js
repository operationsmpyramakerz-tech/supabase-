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
  function folderArt(index){ const icons=['users','briefcase','heart','star','layers','folder']; return icons[index % icons.length]; }
  function render(){
    $('#b2cDatabaseCount')?.replaceChildren(document.createTextNode(String(state.databases.length)));
    $('#b2cTableCountNote')?.replaceChildren(document.createTextNode(`${state.databases.length} table${state.databases.length===1?'':'s'}`));
    $('#b2cDatabaseSummary')?.replaceChildren(document.createTextNode(state.databases.length ? 'Choose a folder to open its dedicated table page.' : 'Create your first B2C database table to begin.'));
    const target=$('#b2cDatabaseList'); if(!target)return;
    if(!state.databases.length){ target.innerHTML='<div class="b2c-folder-empty"><i data-feather="folder-plus"></i><strong>No data tables yet</strong><span>Create the first B2C table to add independent records and forms.</span></div>'; icons(); return; }
    target.innerHTML = state.databases.map((db,index)=>`<a class="b2c-folder-card" href="/b2c/database/${encodeURIComponent(db.id)}" aria-label="Open ${escapeHtml(db.name)}"><span class="b2c-folder-card__tab"></span><span class="b2c-folder-card__art"><i data-feather="${folderArt(index)}"></i></span><span class="b2c-folder-card__menu"><i data-feather="more-horizontal"></i></span><span class="b2c-folder-card__body"><strong>${escapeHtml(db.name)}</strong><span class="b2c-folder-card__description">${escapeHtml(db.description || 'No description')}</span></span><span class="b2c-folder-card__meta"><span><i data-feather="columns"></i>${Number(db.fieldCount)||0} properties</span><span><i data-feather="layers"></i>${Number(db.recordCount)||0} records</span></span></a>`).join('');
    icons();
  }
  async function load(){ const refresh=$('#b2cRefreshBtn'); try{ refresh && (refresh.disabled=true); const payload=await api('/api/b2c/databases'); state.databases=Array.isArray(payload.databases)?payload.databases:[]; render(); }catch(error){ const target=$('#b2cDatabaseList'); if(target)target.innerHTML=`<div class="b2c-folder-empty is-error"><i data-feather="alert-circle"></i><strong>Unable to load databases</strong><span>${escapeHtml(error.message||'Please refresh and try again.')}</span></div>`; message(error.message||'Unable to load B2C databases.','error'); icons(); }finally{refresh && (refresh.disabled=false);} }
  async function create(event){ event.preventDefault(); error(''); const name=clean($('#b2cNewTableName')?.value), description=clean($('#b2cNewTableDescription')?.value); if(!name)return error('Table name is required.'); const button=$('#b2cTableForm button[type="submit"]'), original=button?.innerHTML; try{if(button){button.disabled=true;button.textContent='Creating…';} const payload=await api('/api/b2c/databases',{method:'POST',body:JSON.stringify({name,description})}); const id=payload?.database?.id; close(); if(id)window.location.assign(`/b2c/database/${encodeURIComponent(id)}`); else await load(); }catch(err){error(err.message||'Could not create table.');}finally{if(button){button.disabled=false;button.innerHTML=original;icons();}} }
  document.addEventListener('DOMContentLoaded',()=>{ icons(); load(); $('#b2cRefreshBtn')?.addEventListener('click',load); $('#b2cNewTableBtn')?.addEventListener('click',()=>{ $('#b2cTableForm')?.reset(); error(''); open(); }); $('#b2cTableForm')?.addEventListener('submit',create); document.addEventListener('click',(event)=>{if(event.target.closest('[data-b2c-close="table"]')) close();}); document.addEventListener('keydown',(event)=>{if(event.key==='Escape')close();}); });
})();
