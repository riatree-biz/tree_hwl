/* Shared JSON store. Browser storage is used until the user exports or connects data.json. */
(() => {
  'use strict';
  const KEY = 'treeHwlDataV2';
  let data = { inquiries: [], deployments: [] };
  let fileHandle = null;
  const normalize = raw => {
    if (Array.isArray(raw)) return { inquiries: [], deployments: raw };
    return { inquiries: Array.isArray(raw?.inquiries) ? raw.inquiries : [], deployments: Array.isArray(raw?.deployments) ? raw.deployments : [] };
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const download = (blob, name) => {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const persist = () => {
    localStorage.setItem(KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('worklog:data-changed', { detail: data }));
  };
  async function load() {
    const saved = localStorage.getItem(KEY);
    if (saved) { try { data = normalize(JSON.parse(saved)); return data; } catch (_) {} }
    try { const r = await fetch('./data.json', { cache: 'no-store' }); if (r.ok) data = normalize(await r.json()); }
    catch (_) { data = normalize({ inquiries: [], deployments: [] }); }
    persist(); return data;
  }
  async function saveJson() {
    if (fileHandle) {
      try {
        const p = await fileHandle.queryPermission({ mode: 'readwrite' });
        if (p !== 'granted' && await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('파일 쓰기 권한이 필요합니다.');
        const w = await fileHandle.createWritable(); await w.write(JSON.stringify(data, null, 2)); await w.close();
        alert('연결된 data.json 파일에 저장했습니다.'); return;
      } catch (e) { alert('파일 저장에 실패했습니다: ' + e.message); return; }
    }
    if (window.showSaveFilePicker) {
      try {
        fileHandle = await window.showSaveFilePicker({ suggestedName: 'data.json', types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }] });
        const w = await fileHandle.createWritable(); await w.write(JSON.stringify(data, null, 2)); await w.close();
        alert('data.json 파일에 저장했습니다. 다음 저장부터 연결된 파일을 갱신합니다.'); return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), 'data.json');
    alert('data.json을 다운로드했습니다. 프로젝트의 기존 파일에 덮어써 주세요.');
  }
  async function connectJson() {
    if (!window.showOpenFilePicker) { alert('파일 연결은 Chrome 또는 Edge의 보안 컨텍스트(예: localhost)에서 지원됩니다.'); return; }
    try {
      const [h] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }] });
      fileHandle = h; data = normalize(JSON.parse(await (await h.getFile()).text())); persist();
      alert('data.json 파일을 연결했습니다. 저장 버튼으로 파일에 반영할 수 있습니다.');
    } catch (e) { if (e.name !== 'AbortError') alert('JSON 파일을 열지 못했습니다: ' + e.message); }
  }
  function saveHtml() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('.backdrop').forEach(x => x.classList.remove('open'));
    download(new Blob(['<!doctype html>\n' + clone.outerHTML], { type: 'text/html;charset=utf-8' }), today() + '.html');
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-save-json]').forEach(b => b.addEventListener('click', saveJson));
    document.querySelectorAll('[data-save-html]').forEach(b => b.addEventListener('click', saveHtml));
  });
  window.Store = {
    load, get: () => data, persist, today, saveJson, connectJson,
    addInquiry: x => { data.inquiries.push(x); persist(); },
    updateInquiry: x => { const i = data.inquiries.findIndex(v => Number(v.id) === Number(x.id)); if (i >= 0) data.inquiries[i] = x; persist(); },
    removeInquiry: id => { data.inquiries = data.inquiries.filter(x => Number(x.id) !== Number(id)); persist(); },
    addDeployment: x => { data.deployments.push(x); persist(); },
    updateDeployment: x => { const i = data.deployments.findIndex(v => Number(v.id) === Number(x.id)); if (i >= 0) data.deployments[i] = x; persist(); },
    removeDeployment: id => { data.deployments = data.deployments.filter(x => Number(x.id) !== Number(id)); persist(); }
  };
})();