let suggestWidget;
let monacoListRows;
let monacoBreadcrumbs;
let explorerTitleLabel;
let explorerTitleLabelH2;

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
    const labelsBuffer = [];

    function updateExplorerTitle() {
        const folderLabels = monacoBreadcrumbs.querySelectorAll('.folder .label-name');

        let newTitle;

        if (folderLabels.length === 0) {
            newTitle = "~\\";
        }
        else {
            labelsBuffer.length = 0;

            for (let i = 0; i < folderLabels.length; i++) {
                labelsBuffer.push(folderLabels[i].textContent);
            }

            newTitle = "~\\" + labelsBuffer.join("\\");
        }

        if (explorerTitleLabelH2.textContent !== newTitle) {
            explorerTitleLabelH2.textContent = newTitle;
        }
    }

    getElementWithInterval('.monaco-breadcrumbs').then(element => {
        monacoBreadcrumbs = element;

        const observer = new MutationObserver(updateExplorerTitle);
        observer.observe(monacoBreadcrumbs, { childList: true });
    });

    getElementWithInterval('.sidebar.pane-composite-part:has(.explorer-viewlet) .composite.title .title-label').then(element => {
        explorerTitleLabel = element;
        explorerTitleLabelH2 = explorerTitleLabel.querySelector('h2');

        const observer = new MutationObserver(updateExplorerTitle);
        observer.observe(explorerTitleLabel, { childList: true, subtree: true });
    });
}

function changeSuggestDetails() {
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
