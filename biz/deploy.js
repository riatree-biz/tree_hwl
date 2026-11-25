/*
 * 개발·배포 관리 화면 스크립트
 * 기존 작업일지의 카테고리, 날짜, 소스, CSV, 배포완료 처리 기능을 유지합니다.
 */
document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));

    let deployments = await Store.load("deployments");
    let currentTab = "all";

    const modal = $("dModal");
    const form = $("dForm");
    const rowImages = RowImageAttachments.create("dImages", "dImagePreview");

    /* 배포 상태는 배포일자 또는 status 값으로 판단합니다. */
    const isDeployed = item => item.status === "deployed" || Boolean(item.deployDate);

    /* 저장 결과를 화면 오른쪽 아래에 표시합니다. */
    function showToast(message) {
        $("dToast").textContent = message;
        $("dToast").classList.add("show");
        window.setTimeout(() => $("dToast").classList.remove("show"), 2200);
    }

    /* 검색 조건과 탭 상태를 반영하여 작업 목록과 통계를 갱신합니다. */
    function render() {
        const completedCount = deployments.filter(isDeployed).length;
        const pendingCount = deployments.length - completedCount;

        $("dTotal").textContent = deployments.length;
        $("dPending").textContent = pendingCount;
        $("dDone").textContent = completedCount;
        $("dHospitals").textContent = new Set(deployments.map(item => item.hospital).filter(Boolean)).size;
        $("dAllN").textContent = deployments.length;
        $("dPendingN").textContent = pendingCount;
        $("dDoneN").textContent = completedCount;

        const selectedHospital = $("dHospital").value;
        const hospitals = [...new Set(deployments.map(item => item.hospital).filter(Boolean))].sort();

        $("dHospital").innerHTML = '<option value="">전체 병원</option>' +
            hospitals.map(hospital => `<option value="${escapeHtml(hospital)}">${escapeHtml(hospital)}</option>`).join("");
        $("dHospital").value = selectedHospital;

        const keyword = $("dSearch").value.trim().toLowerCase();
        const hospitalFilter = $("dHospital").value;
        const categoryFilter = $("dCategory").value;

        const rows = deployments
            .filter(item => currentTab === "all" ||
                (currentTab === "deployed" ? isDeployed(item) : !isDeployed(item)))
            .filter(item => !hospitalFilter || item.hospital === hospitalFilter)
            .filter(item => !categoryFilter || (item.categories || []).includes(categoryFilter))
            .filter(item => !keyword ||
                [
                    item.hospital, item.requester, (item.categories || []).join(" "),
                    item.requestContent, item.devContent, item.changedSource
                ].join(" ").toLowerCase().includes(keyword))
            .sort((a, b) => Number(b.id) - Number(a.id));

        $("dRows").innerHTML = rows.map(item => `
            <tr class="data-detail-row" data-detail-type="deployments" data-detail-id="${item.id}" tabindex="0" title="행을 선택하면 상세 내용을 볼 수 있습니다">
                <td>#${String(item.id).padStart(3, "0")}</td>
                <td><span class="status ${isDeployed(item) ? "done" : "pending"}">${isDeployed(item) ? "배포완료" : "배포대기"}</span></td>
                <td class="strong">${escapeHtml(item.hospital)}</td>
                <td class="request-user">${escapeHtml(item.requester)}</td>
                <td>${(item.categories || []).map(category => `<span class="tag">${escapeHtml(category)}</span>`).join(" ")}</td>
                <td class="wrap">${escapeHtml(item.requestContent)}</td>
                <td class="wrap">${escapeHtml(item.devContent) || "-"}</td>
                <td class="wrap mono">${escapeHtml(item.changedSource) || "-"}</td>
                <td>${escapeHtml(item.requestDate) || "-"}</td>
                <td>${escapeHtml(item.devDate) || "-"}</td>
                <td>${escapeHtml(item.completeDate) || "-"}</td>
                <td>${escapeHtml(item.deployDate) || "-"}</td>
                <td>${rowImages.cell(item.images)}</td>
                <td class="nowrap">
                    ${!isDeployed(item) ? `<button class="btn success small" data-deploy="${item.id}">배포완료</button>` : ""}
                    <button class="btn secondary small" data-edit="${item.id}">수정</button>
                    <button class="btn danger small" data-delete="${item.id}">삭제</button>
                </td>
            </tr>
        `).join("");

        $("dEmpty").hidden = rows.length > 0;
    }

    /* 신규 등록과 수정에 공통으로 사용하는 입력 모달을 엽니다. */
    function openModal(item = null) {
        form.reset();
        rowImages.set(item?.images || []);
        document.querySelectorAll('[name="category"]').forEach(input => {
            input.checked = false;
        });

        const nextId = Math.max(0, ...deployments.map(row => Number(row.id) || 0)) + 1;

        $("dId").value = item?.id ?? "";
        $("dModalTitle").textContent = item ? "작업 내역 수정" : "새 작업 등록";
        $("dIndex").value = `#${String(item?.id ?? nextId).padStart(3, "0")}`;
        $("dHospitalField").value = item?.hospital || "";
        $("dRequester").value = item?.requester || "";
        $("dRequest").value = item?.requestContent || "";
        $("dDevelopment").value = item?.devContent || "";
        $("dSource").value = item?.changedSource || "";
        $("dRequestDate").value = item?.requestDate || Store.today();
        $("dDevDate").value = item?.devDate || "";
        $("dCompleteDate").value = item?.completeDate || "";
        $("dDeployDate").value = item?.deployDate || "";

        (item?.categories || []).forEach(category => {
            const checkbox = document.querySelector(`[name="category"][value="${category}"]`);
            if (checkbox) checkbox.checked = true;
        });

        modal.classList.add("open");
    }

    /* 입력 모달을 닫습니다. */
    function closeModal() {
        modal.classList.remove("open");
    }

    $("addDeploy").addEventListener("click", () => openModal());
    $("dClose").addEventListener("click", closeModal);
    $("dCancel").addEventListener("click", closeModal);

    /* 폼 제출 시 신규 작업 또는 수정된 작업을 JSON 데이터에 반영합니다. */
    form.addEventListener("submit", async event => {
        event.preventDefault();

        const oldId = $("dId").value;
        const categories = [...document.querySelectorAll('[name="category"]:checked')]
            .map(input => input.value);

        if (categories.length === 0) {
            alert("구분(DB, FE, BE 등)을 하나 이상 선택해 주세요.");
            return;
        }

        const nextId = Math.max(0, ...deployments.map(item => Number(item.id) || 0)) + 1;
        const deployDate = $("dDeployDate").value;
        const item = {
            id: oldId ? Number(oldId) : nextId,
            status: deployDate ? "deployed" : "pending",
            hospital: $("dHospitalField").value.trim(),
            requester: $("dRequester").value.trim(),
            categories,
            requestContent: $("dRequest").value.trim(),
            devContent: $("dDevelopment").value.trim(),
            changedSource: $("dSource").value.trim(),
            requestDate: $("dRequestDate").value,
            devDate: $("dDevDate").value,
            completeDate: $("dCompleteDate").value,
            deployDate,
            images: rowImages.get()
        };

        if (oldId) {
            await Store.updateDeployment(item);
        } else {
            await Store.addDeployment(item);
        }

        deployments = Store.get("deployments");
        closeModal();
        render();
        showToast("작업 내역을 저장했습니다.");
    });

    /* 목록의 수정, 삭제, 배포완료 버튼을 한 곳에서 처리합니다. */
    $("dRows").addEventListener("click", async event => {
        const editButton = event.target.closest("[data-edit]");
        const deleteButton = event.target.closest("[data-delete]");
        const deployButton = event.target.closest("[data-deploy]");

        if (editButton) {
            const item = deployments.find(row => Number(row.id) === Number(editButton.dataset.edit));
            if (item) openModal(item);
        }

        if (deleteButton) {
            const id = Number(deleteButton.dataset.delete);

            if (confirm("선택한 작업 내역을 삭제하시겠습니까?")) {
                await Store.removeDeployment(id);
                deployments = Store.get("deployments");
                render();
                showToast("작업 내역을 삭제했습니다.");
            }
        }

        if (deployButton) {
            const id = Number(deployButton.dataset.deploy);
            const item = deployments.find(row => Number(row.id) === id);

            if (item && confirm(`[${item.hospital}] 작업을 오늘 날짜로 배포 완료 처리할까요?`)) {
                item.deployDate = Store.today();
                item.completeDate = item.completeDate || Store.today();
                item.status = "deployed";

                await Store.updateDeployment(item);
                deployments = Store.get("deployments");
                render();
                showToast("배포 완료 처리했습니다.");
            }
        }
    });

    /* 전체/대기/완료 탭을 전환합니다. */
    document.querySelectorAll("[data-tab]").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-tab]").forEach(tab => tab.classList.remove("active"));
            button.classList.add("active");
            currentTab = button.dataset.tab;
            render();
        });
    });

    ["dHospital", "dCategory"].forEach(id => $(id).addEventListener("change", render));
    $("dSearch").addEventListener("input", render);

    /* 기존 CSV 내보내기 기능을 유지합니다. */
    $("exportCsv").addEventListener("click", () => {
        const columns = [
            "id", "status", "hospital", "requester", "categories",
            "requestContent", "devContent", "changedSource",
            "requestDate", "devDate", "completeDate", "deployDate"
        ];
        const lines = [
            columns.join(","),
            ...deployments.map(item => columns.map(key => {
                const value = key === "categories" ? (item[key] || []).join("|") : (item[key] ?? "");
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(","))
        ];

        const blob = new Blob(["\\ufeff", lines.join("\\r\\n")], {
            type: "text/csv;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = url;
        anchor.download = "deployments.csv";
        anchor.click();

        URL.revokeObjectURL(url);
    });

    /* 데이터 관리 화면에서 변경된 경우 현재 목록을 다시 조회합니다. */
    window.addEventListener("treehwl:data-changed", event => {
        if (event.detail.type === "deployments") {
            deployments = Store.get("deployments");
            render();
        }
    });

    render();
});