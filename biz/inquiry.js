/*
 * 문의 관리 화면 스크립트
 * 문의 목록 조회, 검색, 필터, 등록, 수정, 삭제 기능을 담당합니다.
 */
document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));

    let inquiries = await Store.load("inquiries");
    let currentFilter = "all";

    const modal = $("qModal");
    const form = $("qForm");
    const rowImages = RowImageAttachments.create("qImages", "qImagePreview");

    /* 사용자에게 저장 결과를 잠깐 보여주는 알림입니다. */
    function showToast(message) {
        $("toast").textContent = message;
        $("toast").classList.add("show");
        window.setTimeout(() => $("toast").classList.remove("show"), 2200);
    }

    /* 현재 필터와 검색어를 기준으로 문의 목록과 통계를 다시 그립니다. */
    function render() {
        const completedCount = inquiries.filter(item => item.completed).length;
        const pendingCount = inquiries.length - completedCount;

        $("qTotal").textContent = inquiries.length;
        $("qPending").textContent = pendingCount;
        $("qDone").textContent = completedCount;
        $("qHospitals").textContent = new Set(inquiries.map(item => item.hospital).filter(Boolean)).size;
        $("qAllN").textContent = inquiries.length;
        $("qPendingN").textContent = pendingCount;
        $("qDoneN").textContent = completedCount;

        const selectedHospital = $("qHospital").value;
        const hospitals = [...new Set(inquiries.map(item => item.hospital).filter(Boolean))].sort();

        $("qHospital").innerHTML = '<option value="">전체 병원</option>' +
            hospitals.map(hospital => `<option value="${escapeHtml(hospital)}">${escapeHtml(hospital)}</option>`).join("");
        $("qHospital").value = selectedHospital;

        const keyword = $("qSearch").value.trim().toLowerCase();
        const hospitalFilter = $("qHospital").value;

        const rows = inquiries
            .filter(item => currentFilter === "all" ||
                (currentFilter === "done" ? item.completed : !item.completed))
            .filter(item => !hospitalFilter || item.hospital === hospitalFilter)
            .filter(item => !keyword ||
                [item.hospital, item.requester, item.content, item.answer].join(" ").toLowerCase().includes(keyword))
            .sort((a, b) => Number(b.id) - Number(a.id));

        $("qRows").innerHTML = rows.map(item => `
            <tr class="data-detail-row" data-detail-type="inquiries" data-detail-id="${item.id}" tabindex="0" title="행을 선택하면 상세 내용을 볼 수 있습니다">
                <td>#${String(item.id).padStart(3, "0")}</td>
                <td><span class="status ${item.completed ? "done" : "pending"}">${item.completed ? "완료" : "미완료"}</span></td>
                <td class="strong">${escapeHtml(item.hospital)}</td>
                <td>${escapeHtml(item.requester)}</td>
                <td class="wrap">${escapeHtml(item.content)}</td>
                <td class="wrap">${escapeHtml(item.answer) || "-"}</td>
                <td>${escapeHtml(item.inquiryDate)}</td>
                <td>${escapeHtml(item.processDate) || "-"}</td>
                <td>${rowImages.cell(item.images)}</td>
                <td class="nowrap">
                    <button class="btn secondary small" data-edit="${item.id}">수정</button>
                    <button class="btn danger small" data-delete="${item.id}">삭제</button>
                </td>
            </tr>
        `).join("");

        $("qEmpty").hidden = rows.length > 0;
    }

    /* 신규 등록 또는 기존 문의 수정에 사용할 모달을 엽니다. */
    function openModal(item = null) {
        form.reset();
        rowImages.set(item?.images || []);

        $("qId").value = item?.id ?? "";
        $("qModalTitle").textContent = item ? "문의 수정" : "문의 등록";
        $("qHospitalField").value = item?.hospital || "";
        $("qRequester").value = item?.requester || "";
        $("qContent").value = item?.content || "";
        $("qAnswer").value = item?.answer || "";
        $("qDate").value = item?.inquiryDate || Store.today();
        $("qProcessDate").value = item?.processDate || "";
        $("qCompleted").checked = Boolean(item?.completed);

        modal.classList.add("open");
    }

    /* 모달을 닫습니다. */
    function closeModal() {
        modal.classList.remove("open");
    }

    /* 등록 버튼과 모달의 닫기/취소 버튼을 연결합니다. */
    $("addInquiry").addEventListener("click", () => openModal());
    $("qClose").addEventListener("click", closeModal);
    $("qCancel").addEventListener("click", closeModal);

    /* 폼 제출 시 신규 등록 또는 기존 데이터 수정을 수행합니다. */
    form.addEventListener("submit", async event => {
        event.preventDefault();

        const oldId = $("qId").value;
        const nextId = Math.max(0, ...inquiries.map(item => Number(item.id) || 0)) + 1;
        const item = {
            id: oldId ? Number(oldId) : nextId,
            hospital: $("qHospitalField").value.trim(),
            requester: $("qRequester").value.trim(),
            content: $("qContent").value.trim(),
            answer: $("qAnswer").value.trim(),
            inquiryDate: $("qDate").value,
            processDate: $("qProcessDate").value,
            completed: $("qCompleted").checked,
            images: rowImages.get()
        };

        if (item.completed && !item.processDate) {
            item.processDate = Store.today();
        }

        if (oldId) {
            await Store.updateInquiry(item);
        } else {
            await Store.addInquiry(item);
        }

        inquiries = Store.get("inquiries");
        closeModal();
        render();
        showToast("문의 데이터가 저장되었습니다.");
    });

    /* 목록의 수정/삭제 버튼은 이벤트 위임 방식으로 처리합니다. */
    $("qRows").addEventListener("click", async event => {
        const editButton = event.target.closest("[data-edit]");
        const deleteButton = event.target.closest("[data-delete]");

        if (editButton) {
            const item = inquiries.find(row => Number(row.id) === Number(editButton.dataset.edit));
            if (item) openModal(item);
        }

        if (deleteButton) {
            const id = Number(deleteButton.dataset.delete);

            if (confirm("선택한 문의사항을 삭제하시겠습니까?")) {
                await Store.removeInquiry(id);
                inquiries = Store.get("inquiries");
                render();
                showToast("문의사항을 삭제했습니다.");
            }
        }
    });

    /* 전체/미완료/완료 탭을 전환합니다. */
    document.querySelectorAll("[data-filter]").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-filter]").forEach(tab => tab.classList.remove("active"));
            button.classList.add("active");
            currentFilter = button.dataset.filter;
            render();
        });
    });

    $("qSearch").addEventListener("input", render);
    $("qHospital").addEventListener("change", render);

    /* 저장 요청 화면이나 다른 탭에서 데이터가 갱신되면 현재 목록도 최신화합니다. */
    window.addEventListener("treehwl:data-changed", event => {
        if (event.detail.type === "inquiries") {
            inquiries = Store.get("inquiries");
            render();
        }
    });

    render();
});