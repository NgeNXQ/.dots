function removeCustomCSSIndicator() {
    const customCSSIndicator = document.getElementById('be5invis.vscode-custom-css');

    if (customCSSIndicator) {
        customCSSIndicator.remove();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    removeCustomCSSIndicator();

    const observer = new MutationObserver(() => {
        removeCustomCSSIndicator();
    });

    observer.observe(document.body, { childList: true, subtree: true });
});