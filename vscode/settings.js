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