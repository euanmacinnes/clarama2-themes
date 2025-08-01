document.addEventListener('DOMContentLoaded', () => {
    const ginaButton = document.getElementById('gina-button');
    const mainContent = document.getElementById('main-content');
    const ginaContainer = document.getElementById('gina-chat-container');
    const ginaTitle = document.getElementById('gina-title');
    const ginaInput = ginaContainer?.querySelector('.gina-input');
    const ginaButtonGroup = document.querySelector('.gina-button-group');
    const ginaSendBtn = document.getElementById('gina-send-btn');
    const ginaSendContainer = document.querySelector('.gina-send-container');

    if (!ginaButton || !mainContent || !ginaContainer || !ginaInput || !ginaButtonGroup || !ginaTitle) {
        console.error('One or more GINA elements are missing from the DOM.');
        return;
    }

    // Toggle GINA interface
    ginaButton.addEventListener('click', () => {
        const isActive = ginaContainer.classList.contains('active');

        if (!isActive) {
            // Show GINA
            mainContent.classList.add('hidden');
            ginaContainer.classList.add('active');
            ginaTitle.classList.add('active');
            ginaButtonGroup.classList.add('gina-active');
            setTimeout(() => ginaInput.focus(), 400);
        } else {
            // Hide GINA
            ginaContainer.classList.remove('active');
            ginaTitle.classList.remove('active'); 
            ginaButtonGroup.classList.remove('gina-active');
            setTimeout(() => mainContent.classList.remove('hidden'), 400);
        }
    });

    // Show/hide send button based on input content
    function toggleSendButton() {
        const hasContent = ginaInput.value.trim().length > 0;
        if (hasContent) {
            ginaSendContainer.classList.add('show');
        } else {
            ginaSendContainer.classList.remove('show');
        }
    }

    // Listen for input changes
    ginaInput.addEventListener('input', toggleSendButton);
    ginaInput.addEventListener('paste', () => {
        setTimeout(toggleSendButton, 10);
    });

    // Handle send button click
    ginaSendBtn.addEventListener('click', () => {
        const message = ginaInput.value.trim();
        if (message) {
            console.log('Sending message:', message);
            
            // Add message sending logic here
            
            // Clear the input and hide send button
            ginaInput.value = '';
            toggleSendButton();
            ginaInput.focus();
        }
    });

    // Handle Enter key (Ctrl+Enter or Cmd+Enter to send)
    ginaInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (ginaInput.value.trim()) {
                ginaSendBtn.click();
            }
        }
    });

    // Handle recent conversation clicks
    document.addEventListener('click', (e) => {
        const convoItem = e.target.closest('.recent-convo-item');
        if (convoItem && convoItem.dataset.convoId) {
            const convoId = convoItem.dataset.convoId;
            const convoTitle = convoItem.querySelector('.convo-title').textContent;
            
            console.log(`Loading conversation ${convoId}: ${convoTitle}`);
            
            ginaInput.value = `Continue our conversation about: ${convoTitle}`;
            toggleSendButton();
            ginaInput.focus();
        }
    });

    // Auto-close dropdown when GINA is closed
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const dropdown = bootstrap.Dropdown.getInstance(document.getElementById('gina-recent-btn'));
                if (dropdown && !ginaContainer.classList.contains('active')) {
                    dropdown.hide();
                }
            }
        });
    });

    observer.observe(ginaContainer, { attributes: true });
});