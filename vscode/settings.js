(() => {
    function installQuickInputBlur() {
        const root = document.documentElement;
        const radius = parseFloat(getComputedStyle(root).getPropertyValue('--custom-quick-input-blur')) || 12;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="blur" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">
            <feComponentTransfer in="SourceGraphic" result="opaque"><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>
            <feMorphology in="opaque" operator="dilate" radius="0.5" result="thickened"/>
            <feGaussianBlur in="thickened" stdDeviation="${radius}" edgeMode="duplicate" result="blurred"/>
            <feMorphology in="SourceAlpha" operator="dilate" radius="8" result="alphaDilated"/>
            <feGaussianBlur in="alphaDilated" stdDeviation="${radius}" edgeMode="duplicate" result="alphaBlurred"/>
            <feComposite in="blurred" in2="alphaBlurred" operator="in" result="combined"/>
            <feComponentTransfer in="combined"><feFuncA type="linear" slope="1.8"/></feComponentTransfer>
        </filter></svg>`;
        root.style.setProperty('--custom-quick-input-filter', `url("data:image/svg+xml,${encodeURIComponent(svg)}#blur")`);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installQuickInputBlur, { once: true });
    else installQuickInputBlur();
})();

(() => {
    'use strict';
    globalThis.suggestLayoutCustomization?.dispose?.();
    const widgets = new Map();
    const rootStyle = document.documentElement.style;
    const propertyNames = ['--custom-suggest-height', '--custom-suggest-details-left', '--custom-suggest-details-top'];
    let discovery;
    let stopped = false;
    const api = globalThis.suggestLayoutCustomization = { status: 'waiting', dispose };

    function setProperty(style, name, value) {
        if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
    }

    function attach(widget) {
        if (widgets.has(widget)) return;
        let frame = 0;
        let disposed = false;
        let rows;
        function update() {
            frame = 0;
            if (disposed || !widget.isConnected) return;
            if (!rows?.isConnected) rows = widget.querySelector('.tree .monaco-list .monaco-list-rows');
            const rect = widget.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const height = rows && (rows.childElementCount < 13 ? rows.style.height : widget.style.height);
            if (height) setProperty(widget.style, '--custom-suggest-height', height);
            setProperty(rootStyle, '--custom-suggest-details-left', `${rect.left}px`);
            setProperty(rootStyle, '--custom-suggest-details-top', `${rect.bottom + 1}px`);
        }
        function schedule() {
            if (!disposed && !frame) frame = requestAnimationFrame(update);
        }
        const mutations = new MutationObserver(schedule);
        mutations.observe(widget, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
        const resize = new ResizeObserver(schedule);
        resize.observe(widget);
        widgets.set(widget, {
            schedule,
            dispose() {
                disposed = true;
                cancelAnimationFrame(frame);
                mutations.disconnect();
                resize.disconnect();
                widget.style.removeProperty('--custom-suggest-height');
            },
        });
        schedule();
    }

    function discover(node) {
        if (node.nodeType !== 1) return;

        if (node.matches('.suggest-widget')) attach(node);
        else if (!node.closest('.suggest-widget')) {
            for (const widget of node.querySelectorAll('.suggest-widget')) attach(widget);
        }
    }

    function scheduleAll() {
        for (const controller of widgets.values()) controller.schedule();
    }

    function start() {
        if (stopped) return;
        discover(document.documentElement);
        discovery = new MutationObserver(records => {
            let removed = false;
            for (const record of records) {
                for (const node of record.addedNodes) discover(node);
                removed ||= record.removedNodes.length > 0;
            }
            if (removed) {
                for (const [widget, controller] of widgets) {
                    if (!widget.isConnected) {
                        controller.dispose();
                        widgets.delete(widget);
                    }
                }
            }
        });
        discovery.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', scheduleAll);
        document.addEventListener('scroll', scheduleAll, true);
        api.status = 'active';
    }

    function dispose() {
        if (stopped) return;
        stopped = true;
        document.removeEventListener('DOMContentLoaded', start);
        discovery?.disconnect();
        window.removeEventListener('resize', scheduleAll);
        document.removeEventListener('scroll', scheduleAll, true);
        for (const controller of widgets.values()) controller.dispose();
        widgets.clear();
        for (const name of propertyNames) rootStyle.removeProperty(name);
        api.status = 'disposed';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();

(() => {
    'use strict';

    globalThis.breakpointHighlightExperiment?.dispose?.();

    const hooks = new Map();
    const subscriptions = [];
    const editors = new Map();
    let debugService;
    let editorService;
    let stopped = false;
    let started = false;
    let scheduled = false;
    let startupTimer;
    const experiment = globalThis.breakpointHighlightExperiment = {
        status: 'waiting-for-services',
        highlightedLines: 0,
        editorCount: 0,
        error: null,
        dispose,
        refresh: schedule,
    };

    function setStatus(status) {
        experiment.status = status;
        document.documentElement.dataset.breakpointExperiment = status;
    }

    function removeHook(name) {
        const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, name);
        if (descriptor?.set === hooks.get(name)) {
            delete Object.prototype[name];
        }
        hooks.delete(name);
    }

    function clearHooks() {
        for (const name of [...hooks.keys()]) removeHook(name);
    }

    function dispose() {
        if (stopped) return;
        stopped = true;
        clearTimeout(startupTimer);
        clearHooks();
        for (const subscription of subscriptions) subscription.dispose();
        for (const [editor, entry] of editors) removeEditor(editor, entry);
        experiment.highlightedLines = 0;
        experiment.editorCount = 0;
        setStatus('disposed');
    }

    function fail(error) {
        dispose();
        experiment.error = String(error?.stack || error);
        setStatus('unavailable');
    }

    function schedule() {
        if (stopped || !started || scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            if (stopped) return;
            try { refresh(); } catch (error) { fail(error); }
        });
    }

    function removeEditor(editor, entry = editors.get(editor)) {
        if (!entry) return;
        for (const subscription of entry.subscriptions) subscription.dispose();
        entry.decorations.clear();
        entry.executionDecorations.clear();
        editors.delete(editor);
    }

    function executionLinesByUri() {
        const byUri = new Map();
        const focused = debugService.getViewModel?.()?.focusedStackFrame;
        function add(frame, kind) {
            const line = frame?.range?.startLineNumber;
            if (!frame?.source?.uri || !Number.isInteger(line) || line < 1) return;
            const uri = frame.source.uri.toString();
            if (!byUri.has(uri)) byUri.set(uri, new Map());
            const lines = byUri.get(uri);

            if (kind === 'top' || !lines.has(line)) lines.set(line, kind);
        }
        for (const session of debugService.getModel().getSessions?.() || []) {
            for (const thread of session.getAllThreads()) {
                if (thread.stopped) add(thread.getCallStack()[0], 'top');
            }
        }
        if (focused?.thread?.stopped) {
            const top = focused.thread.getTopStackFrame();
            if (focused.getId() !== top?.getId()) add(focused, 'focused');
        }
        return byUri;
    }

    function refresh() {
        const currentEditors = new Set(editorService.listCodeEditors());
        for (const [editor, entry] of editors) {
            if (!currentEditors.has(editor)) removeEditor(editor, entry);
        }

        const breakpoints = debugService.getModel().getBreakpoints({ enabledOnly: true });

        const linesByUri = new Map();
        for (const breakpoint of breakpoints) {
            if (!breakpoint.enabled || !Number.isInteger(breakpoint.lineNumber) || breakpoint.lineNumber < 1) continue;
            const uri = breakpoint.uri.toString();
            if (!linesByUri.has(uri)) linesByUri.set(uri, new Set());
            linesByUri.get(uri).add(breakpoint.lineNumber);
        }
        const executionByUri = executionLinesByUri();
        let highlightedLines = 0;
        for (const editor of currentEditors) {
            if (typeof editor.createDecorationsCollection !== 'function') continue;
            let entry = editors.get(editor);
            if (!entry) {
                entry = { decorations: editor.createDecorationsCollection(), subscriptions: [], model: null, key: "", lineCount: 0 };
                entry.executionDecorations = editor.createDecorationsCollection();
                entry.executionKey = '';
                entry.executionLineCount = 0;
                entry.executionModel = null;
                editors.set(editor, entry);
                entry.subscriptions.push(editor.onDidChangeModel(schedule));
                entry.subscriptions.push(editor.onDidChangeModelContent(() => {
                    if (entry.lineCount || entry.executionLineCount) schedule();
                }));
                entry.subscriptions.push(editor.onDidDispose(() => removeEditor(editor)));
            }
            const model = editor.getModel();
            let lines = [];
            if (model && !model.isDisposed()) {
                const maxLine = model.getLineCount();
                lines = [...(linesByUri.get(model.uri.toString()) || [])]
                    .filter(line => line <= maxLine).sort((a, b) => a - b);
            }
            const key = lines.join(',');
            const ranges = entry.lineCount ? entry.decorations.getRanges?.() : null;
            const trackedKey = ranges?.map(range => range.startLineNumber).join(',');
            if (entry.model !== model || entry.key !== key || (trackedKey != null && trackedKey !== key)) {
                if (lines.length || entry.lineCount) {
                    entry.decorations.set(lines.map(line => ({
                        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
                        options: {
                            description: 'custom-ui-breakpoint-highlight',
                            isWholeLine: true,
                            marginClassName: 'custom-ui-breakpoint-margin',
                            stickiness: 1,
                        },
                    })));
                }
                entry.model = model;
                entry.key = key;
                entry.lineCount = lines.length;
            }
            highlightedLines += lines.length;

            const execution = model && !model.isDisposed()
                ? [...(executionByUri.get(model.uri.toString()) || [])]
                    .filter(([line]) => line <= model.getLineCount()).sort(([a], [b]) => a - b)
                : [];
            const executionKey = execution.map(([line, kind]) => `${line}:${kind}`).join(',');
            const executionRanges = entry.executionLineCount ? entry.executionDecorations.getRanges?.() : null;
            const moved = executionRanges && executionRanges.some((range, index) => range.startLineNumber !== execution[index]?.[0]);
            if (entry.executionModel !== model || entry.executionKey !== executionKey || moved) {
                if (execution.length || entry.executionLineCount) {
                    entry.executionDecorations.set(execution.map(([line, kind]) => ({
                        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
                        options: {
                            description: 'custom-ui-debug-execution-margin',
                            isWholeLine: true,
                            marginClassName: `custom-ui-debug-${kind}-margin`,
                            stickiness: 1,
                            zIndex: 10,
                        },
                    })));
                }
                entry.executionModel = model;
                entry.executionKey = executionKey;
                entry.executionLineCount = execution.length;
            }
        }
        experiment.highlightedLines = highlightedLines;
        experiment.editorCount = editors.size;
        document.documentElement.dataset.breakpointExperimentLines = String(highlightedLines);
    }

    function start() {
        if (stopped || started || !debugService || !editorService) return;
        started = true;
        clearTimeout(startupTimer);
        clearHooks();
        try {
            subscriptions.push(debugService.getModel().onDidChangeBreakpoints(schedule));
            const debugModel = debugService.getModel();
            const debugView = debugService.getViewModel?.();
            if (debugModel.onDidChangeCallStack) subscriptions.push(debugModel.onDidChangeCallStack(schedule));
            if (debugView?.onDidFocusStackFrame) subscriptions.push(debugView.onDidFocusStackFrame(schedule));
            subscriptions.push(editorService.onCodeEditorAdd(schedule));
            subscriptions.push(editorService.onCodeEditorRemove(schedule));
            refresh();
            setStatus('active');
        } catch (error) { fail(error); }
    }

    function capture(name, kind) {
        if (Object.getOwnPropertyDescriptor(Object.prototype, name)) return;
        function setter(value) {
            Object.defineProperty(this, name, {
                value, configurable: true, enumerable: true, writable: true,
            });
            try {
                if (kind === 'debug' && typeof value?.getModel === 'function' &&
                    typeof value.getModel()?.getBreakpoints === 'function') {
                    debugService = value;
                    removeHook('debugService');
                    removeHook('_debugService');
                } else if (kind === 'editor' && typeof value?.listCodeEditors === 'function' &&
                    typeof value?.onCodeEditorAdd === 'function') {
                    editorService = value;
                    removeHook('codeEditorService');
                    removeHook('_codeEditorService');
                }
                if (debugService && editorService) queueMicrotask(start);
            } catch (error) { queueMicrotask(() => fail(error)); }
        }
        hooks.set(name, setter);
        Object.defineProperty(Object.prototype, name, { configurable: true, set: setter });
    }

    if (document.querySelector('.monaco-workbench')) {
        fail('Loaded after workbench startup. Run Custom UI Style: Reload and restart VS Code.');
        return;
    }
    setStatus('waiting-for-services');
    startupTimer = setTimeout(() => {
        fail(`Service capture timed out (debug=${!!debugService}, editor=${!!editorService}).`);
    }, 20000);
    capture('debugService', 'debug');
    capture('_debugService', 'debug');
    capture('codeEditorService', 'editor');
    capture('_codeEditorService', 'editor');
})();


(() => {
    'use strict';
    globalThis.explorerLayoutExperiment?.dispose?.();

    const targets = new Map([
        ['workbench.parts.sidebar', 'workbench.view.explorer'],
        ['workbench.parts.auxiliarybar', 'workbench.view.debug'],
    ]);
    const controllers = new Map();
    const api = globalThis.explorerLayoutExperiment = {
        status: 'waiting', error: null, parts: {}, dispose,
    };
    let stopped = false;
    let startupTimer;

    function removeCapture() {
        if (Object.getOwnPropertyDescriptor(Object.prototype, 'partLayout')?.set === capture) {
            delete Object.prototype.partLayout;
        }
        clearTimeout(startupTimer);
    }

    function createController(part, helper, targetView) {
        const nativeHeights = new Set();
        const subscriptions = [];
        const heightSelector = '.content, .split-view-view';
        let originalLayout, wrappedLayout, observer, resizeObserver;
        let frame = 0;
        let stopped = false;
        function isTargetView() {
            return part.getActiveComposite?.()?.getId() === targetView;
        }
        function saveHeight(element) {
            const height = element.style.height;
            if (height && element.style.getPropertyValue('--viewlet-native-height') !== height) {
                element.style.setProperty('--viewlet-native-height', height);
                nativeHeights.add(element);
            }
        }

        function synchronize() {
            frame = 0;
            if (stopped || !part?.element) return;
            const sidebar = part.element;
            const active = isTargetView();
            const state = active ? 'active' : 'inactive';
            if (sidebar.dataset.viewletLayoutFix !== state) sidebar.dataset.viewletLayoutFix = state;
            if (!active) return;
            saveHeight(sidebar);
            for (const element of sidebar.querySelectorAll(heightSelector)) saveHeight(element);
        }

        function schedule() {
            if (!stopped && !frame) frame = requestAnimationFrame(synchronize);
        }

        function relayout() {
            if (stopped) return;
            cancelAnimationFrame(frame);
            frame = 0;
            synchronize();
            part.relayout();
            schedule();
        }

        function disposePart() {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(frame);
            observer?.disconnect();
            resizeObserver?.disconnect();
            for (const subscription of subscriptions) subscription.dispose();
            if (helper?.layout === wrappedLayout) helper.layout = originalLayout;
            for (const element of nativeHeights) element.style.removeProperty('--viewlet-native-height');
            nativeHeights.clear();
            if (part?.element) delete part.element.dataset.viewletLayoutFix;
            api.parts[part.partId] = 'disposed';
            part?.relayout();
        }

        function fail(error) {
            disposePart();
            api.error = String(error?.stack || error);
            api.parts[part.partId] = 'unavailable';
        }

        function install() {
            if (stopped) return;
            try {
                originalLayout = helper.layout;
                wrappedLayout = function (...args) {
                    const hiddenTitle = isTargetView() && part.titleArea &&
                        getComputedStyle(part.titleArea).display === 'none';
                    const hasTitle = this.options.hasTitle;
                    if (hiddenTitle) this.options.hasTitle = false;
                    try { return originalLayout.apply(this, args); }
                    finally { this.options.hasTitle = hasTitle; }
                };
                helper.layout = wrappedLayout;
                observer = new MutationObserver(records => {
                    let removed = false;
                    for (const record of records) {
                        if (record.type === 'attributes') {
                            if (record.attributeName === 'data-active-composite') {
                                relayout();
                                return;
                            }
                            const element = record.target;
                            if (element === part.element || element.matches(heightSelector)) {
                                if (isTargetView()) saveHeight(element);
                            }
                        } else {
                            removed ||= record.removedNodes.length > 0;
                            for (const node of record.addedNodes) {
                                if (node.nodeType === 1 && (node.matches(heightSelector) || node.querySelector(heightSelector))) {
                                    schedule();
                                    return;
                                }
                            }
                        }
                    }

                    if (removed) {
                        for (const element of nativeHeights) {
                            if (!element.isConnected) nativeHeights.delete(element);
                        }
                    }
                });

                observer.observe(part.element, {
                    subtree: true, childList: true, attributes: true,
                    attributeFilter: ['style', 'data-active-composite'],
                });

                resizeObserver = new ResizeObserver(schedule);
                resizeObserver.observe(part.element);
                subscriptions.push(part.onDidPaneCompositeOpen(relayout));
                subscriptions.push(part.onDidPaneCompositeClose(schedule));
                api.parts[part.partId] = 'installed';
                relayout();
            } catch (error) { fail(error); }
        }

        install();
        return { dispose: disposePart };
    }

    function dispose() {
        if (stopped) return;
        stopped = true;
        removeCapture();
        for (const controller of controllers.values()) controller.dispose();
        controllers.clear();
        api.status = 'disposed';
    }

    function capture(value) {
        Object.defineProperty(this, 'partLayout', {
            value, writable: true, enumerable: true, configurable: true,
        });
        const targetView = targets.get(this.partId);
        if (!targetView || controllers.has(this.partId) || typeof value?.layout !== 'function') return;
        const part = this;
        controllers.set(part.partId, { dispose() { } });
        if (controllers.size === targets.size) removeCapture();
        queueMicrotask(() => {
            if (stopped) return;
            controllers.set(part.partId, createController(part, value, targetView));
            api.status = Object.values(api.parts).every(state => state === 'installed')
                && controllers.size === targets.size ? 'installed' : 'partial';
        });
    }

    if (document.querySelector('.monaco-workbench') ||
        Object.getOwnPropertyDescriptor(Object.prototype, 'partLayout')) {
        api.error = 'Startup capture unavailable. Run Custom UI Style: Reload and restart VS Code.';
        api.status = 'unavailable';
        return;
    }
    Object.defineProperty(Object.prototype, 'partLayout', { configurable: true, set: capture });
    startupTimer = setTimeout(() => {
        removeCapture();
        api.error = 'Not all sidebar layout helpers were captured.';
        api.status = controllers.size ? 'partial' : 'unavailable';
    }, 20000);
})();
