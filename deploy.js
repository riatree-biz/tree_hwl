document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id), esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data = await Store.load(), tab = 'all'; const modal = $('dModal'), form = $('dForm');
  const toast = msg => { $('dToast').textContent=msg; $('dToast').classList.add('show'); setTimeout(()=>$('dToast').classList.remove('show'),2200); };
  const deployed = x => x.status === 'deployed' || !!x.deployDate;
  function render() {
    const all=data.deployments, done=all.filter(deployed).length, pending=all.length-done;
    $('dTotal').textContent=all.length; $('dPending').textContent=pending; $('dDone').textContent=done; $('dHospitals').textContent=new Set(all.map(x=>x.hospital).filter(Boolean)).size;
    $('dAllN').textContent=all.length; $('dPendingN').textContent=pending; $('dDoneN').textContent=done;
    const prev=$('dHospital').value, hospitals=[...new Set(all.map(x=>x.hospital).filter(Boolean))].sort();
    $('dHospital').innerHTML='<option value="">전체 병원</option>'+hospitals.map(h=>`<option>${esc(h)}</option>`).join(''); $('dHospital').value=prev;
    const kw=$('dSearch').value.trim().toLowerCase(), h=$('dHospital').value, cat=$('dCategory').value;
    const rows=all.filter(x=>(tab==='all'||(tab==='deployed'?deployed(x):!deployed(x)))&&(!h||x.hospital===h)&&(!cat||(x.categories||[]).includes(cat))&&(!kw||[x.hospital,x.requester,(x.categories||[]).join(' '),x.requestContent,x.devContent,x.changedSource].join(' ').toLowerCase().includes(kw))).sort((a,b)=>b.id-a.id);
    $('dRows').innerHTML=rows.map(x=>`<tr><td>#${String(x.id).padStart(3,'0')}</td><td><span class="status ${deployed(x)?'done':'pending'}">${deployed(x)?'배포완료':'배포대기'}</span></td><td class="strong">${esc(x.hospital)}</td><td>${esc(x.requester)}</td><td>${(x.categories||[]).map(c=>`<span class="tag">${esc(c)}</span>`).join(' ')}</td><td class="wrap">${esc(x.requestContent)}</td><td class="wrap">${esc(x.devContent)||'-'}</td><td class="wrap mono">${esc(x.changedSource)||'-'}</td><td>${esc(x.requestDate)||'-'}</td><td>${esc(x.devDate)||'-'}</td><td>${esc(x.completeDate)||'-'}</td><td>${esc(x.deployDate)||'-'}</td><td class="nowrap">${!deployed(x)?`<button class="btn success small" data-deploy="${x.id}">배포완료</button> `:''}<button class="btn secondary small" data-edit="${x.id}">수정</button> <button class="btn danger small" data-delete="${x.id}">삭제</button></td></tr>`).join('');
    $('dEmpty').hidden=rows.length!==0;
  }
  function open(x) {
    form.reset(); document.querySelectorAll('[name="category"]').forEach(c=>c.checked=false);
    $('dId').value=x?.id??''; $('dModalTitle').textContent=x?'작업 내역 수정':'새 작업 등록';
    $('dIndex').value='#'+String(x?.id??(Math.max(0,...data.deployments.map(v=>Number(v.id)||0))+1)).padStart(3,'0');
    $('dHospitalField').value=x?.hospital||''; $('dRequester').value=x?.requester||''; $('dRequest').value=x?.requestContent||''; $('dDevelopment').value=x?.devContent||''; $('dSource').value=x?.changedSource||'';
    $('dRequestDate').value=x?.requestDate||Store.today(); $('dDevDate').value=x?.devDate||''; $('dCompleteDate').value=x?.completeDate||''; $('dDeployDate').value=x?.deployDate||'';
    (x?.categories||[]).forEach(c=>{const el=document.querySelector(`[name="category"][value="${c}"]`);if(el)el.checked=true;}); modal.classList.add('open');
  }
  const close=()=>modal.classList.remove('open');
  $('addDeploy').addEventListener('click',()=>open()); $('dClose').addEventListener('click',close); $('dCancel').addEventListener('click',close);
  form.addEventListener('submit',e=>{
    e.preventDefault(); const id=$('dId').value, cats=[...document.querySelectorAll('[name="category"]:checked')].map(x=>x.value);
    if(!cats.length){alert('구분(DB, FE, BE 등)을 하나 이상 선택해주세요.');return;}
    const deployDate=$('dDeployDate').value, item={id:id?Number(id):Math.max(0,...data.deployments.map(x=>Number(x.id)||0))+1,status:deployDate?'deployed':'pending',hospital:$('dHospitalField').value.trim(),requester:$('dRequester').value.trim(),categories:cats,requestContent:$('dRequest').value.trim(),devContent:$('dDevelopment').value.trim(),changedSource:$('dSource').value.trim(),requestDate:$('dRequestDate').value,devDate:$('dDevDate').value,completeDate:$('dCompleteDate').value,deployDate};
    if(id)Store.updateDeployment(item);else Store.addDeployment(item); data=Store.get(); close(); render(); toast('작업 내역을 저장했습니다.');
  });
  $('dRows').addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]'),dep=e.target.closest('[data-deploy]');
    if(edit){const x=data.deployments.find(v=>Number(v.id)===Number(edit.dataset.edit));if(x)open(x);}
    if(del){const id=Number(del.dataset.delete);if(confirm('선택한 작업 내역을 삭제하시겠습니까?')){Store.removeDeployment(id);data=Store.get();render();toast('작업 내역을 삭제했습니다.');}}
    if(dep){const id=Number(dep.dataset.deploy),x=data.deployments.find(v=>Number(v.id)===id);if(x&&confirm(`[${x.hospital}] 작업을 오늘 날짜로 배포 완료 처리할까요?`)){x.deployDate=Store.today();x.completeDate=x.completeDate||Store.today();x.status='deployed';Store.updateDeployment(x);data=Store.get();render();toast('배포 완료 처리했습니다.');}}
  });
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');tab=b.dataset.tab;render();}));
  ['dHospital','dCategory'].forEach(id=>$(id).addEventListener('change',render)); $('dSearch').addEventListener('input',render);
  $('exportCsv').addEventListener('click',()=>{const cols=['id','status','hospital','requester','categories','requestContent','devContent','changedSource','requestDate','devDate','completeDate','deployDate'];const lines=[cols.join(','),...data.deployments.map(x=>cols.map(k=>'"'+String(k==='categories'?(x[k]||[]).join('|'):(x[k]??'')).replace(/"/g,'""')+'"').join(','))];const blob=new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download='deployments.csv';a.click();URL.revokeObjectURL(u);});
  render();
});