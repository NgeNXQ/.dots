let suggestWidget;
let suggestDetailsContainer;

function getElementWithIntervalByClassName(className, pollingInterval = 10) {
    return new Promise((resolve) => {
        const intervalId = setInterval(() => {
            const cachedElement = document.querySelector(className);

            if (cachedElement) {
                clearInterval(intervalId);
                resolve(cachedElement);
            }
        }, pollingInterval);
    });
}

function updateSuggestDetailsContainer() {
    const widgetRect = suggestWidget.getBoundingClientRect();
    suggestDetailsContainer.style.setProperty('--suggest-details-left', `${widgetRect.left}px`);
    suggestDetailsContainer.style.setProperty('--suggest-details-top', `${widgetRect.bottom}px`);
}

document.addEventListener('DOMContentLoaded', () => {
    getElementWithIntervalByClassName('.suggest-widget').then(element => {
        suggestWidget = element;

        const observerSuggestWidget = new MutationObserver(() => {
            updateSuggestDetailsContainer();
        });

        observerSuggestWidget.observe(element, { childList: true, subtree: true });
    });

    getElementWithIntervalByClassName('.suggest-details-container').then(element => {
        suggestDetailsContainer = element;
        updateSuggestDetailsContainer();
    });
});
