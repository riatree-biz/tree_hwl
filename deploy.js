/**
 * deploy.js
 * data.json 기반 개발 및 배포 작업일지 관리 컨트롤러
 */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  let records = [];
  let currentTab = 'all';

  const tbody = document.getElementById('worklogTbody');
  const emptyState = document.getElementById('emptyState');
  const filterHospital = document.getElementById('filterHospital');
  const filterCategory = document.getElementById('filterCategory');
  const filterSearch = document.getElementById('filterSearch');
  const hospitalDatalist = document.getElementById('hospitalDatalist');

  const formModal = document.getElementById('formModalBackdrop');
  const worklogForm = document.getElementById('worklogForm');
  const toastBanner = document.getElementById('toastBanner');

  const getTodayStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatIndex = (id) => `#${String(id).padStart(3, '0')}`;

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  let toastTimer = null;
  const showToast = (msg) => {
    toastBanner.textContent = msg;
    toastBanner.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBanner.classList.remove('is-visible');
    }, 2800);
  };

  // 1. data.json 파일 불러오기
  const loadDataJson = async () => {
    try {
      const response = await fetch('./data.json');
      if (!response.ok) throw new Error('data.json 파일을 찾을 수 없습니다.');
      records = await response.json();
      renderTable();
    } catch (error) {
      console.error(error);
      alert('data.json 로드 실패. 로컬 서버(Live Server 등) 환경에서 실행 중이신지 확인해주세요.');
      records = [];
      renderTable();
    }
  };

  const syncHospitalOptions = () => {
    const hospitals = [...new Set(records.map((r) => (r.hospital || '').trim()).filter(Boolean))].sort();
    const prevSelected = filterHospital.value;

    filterHospital.innerHTML = '<option value="">전체 병원</option>';
    hospitalDatalist.innerHTML = '';

    hospitals.forEach((h) => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      filterHospital.appendChild(opt);

      const dataOpt = document.createElement('option');
      dataOpt.value = h;
      hospitalDatalist.appendChild(dataOpt);
    });

    if (hospitals.includes(prevSelected)) {
      filterHospital.value = prevSelected;
    }
  };

  const renderTable = () => {
    syncHospitalOptions();

    const total = records.length;
    let deployedCount = 0;
    let pendingCount = 0;
    const hospitalSet = new Set();

    const hFilter = filterHospital.value;
    const cFilter = filterCategory.value;
    const keyword = filterSearch.value.trim().toLowerCase();

    const filtered = records.filter((r) => {
      const isDeployed = r.status === 'deployed' || Boolean(r.deployDate);
      if (isDeployed) deployedCount++;
      else pendingCount++;

      if (r.hospital) hospitalSet.add(r.hospital.trim());

      if (currentTab === 'pending' && isDeployed) return false;
      if (currentTab === 'deployed' && !isDeployed) return false;
      if (hFilter && r.hospital !== hFilter) return false;
      if (cFilter && !(r.categories || []).includes(cFilter)) return false;

      if (keyword) {
        const blob = [
          formatIndex(r.id),
          r.hospital,
          r.requester,
          (r.categories || []).join(' '),
          r.requestContent,
          r.devContent,
          r.changedSource
        ].join(' ').toLowerCase();
        if (!blob.includes(keyword)) return false;
      }
      return true;
    }).sort((a, b) => b.id - a.id);

    document.getElementById('kpiTotal').textContent = String(total);
    document.getElementById('kpiPending').textContent = String(pendingCount);
    document.getElementById('kpiDeployed').textContent = String(deployedCount);
    document.getElementById('kpiHospitals').textContent = String(hospitalSet.size);

    document.getElementById('tabCountAll').textContent = String(total);
    document.getElementById('tabCountPending').textContent = String(pendingCount);
    document.getElementById('tabCountDeployed').textContent = String(deployedCount);

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    filtered.forEach((item) => {
      const isDeployed = item.status === 'deployed' || Boolean(item.deployDate);
      const tr = document.createElement('tr');

      const tagsHtml = (item.categories || [])
        .map((cat) => `<span class="tag-badge tag-badge--${escapeHtml(cat)}">${escapeHtml(cat)}</span>`)
        .join('');

      const statusHtml = isDeployed
        ? '<span class="status-badge status-badge--deployed">배포완료</span>'
        : '<span class="status-badge status-badge--pending">배포대기</span>';

      const sourceHtml = item.changedSource
        ? `<div class="source-box">${escapeHtml(item.changedSource)}</div>`
        : '<span style="color:var(--text-muted)">-</span>';

      const deployBtnHtml = !isDeployed
        ? '<button type="button" class="btn btn--success btn--sm" data-action="deploy" data-id="' + item.id + '">배포완료</button> '
        : '';

      tr.innerHTML = `
        <td class="col-idx">${formatIndex(item.id)}</td>
        <td>${statusHtml}</td>
        <td class="col-hospital">${escapeHtml(item.hospital)}</td>
        <td class="col-requester">${escapeHtml(item.requester)}</td>
        <td><div class="tag-list">${tagsHtml}</div></td>
        <td class="col-text">${escapeHtml(item.requestContent)}</td>
        <td class="col-text">${escapeHtml(item.devContent) || '<span style="color:var(--text-muted)">-</span>'}</td>
        <td class="col-source">${sourceHtml}</td>
        <td class="col-dates">${escapeHtml(item.requestDate) || '-'}</td>
        <td class="col-dates">${escapeHtml(item.devDate) || '-'}</td>
        <td class="col-dates">${escapeHtml(item.completeDate) || '-'}</td>
        <td class="col-dates" style="${isDeployed ? 'color:var(--success);font-weight:700;' : ''}">${escapeHtml(item.deployDate) || '-'}</td>
        <td class="col-actions">
          ${deployBtnHtml}<button type="button" class="btn btn--secondary btn--sm" data-action="edit" data-id="${item.id}">수정</button>
          <button type="button" class="btn btn--danger-ghost btn--sm" data-action="delete" data-id="${item.id}">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  };

  // 모달 제어
  const openModal = (record = null) => {
    worklogForm.reset();
    document.querySelectorAll('input[name="category"]').forEach((cb) => (cb.checked = false));

    if (record) {
      document.getElementById('modalTitle').textContent = `작업 내역 수정 (${formatIndex(record.id)})`;
      document.getElementById('fieldId').value = record.id;
      document.getElementById('fieldIndexDisplay').value = formatIndex(record.id);
      document.getElementById('fieldHospital').value = record.hospital || '';
      document.getElementById('fieldRequester').value = record.requester || '';
      document.getElementById('fieldRequestContent').value = record.requestContent || '';
      document.getElementById('fieldDevContent').value = record.devContent || '';
      document.getElementById('fieldChangedSource').value = record.changedSource || '';
      document.getElementById('fieldRequestDate').value = record.requestDate || '';
      document.getElementById('fieldDevDate').value = record.devDate || '';
      document.getElementById('fieldCompleteDate').value = record.completeDate || '';
      document.getElementById('fieldDeployDate').value = record.deployDate || '';

      (record.categories || []).forEach((cat) => {
        const cb = document.querySelector(`input[name="category"][value="${cat}"]`);
        if (cb) cb.checked = true;
      });
    } else {
      const nextId = records.length > 0 ? Math.max(...records.map((r) => r.id)) + 1 : 1;
      document.getElementById('modalTitle').textContent = '새 개발/배포 작업 등록';
      document.getElementById('fieldId').value = '';
      document.getElementById('fieldIndexDisplay').value = formatIndex(nextId);
      document.getElementById('fieldRequestDate').value = getTodayStr();
    }

    formModal.classList.add('is-open');
  };

  const closeModal = () => formModal.classList.remove('is-open');

  worklogForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedCategories = Array.from(
      document.querySelectorAll('input[name="category"]:checked')
    ).map((el) => el.value);

    if (selectedCategories.length === 0) {
      alert('구분(DB, FE, BE 등)을 최소 1개 이상 선택해주세요.');
      return;
    }

    const editId = document.getElementById('fieldId').value;
    const deployVal = document.getElementById('fieldDeployDate').value;

    const payload = {
      id: editId ? Number(editId) : (records.length > 0 ? Math.max(...records.map((r) => r.id)) + 1 : 1),
      status: deployVal ? 'deployed' : 'pending',
      hospital: document.getElementById('fieldHospital').value.trim(),
      requester: document.getElementById('fieldRequester').value.trim(),
      categories: selectedCategories,
      requestContent: document.getElementById('fieldRequestContent').value.trim(),
      devContent: document.getElementById('fieldDevContent').value.trim(),
      changedSource: document.getElementById('fieldChangedSource').value.trim(),
      requestDate: document.getElementById('fieldRequestDate').value,
      devDate: document.getElementById('fieldDevDate').value,
      completeDate: document.getElementById('fieldCompleteDate').value,
      deployDate: deployVal
    };

    if (editId) {
      const idx = records.findIndex((r) => r.id === Number(editId));
      if (idx !== -1) records[idx] = payload;
      showToast(`${formatIndex(payload.id)} 작업 내역이 수정되었습니다.`);
    } else {
      records.push(payload);
      showToast(`${formatIndex(payload.id)} 새 작업이 추가되었습니다.`);
    }

    closeModal();
    renderTable();
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    const target = records.find((r) => r.id === id);
    if (!target) return;

    if (action === 'deploy') {
      const today = getTodayStr();
      if (confirm(`[${formatIndex(id)} ${target.hospital}] 건을 오늘(${today}) 날짜로 배포 완료 처리하시겠습니까?`)) {
        if (!target.completeDate) target.completeDate = today;
        target.deployDate = today;
        target.status = 'deployed';
        renderTable();
        showToast(`${formatIndex(id)} 배포 완료 처리되었습니다.`);
      }
    } else if (action === 'edit') {
      openModal(target);
    } else if (action === 'delete') {
      if (confirm(`[${formatIndex(id)} ${target.hospital}] 작업 내역을 삭제하시겠습니까?`)) {
        records = records.filter((r) => r.id !== id);
        renderTable();
        showToast(`${formatIndex(id)} 작업 내역이 삭제되었습니다.`);
      }
    }
  });

  // 탭 및 필터
  document.querySelectorAll('.tab-btn').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      currentTab = tab.dataset.tab;
      renderTable();
    });
  });

  filterHospital.addEventListener('change', renderTable);
  filterCategory.addEventListener('change', renderTable);
  filterSearch.addEventListener('input', renderTable);

  document.getElementById('btnOpenNew').addEventListener('click', () => openModal());
  document.getElementById('btnEmptyNew').addEventListener('click', () => openModal());
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeModal);

  // ★ data.json 파일로 내보내기 (덮어쓰기 저장)
  document.getElementById('btnSaveDataJson').addEventListener('click', () => {
    const jsonStr = JSON.stringify(records, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json'; // 파일명을 data.json으로 지정
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('data.json 파일이 생성되었습니다. 기존 data.json에 덮어쓰기 하세요.');
  });

  // 초기 구동: data.json 로드
  loadDataJson();
});