let windowTitle;
let explorerTitleLabel;

let suggestWidget;
let monacoListRows;
let suggestDetailsContainer;

function getElementWithInterval(selector, pollingInterval = 10) {
    return new Promise((resolve) => {
        const intervalId = setInterval(() => {
            const cachedElement = document.querySelector(selector);

            if (cachedElement) {
                clearInterval(intervalId);
                resolve(cachedElement);
            }
        }, pollingInterval);
    });
}

function changeSuggest() {
    const maxChildCount = 13;

    getElementWithInterval('.suggest-widget').then(element => {
        suggestWidget = element;
    });

    getElementWithInterval('.suggest-widget .tree .monaco-list .monaco-scrollable-element .monaco-list-rows').then(element => {
        monacoListRows = element;

        const observer = new MutationObserver(() => {
            const height = monacoListRows.childElementCount < maxChildCount ? monacoListRows.style.height : suggestWidget.style.height;
            document.documentElement.style.setProperty('--custom-suggest-height', `${height}`);
        });

        observer.observe(monacoListRows, { attributes: true });
    });
}

function changeExplorerTitle() {
    getElementWithInterval('.pane-composite-part:has(.content .explorer-viewlet) .composite.title .title-label h2').then(element => {
        explorerTitleLabel = element;

        const observer = new MutationObserver(() => {
            if (explorerTitleLabel && windowTitle) {
                explorerTitleLabel.textContent = windowTitle.textContent.trim();
            }
        });

        observer.observe(explorerTitleLabel, { childList: true });
    });

    getElementWithInterval('.window-title').then(element => {
        windowTitle = element;

        const observer = new MutationObserver(() => {
            if (explorerTitleLabel && windowTitle) {
                explorerTitleLabel.textContent = windowTitle.textContent.trim();
            }
        });

        observer.observe(windowTitle, { childList: true });
    });
}

function changeSuggestDetails() {
    getElementWithInterval('.suggest-details-container').then(element => {
        suggestDetailsContainer = element;
    });

    getElementWithInterval('.suggest-widget').then(element => {
        suggestWidget = element;

        const observer = new MutationObserver(() => {
            const widgetRect = suggestWidget.getBoundingClientRect();
            document.documentElement.style.setProperty('--custom-suggest-details-left', `${widgetRect.left}px`);
            document.documentElement.style.setProperty('--custom-suggest-details-top', `${widgetRect.bottom + 1}px`);
        });

        observer.observe(suggestWidget, { attributes: true });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    changeSuggest();
    changeExplorerTitle();
    changeSuggestDetails();
});
