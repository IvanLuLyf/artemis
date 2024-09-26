(function () {
    const NOOP = () => undefined;

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, function (match) {
            switch (match) {
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case '"':
                    return "&quot;";
                case "'":
                    return "&#39;";
            }
        });
    }

    const EXP_TABLE_HEAD = /^\s*\|?[ \-|]*\|?[ \-|]*\|?[ \-|]*\|?\s*$/;
    const EXP_BOLD = /\*\*(.*?)\*\*/g;
    const EXP_ITALIC = /\*(.*?)\*/g;
    const EXP_IMG = /!\[(.*?)]\((.*?)\)/g;
    const EXP_A = /\[(.*?)]\((.*?)\)/g
    const EXP_HN = /^#+/;
    const mdReplaceA = (m0, m1, m2) => {
        const src = (m2 || "").trim(),
            txt = (m1 || "").trim();
        if (src && txt) {
            return `<a href="${escapeHtml(src)}" target="_blank">${txt}</a>`;
        }
        return src || txt || "";
    };
    const mdReplaceImg = (m0, m1, m2) => {
        const src = (m2 || "").trim(),
            txt = (m1 || "").trim();
        if (src) {
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(txt)}"/>`;
        }
        return "";
    };

    function markdownToHtml(text) {
        let html = "";
        let lines = text.split("\n");
        let inTable = false;
        let inHead = true;
        let inCode = false;

        const baseProcess = (line) => {
            const lt = line.trim();
            if (lt.startsWith("#")) {
                let m = lt.match(EXP_HN);
                let hl = (m ? m[0].length : 0) || lt.indexOf(" ");
                html += `<h${hl}>${lt.substring(m ? hl : hl + 1).trim()}</h${hl}>`;
            } else if (lt.startsWith("* ") || lt.startsWith("- ")) {
                html += `<li>${lt.substring(2).trim()}</li>`;
            } else if (lt.startsWith("---")) {
                html += "<hr/>";
            } else if (lt.startsWith("```")) {
                const lang = line.substring(3).trim();
                html += `<pre><code data-lang="${lang}">`;
                inCode = true;
            } else {
                html += `<p>${lt}</p>`;
            }
        }

        for (let line of lines) {
            line = line.replace(EXP_BOLD, "<strong>$1</strong>").replace(EXP_ITALIC, "<em>$1</em>").replace(EXP_IMG, mdReplaceImg).replace(EXP_A, mdReplaceA);
            if (line.startsWith("|") && line.endsWith("|")) {
                if (!inTable) {
                    html += "<table>";
                    inTable = true;
                    inHead = true;
                }
                if (EXP_TABLE_HEAD.test(line)) continue;
                let cells = line.split("|");
                cells = cells.slice(1, cells.length - 1);
                if (inHead) html += "<thead>";
                html += "<tr>";
                for (let cell of cells) {
                    html += inHead ? `<th>${cell.trim()}</th>` : `<td>${cell.trim()}</td>`;
                }
                html += "</tr>";
                if (inHead) {
                    html += "</thead><tbody>";
                    inHead = false;
                }
            } else {
                if (inTable) {
                    html += "</tbody></table>";
                    inTable = false;
                }
                if (inCode) {
                    const lt = line.trim();
                    if (lt.startsWith("```")) {
                        html += "</code></pre>";
                        inCode = false;
                        const remain = lt.substring(3);
                        if (remain) baseProcess(remain);
                    } else {
                        html += `${escapeHtml(line)}\n`;
                    }
                } else {
                    baseProcess(line);
                }
            }
        }
        if (inTable) html += "</tbody></table>";
        return html;
    }

    function requestSSE(url, data, callback = NOOP, config = {}) {
        const ctr = new AbortController();
        const {
            method = "POST",
            json = true,
            headers = {"content-type": "application/json"},
            onDone = NOOP,
        } = config;
        const decoder = new TextDecoder("utf-8");
        const s = {buffer: ""};
        const p = new Promise((resolve) => {
            const fail = () => {
                onDone(false);
                resolve(false);
            };
            const processLine = (x) => {
                const text = x.startsWith("data:") ? x.slice(5) : x;
                if (text.trim()) {
                    callback(json ? JSON.parse(text) : text);
                }
            };
            fetch(url, {
                headers,
                body: JSON.stringify(data),
                method,
                signal: ctr.signal,
            }).then((response) => {
                const reader = response.body.getReader();
                const loop = () => {
                    reader.read().then((g) => {
                        if (g.done) {
                            if (s.buffer) processLine(s.buffer);
                            onDone(true);
                            resolve(true);
                            return;
                        }
                        s.buffer += decoder.decode(g.value, {stream: true});
                        const lines = s.buffer.split(/\r\n|\r|\n/);
                        s.buffer = lines.pop();
                        lines.forEach((x) => processLine(x));
                        loop();
                    }).catch(() => fail());
                };
                loop();
            }).catch(() => fail());
        });
        p.cancelRequest = () => {
            ctr.abort();
        };
        return p;
    }

    function fetchData(url, data, {token} = {}) {
        const headers = {'Content-Type': 'application/json',}
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(data),
        }).then((res) => res.json());
    }

    function toast(msg, duration = 3000) {
        const el = document.createElement('div');
        el.innerText = msg;
        el.classList.add('toast');
        document.body.append(el);
        setTimeout(function () {
            el.remove()
        }, duration);
    }

    function createStorage(name, defaultValue = undefined, area = localStorage, prefix = 'flows_') {
        const key = prefix + name;
        const _cache = {};
        if (defaultValue) Object.assign(_cache, defaultValue);
        const load = () => {
            let tmp;
            try {
                tmp = JSON.parse(area[key] ?? "{}");
            } catch (ex) {
                tmp = {}
            }
            Object.assign(_cache, tmp);
        }
        window.addEventListener("storage", (e) => {
            if (e.storageArea === area && e.key === key) load();
        });
        load();
        return new Proxy(_cache, {
            set(target, p, value) {
                _cache[p] = value;
                area[key] = JSON.stringify(_cache);
                return true;
            }
        });
    }

    function friendlyTime(timestamp) {
        let now = new Date();
        let t = new Date(timestamp);
        let z = (n) => ('' + n).length > 1 ? '' + n : '0' + n;
        let millieSecond = now - t;
        let m = z(t.getHours()) + ':' + z(t.getMinutes());
        let d = (t.getMonth() + 1) + '-' + t.getDate();
        let y = t.getFullYear();
        if (millieSecond <= 1000 * 3600 * 24 && now.getDate() === t.getDate()) {
            return m;
        } else {
            if (now.getFullYear() !== y) {
                return y + '-' + d + ' ' + m;
            } else {
                return d + ' ' + m;
            }
        }
    }

    function toPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = (e) => {
                resolve(e.target.result);
            }
            request.onerror = (e) => {
                reject(e.target.errorCode);
            }
        })
    }

    function createDb(name, ver = 1, onUpgrade = NOOP) {
        let db;
        const connect = () => {
            const req = indexedDB.open(name, ver);
            req.onupgradeneeded = (e) => {
                onUpgrade(e.target.result);
            };
            return toPromise(req);
        };
        const objectStore = (name, mode = "readwrite") => {
            const t = db.transaction([name], mode);
            return t.objectStore(name);
        };
        const table = (name) => {
            const os = () => objectStore(name);
            return {
                add: (item) => toPromise(os().add(item)),
                all: () => toPromise(os().getAll()),
                get: (key) => toPromise(os().get(key)),
                listByIndex: (indexName, val) => {
                    const os = objectStore(name, 'readonly');
                    const index = os.index(indexName);
                    return toPromise(index.getAll(val));
                },
                update: (item) => toPromise(os().put(item)),
                remove: (key) => toPromise(os().delete(key)),
                removeByIndex: (indexName, val) => {
                    const os = objectStore(name, 'readwrite');
                    const index = os.index(indexName);
                    return new Promise((resolve, reject) => {
                        const req = index.openCursor(val);
                        req.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (cursor) {
                                cursor.delete();
                                cursor.continue();
                            } else {
                                resolve();
                            }
                        };
                        req.onerror = (e) => {
                            reject(e.target.errorCode);
                        };
                    });
                },
            };
        }
        return new Promise(resolve => {
            connect().then((res) => {
                db = res;
                resolve({table})
            });
        });
    }

    function createEvents() {
        const events = {};
        const on = (evt, callback) => {
            if (typeof callback !== "function") return;
            if (!events[evt]) events[evt] = [];
            events[evt].push(callback);
        };
        const off = (evt, callback) => {
            if (!events[evt]) return;
            if (!callback) {
                delete events[evt];
            } else {
                events[evt] = events[evt].filter((x) => x !== callback);
            }
        };
        const once = (evt, callback) => {
            const w = (e) => {
                callback(e);
                off(evt, w);
            }
            on(evt, w);
        };
        const emit = (evt, data) => {
            if (events[evt]) events[evt].forEach((c) => c(data));
        };
        const clear = () => {
            for (const evt in events) delete events[evt];
        }
        return {on, off, once, emit, clear};
    }

    const BTN_TYPE_CLASS = {
        primary: "rmx-btn-primary",
        danger: "rmx-btn-danger",
        success: "rmx-btn-success",
    };
    const BTN_SCENE = {
        normal: [{primary: true, action: "confirm", text: "确认"}, {action: "cancel", text: "取消"}],
        alert: [{primary: true, action: "confirm", text: "知道了"}],
    };

    function createButtons(buttons, scene) {
        if (scene === "form") {
            return buttons.map((x) => `<button class="rmx-btn ${x.primary ? 'rmx-btn-primary' : ''}" ${x.primary ? '' : 'formnovalidate'} value="${x.action}">${x.text}</button>`).join("");
        } else {
            return buttons.map((x) => `<button type="button" class="rmx-btn ${BTN_TYPE_CLASS[x.type] || ''}" data-action="${x.action}">${x.text}</button>`).join("");
        }
    }

    function createDialog(
        {
            persist,
            title = "",
            content = "",
            footer = "default",
            buttons = [],
            glass = false,
            init = NOOP,
        } = {}) {
        const ctx = {}, $bus = createEvents();
        const $dialog = document.createElement('dialog');
        $dialog.classList.add('rmx-dialog');
        if (glass) $dialog.classList.add('rmx-dialog-glass');
        if (footer === "default") {
            buttons = BTN_SCENE.normal;
            if (buttons?.length > 0) footer = createButtons(buttons, "form");
        }
        $dialog.innerHTML = `<form method="dialog" class="rmx-dialog-form">
    <div class="rmx-dialog-header">
        <div class="rmx-dialog-title">${title}</div>
        <button class="rmx-dialog-close" formnovalidate value="cancel">
            <span class="rmx-dialog-close-icon"></span>
        </button>
    </div>
    <div class="rmx-dialog-body">${content}</div>
    <div class="rmx-dialog-footer">${footer}</div>
</form>`;
        const $title = $dialog.querySelector('.rmx-dialog-title');
        const $form = $dialog.querySelector('.rmx-dialog-form');
        const $body = $dialog.querySelector('.rmx-dialog-body');
        const $footer = $dialog.querySelector('.rmx-dialog-footer');
        const open = () => {
            if (!persist) document.body.append($dialog);
            return new Promise((resolve) => {
                ctx.resolve = resolve;
                $dialog.showModal();
            });
        };
        const setButtons = (arr = []) => {
            buttons = arr;
            footer = createButtons(buttons, "form");
            $footer.innerHTML = footer;
        };
        $dialog.addEventListener('close', () => {
            ctx.resolve({action: $dialog.returnValue});
            if (!persist) $dialog.remove();
        });
        if (persist) document.body.append($dialog);
        if (init) init({$dialog, $title, $body, $footer});
        return {$dialog, $form, $title, $body, $footer, open, setButtons, on: $bus.on};
    }

    function showAlert(content, {glass} = {}) {
        const $dialog = createDialog({
            title: "提示",
            glass,
            content: `<div class="rmx-dialog-text-content">${content}</div>`,
            buttons: BTN_SCENE.alert,
        });
        return $dialog.open();
    }

    function showConfirm(content, {glass} = {}) {
        const $dialog = createDialog({
            title: "提示",
            glass,
            content: `<div class="rmx-dialog-text-content">${content}</div>`,
        });
        return $dialog.open();
    }

    Object.assign(window, {
        escapeHtml,
        markdownToHtml,
        requestSSE,
        fetchData,
        toast,
        createStorage,
        friendlyTime,
        createDb,
        createEvents,
        createButtons,
        createDialog,
        showAlert,
        showConfirm,
    });
})();