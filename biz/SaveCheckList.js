/*
 * 체크리스트 관리 화면
 * 체크 항목의 일정, 환경별 반영 여부, 첨부 이미지를 등록·조회·수정·삭제합니다.
 */
document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);

    // 화면 진입 시 저장된 체크리스트 데이터를 불러옵니다.
    let rows = await Store.load("checklists");
    const modal = $("cModal");
    const form = $("cForm");

    // 현재 등록/수정 중인 행에 연결된 이미지만 메모리에서 관리합니다.
    let attachedImages = [];
    const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024;
    const MAX_IMAGES = 5;

    // 사용자 입력값을 HTML에 출력할 때 특수문자를 이스케이프합니다.
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));

    // 세 환경 중 반영 완료된 개수를 기준으로 상태를 계산합니다.
    const getCompletedEnvironmentCount = item =>
        [item.dev, item.staging, item.production].filter(Boolean).length;

    function getStatus(item) {
        const completedCount = getCompletedEnvironmentCount(item);

        if (completedCount === 3) return "done";
        if (completedCount > 0) return "partial";
        return "pending";
    }

    /* 검색어와 상태 필터를 반영해 목록과 상단 통계를 갱신합니다. */
    function render() {
        const keyword = $("cSearch").value.trim().toLowerCase();
        const filter = $("cFilter").value;

        const doneCount = rows.filter(item => getStatus(item) === "done").length;
        const partialCount = rows.filter(item => getStatus(item) === "partial").length;
        const pendingCount = rows.length - doneCount - partialCount;

        $("cTotal").textContent = rows.length;
        $("cDone").textContent = doneCount;
        $("cPartial").textContent = partialCount;
        $("cPending").textContent = pendingCount;

        const filteredRows = rows
            .filter(item => {
                const searchableText = [item.title, item.memo].join(" ").toLowerCase();
                const matchesKeyword = !keyword || searchableText.includes(keyword);
                const matchesStatus = filter === "all" || getStatus(item) === filter;
                return matchesKeyword && matchesStatus;
            })
            .sort((a, b) => Number(b.id) - Number(a.id));

        $("cRows").innerHTML = filteredRows.map(item => {
            const itemStatus = getStatus(item);
            const statusLabel = {
                done: "전체 완료",
                partial: "일부 반영",
                pending: "미반영"
            }[itemStatus];

            return `
                <tr
                    class="data-detail-row"
                    data-detail-type="checklists"
                    data-detail-id="${item.id}"
                    tabindex="0"
                    title="행을 선택하면 상세 내용을 볼 수 있습니다"
                >
                    <td>#${String(item.id).padStart(3, "0")}</td>
                    <td class="wrap strong">${esc(item.title)}</td>
                    <td>${esc(item.startDate || "-")}</td>
                    <td>${esc(item.endDate || "-")}</td>
                    <td>${esc(item.releaseDate || "-")}</td>
                    <td>${renderEnvironmentStatus(item.dev)}</td>
                    <td>${renderEnvironmentStatus(item.staging)}</td>
                    <td>${renderEnvironmentStatus(item.production)}</td>
                    <td>${renderRowImages(item.images || [])}</td>
                    <td><span class="status ${itemStatus}">${statusLabel}</span></td>
                    <td class="nowrap">
                        <button class="btn secondary small" data-edit="${item.id}">수정</button>
                        <button class="btn danger small" data-delete="${item.id}">삭제</button>
                    </td>
                </tr>
            `;
        }).join("");

        $("cEmpty").hidden = filteredRows.length > 0;
    }

    // 환경별 반영 상태를 공통된 배지 형태로 출력합니다.
    function renderEnvironmentStatus(isCompleted) {
        return isCompleted
            ? '<span class="status done">완료</span>'
            : '<span class="status pending">미반영</span>';
    }

    /* 신규 등록 또는 기존 항목 수정을 위한 입력 모달을 엽니다. */
    function openForm(item = null) {
        form.reset();

        // 수정인 경우 기존 첨부 이미지를 유지하고, 신규 등록이면 빈 배열을 사용합니다.
        attachedImages = (item?.images || []).slice();
        renderImagePreview();
        $("cImages").value = "";

        $("cId").value = item?.id ?? "";
        $("cModalTitle").textContent = item ? "체크리스트 수정" : "체크리스트 등록";
        $("cTitle").value = item?.title || "";
        $("cStart").value = item?.startDate || "";
        $("cEnd").value = item?.endDate || "";
        $("cRelease").value = item?.releaseDate || "";
        $("cDev").checked = Boolean(item?.dev);
        $("cStage").checked = Boolean(item?.staging);
        $("cProd").checked = Boolean(item?.production);
        $("cMemo").value = item?.memo || "";

        modal.classList.add("open");
    }

    // 모달을 닫습니다. 저장하지 않은 변경 사항은 데이터에 반영되지 않습니다.
    function closeForm() {
        modal.classList.remove("open");
    }

    // 등록 버튼과 모달의 닫기/취소 버튼을 연결합니다.
    $("addChecklist").addEventListener("click", () => openForm());
    $("cClose").addEventListener("click", closeForm);
    $("cCancel").addEventListener("click", closeForm);

    /* 폼 제출 시 입력값을 검증한 뒤 JSON 저장소에 신규/수정 데이터를 반영합니다. */
    form.addEventListener("submit", async event => {
        event.preventDefault();

        const oldId = $("cId").value;
        const previousItem = rows.find(item => String(item.id) === String(oldId));
        const now = new Date().toISOString();

        const item = {
            id: oldId
                ? Number(oldId)
                : Math.max(0, ...rows.map(row => Number(row.id) || 0)) + 1,
            title: $("cTitle").value.trim(),
            startDate: $("cStart").value,
            endDate: $("cEnd").value,
            releaseDate: $("cRelease").value,
            dev: $("cDev").checked,
            staging: $("cStage").checked,
            production: $("cProd").checked,
            memo: $("cMemo").value.trim(),
            images: attachedImages,
            createdAt: previousItem?.createdAt || now,
            updatedAt: now
        };

        // 시작일과 종료일이 역전된 경우 저장하지 않고 사용자에게 안내합니다.
        if (item.startDate && item.endDate && item.startDate > item.endDate) {
            alert("종료일은 시작일보다 빠를 수 없습니다.");
            return;
        }

        if (oldId) {
            await Store.updateChecklist(item);
        } else {
            await Store.addChecklist(item);
        }

        rows = Store.get("checklists");
        closeForm();
        render();
        toast("체크리스트를 저장했습니다.");
    });

    /* 목록 이벤트 위임으로 수정 및 삭제 버튼을 처리합니다. */
    $("cRows").addEventListener("click", async event => {
        const editButton = event.target.closest("[data-edit]");
        const deleteButton = event.target.closest("[data-delete]");

        if (editButton) {
            const item = rows.find(row => Number(row.id) === Number(editButton.dataset.edit));
            if (item) openForm(item);
            return;
        }

        if (deleteButton && confirm("선택한 체크리스트를 삭제할까요?")) {
            await Store.removeChecklist(deleteButton.dataset.delete);
            rows = Store.get("checklists");
            render();
            toast("체크리스트를 삭제했습니다.");
        }
    });

    /* 파일 선택 시 형식·용량·개수를 확인한 뒤 현재 행의 이미지 목록에 추가합니다. */
    $("cImages").addEventListener("change", async event => {
        const files = Array.from(event.target.files || []);

        for (const file of files) {
            if (!file.type.startsWith("image/")) {
                alert(`${file.name}: 이미지 파일만 첨부할 수 있습니다.`);
                continue;
            }

            if (file.size > MAX_IMAGE_SIZE) {
                alert(`${file.name}: 이미지당 최대 1.5MB까지 첨부할 수 있습니다.`);
                continue;
            }

            if (attachedImages.length >= MAX_IMAGES) {
                alert(`체크 항목당 이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
                break;
            }

            try {
                const data = await readAsDataUrl(file);
                attachedImages.push({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    data,
                    uploadedAt: new Date().toISOString()
                });
            } catch (error) {
                console.error("이미지 파일 읽기 실패:", error);
                alert(`${file.name} 파일을 읽지 못했습니다.`);
            }
        }

        // 같은 파일을 다시 선택할 수 있도록 input 값을 비웁니다.
        event.target.value = "";
        renderImagePreview();
    });

    /* 미리보기 영역의 삭제 버튼을 눌렀을 때 해당 이미지만 제거합니다. */
    $("cImagePreview").addEventListener("click", event => {
        const removeButton = event.target.closest("[data-image-remove]");
        if (!removeButton) return;

        attachedImages.splice(Number(removeButton.dataset.imageRemove), 1);
        renderImagePreview();
    });

    // 검색어와 상태 필터가 바뀌면 목록을 다시 그립니다.
    $("cSearch").addEventListener("input", render);
    $("cFilter").addEventListener("change", render);

    // 다른 화면이나 JSON 설정에서 데이터가 변경되면 최신 데이터를 다시 불러옵니다.
    window.addEventListener("treehwl:data-changed", event => {
        if (event.detail.type !== "checklists") return;

        rows = Store.get("checklists");
        render();
    });

    // FileReader를 사용해 이미지 파일을 JSON에 저장할 수 있는 Data URL로 변환합니다.
    function readAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    // 등록/수정 모달에 현재 항목의 첨부 이미지와 삭제 버튼을 표시합니다.
    function renderImagePreview() {
        $("cImagePreview").innerHTML = attachedImages.map((image, index) => `
            <div class="checklist-image-item">
                <img src="${image.data}" alt="${esc(image.name)}">
                <span title="${esc(image.name)}">${esc(image.name)}</span>
                <button type="button" class="btn danger small" data-image-remove="${index}">삭제</button>
            </div>
        `).join("");
    }

    // 목록에서는 각 행에 해당하는 이미지의 작은 미리보기만 표시합니다.
    function renderRowImages(images) {
        if (!images.length) return '<span class="muted">-</span>';

        return `
            <div class="checklist-row-images">
                ${images.map(image => `
                    <a href="#" data-full-image="${image.data}" data-image-name="${esc(image.name)}" title="큰 화면으로 보기">
                        <img src="${image.data}" alt="${esc(image.name)}">
                    </a>
                `).join("")}
            </div>
        `;
    }

    // 저장 결과를 화면에 잠시 표시하는 알림입니다.
    function toast(message) {
        $("cToast").textContent = message;
        $("cToast").classList.add("show");
        window.setTimeout(() => $("cToast").classList.remove("show"), 2200);
    }

    // 첫 화면을 표시합니다.
    render();
});
