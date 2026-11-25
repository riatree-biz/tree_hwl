/* 대시보드에 업무 건수, 완료율, 분포와 최근 변경 시각을 표시합니다. */
document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);

    // 화면 진입 시 전체 업무 데이터를 불러옵니다.
    try {
        renderDashboard(await Store.loadAll());
    } catch (error) {
        console.error("대시보드 데이터를 불러오지 못했습니다.", error);
        return;
    }

    // 다른 화면에서 데이터가 변경되면 대시보드 숫자도 갱신합니다.
    window.addEventListener("treehwl:data-changed", async () => {
        try {
            renderDashboard(await Store.loadAll());
        } catch (error) {
            console.error("대시보드 갱신에 실패했습니다.", error);
        }
    });

    function renderDashboard(data = {}) {
        const inquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
        const deployments = Array.isArray(data.deployments) ? data.deployments : [];
        const requests = Array.isArray(data.dataRequests) ? data.dataRequests : [];
        const checklists = Array.isArray(data.checklists) ? data.checklists : [];

        const total = inquiries.length + deployments.length + requests.length + checklists.length;
        const doneInquiries = inquiries.filter(item => item.completed === true || item.status === "done").length;
        const doneDeployments = deployments.filter(item => item.status === "deployed" || item.deployDate || item.status === "done").length;
        const doneRequests = requests.filter(item => item.status === "done").length;
        const doneChecklists = checklists.filter(item => item.dev && item.staging && item.production).length;
        const done = doneInquiries + doneDeployments + doneRequests + doneChecklists;
        const hold = requests.filter(item => item.status === "hold").length;
        const pending = Math.max(0, total - done);

        // 화면 요소가 존재할 때만 값을 변경해 페이지 구조 변경에도 안전하게 처리합니다.
        const setText = (id, value) => {
            const element = $(id);
            if (element) element.textContent = value;
        };

        setText("totalCount", total);
        setText("inquiryCount", inquiries.length);
        setText("deployCount", deployments.length);
        setText("requestCount", requests.length);
        setText("checklistCount", checklists.length);
        setText("pendingCount", pending);
        setText("inquiryLinkCount", `${inquiries.length}건 관리 중 →`);
        setText("deployLinkCount", `${deployments.length}건 관리 중 →`);
        setText("requestLinkCount", `${requests.length}건 관리 중 →`);
        setText("checklistLinkCount", `${checklists.length}건 관리 중 →`);
        setText("doneTotal", `${done}건`);
        setText("pendingTotal", `${Math.max(0, pending - hold)}건`);
        setText("holdTotal", `${hold}건`);

        const rate = total ? Math.round(done / total * 100) : 0;
        setText("completionRate", `${rate}%`);

        const donut = $("completionDonut");
        if (donut) {
            donut.style.background = `conic-gradient(var(--success) 0 ${rate}%, #343434 ${rate}% 100%)`;
        }

        const counts = [
            { id: "inquiry", count: inquiries.length },
            { id: "deploy", count: deployments.length },
            { id: "request", count: requests.length },
            { id: "checklist", count: checklists.length }
        ];

        counts.forEach(({ id, count }) => {
            setText(`${id}Stat`, `${count}건`);
            const bar = $(`${id}Bar`);
            if (bar) bar.style.width = `${total ? count / total * 100 : 0}%`;
        });

        // 각 업무의 마지막 수정/등록 시각 중 가장 최근 값을 찾습니다.
        const timestamps = [...inquiries, ...deployments, ...requests, ...checklists]
            .map(item => item.updatedAt || item.createdAt || item.requestDate)
            .filter(Boolean)
            .map(value => new Date(value))
            .filter(date => !Number.isNaN(date.getTime()))
            .sort((a, b) => b - a);

        if (!timestamps.length) {
            setText("lastUpdated", "기록 없음");
            setText("lastUpdatedRelative", "데이터가 변경되면 시각이 표시됩니다.");
            return;
        }

        const latest = timestamps[0];
        setText("lastUpdated", new Intl.DateTimeFormat("ko-KR", {
            dateStyle: "medium",
            timeStyle: "medium"
        }).format(latest));

        const minutes = Math.floor(Math.max(0, Date.now() - latest.getTime()) / 60000);
        const relative = minutes < 1 ? "방금 전 변경"
            : minutes < 60 ? `${minutes}분 전 변경`
            : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전 변경`
            : `${Math.floor(minutes / 1440)}일 전 변경`;

        setText("lastUpdatedRelative", relative);
    }
});
