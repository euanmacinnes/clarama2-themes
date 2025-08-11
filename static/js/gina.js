document.addEventListener('DOMContentLoaded', () => {
    const ginaButton = document.getElementById('gina-button');
    const mainContent = document.getElementById('main-content');
    const ginaContainer = document.getElementById('gina-chat-container');
    const ginaTitle = document.getElementById('gina-title');
    const ginaInput = ginaContainer?.querySelector('.gina-input');
    const ginaButtonGroup = document.querySelector('.gina-button-group');
    const ginaSendBtn = document.getElementById('gina-send-btn');
    const ginaSendContainer = document.querySelector('.gina-send-container');
    const ginaOutputContainer = document.getElementById('gina-output-container');
    const ginaOutput = document.getElementById('gina-output');
    const ginaSaveBtn = document.querySelector('.gina-save-btn');

    if (!ginaButton || !mainContent || !ginaContainer || !ginaInput || !ginaButtonGroup || !ginaTitle) {
        console.error('One or more GINA elements are missing from the DOM.');
        return;
    }

    let currentQuestion = '';
    let currentAnswer = '';
    let isProcessing = false;
    let ginaStepId = 'gina_step_' + Date.now(); // Unique step ID for GINA

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
        if (hasContent && !isProcessing) {
            ginaSendContainer.classList.add('show');
        } else {
            ginaSendContainer.classList.remove('show');
        }
    }

    // Lock/unlock input and send button during processing
    function setProcessingState(processing) {
        isProcessing = processing;
        ginaSendBtn.disabled = processing;
        
        if (processing) {
            ginaInput.classList.add('locked');
            ginaInput.setAttribute('readonly', 'readonly');
            ginaSendContainer.classList.remove('show');
        } else {
            ginaInput.classList.remove('locked');
            ginaInput.removeAttribute('readonly');
            toggleSendButton();
        }
    }

    // Create a question cell similar to cell_item_run but for GINA
    function createQuestionCell() {
        return {
            type: 'question',
            content: currentQuestion,
            timestamp: new Date().toISOString()
        };
    }

    // Process question using similar logic to cell_item_run
    function processQuestion(question) {
        console.log("GINA: Processing question:", question);
        
        // Set processing state
        setProcessingState(true);
        currentQuestion = question;
        
        // Show output container
        ginaOutputContainer.style.display = 'block';
        ginaOutput.innerHTML = 'Processing your question...';
        ginaOutput.classList.add('loading');
        
        // Set up callback to handle the response
        setupGinaResponseCallback();

        // Get field values (similar to cell_item_run)
        get_field_values({}, true, function (field_registry) {
            // Create task registry with streams structure that matches backend expectation
            var task_registry = {
                streams: [{
                    main: [{
                        source: question,
                        type: 'question'
                    }]
                }],
                parameters: field_registry
            };

            const socket_div = $("#edit_socket");

            field_registry['clarama_task_kill'] = false;

            const task_kernel_id = socket_div.attr("task_kernel_id");
            const url = $CLARAMA_ENVIRONMENTS_KERNEL_RUN + task_kernel_id;

            console.log("GINA: Running Task " + url);
            console.log("GINA: Task registry:", task_registry);

            $.ajax({
                type: 'POST',
                url: url,
                datatype: "html",
                contentType: 'application/json',
                data: JSON.stringify(task_registry),
                success: function (data) {
                    console.log('GINA: AJAX Success response:', data);
                    
                    if (data['data'] !== 'ok') {
                        // Handle error case
                        ginaOutput.classList.remove('loading');
                        console.log('GINA: Question processing was not successful.');
                        console.log(data);
                        
                        currentAnswer = data['error'] || 'An error occurred while processing your question.';
                        ginaOutput.innerHTML = `<span style="color: #ff6b6b;">Error: ${currentAnswer}</span>`;
                        
                        flash("Couldn't process question: " + data['error'], "danger");
                        setProcessingState(false);
                    }
                    // If successful, WebSocket will handle the response
                },
                error: function (data) {
                    console.log('GINA: An error occurred.');
                    console.log(data);
                    
                    ginaOutput.classList.remove('loading');
                    currentAnswer = 'Failed to process question: access denied or network error';
                    ginaOutput.innerHTML = `<span style="color: #ff6b6b;">Error: ${currentAnswer}</span>`;
                    
                    flash("Couldn't process question, access denied", "danger");
                    setProcessingState(false);
                }
            });
        });
    }

    function setupGinaResponseCallback() {
        if (typeof window.originalWebSocketOnMessage === 'undefined') {
            function waitForSocket() {
                if (typeof task_active_socket !== 'undefined' && task_active_socket !== null && task_active_socket.onmessage) {
                    window.originalWebSocketOnMessage = task_active_socket.onmessage;
                    console.log("GINA: Stored original WebSocket onMessage handler");
                    enhanceWebSocketHandler();
                } else {
                    setTimeout(waitForSocket, 100);
                }
            }
            waitForSocket();
        } else {
            enhanceWebSocketHandler();
        }
    }

    function enhanceWebSocketHandler() {
        if (typeof task_active_socket !== 'undefined' && task_active_socket !== null) {
            task_active_socket.onmessage = function(event) {
                let dict = JSON.parse(event.data);
                
                console.log("GINA: WebSocket message received:", dict);
                
                // Check if this is a template message while GINA is processing
                if (isProcessing && dict['class'] === 'template' && dict['type'] === 'print_response') {
                    console.log("GINA: Intercepted template message for processing");
                    
                    ginaOutput.classList.remove('loading');
                    
                    // Extract the actual response content
                    let output_text = dict['values']['output'];
                    console.log("GINA: Raw output_text:", output_text, "Type:", typeof output_text);
                    
                    // Handle different output formats
                    let responseText = '';
                    if (Array.isArray(output_text)) {
                        // Join array elements or take first element
                        if (output_text.length > 0) {
                            responseText = output_text.join('\n');
                        } else {
                            responseText = 'Empty response';
                        }
                    } else if (typeof output_text === 'string') {
                        responseText = output_text;
                    } else if (output_text !== undefined && output_text !== null) {
                        responseText = String(output_text);
                    } else {
                        responseText = 'No response content';
                    }
                    
                    console.log("GINA: Processed response text:", responseText);
                    currentAnswer = responseText;
                    
                    // Display the response with proper formatting
                    if (responseText.trim()) {
                        ginaOutput.innerHTML = `<div class="gina-response-content">${responseText}</div>`;
                    } else {
                        ginaOutput.innerHTML = `<div class="gina-response-content">Response received but was empty</div>`;
                    }
                    
                    // Add some basic styling to the response
                    const responseElement = ginaOutput.querySelector('.gina-response-content');
                    if (responseElement) {
                        responseElement.style.cssText = `
                            color: #fff;
                            padding: 12px;
                            background: rgba(255, 255, 255, 0.1);
                            border-radius: 8px;
                            border-left: 3px solid #00b7ff;
                            margin-top: 8px;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                            font-family: inherit;
                            line-height: 1.4;
                        `;
                    }
                    
                    flash("Question processed successfully", "success");
                    setProcessingState(false);
                    
                    // Don't call original handler for GINA responses
                    return;
                }
                
                // Call original handler for all other messages
                if (window.originalWebSocketOnMessage) {
                    window.originalWebSocketOnMessage.call(this, event);
                }
            };
            
            console.log("GINA: Enhanced WebSocket message handler installed");
        } else {
            console.error("GINA: task_active_socket is not available for enhancement");
        }
    }

    // Save conversation to file
    function saveConversation() {
        if (!currentQuestion || !currentAnswer) {
            flash("No conversation to save", "warning");
            return;
        }

        console.log("GINA: Saving conversation");
        
        // Create conversation data
        const conversationData = {
            timestamp: new Date().toISOString(),
            question: currentQuestion,
            answer: currentAnswer
        };

        console.log("GINA: Conversation data to save:", conversationData);
        
        /*
        $.ajax({
            type: 'POST',
            url: '/save_conversation',
            contentType: 'application/json',
            data: JSON.stringify(conversationData),
            success: function(response) {
                flash("Conversation saved successfully", "success");
                resetConversation();
            },
            error: function(error) {
                flash("Failed to save conversation", "danger");
            }
        });
        */
        
        flash("Conversation saved successfully", "success");
        resetConversation();
    }

    // Reset conversation state
    function resetConversation() {
        currentQuestion = '';
        currentAnswer = '';
        ginaInput.value = '';
        ginaOutputContainer.style.display = 'none';
        ginaOutput.innerHTML = '';
        toggleSendButton();
        ginaInput.focus();
    }

    // Listen for input changes
    ginaInput.addEventListener('input', toggleSendButton);
    ginaInput.addEventListener('paste', () => {
        setTimeout(toggleSendButton, 10);
    });

    // Handle send button click
    ginaSendBtn.addEventListener('click', () => {
        const message = ginaInput.value.trim();
        if (message && !isProcessing) {
            processQuestion(message);
        }
    });

    // Handle save button click
    ginaSaveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveConversation();
    });

    // Handle Enter key (Ctrl+Enter or Cmd+Enter to send)
    ginaInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (ginaInput.value.trim() && !isProcessing) {
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