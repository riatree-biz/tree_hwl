document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data = await Store.load(), filter = 'all';
  const modal = $('qModal'), form = $('qForm');
  const toast = msg => { $('toast').textContent = msg; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 2200); };
  function render() {
    const all = data.inquiries, done = all.filter(x => x.completed).length, pending = all.length - done;
    $('qTotal').textContent = all.length; $('qPending').textContent = pending; $('qDone').textContent = done;
    $('qHospitals').textContent = new Set(all.map(x => x.hospital).filter(Boolean)).size;
    $('qAllN').textContent = all.length; $('qPendingN').textContent = pending; $('qDoneN').textContent = done;
    const old = $('qHospital').value, hospitals = [...new Set(all.map(x => x.hospital).filter(Boolean))].sort();
    $('qHospital').innerHTML = '<option value="">전체 병원</option>' + hospitals.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join(''); $('qHospital').value = old;
    const kw = $('qSearch').value.trim().toLowerCase(), hospital = $('qHospital').value;
    const rows = all.filter(x => (filter === 'all' || (filter === 'done' ? x.completed : !x.completed)) && (!hospital || x.hospital === hospital) && (!kw || [x.hospital,x.requester,x.content,x.answer].join(' ').toLowerCase().includes(kw))).sort((a,b) => b.id-a.id);
    $('qRows').innerHTML = rows.map(x => `<tr><td>#${String(x.id).padStart(3,'0')}</td><td><span class="status ${x.completed?'done':'pending'}">${x.completed?'완료':'미완료'}</span></td><td class="strong">${esc(x.hospital)}</td><td>${esc(x.requester)}</td><td class="wrap">${esc(x.content)}</td><td class="wrap">${esc(x.answer)||'-'}</td><td>${esc(x.inquiryDate)}</td><td>${esc(x.processDate)||'-'}</td><td class="nowrap"><button class="btn secondary small" data-edit="${x.id}">수정</button> <button class="btn danger small" data-delete="${x.id}">삭제</button></td></tr>`).join('');
    $('qEmpty').hidden = rows.length !== 0;
  }
  function open(x) {
    form.reset(); $('qId').value = x?.id ?? ''; $('qModalTitle').textContent = x ? '문의 수정' : '문의 등록';
    $('qHospitalField').value = x?.hospital || ''; $('qRequester').value = x?.requester || ''; $('qContent').value = x?.content || ''; $('qAnswer').value = x?.answer || '';
    $('qDate').value = x?.inquiryDate || Store.today(); $('qProcessDate').value = x?.processDate || ''; $('qCompleted').checked = !!x?.completed; modal.classList.add('open');
  }
  const close = () => modal.classList.remove('open');
  $('addInquiry').addEventListener('click', () => open()); $('qClose').addEventListener('click', close); $('qCancel').addEventListener('click', close);
  form.addEventListener('submit', e => {
    e.preventDefault(); const oldId = $('qId').value;
    const item = { id: oldId ? Number(oldId) : Math.max(0,...data.inquiries.map(x=>Number(x.id)||0))+1, hospital: $('qHospitalField').value.trim(), requester: $('qRequester').value.trim(), content: $('qContent').value.trim(), answer: $('qAnswer').value.trim(), inquiryDate: $('qDate').value, processDate: $('qProcessDate').value, completed: $('qCompleted').checked };
    if (item.completed && !item.processDate) item.processDate = Store.today();
    if (oldId) Store.updateInquiry(item); else Store.addInquiry(item);
    data = Store.get(); close(); render(); toast('문의사항이 저장되었습니다.');
  });
  $('qRows').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-delete]');
    if (edit) { const x = data.inquiries.find(v => Number(v.id) === Number(edit.dataset.edit)); if (x) open(x); }
    if (del) { const id = Number(del.dataset.delete); if (confirm('선택한 문의사항을 삭제하시겠습니까?')) { Store.removeInquiry(id); data = Store.get(); render(); toast('문의사항을 삭제했습니다.'); } }
  });
  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active')); b.classList.add('active'); filter=b.dataset.filter; render(); }));
  $('qSearch').addEventListener('input', render); $('qHospital').addEventListener('change', render);
  render();
});