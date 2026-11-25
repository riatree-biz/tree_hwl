/* JSON 파일 설정 화면: 업무 데이터별 파일 연결, 가져오기, 저장 및 연결 해제를 담당합니다. */
document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);
    const types = ["inquiries", "deployments", "dataRequests", "checklists"];
    const labels = { inquiries:"문의 데이터", deployments:"개발·배포 데이터", dataRequests:"병원 데이터 처리 요청", checklists:"개발 반영 체크리스트" };
    const statusText = { connected:"연결됨", local:"브라우저 저장", permission:"권한 확인 필요" };
    await Store.loadAll();
    
    function refreshCounts() {
        const current = { inquiries:Store.get("inquiries"), deployments:Store.get("deployments"), dataRequests:Store.get("dataRequests"), checklists:Store.get("checklists") };
        types.forEach(type => { $(`${type}Count`).textContent = `${current[type].length}건`; });
        $("inquiryCount").textContent = current.inquiries.length;
        $("deploymentCount").textContent = current.deployments.length;
        $("requestCount").textContent = current.dataRequests.length;
        $("checklistCount").textContent = current.checklists.length;
        $("totalCount").textContent = current.inquiries.length + current.deployments.length + current.dataRequests.length + current.checklists.length;
    }
    function updateStatus(type, status, message) {
        const el = $(`${type}Status`); el.textContent = statusText[status] || "미연결"; el.className = `file-status ${status}`;
        $("lastMessage").textContent = message || "상태가 갱신되었습니다.";
        let row = document.getElementById(`${type}-status-row`);
        if (!row) { row = document.createElement("tr"); row.id = `${type}-status-row`; $("statusRows").appendChild(row); }
        row.innerHTML = `<td>${labels[type]}</td><td>${Store.FILES[type].fileName}</td><td>${statusText[status] || "미연결"}</td><td>${message || "-"}</td>`;
    }
    document.querySelectorAll("[data-connect]").forEach(button => button.addEventListener("click", async () => {
        const type = button.dataset.connect;
        try { await Store.connect(type); refreshCounts(); updateStatus(type,"connected",`${Store.FILES[type].fileName} 연결 완료`); toast("JSON 파일을 연결했습니다."); }
        catch (error) { if (error.name !== "AbortError") alert(`파일 연결 실패: ${error.message}`); }
    }));
    document.querySelectorAll("[data-import]").forEach(button => button.addEventListener("click", () => document.querySelector(`[data-file="${button.dataset.import}"]`).click()));
    document.querySelectorAll("[data-file]").forEach(input => input.addEventListener("change", async () => {
        const type = input.dataset.file; const file = input.files[0]; if (!file) return;
        try { await Store.importFile(type,file); refreshCounts(); updateStatus(type,"local",`${file.name} 불러오기 완료`); toast("JSON 데이터를 불러왔습니다."); }
        catch (error) { alert(`JSON 불러오기 실패: ${error.message}`); } finally { input.value=""; }
    }));
    document.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", async () => {
        const type = button.dataset.save;
        try { await Store.save(type); updateStatus(type,"connected",`${Store.FILES[type].fileName} 저장 완료`); toast("JSON 파일을 저장했습니다."); }
        catch (error) { if (error.name !== "AbortError") alert(`JSON 저장 실패: ${error.message}`); }
    }));
    document.querySelectorAll("[data-disconnect]").forEach(button => button.addEventListener("click", async () => {
        const type = button.dataset.disconnect;
        if (!confirm(`${Store.FILES[type].fileName} 연결을 해제할까요? 파일은 삭제되지 않습니다.`)) return;
        await Store.disconnect(type); updateStatus(type,"local","연결 해제됨 · 브라우저 저장 데이터는 유지됩니다.");
    }));
    window.addEventListener("treehwl:storage", event => updateStatus(event.detail.type,event.detail.status,event.detail.message));
    types.forEach(type => updateStatus(type,"local","브라우저 저장소 기준으로 준비됨"));
    refreshCounts();
    function toast(message) { $("dataToast").textContent=message; $("dataToast").classList.add("show"); setTimeout(() => $("dataToast").classList.remove("show"),2200); }
});
