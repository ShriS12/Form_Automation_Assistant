const socket = io();

const taskBody = document.getElementById('task-body');
const totalTasksEl = document.getElementById('total-tasks');
const processingTasksEl = document.getElementById('processing-tasks');
const completedTasksEl = document.getElementById('completed-tasks');
const failedTasksEl = document.getElementById('failed-tasks');

let tasks = [];

function updateStats() {
    totalTasksEl.textContent = tasks.length;
    processingTasksEl.textContent = tasks.filter(t => t.status === 'PROCESSING').length;
    completedTasksEl.textContent = tasks.filter(t => t.status === 'COMPLETED' || t.status === 'PARTIAL_SUCCESS').length;
    failedTasksEl.textContent = tasks.filter(t => t.status === 'FAILED').length;
}

function renderTasks() {
    taskBody.innerHTML = '';
    tasks.forEach(task => {
        const row = document.createElement('tr');

        const statusClass = `status-${task.status.toLowerCase()}`;

        let resultText = '-';
        let fullResultText = '-';

        if (task.status === 'COMPLETED') {
            resultText = 'Success';
            fullResultText = 'Success';
        } else if (task.status === 'PARTIAL_SUCCESS') {
            resultText = 'Partial Success';
            fullResultText = 'Partial Success';
        } else if (task.status === 'FAILED') {
            const err = task.error || 'Failed';
            fullResultText = err;
            resultText = err.length > 20 ? err.substring(0, 20) + '...' : err;
        }

        // Prepare Logs for Tooltip
        let logTooltip = fullResultText;
        if (task.logs && task.logs.length > 0) {
            const logsStr = task.logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}`).join('\n');
            logTooltip = `Status: ${fullResultText}\n\nLogs:\n${logsStr}`;
        }

        // Safe escape for HTML attributes
        const escapeAttr = (str) => (str || '').replace(/"/g, '&quot;');

        row.innerHTML = `
            <td class="font-mono text-sm" title="${escapeAttr(task.id)}">${task.id.substring(0, 8)}...</td>
            <td title="${escapeAttr(task.url)}">${task.url}</td>
            <td><span class="status-badge ${statusClass}">${task.status}</span></td>
            <td>${new Date(task.createdAt).toLocaleTimeString()}</td>
            <td class="result-cell" title="${escapeAttr(logTooltip)}">${resultText}</td>
            <td>
                <button onclick="deleteTask('${task.id}')" class="btn-delete" title="Delete Task">🗑️</button>
            </td>
        `;

        taskBody.appendChild(row);
    });
    updateStats();
}

socket.on('initialState', (initialTasks) => {
    tasks = initialTasks;
    renderTasks();
});

socket.on('taskAdded', (task) => {
    tasks.unshift(task);
    renderTasks();
});

socket.on('taskUpdated', (updatedTask) => {
    const index = tasks.findIndex(t => t.id === updatedTask.id);
    if (index !== -1) {
        tasks[index] = updatedTask;
        renderTasks();

        // Check if task is waiting for file
        if (updatedTask.status === 'WAITING_FOR_FILE') {
            showUploadModal(updatedTask);
        }
    }
});

function showUploadModal(task) {
    const modal = document.getElementById('upload-modal');
    const message = document.getElementById('upload-message');
    const form = document.getElementById('file-upload-form');
    const cancelBtn = document.getElementById('cancel-upload');

    message.textContent = `Task needs a file for field: ${task.result?.selector || 'Unknown'}. Please select a file.`;
    modal.classList.remove('hidden');

    // Handle Cancel
    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
    };

    // Handle Submit
    form.onsubmit = async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('manual-file');
        const file = fileInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        if (task.result && task.result.selector) {
            formData.set('selector', task.result.selector);
        }

        try {
            const response = await fetch(`/api/tasks/${task.id}/upload`, {
                method: 'POST',
                body: formData
            });
            const res = await response.json();
            if (res.success) {
                alert('File uploaded successfully! Automation should resume.');
                modal.classList.add('hidden');
                form.reset();
                if (manualFileLabel) {
                    manualFileLabel.innerHTML = manualOriginalLabel;
                    manualFileLabel.classList.remove('has-file');
                }
            } else {
                alert('Upload failed: ' + res.error);
            }
        } catch (err) {
            alert('Upload error: ' + err.message);
        }
    };
}

socket.on('taskDeleted', (taskId) => {
    tasks = tasks.filter(t => t.id !== taskId);
    renderTasks();
});

socket.on('taskProcessing', (task) => {
    // This is redundant if we handle taskUpdated, but good for explicit UI feedback if needed
    // We rely on taskUpdated for status change
});

// Form handling
const addTaskForm = document.getElementById('add-task-form');
const urlInput = document.getElementById('task-url');
const fileInput = document.getElementById('task-file');
const fileLabel = document.getElementById('file-label-text');
const originalLabelContent = fileLabel ? fileLabel.innerHTML : 'Choose JSON File';

// File Input Interaction
if (fileInput && fileLabel) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const fileName = e.target.files[0].name;
            fileLabel.innerHTML = `
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>${fileName}</span>
            `;
            fileLabel.classList.add('has-file');
        } else {
            fileLabel.innerHTML = originalLabelContent;
            fileLabel.classList.remove('has-file');
        }
    });

    addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const url = urlInput.value;
        const file = fileInput.files[0];

        if (!file) {
            alert('Please select a file');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const formData = JSON.parse(e.target.result);

                const response = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url, formData })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to add task');
                }

                // Clear inputs on success
                urlInput.value = '';
                fileInput.value = '';
                fileLabel.innerHTML = originalLabelContent;
                fileLabel.classList.remove('has-file');

            } catch (err) {
                alert('Error adding task: ' + err.message);
            }
        };
        reader.onerror = () => {
            alert('Error reading file');
        };
        reader.readAsText(file);
    });
}

// Manual File Input Interaction (Modal)
const manualFileInput = document.getElementById('manual-file');
const manualFileLabel = document.getElementById('manual-file-label');
const manualOriginalLabel = manualFileLabel ? manualFileLabel.innerHTML : 'Choose File to Upload';

if (manualFileInput && manualFileLabel) {
    manualFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const fileName = e.target.files[0].name;
            manualFileLabel.innerHTML = `
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>${fileName}</span>
            `;
            manualFileLabel.classList.add('has-file');
        } else {
            manualFileLabel.innerHTML = manualOriginalLabel;
            manualFileLabel.classList.remove('has-file');
        }
    });
}

async function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json();
            alert('Failed to delete task: ' + (err.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error deleting task: ' + e.message);
    }
}
