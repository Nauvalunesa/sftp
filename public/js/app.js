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
    terminalFontSize: 14,
    terminalFullscreen: false,
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

    const reconnectTerminal = document.getElementById('reconnectTerminal');
    if (reconnectTerminal) {
        reconnectTerminal.addEventListener('click', () => {
            if (state.terminal) {
                state.terminal.clear();
                createTerminal();
                updateTerminalStatus('Reconnecting...', false);
            }
        });
    }

    // Font size controls
    const fontIncreaseBtn = document.getElementById('fontIncreaseBtn');
    if (fontIncreaseBtn) {
        fontIncreaseBtn.addEventListener('click', () => {
            if (state.terminal && state.terminalFontSize < 24) {
                state.terminalFontSize += 2;
                state.terminal.options.fontSize = state.terminalFontSize;
                updateFontSizeDisplay();
                fitTerminal();
            }
        });
    }

    const fontDecreaseBtn = document.getElementById('fontDecreaseBtn');
    if (fontDecreaseBtn) {
        fontDecreaseBtn.addEventListener('click', () => {
            if (state.terminal && state.terminalFontSize > 10) {
                state.terminalFontSize -= 2;
                state.terminal.options.fontSize = state.terminalFontSize;
                updateFontSizeDisplay();
                fitTerminal();
            }
        });
    }

    // Fullscreen toggle
    const fullscreenTerminal = document.getElementById('fullscreenTerminal');
    if (fullscreenTerminal) {
        fullscreenTerminal.addEventListener('click', () => {
            toggleFullscreen();
        });
    }

    // Copy mode info
    const copyModeBtn = document.getElementById('copyModeBtn');
    if (copyModeBtn) {
        copyModeBtn.addEventListener('click', () => {
            if (state.terminal) {
                state.terminal.write('\r\n\x1b[1;33m[Copy Mode]\x1b[0m Select text with mouse, then press Ctrl+C or Cmd+C to copy\r\n');
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

    // Initialize xterm.js terminal with Proxmox-like theme
    state.terminal = new Terminal({
        cursorBlink: true,
        fontSize: state.terminalFontSize,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#00ff00',
            cursorAccent: '#000000',
            selection: 'rgba(255, 255, 255, 0.3)',
            black: '#000000',
            red: '#ff0000',
            green: '#00ff00',
            yellow: '#ffff00',
            blue: '#0000ff',
            magenta: '#ff00ff',
            cyan: '#00ffff',
            white: '#ffffff',
            brightBlack: '#808080',
            brightRed: '#ff8080',
            brightGreen: '#80ff80',
            brightYellow: '#ffff80',
            brightBlue: '#8080ff',
            brightMagenta: '#ff80ff',
            brightCyan: '#80ffff',
            brightWhite: '#ffffff'
        },
        scrollback: 10000,
        allowTransparency: false,
        convertEol: true
    });

    state.terminal.open(terminalDiv);

    // Fit terminal to container
    fitTerminal();

    // Update session info
    updateTerminalSessionInfo();

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

    // Handle window resize
    window.addEventListener('resize', () => {
        fitTerminal();
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
        updateTerminalStatus('Connected', true);
    } else if (data.action === 'exit') {
        console.log('Terminal exited');
        updateTerminalStatus('Disconnected', false);
        if (state.terminal) {
            state.terminal.write('\r\n\r\n\x1b[1;31mTerminal session ended.\x1b[0m Click reconnect to start a new session.\r\n');
        }
    } else if (data.action === 'error') {
        console.error('Terminal error:', data.message);
        updateTerminalStatus('Error', false);
        if (state.terminal) {
            state.terminal.write(`\r\n\x1b[1;31mError: ${data.message}\x1b[0m\r\n`);
        }
    }
}

// Terminal helper functions
function fitTerminal() {
    if (!state.terminal) return;

    const terminalDiv = document.getElementById('terminal');
    if (!terminalDiv) return;

    const dimensions = {
        cols: Math.floor(terminalDiv.clientWidth / (state.terminalFontSize * 0.6)),
        rows: Math.floor(terminalDiv.clientHeight / (state.terminalFontSize * 1.5))
    };

    if (dimensions.cols > 0 && dimensions.rows > 0) {
        state.terminal.resize(dimensions.cols, dimensions.rows);

        // Send resize to backend
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'terminal',
                action: 'resize',
                cols: dimensions.cols,
                rows: dimensions.rows,
                sessionId: state.sshSessionId
            }));
        }
    }
}

function updateTerminalStatus(status, isConnected) {
    const statusElement = document.getElementById('terminalStatus');
    const statusDot = document.getElementById('terminalStatusDot');

    if (statusElement) {
        statusElement.textContent = status;
    }

    if (statusDot) {
        if (isConnected) {
            statusDot.classList.add('connected');
        } else {
            statusDot.classList.remove('connected');
        }
    }
}

function updateTerminalSessionInfo() {
    const sessionInfo = document.getElementById('terminalSessionInfo');
    if (sessionInfo && state.sshHost && state.sshUsername) {
        sessionInfo.textContent = `${state.sshUsername}@${state.sshHost}`;
    }
}

function updateFontSizeDisplay() {
    const fontSizeElement = document.getElementById('terminalFontSize');
    if (fontSizeElement) {
        fontSizeElement.textContent = `Font: ${state.terminalFontSize}px`;
    }
}

function toggleFullscreen() {
    const container = document.querySelector('.terminal-container');
    const icon = document.querySelector('#fullscreenTerminal i');

    if (!container || !icon) return;

    state.terminalFullscreen = !state.terminalFullscreen;

    if (state.terminalFullscreen) {
        container.classList.add('fullscreen');
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
    } else {
        container.classList.remove('fullscreen');
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
    }

    // Refit terminal after fullscreen toggle
    setTimeout(() => {
        fitTerminal();
    }, 100);
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
                <i class="fas fa-folder-open"></i>
                <p>No files to display</p>
            </div>
        `;
        return;
    }

    let html = '<div class="file-grid">';

    files.forEach(file => {
        const icon = file.type === 'd' ? 'fa-folder' : 'fa-file';
        const fileClass = file.type === 'd' ? 'directory' : 'file';

        html += `
            <div class="file-item ${fileClass}" data-name="${file.name}" data-type="${file.type}">
                <i class="fas ${icon}"></i>
                <span class="file-name">${file.name}</span>
                <div class="file-actions">
                    ${file.type === '-' ? `
                        <button class="btn-icon" onclick="handleFileEdit('${file.name}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : ''}
                    <button class="btn-icon" onclick="handleFileDownload('${file.name}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn-icon" onclick="handleFileDelete('${file.name}', '${file.type}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    html += '</div>';
    fileList.innerHTML = html;

    // Add click handlers for directories
    const dirItems = fileList.querySelectorAll('.file-item.directory');
    dirItems.forEach(item => {
        item.addEventListener('dblclick', () => {
            const dirName = item.dataset.name;
            const newPath = state.currentPath === '/' ? `/${dirName}` : `${state.currentPath}/${dirName}`;
            loadFileList(newPath);
        });
    });
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
        const response = await fetch(`/api/sftp/download?path=${encodeURIComponent(filePath)}`);
        const content = await response.text();

        state.currentFile = filePath;
        openFileEditor(filename, content);
    } catch (error) {
        console.error('File edit error:', error);
        alert('Failed to open file');
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

    try {
        const response = await fetch('/api/sftp/write-file', {
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
            alert('File saved successfully');
        } else {
            alert('Failed to save file: ' + data.message);
        }
    } catch (error) {
        console.error('File save error:', error);
        alert('Failed to save file');
    }
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
