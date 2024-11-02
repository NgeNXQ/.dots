// workbench.parts.sidebar
// workbench.parts.titlebar
// workbench.parts.auxiliarybar

let windowTitle;
let workbenchPartBar;

function getElementByIdWithInterval(elementId, pollingInterval = 10) {
    return new Promise((resolve) => {
        const intervalId = setInterval(() => {
            const cachedElement = document.getElementById(elementId);

            if (cachedElement) {
                clearInterval(intervalId);
                resolve(cachedElement);
            }
        }, pollingInterval);
    });
}

function updateExplorerTitleLabel() {
    const explorerTitleLabel = workbenchPartBar.querySelector('.composite.title .title-label h2');
    explorerTitleLabel.textContent = windowTitle.textContent.trim();
}

document.addEventListener('DOMContentLoaded', () => {
    getElementByIdWithInterval('workbench.parts.titlebar').then(element => {
        windowTitle = element;

        const observerTitleBar = new MutationObserver(() => {
            updateExplorerTitleLabel();
        });

        observerTitleBar.observe(element, { childList: true, subtree: true });
    });

    getElementByIdWithInterval('workbench.parts.sidebar').then(element => {
        workbenchPartBar = element;

        const observerTitleBar = new MutationObserver(() => {
            updateExplorerTitleLabel();
        });

        observerTitleBar.observe(element, { childList: true, subtree: true });
    });
});
