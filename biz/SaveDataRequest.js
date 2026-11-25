/* 병원 사용자가 접수한 데이터 처리 요청의 등록·수정·삭제와 진행 상태를 관리합니다. */
document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);
    await Store.load("dataRequests");
    let rows = Store.get("dataRequests");
    const labels = { received: "접수", working: "처리 중", done: "완료", hold: "보류" };
    const modal = $("requestModal");
    const rowImages = RowImageAttachments.create("requestImages", "requestImagePreview");

    function render() {
        const keyword = $("requestSearch").value.trim().toLowerCase();
        const status = $("statusFilter").value;
        const type = $("typeFilter").value;
        const filtered = rows.filter(item => {
            const text = [item.hospital, item.requester, item.requestContent, item.resultContent, item.assignee].join(" ").toLowerCase();
            return (!keyword || text.includes(keyword)) && (status === "all" || item.status === status) && (type === "all" || item.requestType === type);
        });
        $("requestTotal").textContent = rows.length;
        $("requestPending").textContent = rows.filter(x => x.status === "received").length;
        $("requestWorking").textContent = rows.filter(x => x.status === "working").length;
        $("requestDone").textContent = rows.filter(x => x.status === "done").length;
        $("requestRows").innerHTML = filtered.map(item => `<tr class="data-detail-row" data-detail-type="dataRequests" data-detail-id="${escapeHtml(item.id)}" tabindex="0" title="행을 선택하면 상세 내용을 볼 수 있습니다">
            <td class="mono">${escapeHtml(item.id)}</td><td><strong>${escapeHtml(item.hospital)}</strong><br><span class="muted">${escapeHtml(item.requester)}</span></td>
            <td>${escapeHtml(item.requestType)}</td><td class="wrap">${escapeHtml(item.requestContent)}</td><td class="nowrap">${escapeHtml(item.requestDate || "-")}</td>
            <td>${escapeHtml(item.assignee || "-")}</td><td><span class="status ${item.status === "done" ? "done" : "pending"}">${labels[item.status] || "접수"}</span></td>
            <td class="nowrap">${escapeHtml(item.completedAt || "-")}</td><td>${rowImages.cell(item.images)}</td><td class="nowrap"><button class="btn small secondary" data-edit="${escapeHtml(item.id)}">수정</button> <button class="btn small danger" data-delete="${escapeHtml(item.id)}">삭제</button></td></tr>`).join("");
        $("emptyRequests").hidden = filtered.length > 0;
    }
    function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
    function openForm(item = null) {
        $("requestForm").reset();
        rowImages.set(item?.images || []);
        $("modalTitle").textContent = item ? "데이터 처리 요청 수정" : "데이터 처리 요청 등록";
        $("requestId").value = item?.id ?? "";
        ["hospital", "requester", "requestType", "requestDate", "assignee", "requestStatus", "completedAt", "requestContent", "resultContent"].forEach(key => {
            const field = $(key);
            const prop = ({requestStatus:"status"})[key] || key;
            if (item && item[prop] != null) field.value = item[prop];
        });
        if (!item) { $("requestDate").value = Store.today(); $("requestStatus").value = "received"; }
        modal.classList.add("open");
    }
    function closeForm() { modal.classList.remove("open"); }
    $("addRequest").addEventListener("click", () => openForm());
    $("closeModal").addEventListener("click", closeForm);
    $("cancelModal").addEventListener("click", closeForm);
    modal.addEventListener("click", event => { if (event.target === modal) closeForm(); });
    $("requestForm").addEventListener("submit", async event => {
        event.preventDefault();
        const id = $("requestId").value || `DR-${Date.now()}`;
        const previous = rows.find(x => String(x.id) === String(id));
        const status = $("requestStatus").value;
        const item = { id, hospital:$("hospital").value.trim(), requester:$("requester").value.trim(), requestType:$("requestType").value,
            requestDate:$("requestDate").value, assignee:$("assignee").value.trim(), status,
            completedAt: status === "done" ? ($("completedAt").value || Store.today()) : $("completedAt").value,
            requestContent:$("requestContent").value.trim(), resultContent:$("resultContent").value.trim(), images:rowImages.get(),
            createdAt: previous?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() };
        if (previous) rows = rows.map(x => String(x.id) === String(id) ? item : x); else rows = [item, ...rows];
        await Store.set("dataRequests", rows); rows = Store.get("dataRequests"); closeForm(); render(); toast("요청 내용을 저장했습니다.");
    });
    $("requestRows").addEventListener("click", async event => {
        const edit = event.target.closest("[data-edit]"); const del = event.target.closest("[data-delete]");
        if (edit) { const item = rows.find(x => String(x.id) === edit.dataset.edit); if (item) openForm(item); }
        if (del && confirm("선택한 데이터 처리 요청을 삭제할까요?")) { rows = rows.filter(x => String(x.id) !== del.dataset.delete); await Store.set("dataRequests", rows); render(); toast("요청을 삭제했습니다."); }
    });
    ["requestSearch", "statusFilter", "typeFilter"].forEach(id => $(id).addEventListener("input", render));
    window.addEventListener("treehwl:data-changed", event => { if (event.detail.type === "dataRequests") { rows = Store.get("dataRequests"); render(); } });
    function toast(message) { $("requestToast").textContent = message; $("requestToast").classList.add("show"); setTimeout(() => $("requestToast").classList.remove("show"), 2200); }
    render();
});
