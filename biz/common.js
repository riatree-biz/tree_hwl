/*
 * 공통 데이터 관리 모듈
 * - 문의 데이터는 inquiries.json, 개발·배포 데이터는 deployments.json으로 분리합니다.
 * - File System Access API를 지원하는 Chrome/Edge에서는 연결된 파일을 수정 즉시 갱신합니다.
 * - 파일 핸들은 IndexedDB에 보관하므로 같은 브라우저의 다른 화면에서도 재사용할 수 있습니다.
 * - 파일을 연결하지 않은 경우에는 localStorage를 임시 저장소로 사용합니다.
 */
(() => {
    "use strict";

    const DB_NAME = "tree-hwl-file-handles";
    const STORE_NAME = "handles";
    const STORAGE_PREFIX = "treeHwl:";
    const FILES = {
        inquiries: {
            fileName: "inquiries.json",
            label: "문의 데이터",
            empty: []
        },
        deployments: {
            fileName: "deployments.json",
            label: "개발·배포 데이터",
            empty: []
        },
        dataRequests: {
            fileName: "dataRequests.json",
            label: "병원 데이터 처리 요청",
            empty: []
        },
        checklists: {
            fileName: "checklists.json",
            label: "체크리스트",
            empty: []
        }
    };

    const memory = {
        inquiries: [],
        deployments: [],
        dataRequests: [],
        checklists: []
    };

    const writeQueues = {
        inquiries: Promise.resolve(),
        deployments: Promise.resolve(),
        dataRequests: Promise.resolve(),
        checklists: Promise.resolve()
    };

    /* 브라우저별 파일 핸들을 보관할 IndexedDB 연결을 엽니다. */
    function openDatabase() {
        return new Promise((resolve, reject) => {
            // 파일 연결 기능을 지원하지 않는 환경에서는 원인을 명확히 반환합니다.
            if (!window.indexedDB) {
                reject(new Error("이 브라우저에서는 IndexedDB를 사용할 수 없습니다."));
                return;
            }

            const request = window.indexedDB.open(DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /* IndexedDB에서 화면별 JSON 파일 핸들을 조회합니다. */
    async function getHandle(type) {
        // IndexedDB가 없는 환경에서는 연결 파일 없이 브라우저 저장소로 동작합니다.
        if (!window.indexedDB) return null;

        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const request = transaction.objectStore(STORE_NAME).get(type);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /* 사용자가 연결한 파일 핸들을 IndexedDB에 저장합니다. */
    async function setHandle(type, handle) {
        if (!window.indexedDB) {
            throw new Error("이 브라우저에서는 파일 연결 정보를 저장할 수 없습니다.");
        }

        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put(handle, type);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /* 날짜를 YYYY-MM-DD 형식으로 반환합니다. */
    function today() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    /* JSON 데이터의 최상위 구조가 배열인지 확인합니다. */
    function normalize(type, value) {
        if (!Array.isArray(value)) {
            throw new Error(`${FILES[type].fileName}의 최상위 데이터는 배열이어야 합니다.`);
        }

        return value;
    }

    /* 저장 상태가 변경되면 각 화면이 최신 상태를 표시할 수 있도록 이벤트를 발생시킵니다. */
    function notify(type, status, message = "") {
        window.dispatchEvent(new CustomEvent("treehwl:storage", {
            detail: { type, status, message }
        }));
    }

    /* localStorage는 파일 연결 전 임시 저장소로 사용합니다. */
    function saveLocal(type) {
        try {
            localStorage.setItem(STORAGE_PREFIX + type, JSON.stringify(memory[type]));
            return true;
        } catch (error) {
            // 저장 공간 부족이나 브라우저 정책으로 실패해도 화면 스크립트가 중단되지 않게 합니다.
            console.warn(`[${FILES[type].fileName}] 브라우저 임시 저장 실패`, error);
            notify(type, "error", "브라우저 저장 공간을 확인해 주세요.");
            return false;
        }
    }

    /* localStorage 접근 자체가 차단된 환경에서도 안전하게 값을 읽습니다. */
    function readLocal(type) {
        try {
            return localStorage.getItem(STORAGE_PREFIX + type);
        } catch (error) {
            console.warn("브라우저 임시 저장소를 읽지 못했습니다.", error);
            return null;
        }
    }

    /* 연결된 JSON 파일에 데이터를 기록합니다. */
    async function writeFile(type, handle, askPermission = false) {
        let permission = await handle.queryPermission({ mode: "readwrite" });

        if (permission !== "granted" && askPermission) {
            permission = await handle.requestPermission({ mode: "readwrite" });
        }

        if (permission !== "granted") {
            throw new Error("파일 쓰기 권한이 없습니다. JSON 파일을 다시 연결해 주세요.");
        }

        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(memory[type], null, 2));
        await writable.close();

        notify(type, "connected", `${FILES[type].fileName} 저장 완료`);
    }

    /*
     * 저장 작업을 순서대로 처리합니다.
     * 연속으로 등록/수정/삭제가 발생해도 파일 쓰기 순서가 뒤섞이지 않게 합니다.
     */
    function queueFileWrite(type) {
        writeQueues[type] = writeQueues[type]
            .then(async () => {
                const handle = await getHandle(type);
                if (!handle) {
                    notify(type, "local", "브라우저 임시 저장소에 저장했습니다. JSON 파일을 연결하면 자동 저장됩니다.");
                    return;
                }

                await writeFile(type, handle, false);
            })
            .catch(error => {
                notify(type, "permission", error.message);
                console.warn(`[${FILES[type].fileName}] 자동 저장 실패`, error);
            });

        return writeQueues[type];
    }

    /* 현재 화면에 필요한 데이터를 불러옵니다. 연결된 파일이 있으면 파일 내용을 우선합니다. */
    async function load(type) {
        if (!FILES[type]) {
            throw new Error(`지원하지 않는 데이터 유형입니다: ${type}`);
        }

        try {
            const handle = await getHandle(type);

            if (handle) {
                const permission = await handle.queryPermission({ mode: "readwrite" });

                if (permission === "granted") {
                    const file = await handle.getFile();
                    memory[type] = normalize(type, JSON.parse(await file.text()));
                    saveLocal(type);
                    notify(type, "connected", `${handle.name} 연결됨`);
                    return memory[type];
                }

                notify(type, "permission", "파일 권한이 필요합니다. 데이터 관리 화면에서 다시 연결해 주세요.");
            }
        } catch (error) {
            if (window.indexedDB) console.warn("연결 파일을 읽지 못했습니다.", error);
        }

        const localValue = readLocal(type);

        if (localValue) {
            try {
                memory[type] = normalize(type, JSON.parse(localValue));
                return memory[type];
            } catch (error) {
                console.warn("브라우저 임시 데이터가 올바른 JSON이 아닙니다.", error);
            }
        }

        try {
            const response = await fetch(`./${FILES[type].fileName}`, { cache: "no-store" });

            if (response.ok) {
                memory[type] = normalize(type, await response.json());
            } else {
                memory[type] = [...FILES[type].empty];
            }
        } catch (error) {
            memory[type] = [...FILES[type].empty];
        }

        saveLocal(type);
        return memory[type];
    }

    /* 대시보드에서 문의와 개발·배포 데이터를 한 번에 조회할 때 사용합니다. */
    async function loadAll() {
        const [inquiries, deployments, dataRequests, checklists] = await Promise.all([
            load("inquiries"),
            load("deployments"),
            load("dataRequests"),
            load("checklists")
        ]);

        return { inquiries, deployments, dataRequests, checklists };
    }

    /* 사용자가 지정한 JSON 파일을 연결하고 파일 내용을 현재 데이터로 불러옵니다. */
    async function connect(type) {
        if (!window.showOpenFilePicker) {
            throw new Error("파일 연결은 Chrome 또는 Edge에서 localhost로 실행할 때 지원됩니다.");
        }

        if (!FILES[type]) {
            throw new Error(`지원하지 않는 데이터 유형입니다: ${type}`);
        }

        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: "JSON 파일",
                accept: { "application/json": [".json"] }
            }]
        });

        const permission = await handle.requestPermission({ mode: "readwrite" });

        if (permission !== "granted") {
            throw new Error("파일 읽기 및 쓰기 권한을 허용해 주세요.");
        }

        const file = await handle.getFile();
        const parsed = normalize(type, JSON.parse(await file.text()));

        await setHandle(type, handle);
        memory[type] = parsed;
        saveLocal(type);
        notify(type, "connected", `${handle.name} 연결 완료`);

        return memory[type];
    }

    /* 파일 선택 창을 통해 JSON 파일을 불러옵니다. 연결 파일이 있으면 연결도 함께 갱신합니다. */
    async function importFile(type, file) {
        if (!file) return memory[type];

        const parsed = normalize(type, JSON.parse(await file.text()));
        memory[type] = parsed;
        saveLocal(type);

        const handle = await getHandle(type);

        if (handle) {
            await writeFile(type, handle, true);
        }

        notify(type, handle ? "connected" : "local", `${file.name} 불러오기 완료`);
        return memory[type];
    }

    /* 현재 데이터를 JSON 파일로 저장합니다. 연결된 파일이 없으면 저장 위치를 선택합니다. */
    async function save(type) {
        if (!FILES[type]) {
            throw new Error(`지원하지 않는 데이터 유형입니다: ${type}`);
        }

        let handle = await getHandle(type);

        if (!handle && window.showSaveFilePicker && window.indexedDB) {
            handle = await window.showSaveFilePicker({
                suggestedName: FILES[type].fileName,
                types: [{
                    description: "JSON 파일",
                    accept: { "application/json": [".json"] }
                }]
            });

            await setHandle(type, handle);
        }

        if (handle) {
            await writeFile(type, handle, true);
            return;
        }

        /* File System Access API를 지원하지 않는 브라우저에서는 파일 다운로드로 대체합니다. */
        const blob = new Blob(
            [JSON.stringify(memory[type], null, 2)],
            { type: "application/json;charset=utf-8" }
        );
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = url;
        anchor.download = FILES[type].fileName;
        anchor.click();

        URL.revokeObjectURL(url);
        notify(type, "local", `${FILES[type].fileName} 다운로드 완료`);
    }

    /* 연결된 파일을 사용하지 않도록 IndexedDB의 핸들을 제거합니다. */
    async function disconnect(type) {
        if (!window.indexedDB) {
            notify(type, "local", "이 브라우저에는 연결된 파일 정보가 없습니다.");
            return;
        }

        const db = await openDatabase();

        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).delete(type);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });

        notify(type, "local", "JSON 파일 연결 해제됨");
    }

    /* 데이터 변경 시 브라우저 저장과 연결 파일 자동 저장을 함께 실행합니다. */
    function persist(type) {
        saveLocal(type);
        window.dispatchEvent(new CustomEvent("treehwl:data-changed", {
            detail: { type, data: memory[type] }
        }));

        return queueFileWrite(type);
    }

    /* 공통 등록/수정/삭제 함수를 화면별로 제공합니다. */
    const Store = {
        FILES,
        today,
        load,
        loadAll,
        get: type => memory[type],
        set: (type, value) => {
            memory[type] = normalize(type, value);
            return persist(type);
        },
        connect,
        importFile,
        save,
        disconnect,
        persist,

        addInquiry: item => {
            memory.inquiries.push(item);
            return persist("inquiries");
        },
        updateInquiry: item => {
            const index = memory.inquiries.findIndex(row => Number(row.id) === Number(item.id));
            if (index >= 0) memory.inquiries[index] = item;
            return persist("inquiries");
        },
        removeInquiry: id => {
            memory.inquiries = memory.inquiries.filter(row => Number(row.id) !== Number(id));
            return persist("inquiries");
        },

        addDeployment: item => {
            memory.deployments.push(item);
            return persist("deployments");
        },
        updateDeployment: item => {
            const index = memory.deployments.findIndex(row => Number(row.id) === Number(item.id));
            if (index >= 0) memory.deployments[index] = item;
            return persist("deployments");
        },
        removeDeployment: id => {
            memory.deployments = memory.deployments.filter(row => Number(row.id) !== Number(id));
            return persist("deployments");
        },
        addDataRequest: item => {
            memory.dataRequests.push(item);
            return persist("dataRequests");
        },
        updateDataRequest: item => {
            const index = memory.dataRequests.findIndex(row => String(row.id) === String(item.id));
            if (index >= 0) memory.dataRequests[index] = item;
            return persist("dataRequests");
        },
        removeDataRequest: id => {
            memory.dataRequests = memory.dataRequests.filter(row => String(row.id) !== String(id));
            return persist("dataRequests");
        },
        addChecklist: item => {
            memory.checklists.push(item);
            return persist("checklists");
        },
        updateChecklist: item => {
            const index = memory.checklists.findIndex(row => String(row.id) === String(item.id));
            if (index >= 0) memory.checklists[index] = item;
            return persist("checklists");
        },
        removeChecklist: id => {
            memory.checklists = memory.checklists.filter(row => String(row.id) !== String(id));
            return persist("checklists");
        }
    };

    /* 모든 화면에서 공통으로 사용하는 이미지 보관함을 구성합니다.
     * 이미지는 브라우저 localStorage에 저장되며 JSON 업무 데이터와는 별도로 관리합니다. */
    // function mountImageLibrary() {
    //     if (document.getElementById("sharedImageLibrary")) return;
    //     const main = document.querySelector("main");
    //     if (!main) return;
    //     const section = document.createElement("section");
    //     section.id = "sharedImageLibrary";
    //     section.className = "panel image-library";
    //     section.innerHTML = `<div class="panel-head"><div><p class="eyebrow">IMAGE ATTACHMENTS</p><h2>이미지 보관함</h2><p>현재 화면에서 참고 이미지를 업로드하고 미리보기·삭제할 수 있습니다. 이미지 데이터는 이 브라우저에 저장됩니다.</p></div><label class="btn secondary image-upload-label">이미지 업로드<input id="sharedImageInput" type="file" accept="image/*" multiple hidden></label></div><div id="sharedImageGrid" class="image-grid"><p class="muted">업로드한 이미지가 없습니다.</p></div>`;
    //     main.appendChild(section);
    //     const key = "treeHwl:images";
    //     const read = () => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
    //     const draw = () => {
    //         const items = read(); const grid = section.querySelector("#sharedImageGrid");
    //         grid.innerHTML = items.length ? items.map((item, index) => `<article class="image-item"><img src="${item.data}" alt="${String(item.name).replace(/[&<>\"]/g, "")}"><div><strong title="${String(item.name).replace(/[&<>\"]/g, "")}">${String(item.name).replace(/[&<>\"]/g, "")}</strong><small>${(item.size / 1024).toFixed(1)} KB</small><button class="btn danger small" data-image-delete="${index}">삭제</button></div></article>`).join("") : '<p class="muted">업로드한 이미지가 없습니다.</p>';
    //     };
    //     section.querySelector("#sharedImageInput").addEventListener("change", async event => {
    //         const files = [...event.target.files]; if (!files.length) return;
    //         const current = read();
    //         for (const file of files) {
    //             if (!file.type.startsWith("image/")) continue;
    //             if (file.size > 1.5 * 1024 * 1024) { alert(`${file.name}: 이미지 한 장의 최대 용량은 1.5MB입니다.`); continue; }
    //             if (current.reduce((sum, item) => sum + (item.size || 0), 0) + file.size > 3 * 1024 * 1024) { alert("이미지 보관함의 전체 용량은 3MB까지 지원합니다."); break; }
    //             const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    //             current.push({ name: file.name, size: file.size, type: file.type, data, uploadedAt: new Date().toISOString() });
    //         }
    //         try { localStorage.setItem(key, JSON.stringify(current)); draw(); }
    //         catch { alert("브라우저 저장 공간이 부족합니다. 이미지 용량이나 개수를 줄여 주세요."); }
    //         event.target.value = "";
    //     });
    //     section.addEventListener("click", event => {
    //         const button = event.target.closest("[data-image-delete]"); if (!button) return;
    //         const items = read(); items.splice(Number(button.dataset.imageDelete), 1); localStorage.setItem(key, JSON.stringify(items)); draw();
    //     });
    //     draw();
    // }

    /* 각 화면의 공통 JSON 불러오기/저장/HTML 저장 버튼을 연결합니다. */
    document.addEventListener("DOMContentLoaded", () => {
        //mountImageLibrary();
        document.querySelectorAll("[data-load-json]").forEach(button => {
            const type = button.dataset.loadJson;
            const input = document.querySelector(`[data-json-input="${type}"]`);

            button.addEventListener("click", () => input?.click());
        });

        document.querySelectorAll("[data-json-input]").forEach(input => {
            input.addEventListener("change", async event => {
                try {
                    await importFile(input.dataset.jsonInput, event.target.files[0]);
                    window.location.reload();
                } catch (error) {
                    alert(`JSON 불러오기에 실패했습니다.\n${error.message}`);
                } finally {
                    input.value = "";
                }
            });
        });

        document.querySelectorAll("[data-save-json]").forEach(button => {
            button.addEventListener("click", async () => {
                try {
                    await save(button.dataset.saveJson);
                    alert(`${FILES[button.dataset.saveJson].fileName} 저장을 완료했습니다.`);
                } catch (error) {
                    if (error.name !== "AbortError") alert(`JSON 저장에 실패했습니다.\n${error.message}`);
                }
            });
        });

        document.querySelectorAll("[data-connect-json]").forEach(button => {
            button.addEventListener("click", async () => {
                try {
                    await connect(button.dataset.connectJson);
                    window.location.reload();
                } catch (error) {
                    if (error.name !== "AbortError") alert(`JSON 연결에 실패했습니다.\n${error.message}`);
                }
            });
        });

        document.querySelectorAll("[data-save-html]").forEach(button => {
            button.addEventListener("click", () => {
                const clone = document.documentElement.cloneNode(true);
                clone.querySelectorAll(".backdrop").forEach(element => element.classList.remove("open"));

                const blob = new Blob(
                    ["<!doctype html>\n", clone.outerHTML],
                    { type: "text/html;charset=utf-8" }
                );
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");

                anchor.href = url;
                anchor.download = `${today()}.html`;
                anchor.click();

                URL.revokeObjectURL(url);
            });
        });
    });


    /* 각 업무 데이터 행에 개별 이미지를 첨부하고 JSON 레코드에 함께 저장하는 공통 도구입니다. */
    window.RowImageAttachments = {
        create(inputId, previewId) {
            const input = document.getElementById(inputId);
            const preview = document.getElementById(previewId);
            let images = [];
            const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
            const render = () => {
                preview.innerHTML = images.map((image, index) => `<div class="checklist-image-item"><img src="${image.data}" alt="${escape(image.name)}"><span title="${escape(image.name)}">${escape(image.name)}</span><button type="button" class="btn danger small" data-row-image-remove="${index}">삭제</button></div>`).join("");
            };
            input.addEventListener("change", async event => {
                for (const file of Array.from(event.target.files || [])) {
                    if (!file.type.startsWith("image/")) { alert(`${file.name}: 이미지 파일만 첨부할 수 있습니다.`); continue; }
                    if (file.size > 1.5 * 1024 * 1024) { alert(`${file.name}: 이미지당 최대 1.5MB까지 첨부할 수 있습니다.`); continue; }
                    if (images.length >= 5) { alert("항목당 이미지는 최대 5장까지 첨부할 수 있습니다."); break; }
                    try {
                        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
                        images.push({ name:file.name, type:file.type, size:file.size, data, uploadedAt:new Date().toISOString() });
                    } catch (_) { alert(`${file.name} 파일을 읽지 못했습니다.`); }
                }
                input.value = ""; render();
            });
            preview.addEventListener("click", event => {
                const button = event.target.closest("[data-row-image-remove]");
                if (!button) return;
                images.splice(Number(button.dataset.rowImageRemove), 1); render();
            });
            return {
                set(value) { images = Array.isArray(value) ? value.slice() : []; input.value = ""; render(); },
                get() { return images.slice(); },
                cell(value) {
                    if (!value || !value.length) return '<span class="muted">-</span>';
                    return `<div class="checklist-row-images">${value.map(image => `<a href="#" data-full-image="${image.data}" data-image-name="${escape(image.name)}" title="큰 화면으로 보기"><img src="${image.data}" alt="${escape(image.name)}"></a>`).join("")}</div>`;
                }
            };
        }
    };


    /* 목록의 데이터 행을 선택하면 해당 레코드 전체 내용을 상세 팝업으로 표시합니다. */
    function installRecordViewer() {
        const labels = {
            id:"번호", hospital:"병원", requester:"요청자", content:"문의 내용", answer:"처리 내용",
            inquiryDate:"문의일", processDate:"처리일", completed:"완료 여부", categories:"구분",
            requestContent:"요청 내용", devContent:"개발 내용", changedSource:"변경 소스", requestDate:"요청일",
            devDate:"개발일", completeDate:"완료일", deployDate:"배포일", status:"상태", assignee:"처리 담당자",
            requestType:"요청 유형", resultContent:"처리 결과", completedAt:"완료일", title:"체크 항목",
            startDate:"시작일", endDate:"종료일", releaseDate:"반영일", dev:"개발기 반영", staging:"스테이징 반영",
            production:"운영기 반영", memo:"메모", createdAt:"등록 시각", updatedAt:"수정 시각"
        };
        const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
        function ensureLayer(id, className) {
            let layer = document.getElementById(id);
            if (layer) return layer;
            layer = document.createElement("div"); layer.id = id; layer.className = className;
            document.body.appendChild(layer); return layer;
        }
        const detail = ensureLayer("recordDetailLayer", "backdrop record-detail-backdrop");
        const image = ensureLayer("imageViewerLayer", "backdrop image-viewer-backdrop");
        detail.innerHTML = `<section class="modal wide record-detail-modal" role="dialog" aria-modal="true" aria-labelledby="recordDetailTitle"><div class="modal-head"><h2 id="recordDetailTitle">데이터 상세</h2><button type="button" class="btn secondary small" data-viewer-close="record">닫기</button></div><div class="modal-body" id="recordDetailBody"></div></section>`;
        image.innerHTML = `<section class="image-viewer" role="dialog" aria-modal="true"><button type="button" class="image-viewer-close" data-viewer-close="image" aria-label="닫기">×</button><p id="imageViewerName"></p><img id="imageViewerTarget" alt="업로드 이미지"></section>`;
        function close(layer) { layer.classList.remove("open"); }
        function showImage(src, name) {
            if (!src) return;
            document.getElementById("imageViewerTarget").src = src;
            document.getElementById("imageViewerName").textContent = name || "첨부 이미지";
            image.classList.add("open");
        }
        document.addEventListener("click", event => {
            const closeButton = event.target.closest("[data-viewer-close]");
            if (closeButton) { close(closeButton.dataset.viewerClose === "image" ? image : detail); return; }
            if (event.target === detail) close(detail);
            if (event.target === image) close(image);
            const thumbnail = event.target.closest("[data-full-image]");
            if (thumbnail) { event.preventDefault(); event.stopPropagation(); showImage(thumbnail.dataset.fullImage, thumbnail.dataset.imageName); return; }
            const row = event.target.closest("tr[data-detail-type][data-detail-id]");
            if (!row || event.target.closest("button, a, input, select, textarea, label")) return;
            const item = (Store.get(row.dataset.detailType) || []).find(record => String(record.id) === String(row.dataset.detailId));
            if (!item) return;
            const title = item.hospital || item.title || `#${item.id}`;
            document.getElementById("recordDetailTitle").textContent = `${title} · 상세 정보`;
            const fields = Object.entries(item).filter(([key]) => key !== "images");
            const valueText = value => Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "예" : "아니오") : (value == null || value === "" ? "-" : String(value));
            const imageHtml = (item.images || []).length ? `<section class="detail-image-section"><h3>첨부 이미지 (${item.images.length})</h3><div class="detail-image-grid">${item.images.map((entry, index) => `<button type="button" class="detail-image-button" data-full-image="${entry.data}" data-image-name="${esc(entry.name || `이미지 ${index+1}`)}"><img src="${entry.data}" alt="${esc(entry.name)}"><span>${esc(entry.name || `이미지 ${index+1}`)}</span></button>`).join("")}</div></section>` : `<p class="muted">첨부된 이미지가 없습니다.</p>`;
            document.getElementById("recordDetailBody").innerHTML = `<dl class="record-detail-grid">${fields.map(([key,value]) => `<div><dt>${esc(labels[key] || key)}</dt><dd>${esc(valueText(value))}</dd></div>`).join("")}</dl>${imageHtml}`;
            detail.classList.add("open");
        });
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") { close(detail); close(image); }
            if ((event.key === "Enter" || event.key === " ") && event.target.matches("tr[data-detail-type][data-detail-id]")) { event.preventDefault(); event.target.click(); }
        });
    }
    installRecordViewer();

    window.Store = Store;
})();