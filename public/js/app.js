// ================================
// VPS Console Manager - Main App
// ================================

// Application State
const state = {
    sshAuthenticated: false,
    sshHost: null,
    sshUsername: null,
    ws: null,
    terminal: null,
    currentPath: '/',
    currentFile: null,
    monacoEditor: null,
    charts: {
        cpu: null,
        memory: null,
        network: null
    },
    monitoringInterval: null
};

// ================================
// Initialization
// ================================

document.addEventListener('DOMContentLoaded', () => {
    checkSSHStatus();
    setupEventListeners();
});

// Check SSH authentication status
async function checkSSHStatus() {
    try {
        const response = await fetch('/api/ssh/status');
        const data = await response.json();

        if (data.authenticated && data.session) {
            state.sshAuthenticated = true;
            state.sshHost = data.host || data.session.host;
            state.sshUsername = data.username || data.session.username;
            state.sshSessionId = data.session.sessionId;
            showDashboard();
            initializeDashboard();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('SSH status check error:', error);
        showLogin();
    }
}

// Setup all event listeners
function setupEventListeners() {
    // SSH Login form
    const sshLoginForm = document.getElementById('sshLoginForm');
    if (sshLoginForm) {
        sshLoginForm.addEventListener('submit', handleSSHLogin);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });

    // Monitor page controls
    const refreshMonitor = document.getElementById('refreshMonitor');
    if (refreshMonitor) {
        refreshMonitor.addEventListener('click', () => {
            fetchMonitoringData();
        });
    }

    // Terminal controls
    const clearTerminal = document.getElementById('clearTerminal');
    if (clearTerminal) {
        clearTerminal.addEventListener('click', () => {
            if (state.terminal) {
                state.terminal.clear();
            }
        });
    }

    const newTerminal = document.getElementById('newTerminal');
    if (newTerminal) {
        newTerminal.addEventListener('click', () => {
            if (state.terminal) {
                state.terminal.clear();
                createTerminal();
            }
        });
    }

    // SFTP controls
    const parentDirBtn = document.getElementById('parentDirBtn');
    if (parentDirBtn) {
        parentDirBtn.addEventListener('click', navigateToParent);
    }

    const newFileBtn = document.getElementById('newFileBtn');
    if (newFileBtn) {
        newFileBtn.addEventListener('click', handleNewFile);
    }

    const newFolderBtn = document.getElementById('newFolderBtn');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', handleNewFolder);
    }

    const refreshFilesBtn = document.getElementById('refreshFilesBtn');
    if (refreshFilesBtn) {
        refreshFilesBtn.addEventListener('click', loadFileList);
    }

    const fileUpload = document.getElementById('fileUpload');
    if (fileUpload) {
        fileUpload.addEventListener('change', handleFileUpload);
    }

    // File editor controls
    const saveFileBtn = document.getElementById('saveFileBtn');
    if (saveFileBtn) {
        saveFileBtn.addEventListener('click', handleFileSave);
    }

    const closeEditorBtn = document.getElementById('closeEditorBtn');
    if (closeEditorBtn) {
        closeEditorBtn.addEventListener('click', closeFileEditor);
    }

    // Move file modal controls
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    if (confirmMoveBtn) {
        confirmMoveBtn.addEventListener('click', handleMoveConfirm);
    }

    const cancelMoveBtn = document.getElementById('cancelMoveBtn');
    if (cancelMoveBtn) {
        cancelMoveBtn.addEventListener('click', () => {
            document.getElementById('moveFileModal').style.display = 'none';
        });
    }

    // Close modals on background click
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    const closeModalBtns = document.querySelectorAll('.close-modal');
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').style.display = 'none';
        });
    });
}

// ================================
// SSH Authentication
// ================================

async function handleSSHLogin(e) {
    e.preventDefault();
    console.log('SSH Login form submitted');

    const host = document.getElementById('loginSshHost').value;
    const port = document.getElementById('loginSshPort').value;
    const username = document.getElementById('loginSshUsername').value;
    const password = document.getElementById('loginSshPassword').value;
    const errorDiv = document.getElementById('loginError');

    console.log('Login details:', { host, port, username, password: '***' });

    // Clear previous errors
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';

    try {
        console.log('Sending login request to /api/ssh/auth');

        const response = await fetch('/api/ssh/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host, port, username, password })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (data.success) {
            console.log('Login successful!');
            state.sshAuthenticated = true;
            state.sshHost = host;
            state.sshUsername = username;
            state.sshSessionId = data.sessionId;

            showDashboard();
            initializeDashboard();
        } else {
            console.error('Login failed:', data.message);
            errorDiv.textContent = data.message || 'SSH authentication failed';
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('SSH login error:', error);
        errorDiv.textContent = 'Connection failed: ' + error.message;
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function handleLogout() {
    try {
        // Stop monitoring
        if (state.monitoringInterval) {
            clearInterval(state.monitoringInterval);
            state.monitoringInterval = null;
        }

        // Close WebSocket
        if (state.ws) {
            state.ws.close();
            state.ws = null;
        }

        // Disconnect SSH
        await fetch('/api/ssh/disconnect', {
            method: 'POST'
        });

        state.sshAuthenticated = false;
        state.sshHost = null;
        state.sshUsername = null;

        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ================================
// UI Navigation
// ================================

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';

    // Update user info
    const currentUser = document.getElementById('currentUser');
    if (currentUser) {
        currentUser.textContent = `${state.sshUsername}@${state.sshHost}`;
    }
}

function navigateToPage(pageName) {
    // Update navigation active state
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });

    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    // Show selected page
    const selectedPage = document.getElementById(pageName + 'Page');
    if (selectedPage) {
        selectedPage.classList.add('active');
    }

    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    const titles = {
        'monitor': 'Server Monitoring',
        'terminal': 'Web Terminal',
        'sftp': 'File Manager'
    };
    if (pageTitle && titles[pageName]) {
        pageTitle.textContent = titles[pageName];
    }

    // Initialize page-specific features
    if (pageName === 'monitor') {
        initMonitoring();
    } else if (pageName === 'terminal' && !state.terminal) {
        initTerminal();
    } else if (pageName === 'sftp') {
        connectSFTP();
    }
}

function initializeDashboard() {
    // Connect WebSocket
    connectWebSocket();

    // Initialize monitoring (default page)
    initMonitoring();
}

// ================================
// Server Monitoring
// ================================

function initMonitoring() {
    if (!state.charts.cpu) {
        initializeCharts();
    }

    // Start monitoring updates
    if (state.monitoringInterval) {
        clearInterval(state.monitoringInterval);
    }

    fetchMonitoringData();
    state.monitoringInterval = setInterval(fetchMonitoringData, 2000);
}

function initializeCharts() {
    // CPU Chart
    const cpuCtx = document.getElementById('cpuChart');
    if (cpuCtx) {
        state.charts.cpu = new Chart(cpuCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU Usage %',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: '#9ca3af' }
                    },
                    x: {
                        ticks: { color: '#9ca3af' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#9ca3af' }
                    }
                }
            }
        });
    }

    // Memory Chart
    const memCtx = document.getElementById('memoryChart');
    if (memCtx) {
        state.charts.memory = new Chart(memCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Memory Usage %',
                    data: [],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: '#9ca3af' }
                    },
                    x: {
                        ticks: { color: '#9ca3af' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#9ca3af' }
                    }
                }
            }
        });
    }

    // Network Chart
    const netCtx = document.getElementById('networkChart');
    if (netCtx) {
        state.charts.network = new Chart(netCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Download (MB/s)',
                        data: [],
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Upload (MB/s)',
                        data: [],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#9ca3af' }
                    },
                    x: {
                        ticks: { color: '#9ca3af' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#9ca3af' }
                    }
                }
            }
        });
    }
}

async function fetchMonitoringData() {
    try {
        const response = await fetch('/api/monitor/stats');
        const data = await response.json();

        if (data.success) {
            updateMonitoringUI(data.data);
        }
    } catch (error) {
        console.error('Monitoring fetch error:', error);
    }
}

function updateMonitoringUI(stats) {
    // Update stat cards
    if (stats.cpu) {
        document.getElementById('cpuUsage').textContent = `${Math.round(stats.cpu.usage)}%`;
        document.getElementById('cpuCores').textContent = `${stats.cpu.cores} Cores`;
    }

    if (stats.memory) {
        document.getElementById('memoryUsage').textContent = `${stats.memory.percentage}%`;
        document.getElementById('memoryDetails').textContent =
            `${stats.memory.usedGB} GB / ${stats.memory.totalGB} GB`;
    }

    if (stats.disk) {
        document.getElementById('diskUsage').textContent = `${Math.round(stats.disk.percentage)}%`;
        document.getElementById('diskDetails').textContent =
            `${stats.disk.used} / ${stats.disk.size}`;
    }

    if (stats.system) {
        document.getElementById('uptime').textContent = stats.system.uptimeFormatted;

        // System info
        document.getElementById('sysHostname').textContent = stats.system.hostname;
        document.getElementById('sysPlatform').textContent = stats.system.platform;
        document.getElementById('sysArch').textContent = stats.system.arch;
        document.getElementById('sysCpuModel').textContent = stats.system.cpuModel;
        document.getElementById('sysLoadAvg').textContent =
            stats.system.loadAverage.map(l => l.toFixed(2)).join(', ');
    }

    // Network stats
    if (stats.network) {
        document.getElementById('networkRx').textContent = `${stats.network.rxSpeedMB} MB/s`;
        document.getElementById('networkTx').textContent = `${stats.network.txSpeedMB} MB/s`;
        document.getElementById('networkRxTotal').textContent = `Total: ${stats.network.totalRxGB} GB`;
        document.getElementById('networkTxTotal').textContent = `Total: ${stats.network.totalTxGB} GB`;
    }

    // Update charts
    if (stats.history) {
        updateCharts(stats.history);
    }

    // Update process list
    if (stats.processes) {
        updateProcessList(stats.processes);
    }
}

function updateCharts(history) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();

    // CPU Chart
    if (state.charts.cpu && history.cpu && history.cpu.length > 0) {
        const chart = state.charts.cpu;
        const cpuValue = history.cpu[history.cpu.length - 1].value;

        chart.data.labels.push(timeLabel);
        chart.data.datasets[0].data.push(cpuValue);

        if (chart.data.labels.length > 60) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }

        chart.update('none');
    }

    // Memory Chart
    if (state.charts.memory && history.memory && history.memory.length > 0) {
        const chart = state.charts.memory;
        const memValue = history.memory[history.memory.length - 1].value;

        chart.data.labels.push(timeLabel);
        chart.data.datasets[0].data.push(memValue);

        if (chart.data.labels.length > 60) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }

        chart.update('none');
    }

    // Network Chart
    if (state.charts.network && history.network && history.network.length > 0) {
        const chart = state.charts.network;
        const netData = history.network[history.network.length - 1];
        const rxMB = (netData.rx / 1024 / 1024).toFixed(2);
        const txMB = (netData.tx / 1024 / 1024).toFixed(2);

        chart.data.labels.push(timeLabel);
        chart.data.datasets[0].data.push(rxMB);
        chart.data.datasets[1].data.push(txMB);

        if (chart.data.labels.length > 60) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
        }

        chart.update('none');
    }
}

function updateProcessList(processes) {
    const listContainer = document.getElementById('processList');
    if (!listContainer) return;

    let html = '';
    processes.slice(0, 10).forEach(proc => {
        html += `
            <div class="process-item">
                <div class="process-pid">${proc.pid}</div>
                <div class="process-cpu">${proc.cpu}%</div>
                <div class="process-mem">${proc.memory}%</div>
                <div class="process-command">${proc.command}</div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

// ================================
// Terminal
// ================================

function initTerminal() {
    const terminalDiv = document.getElementById('terminal');
    if (!terminalDiv) return;

    // Initialize xterm.js terminal
    state.terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
            background: '#1e293b',
            foreground: '#f1f5f9',
            cursor: '#3b82f6',
            selection: 'rgba(59, 130, 246, 0.3)'
        },
        cols: 80,
        rows: 24
    });

    state.terminal.open(terminalDiv);

    // Create terminal session
    createTerminal();

    // Handle terminal input
    state.terminal.onData(data => {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'terminal',
                action: 'input',
                input: data,
                sessionId: state.sshSessionId
            }));
        }
    });
}

function createTerminal() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'terminal',
            action: 'create',
            sessionId: state.sshSessionId  // Pass SSH session ID
        }));
    }
}

// ================================
// WebSocket
// ================================

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        console.log('WebSocket connected');
    };

    state.ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'terminal') {
                handleTerminalMessage(data);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    state.ws.onclose = () => {
        console.log('WebSocket closed');
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
            if (state.sshAuthenticated) {
                connectWebSocket();
            }
        }, 3000);
    };
}

function handleTerminalMessage(data) {
    if (data.action === 'output' && state.terminal) {
        state.terminal.write(data.data);
    } else if (data.action === 'created') {
        console.log('Terminal created');
    } else if (data.action === 'exit') {
        console.log('Terminal exited');
        if (state.terminal) {
            state.terminal.write('\r\n\r\nTerminal session ended. Click "New" to create a new session.\r\n');
        }
    }
}

// ================================
// SFTP File Manager
// ================================

async function connectSFTP() {
    try {
        const response = await fetch('/api/sftp/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                host: state.sshHost,
                port: 22,
                username: state.sshUsername,
                password: '' // Using existing SSH session
            })
        });

        const data = await response.json();

        if (data.success) {
            loadFileList();
        }
    } catch (error) {
        console.error('SFTP connect error:', error);
    }
}

async function loadFileList(path = null) {
    if (path) {
        state.currentPath = path;
    }

    try {
        const response = await fetch(`/api/sftp/list?path=${encodeURIComponent(state.currentPath)}`);
        const data = await response.json();

        if (data.success) {
            displayFileList(data.files);
            document.getElementById('currentPath').textContent = state.currentPath;
        }
    } catch (error) {
        console.error('File list error:', error);
    }
}

function displayFileList(files) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;

    if (!files || files.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open" style="font-size:48px;color:#64748b;margin-bottom:15px;"></i>
                <p style="color:#94a3b8;">No files in this directory</p>
            </div>
        `;
        return;
    }

    // Sort: directories first, then files alphabetically
    const sorted = [...files].sort((a, b) => {
        const aIsDir = a.type === 'directory';
        const bIsDir = b.type === 'directory';
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.name.localeCompare(b.name);
    });

    let html = '<table class="file-table"><thead><tr><th style="text-align:left;padding-left:20px">Name</th><th>Size</th><th>Modified</th><th>Actions</th></tr></thead><tbody>';

    sorted.forEach(file => {
        const isDirectory = file.type === 'directory';
        const icon = isDirectory ? 'fa-folder' : getFileIcon(file.name);
        const iconColor = isDirectory ? '#3b82f6' : '#64748b';
        const fileSize = isDirectory ? '-' : formatFileSize(file.size);
        const modified = file.modified ? new Date(file.modified).toLocaleString() : '-';
        const fileName = escapeHtml(file.name);
        const nameAttr = file.name.replace(/'/g, "\\'");

        html += `
            <tr class="file-row">
                <td class="name-cell" onclick="${isDirectory ? `navigateToFolder('${nameAttr}')` : ''}" style="cursor:${isDirectory ? 'pointer' : 'default'};padding-left:20px;">
                    <i class="fas ${icon}" style="color:${iconColor};margin-right:10px;"></i>
                    <span>${fileName}</span>
                </td>
                <td style="text-align:center;color:#94a3b8;">${fileSize}</td>
                <td style="text-align:center;color:#94a3b8;font-size:13px;">${modified}</td>
                <td style="text-align:center;">
                    <div class="action-buttons">
                        ${!isDirectory ? `
                            <button class="btn-action" onclick="handleFileEdit('${nameAttr}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-action" onclick="handleFileDownload('${nameAttr}')" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                        ` : ''}
                        <button class="btn-action btn-delete" onclick="handleFileDelete('${nameAttr}', '${file.type}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    fileList.innerHTML = html;
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const iconMap = {
        'js': 'fa-file-code', 'ts': 'fa-file-code', 'html': 'fa-file-code', 'css': 'fa-file-code',
        'php': 'fa-file-code', 'py': 'fa-file-code', 'java': 'fa-file-code', 'go': 'fa-file-code',
        'txt': 'fa-file-alt', 'md': 'fa-file-alt', 'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word', 'xls': 'fa-file-excel',
        'zip': 'fa-file-archive', 'tar': 'fa-file-archive', 'gz': 'fa-file-archive',
        'jpg': 'fa-file-image', 'png': 'fa-file-image', 'gif': 'fa-file-image',
        'mp4': 'fa-file-video', 'mp3': 'fa-file-audio',
        'json': 'fa-file-code', 'xml': 'fa-file-code', 'yml': 'fa-file-code'
    };
    return iconMap[ext] || 'fa-file';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function navigateToFolder(folderName) {
    const newPath = state.currentPath === '/' ? `/${folderName}` : `${state.currentPath}/${folderName}`;
    console.log('Navigating to folder:', newPath);
    loadFileList(newPath);
}

function navigateToParent() {
    if (state.currentPath === '/') return;

    const parts = state.currentPath.split('/');
    parts.pop();
    const parentPath = parts.join('/') || '/';
    loadFileList(parentPath);
}

async function handleFileEdit(filename) {
    const filePath = state.currentPath === '/' ? `/${filename}` : `${state.currentPath}/${filename}`;

    try {
        console.log('Reading file:', filePath);
        const response = await fetch(`/api/sftp/read?path=${encodeURIComponent(filePath)}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            state.currentFile = filePath;
            openFileEditor(filename, data.content);
        } else {
            throw new Error(data.message || 'Failed to read file');
        }
    } catch (error) {
        console.error('File edit error:', error);
        showError('Failed to open file: ' + error.message);
    }
}

function openFileEditor(filename, content) {
    const modal = document.getElementById('fileEditorModal');
    const editorContainer = document.getElementById('monacoEditor');

    document.getElementById('editorFileName').textContent = `Editing: ${filename}`;
    modal.style.display = 'block';

    // Initialize Monaco Editor if not already initialized
    if (!state.monacoEditor) {
        require(['vs/editor/editor.main'], function() {
            state.monacoEditor = monaco.editor.create(editorContainer, {
                value: content,
                language: detectLanguage(filename),
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                minimap: { enabled: true },
                lineNumbers: 'on',
                roundedSelection: false,
                scrollBeyondLastLine: false,
                readOnly: false
            });
        });
    } else {
        state.monacoEditor.setValue(content);
        state.monacoEditor.setModel(monaco.editor.createModel(content, detectLanguage(filename)));
    }
}

function detectLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const langMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'javascript',
        'tsx': 'typescript',
        'json': 'json',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'py': 'python',
        'rb': 'ruby',
        'php': 'php',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'go': 'go',
        'rs': 'rust',
        'sh': 'shell',
        'bash': 'shell',
        'yml': 'yaml',
        'yaml': 'yaml',
        'xml': 'xml',
        'md': 'markdown',
        'sql': 'sql'
    };
    return langMap[ext] || 'plaintext';
}

async function handleFileSave() {
    if (!state.monacoEditor || !state.currentFile) return;

    const content = state.monacoEditor.getValue();
    const saveBtn = document.getElementById('saveFileBtn');

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        console.log('Saving file:', state.currentFile);
        const response = await fetch('/api/sftp/write', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: state.currentFile,
                content: content
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('File saved successfully!');
            // Close editor after short delay
            setTimeout(() => {
                closeFileEditor();
            }, 1000);
        } else {
            throw new Error(data.message || 'Failed to save file');
        }
    } catch (error) {
        console.error('File save error:', error);
        showError('Failed to save file: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-notification';
    successDiv.textContent = message;
    successDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#22c55e;color:white;padding:15px 20px;border-radius:8px;z-index:10000;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
}

function closeFileEditor() {
    document.getElementById('fileEditorModal').style.display = 'none';
    state.currentFile = null;
}

async function handleFileDownload(filename) {
    const filePath = state.currentPath === '/' ? `/${filename}` : `${state.currentPath}/${filename}`;
    window.open(`/api/sftp/download?path=${encodeURIComponent(filePath)}`, '_blank');
}

async function handleFileDelete(filename, type) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;

    const filePath = state.currentPath === '/' ? `/${filename}` : `${state.currentPath}/${filename}`;

    try {
        const response = await fetch('/api/sftp/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: filePath,
                isDirectory: type === 'd'
            })
        });

        const data = await response.json();

        if (data.success) {
            loadFileList();
        } else {
            alert('Failed to delete: ' + data.message);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file');
    }
}

async function handleNewFile() {
    const filename = prompt('Enter new file name:');
    if (!filename) return;

    const filePath = state.currentPath === '/' ? `/${filename}` : `${state.currentPath}/${filename}`;

    try {
        const response = await fetch('/api/sftp/write-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: filePath,
                content: ''
            })
        });

        const data = await response.json();

        if (data.success) {
            loadFileList();
        } else {
            alert('Failed to create file: ' + data.message);
        }
    } catch (error) {
        console.error('Create file error:', error);
        alert('Failed to create file');
    }
}

async function handleNewFolder() {
    const foldername = prompt('Enter new folder name:');
    if (!foldername) return;

    const folderPath = state.currentPath === '/' ? `/${foldername}` : `${state.currentPath}/${foldername}`;

    try {
        const response = await fetch('/api/sftp/mkdir', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: folderPath
            })
        });

        const data = await response.json();

        if (data.success) {
            loadFileList();
        } else {
            alert('Failed to create folder: ' + data.message);
        }
    } catch (error) {
        console.error('Create folder error:', error);
        alert('Failed to create folder');
    }
}

async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('remotePath', state.currentPath);

        try {
            const response = await fetch('/api/sftp/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!data.success) {
                alert(`Failed to upload ${file.name}: ${data.message}`);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Failed to upload ${file.name}`);
        }
    }

    // Reload file list
    setTimeout(() => loadFileList(), 500);

    // Reset file input
    e.target.value = '';
}

function handleMoveConfirm() {
    // Implement move/copy functionality
    alert('Move/Copy functionality coming soon');
    document.getElementById('moveFileModal').style.display = 'none';
}
