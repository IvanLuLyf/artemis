(function () {
    const UI_CTX = {index: 0};
    const NOOP = () => undefined;

    function createInputGroup($p, {name, type, textKey, valueKey, source, withEmpty, columns} = {}) {
        const ctx = {list: []};
        const callbacks = {};
        const withRefresh = typeof source === "string" && !source.startsWith('#');
        $p.innerHTML = `<div class="rmx-form-check-able-group-tools">${withRefresh ? '<button class="rmx-btn rmx-btn-primary rmx-btn-small" data-action="refresh" type="button">刷新</button>' : ''}</div>
<div class="rmx-form-check-able-group-body"></div>`;
        const $tools = $p.querySelector('.rmx-form-check-able-group-tools');
        const $body = $p.querySelector('.rmx-form-check-able-group-body');
        if (columns) {
            $body.style.setProperty('--rmx-grid-columns', columns);
        }
        const createItem = (x, i) => {
            const f = document.createElement('template');
            const m = (x.owner_id === 1 && x.shared) ?
                '<span class="rmx-form-check-able-badge rmx-color-green">系统</span>' :
                (x.mine ? '<span class="rmx-form-check-able-badge">我的</span>' : '');
            f.innerHTML = `<div class="rmx-form-check-able-group-item" data-index="${i}">
<label class="rmx-form-check-able">
<input type="${type}" name="${name}" value="${valueKey ? x[valueKey] : i}"/>
<span class="rmx-form-check-able-text">${x[textKey]}</span>${m}
</label>
</div>`;
            return f.content;
        };
        const _load = () => {
            ctx.fragment = document.createDocumentFragment();
            if (withEmpty) {
                ctx.fragment.append(createItem({
                    [valueKey]: "",
                    [textKey]: "默认",
                }, -1))
            }
            ctx.list.forEach((x, i) => {
                ctx.fragment.append(createItem(x, i))
            });
            $body.innerHTML = type === "checkbox" ? `<input type="hidden" name="${name}" value=""/>` : '';
            $body.append(ctx.fragment);
            callbacks['load']?.(ctx);
        };
        const load = () => {
            if (Array.isArray(source)) {
                ctx.list = source;
                _load();
                return;
            }
            if (source.startsWith('#')) {
                try {
                    ctx.list = JSON.parse(document.querySelector(source).innerHTML || "[]");
                } catch (e) {
                    ctx.list = [];
                }
                _load();
            } else {
                fetchData(source, {}).then((res) => {
                    ctx.list = res.list;
                    _load();
                });
            }
        };
        listenAreaAction($tools, (e) => {
            if (e.action === "refresh") {
                load();
            }
        });
        const on = (evt, callback) => {
            if (typeof callback === "function") {
                callbacks[evt] = callback;
                if (evt === 'load') {
                    callback(ctx);
                }
            }
        };
        const toOption = (value) => {
            const list = ctx.list;
            if (Array.isArray(value)) {
                return valueKey ?
                    list.filter((it) => value.includes(`${it[valueKey]}`)) :
                    value.map((it) => list[it]);
            } else {
                return valueKey ? list.find((it) => value === `${it[valueKey]}`) : list[value];
            }
        };
        load();
        return {ctx, load, on, toOption};
    }

    function createValFunc($form, fields = []) {
        const fieldMap = {};
        fields.forEach((x) => {
            fieldMap[x.column] = x;
        });
        return (v = undefined) => {
            const $es = $form.elements;
            if (v === undefined) {
                const result = {};
                fields.forEach((f) => {
                    const ds = $es[f.column].dataset;
                    if (ds && ds.isJson === "true") {
                        try {
                            result[f.column] = JSON.parse($es[f.column].value);
                        } catch (e) {
                        }
                    } else if (f.type === "checkbox") {
                        result[f.column] = !!$es[f.column].checked;
                    } else if (f.type === "checkbox_group") {
                        const values = [...$es[f.column]].filter((x) => x.checked).map((x) => x.value);
                        result[f.column] = f.valueOnly ? values : f.$ins.toOption(values);
                    } else if (f.type === "radio_group") {
                        const fv = $es[f.column].value;
                        result[f.column] = f.valueOnly ? fv : f.$ins.toOption(fv);
                    } else if (f.type === "range" || f.type === "number") {
                        result[f.column] = +$es[f.column].value;
                    } else {
                        result[f.column] = $es[f.column].value;
                    }
                });
                return result;
            }
            Object.keys(v).forEach((x) => {
                if ($es[x]) {
                    const field = fieldMap[x];
                    const fv = v[x];
                    if (typeof fv === "object") {
                        if (field.type === "checkbox_group") {
                            if (field.valueKey) {
                                const tmp = fv.map((x) => x[field.valueKey] ?? x);
                                [...$es[x]].forEach(($it) => {
                                    $it.checked = tmp.includes($it.value);
                                });
                            } else {
                                const $checks = [...$es[x]];
                                fv.forEach((it) => {
                                    if ($checks[it]) $checks[it].checked = true;
                                });
                            }
                        } else if (field.type === "radio_group") {
                            $es[x].value = fv[field.valueKey] || fv;
                        } else {
                            $es[x].value = JSON.stringify(fv, undefined, 2);
                            if ($es[x].dataset) $es[x].dataset.isJson = "true";
                        }
                    } else if (typeof fv === "boolean") {
                        $es[x].checked = fv;
                    } else {
                        $es[x].value = fv;
                        if (field.type === "range") {
                            if ($es[x].nextSibling) $es[x].nextSibling.innerText = fv;
                        }
                    }
                }
            });
        }
    }

    function createUploader(q, callback) {
        const $el = q instanceof HTMLElement ? q : document.querySelector(q);
        if (!$el) return;
        if (typeof callback === "string") {
            if (callback === "input") {
                callback = (file) => {
                    file.text().then((txt) => {
                        $el.value = txt;
                    });
                }
            }
        }
        $el.addEventListener('dragover', (e) => {
            e.stopPropagation();
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });
        $el.addEventListener("drop", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files && files.length) {
                callback(files[0]);
            }
        });
    }

    function listenAreaAction($area, callback = NOOP, what = '[data-action]', evt = 'click') {
        if (!$area) return;
        if (typeof $area === "string") $area = document.querySelector($area);
        $area.addEventListener(evt, (e) => {
            if (e.target) {
                const el = e.target.closest(what);
                if (el && $area.contains(el)) {
                    callback({el, action: el.dataset.action});
                }
            }
        });
    }

    function createFormDialog({fields = [], persist = false, title = "", glass} = {}) {
        const ID_PRE = `dialog_${++UI_CTX.index}`;
        const inputGroups = [];
        const fieldIns = {};
        const fieldsHtml = fields.map((x) => {
            let input;
            const id = `form_${ID_PRE}_${x.column}`;
            const jsonAttr = x.json ? ` data-is-json="true" ` : '';
            const required = x.required ? ` required ` : '';
            if (x.type === "textarea") {
                input = `<textarea id="${id}" name="${x.column}" class="rmx-form-textarea" ${jsonAttr}${required} style="width: 560px;height: 280px"></textarea>`;
            } else if (x.type === "checkbox") {
                input = `<input id="${id}" name="${x.column}" type="checkbox" ${required}/>`;
            } else if (x.type === "radio_group" || x.type === "checkbox_group") {
                inputGroups.push(x);
                input = `<div id="${id}" class="rmx-form-check-able-group-container"></div>`;
            } else if (x.type === "range") {
                const initValue = x.initValue || 0;
                input = `<div class="rmx-form-range-container"><input id="${id}" name="${x.column}" type="range" min="${x.min}" max="${x.max}" step="${x.step}" value="${initValue}"/><span id="txt_${id}">${initValue}</span></div>`;
            } else if (x.type === "number") {
                const initValue = x.initValue || 0;
                input = `<input id="${id}" name="${x.column}" type="number" min="${x.min}" max="${x.max}" step="${x.step}" value="${initValue}" class="rmx-form-input" ${required}/>`;
            } else {
                input = `<input id="${id}" name="${x.column}" class="rmx-form-input" ${required}/>`;
            }
            return `<div class="rmx-form-item">
<label for="${id}"><span class="form-item-label-text ${x.required ? 'form-item-label-text-required' : ''}">${x.label}</span></label>
${input}
</div>`;
        }).join('\n');

        const $dialog = createDialog({
            persist,
            glass,
            title,
            content: `<fieldset class="rmx-form-field-set">${fieldsHtml}</fieldset>`,
            init: (e) => {
                inputGroups.forEach((x) => {
                    const id = `form_${ID_PRE}_${x.column}`;
                    const $area = e.$body.querySelector(`#${id}`);
                    if ($area) {
                        x.$ins = createInputGroup($area, {
                            name: x.column,
                            type: x.type === "checkbox_group" ? "checkbox" : "radio",
                            textKey: x.textKey,
                            valueKey: x.valueKey,
                            source: x.source,
                            withEmpty: x.withEmpty,
                            columns: x.columns,
                        });
                        fieldIns[x.column] = x.$ins;
                    }
                });
                listenAreaAction(e.$body, (e) => {
                    if (e.el.nextSibling) {
                        e.el.nextSibling.innerText = e.el.value;
                    }
                }, 'input[type=range]', 'input');
            },
        });
        const $form = $dialog.$form;
        const $fieldset = $form.querySelector('.rmx-form-field-set');
        const $confirm = $dialog.$footer?.querySelector('.rmx-btn.rmx-btn-primary');
        const $title = $dialog.$title;
        const open = (value) => {
            if (value || value === null) $form.reset();
            if (value) val(value);
            return $dialog.open().then((e) => {
                if (e.action === "confirm") {
                    return {action: "confirm", value: val()};
                } else {
                    return e;
                }
            });
        }
        const val = createValFunc($form, fields);
        const toOption = (field, value) => fieldIns[field]?.toOption?.(value);
        return {
            open,
            toOption,
            get disabled() {
                return !!$fieldset.disabled;
            },
            set disabled(v) {
                $fieldset.disabled = !!v;
            },
            get confirmable() {
                return $confirm ? !$confirm.disabled : true;
            },
            set confirmable(v) {
                if ($confirm) $confirm.disabled = !v;
            },
            get title() {
                return $title.innerText;
            },
            set title(v) {
                $title.innerText = v;
            },
        }
    }

    function createTable(container, fields = [], actions = {}) {
        if (actions.manage) {
            const u = actions.manage;
            Object.assign(actions, {load: u, add: u, edit: u, remove: u});
        }
        const $events = createEvents();
        container.innerHTML = `<div class="rmx-table-toolbar"><button class="rmx-btn rmx-btn-primary" data-action="add">新增</button></div><div class="rmx-table-main"></div>`;
        const $toolbar = container.querySelector('.rmx-table-toolbar');
        const $main = container.querySelector('.rmx-table-main');
        const ctx = {list: []};
        const tableFields = fields.filter((x) => x.display);
        const HEADER = `<tr><th class="rmx-table-no"></th><th class="rmx-table-op">操作</th>${tableFields.map((x) => `<th>${x.label}</th>`).join('')}</tr>`;
        const COLS = tableFields.map((x) => x.column);

        const OP_CELL = createButtons([
            {type: "primary", action: "edit", text: "编辑"},
            {action: "copy", text: "复制"},
            {type: "danger", action: "remove", text: "删除"}
        ]);
        const OP_VIEW = createButtons([
            {type: "primary", action: "view", text: "查看"},
            {action: "copy", text: "复制"},
        ]);
        const $formDialog = createFormDialog({
            persist: true,
            fields,
        });
        const isEditable = actions.editable ? actions.editable : (x) => (x.editable === undefined || !!x.editable);
        const rowRender = (x, i) => {
            const editable = isEditable(x);
            return `<tr><td class="rmx-table-no">${i + 1}</td><td class="rmx-table-op" data-index="${i}">${editable ? OP_CELL : OP_VIEW}</td>${COLS.map((c) => `<td>${(x[c] || '-')}</td>`).join('')}</tr>`;
        }
        const render = () => {
            if (!ctx.list || !ctx.list.length) {
                $main.innerHTML = '<div>暂无数据</div>';
                return;
            }
            $main.innerHTML = `<table class="rmx-table">
<thead>${HEADER}</thead>
<tbody>${ctx.list.map((x, i) => rowRender(x, i)).join('')}</tbody>
</table>`;
        };
        const openEditor = (title, editable, isEdit, data) => {
            $formDialog.title = title || $formDialog.title;
            $formDialog.disabled = !editable;
            $formDialog.confirmable = editable;
            ctx.edit = isEdit;
            ctx.curRow = isEdit ? data : null;
            $formDialog.open(data || null).then((e) => {
                if (e.action === "confirm") {
                    if (ctx.edit) {
                        doAction('edit', {id: ctx.curRow.id, data: e.value, action: 'edit'}).then((r) => load());
                    } else {
                        doAction('add', {data: e.value, action: 'add'}).then((r) => load());
                    }
                }
            });
        }
        const doAction = (name, param) => new Promise((resolve) => {
            if (!actions[name]) return;
            if (typeof actions[name] === 'function') {
                actions[name](param).then((res) => resolve(res));
            } else {
                fetchData(actions[name], param).then((res) => resolve(res));
            }
        });
        const load = () => {
            doAction('load').then((res) => {
                ctx.list = res.list;
                render();
            });
        }
        $main.addEventListener('click', (e) => {
            const $el = e.target;
            if (!$el) return;
            const act = $el.dataset.action;
            const index = +$el.parentElement.dataset.index;
            const data = ctx.list[index];
            if (act === 'edit') {
                openEditor('编辑', true, true, data);
            } else if (act === 'copy') {
                openEditor('复制', true, false, data);
            } else if (act === 'view') {
                openEditor('查看', false, false, data);
            } else if (act === 'remove') {
                showConfirm('确认删除条目').then((e) => {
                    if (e.action === 'confirm') {
                        doAction('remove', {id: data.id, action: 'remove'}).then((r) => load());
                    }
                })
            } else {
                $events.emit(act, {act, data});
            }
        });
        $toolbar.addEventListener('click', (e) => {
            const $el = e.target;
            if (!$el) return;
            const act = $el.dataset.action;
            if (act === 'add') {
                openEditor('新增', true);
            } else {
                $events.emit(act, {act});
            }
        });
        return {load, on: $events.on};
    }

    Object.assign(window, {
        createUploader,
        createFormDialog,
        createTable,
        listenAreaAction,
    });
})();