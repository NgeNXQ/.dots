function getWindowTitleText() {
    const windowTitle = document.querySelector('.window-title');
    return windowTitle ? windowTitle.textContent.trim() : '';
}

function setExplorerTitleLabel(titleText) {
    const paneCompositeParts = document.querySelectorAll('.pane-composite-part');

    paneCompositeParts.forEach(paneCompositePart => {
        const explorerViewlet = paneCompositePart.querySelector('.composite.viewlet.explorer-viewlet');

        if (explorerViewlet) {
            const titleLabel = paneCompositePart.querySelector('.composite.title .title-label h2');

            if (titleLabel) {
                titleLabel.textContent = titleText;
            }
        }
    });
}

function updateExplorerTitleLabel() {
    const titleText = getWindowTitleText();

    if (titleText) {
        setExplorerTitleLabel(titleText);
    }
}

document.addEventListener('DOMContentLoaded', updateExplorerTitleLabel);

const observer = new MutationObserver(() => {
    updateExplorerTitleLabel();
});

observer.observe(document.body, { childList: true, subtree: true });