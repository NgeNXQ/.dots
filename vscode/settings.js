let windowTitle;
let paneCompositePart;
let explorerTitleLabel;

let suggestWidget;
let monacoListRows;
let suggestDetailsContainer;

function getElementWithIntervalBySelector(selector, pollingInterval = 10) {
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

function changeExplorerTitle() {
    getElementWithIntervalBySelector('.pane-composite-part:has(.content .explorer-viewlet)').then(element => {
        paneCompositePart = element;
        explorerTitleLabel = paneCompositePart.querySelector('.composite.title .title-label h2');

        const observer = new MutationObserver(() => {
            if (explorerTitleLabel && windowTitle) {
                explorerTitleLabel.textContent = windowTitle.textContent.trim();
            }
        });

        observer.observe(explorerTitleLabel, { childList: true, subtree: true });
    });

    getElementWithIntervalBySelector('.window-title').then(element => {
        windowTitle = element;

        const observer = new MutationObserver(() => {
            if (explorerTitleLabel && windowTitle) {
                explorerTitleLabel.textContent = windowTitle.textContent.trim();
            }
        });

        observer.observe(windowTitle, { childList: true, subtree: true });
    });
}

function changeSuggestDetails() {
    getElementWithIntervalBySelector('.suggest-details-container').then(element => {
        suggestDetailsContainer = element;
    });

    getElementWithIntervalBySelector('.suggest-widget').then(element => {
        suggestWidget = element;

        const observer = new MutationObserver(() => {
            const widgetRect = suggestWidget.getBoundingClientRect();
            suggestDetailsContainer.style.setProperty('--custom-suggest-details-left', `${widgetRect.left}px`);
            suggestDetailsContainer.style.setProperty('--custom-suggest-details-top', `${widgetRect.bottom + 1}px`);
        });

        observer.observe(suggestWidget, { childList: true, subtree: true });
    });
}

function changeSuggest() {
    const maxChildCount = 13;

    getElementWithIntervalBySelector('.suggest-widget').then(element => {
        suggestWidget = element;
    });

    getElementWithIntervalBySelector('.suggest-widget .tree .monaco-list .monaco-scrollable-element .monaco-list-rows').then(element => {
        monacoListRows = element;

        const observer = new MutationObserver(() => {
            suggestWidget.style.height = monacoListRows.childElementCount < maxChildCount ? monacoListRows.style.height : '';
        });

        observer.observe(suggestWidget, { attributes: true, childList: true, subtree: true });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    changeSuggest();
    changeExplorerTitle();
    changeSuggestDetails();
});
