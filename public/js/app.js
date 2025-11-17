// Application State
const state = {
    authenticated: false,
    user: null,
    ws: null,
    terminalId: null,
    currentPath: '/',
    sftpConnected: false,
    vncConnected: false,
    sshAuthenticated: false,
    sshSessionId: null,
    vncCanvas: null,
    vncContext: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
});

// Check if user is authenticated
async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();

        if (data.authenticated) {
            state.authenticated = true;
            state.user = data.user;
            showDashboard();
            initializeDashboard();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showLogin();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
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

    // Terminal controls
    const clearTerminal = document.getElementById('clearTerminal');
    if (clearTerminal) {
        clearTerminal.addEventListener('click', () => {
            document.getElementById('terminal').innerHTML = '';
        });
    }

    const newTerminal = document.getElementById('newTerminal');
    if (newTerminal) {
        newTerminal.addEventListener('click', createTerminal);
    }

    // SSH Authentication for VNC
    const sshAuthBtn = document.getElementById('sshAuthBtn');
    if (sshAuthBtn) {
        sshAuthBtn.addEventListener('click', handleSSHAuthentication);
    }

    const logoutSSH = document.getElementById('logoutSSH');
    if (logoutSSH) {
        logoutSSH.addEventListener('click', handleSSHLogout);
    }

    // VNC controls
    const connectVNC = document.getElementById('connectVNC');
    if (connectVNC) {
        connectVNC.addEventListener('click', connectVNCSession);
    }

    const disconnectVNC = document.getElementById('disconnectVNC');
    if (disconnectVNC) {
        disconnectVNC.addEventListener('click', disconnectVNCSession);
    }

    const fullscreenVNC = document.getElementById('fullscreenVNC');
    if (fullscreenVNC) {
        fullscreenVNC.addEventListener('click', toggleVNCFullscreen);
    }

    // SFTP controls
    const connectSFTP = document.getElementById('connectSFTP');
    if (connectSFTP) {
        connectSFTP.addEventListener('click', connectSFTPSession);
    }

    const uploadFile = document.getElementById('uploadFile');
    if (uploadFile) {
        uploadFile.addEventListener('click', () => {
            document.getElementById('fileUploadInput').click();
        });
    }

    const fileUploadInput = document.getElementById('fileUploadInput');
    if (fileUploadInput) {
        fileUploadInput.addEventListener('change', handleFileUpload);
    }

    const createFolder = document.getElementById('createFolder');
    if (createFolder) {
        createFolder.addEventListener('click', handleCreateFolder);
    }

    const refreshFiles = document.getElementById('refreshFiles');
    if (refreshFiles) {
        refreshFiles.addEventListener('click', loadFileList);
    }

    // Service controls
    const serviceButtons = document.querySelectorAll('.service-buttons .btn');
    serviceButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            handleServiceAction(action);
        });
    });
}

// Authentication
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            state.authenticated = true;
            state.user = data.user;
            showDashboard();
            initializeDashboard();
        } else {
            errorDiv.textContent = data.message;
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'Login failed. Please try again.';
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST'
        });

        state.authenticated = false;
        state.user = null;

        if (state.ws) {
            state.ws.close();
        }

        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// UI Navigation
function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    document.getElementById('currentUser').textContent = state.user.username;
}

function navigateToPage(pageName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-page="${pageName}"]`).classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`${pageName}Page`).classList.add('active');

    // Update title
    const titles = {
        overview: 'System Overview',
        terminal: 'Web Terminal',
        vnc: 'Remote Desktop',
        sftp: 'File Manager',
        services: 'Service Management',
        network: 'Network Information'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || 'Dashboard';

    // Load page data
    if (pageName === 'overview') {
        loadSystemStats();
    } else if (pageName === 'network') {
        loadNetworkInfo();
    } else if (pageName === 'terminal' && !state.ws) {
        initializeWebSocket();
    } else if (pageName === 'vnc') {
        // Check SSH session status when navigating to VNC page
        checkSSHSessionStatus();
    }
}

// Check SSH session status for VNC
async function checkSSHSessionStatus() {
    try {
        const response = await fetch('/api/vnc/ssh-status');
        const data = await response.json();

        if (data.authenticated && data.session) {
            // SSH session still valid, show VNC console
            state.sshAuthenticated = true;
            state.sshSessionId = data.session.sessionId;

            document.getElementById('sshAuthPanel').style.display = 'none';
            document.getElementById('vncConsolePanel').style.display = 'block';
            document.getElementById('sshSessionInfo').textContent = `SSH: ${data.session.username}@${data.session.host}`;
        } else {
            // No SSH session, show auth panel
            state.sshAuthenticated = false;
            state.sshSessionId = null;

            document.getElementById('sshAuthPanel').style.display = 'block';
            document.getElementById('vncConsolePanel').style.display = 'none';
        }
    } catch (error) {
        console.error('SSH session check error:', error);
        // Show auth panel on error
        document.getElementById('sshAuthPanel').style.display = 'block';
        document.getElementById('vncConsolePanel').style.display = 'none';
    }
}

// Dashboard Initialization
function initializeDashboard() {
    loadSystemStats();
    initializeWebSocket();

    // Refresh stats every 5 seconds
    setInterval(loadSystemStats, 5000);
}

// System Stats
async function loadSystemStats() {
    try {
        const [statsResponse, infoResponse] = await Promise.all([
            fetch('/api/system/stats'),
            fetch('/api/system/info')
        ]);

        const stats = await statsResponse.json();
        const info = await infoResponse.json();

        if (stats.success) {
            updateSystemStats(stats.stats);
        }

        if (info.success) {
            updateSystemInfo(info.info);
        }
    } catch (error) {
        console.error('Error loading system stats:', error);
    }
}

function updateSystemStats(stats) {
    // CPU
    document.getElementById('cpuUsage').textContent = stats.cpu.usage.total + '%';

    // Memory
    const memUsed = (stats.memory.used / (1024 * 1024 * 1024)).toFixed(2);
    const memTotal = (stats.memory.total / (1024 * 1024 * 1024)).toFixed(2);
    document.getElementById('memoryUsage').textContent = stats.memory.usagePercent + '%';
    document.getElementById('memoryDetails').textContent = `${memUsed} GB / ${memTotal} GB`;

    // Disk
    if (stats.disk.usagePercent) {
        document.getElementById('diskUsage').textContent = stats.disk.usagePercent;
        document.getElementById('diskDetails').textContent = `${stats.disk.used} / ${stats.disk.size}`;
    }

    // Uptime
    const uptime = formatUptime(stats.uptime);
    document.getElementById('uptime').textContent = uptime;

    // Load Average
    const loadAvg = stats.loadAverage.map(l => l.toFixed(2)).join(', ');
    document.getElementById('loadAverage').innerHTML = `
        <div><strong>1 min:</strong> ${stats.loadAverage[0].toFixed(2)}</div>
        <div><strong>5 min:</strong> ${stats.loadAverage[1].toFixed(2)}</div>
        <div><strong>15 min:</strong> ${stats.loadAverage[2].toFixed(2)}</div>
    `;
}

function updateSystemInfo(info) {
    document.getElementById('systemInfo').innerHTML = `
        <div><strong>Hostname:</strong> ${info.hostname}</div>
        <div><strong>Platform:</strong> ${info.platform}</div>
        <div><strong>Architecture:</strong> ${info.arch}</div>
        <div><strong>CPUs:</strong> ${info.cpus} cores</div>
        <div><strong>Node Version:</strong> ${info.nodeVersion}</div>
    `;
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// WebSocket for Terminal
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        console.log('WebSocket connected');
        createTerminal();
    };

    state.ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showToast('WebSocket connection error', 'error');
    };

    state.ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect after 3 seconds
        setTimeout(() => {
            if (state.authenticated) {
                initializeWebSocket();
            }
        }, 3000);
    };
}

function handleWebSocketMessage(data) {
    if (data.type === 'terminal') {
        if (data.action === 'created') {
            state.terminalId = data.terminalId;
            showToast('Terminal created', 'success');
        } else if (data.action === 'output') {
            appendToTerminal(data.data);
        } else if (data.action === 'exit') {
            appendToTerminal(`\nTerminal exited with code ${data.exitCode}\n`);
        }
    } else if (data.type === 'vnc') {
        if (data.status === 'connected') {
            showToast('VNC connected', 'success');
        }
    }
}

// Terminal Functions
function createTerminal() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        showToast('WebSocket not connected', 'error');
        return;
    }

    state.ws.send(JSON.stringify({
        type: 'terminal',
        action: 'create'
    }));
}

function appendToTerminal(text) {
    const terminal = document.getElementById('terminal');
    terminal.textContent += text;
    terminal.scrollTop = terminal.scrollHeight;
}

// Setup terminal input
document.addEventListener('keypress', (e) => {
    const terminalPage = document.getElementById('terminalPage');
    if (terminalPage.classList.contains('active') && state.terminalId) {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'terminal',
                action: 'input',
                terminalId: state.terminalId,
                input: e.key
            }));
        }
    }
});

// SSH Authentication Functions
async function handleSSHAuthentication() {
    const host = document.getElementById('sshHost').value;
    const port = document.getElementById('sshPort').value;
    const username = document.getElementById('sshUsername').value;
    const password = document.getElementById('sshPassword').value;
    const statusDiv = document.getElementById('sshAuthStatus');

    if (!username || !password) {
        statusDiv.textContent = 'Please enter username and password';
        statusDiv.className = 'auth-status error';
        return;
    }

    statusDiv.textContent = 'Authenticating...';
    statusDiv.className = 'auth-status';

    try {
        const response = await fetch('/api/vnc/ssh-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host, port, username, password })
        });

        const data = await response.json();

        if (data.success) {
            state.sshAuthenticated = true;
            state.sshSessionId = data.sessionId;

            statusDiv.textContent = 'SSH authentication successful!';
            statusDiv.className = 'auth-status success';

            // Show VNC console panel
            setTimeout(() => {
                document.getElementById('sshAuthPanel').style.display = 'none';
                document.getElementById('vncConsolePanel').style.display = 'block';
                document.getElementById('sshSessionInfo').textContent = `SSH: ${data.user}@${data.host}`;
                showToast('SSH authenticated. You can now connect to VNC', 'success');
            }, 1000);
        } else {
            statusDiv.textContent = data.message;
            statusDiv.className = 'auth-status error';
        }
    } catch (error) {
        console.error('SSH auth error:', error);
        statusDiv.textContent = 'Authentication failed';
        statusDiv.className = 'auth-status error';
    }
}

async function handleSSHLogout() {
    try {
        // Disconnect VNC first if connected
        if (state.vncConnected) {
            disconnectVNCSession();
        }

        const response = await fetch('/api/vnc/ssh-disconnect', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            state.sshAuthenticated = false;
            state.sshSessionId = null;

            // Show SSH auth panel again
            document.getElementById('vncConsolePanel').style.display = 'none';
            document.getElementById('sshAuthPanel').style.display = 'block';

            // Clear form
            document.getElementById('sshUsername').value = '';
            document.getElementById('sshPassword').value = '';
            document.getElementById('sshAuthStatus').textContent = '';

            showToast('SSH session closed', 'success');
        }
    } catch (error) {
        console.error('SSH logout error:', error);
        showToast('Logout failed', 'error');
    }
}

// VNC Functions
async function connectVNCSession() {
    if (!state.sshAuthenticated) {
        showToast('Please authenticate with SSH first', 'error');
        return;
    }

    if (state.vncConnected) {
        showToast('VNC already connected', 'info');
        return;
    }

    // Check SSH status first
    try {
        const statusResponse = await fetch('/api/vnc/ssh-status');
        const statusData = await statusResponse.json();

        if (!statusData.authenticated) {
            showToast('SSH session expired. Please re-authenticate', 'error');
            handleSSHLogout();
            return;
        }
    } catch (error) {
        console.error('SSH status check error:', error);
        showToast('Failed to verify SSH session', 'error');
        return;
    }

    updateVNCStatus('connecting');
    showToast('Connecting to VNC server...', 'info');

    try {
        // Initialize WebSocket if not already
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
            initializeWebSocket();
            // Wait for connection
            await new Promise((resolve) => {
                const checkConnection = setInterval(() => {
                    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                        clearInterval(checkConnection);
                        resolve();
                    }
                }, 100);

                // Timeout after 5 seconds
                setTimeout(() => {
                    clearInterval(checkConnection);
                    resolve();
                }, 5000);
            });
        }

        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            // Send VNC connect request
            state.ws.send(JSON.stringify({
                type: 'vnc',
                action: 'connect',
                sshSessionId: state.sshSessionId
            }));

            // Setup canvas
            setupVNCCanvas();

            // Update UI
            state.vncConnected = true;
            document.getElementById('connectVNC').style.display = 'none';
            document.getElementById('disconnectVNC').style.display = 'inline-flex';
            document.querySelector('.vnc-placeholder').style.display = 'none';
            document.getElementById('vncCanvas').style.display = 'block';

            updateVNCStatus('connected');
            showToast('VNC connected successfully!', 'success');
        } else {
            throw new Error('WebSocket not connected');
        }
    } catch (error) {
        console.error('VNC connection error:', error);
        updateVNCStatus('disconnected');
        showToast('VNC connection failed: ' + error.message, 'error');
    }
}

function disconnectVNCSession() {
    if (!state.vncConnected) {
        return;
    }

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'vnc',
            action: 'disconnect'
        }));
    }

    state.vncConnected = false;
    document.getElementById('connectVNC').style.display = 'inline-flex';
    document.getElementById('disconnectVNC').style.display = 'none';
    document.getElementById('vncCanvas').style.display = 'none';
    document.querySelector('.vnc-placeholder').style.display = 'block';

    updateVNCStatus('disconnected');
    showToast('VNC disconnected', 'info');
}

function setupVNCCanvas() {
    const canvas = document.getElementById('vncCanvas');
    state.vncCanvas = canvas;
    state.vncContext = canvas.getContext('2d');

    // Set canvas size
    canvas.width = 1024;
    canvas.height = 768;

    // Draw initial screen
    state.vncContext.fillStyle = '#000';
    state.vncContext.fillRect(0, 0, canvas.width, canvas.height);
    state.vncContext.fillStyle = '#0f0';
    state.vncContext.font = '20px monospace';
    state.vncContext.fillText('VNC Connected - Waiting for screen data...', 50, 50);

    // Setup mouse and keyboard event listeners
    canvas.addEventListener('mousedown', handleVNCMouse);
    canvas.addEventListener('mouseup', handleVNCMouse);
    canvas.addEventListener('mousemove', handleVNCMouse);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Capture keyboard input
    canvas.setAttribute('tabindex', '0');
    canvas.focus();
    canvas.addEventListener('keydown', handleVNCKeyboard);
    canvas.addEventListener('keyup', handleVNCKeyboard);
}

function handleVNCMouse(e) {
    if (!state.vncConnected || !state.ws) return;

    const rect = state.vncCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (state.vncCanvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (state.vncCanvas.height / rect.height));

    const mouseData = {
        type: 'vnc-mouse',
        x,
        y,
        buttons: e.buttons,
        eventType: e.type
    };

    try {
        state.ws.send(JSON.stringify(mouseData));
    } catch (error) {
        console.error('Error sending mouse data:', error);
    }
}

function handleVNCKeyboard(e) {
    if (!state.vncConnected || !state.ws) return;

    e.preventDefault();

    const keyData = {
        type: 'vnc-keyboard',
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        eventType: e.type
    };

    try {
        state.ws.send(JSON.stringify(keyData));
    } catch (error) {
        console.error('Error sending keyboard data:', error);
    }
}

function updateVNCStatus(status) {
    const statusEl = document.getElementById('vncStatus');
    statusEl.className = '';
    statusEl.classList.add(status);

    const statusText = {
        connected: 'Connected',
        connecting: 'Connecting...',
        disconnected: 'Disconnected'
    };

    statusEl.textContent = `Status: ${statusText[status] || status}`;
}

function toggleVNCFullscreen() {
    const viewer = document.getElementById('vncViewer');
    if (!document.fullscreenElement) {
        viewer.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// SFTP Functions
async function connectSFTPSession() {
    const host = document.getElementById('sftpHost').value;
    const port = document.getElementById('sftpPort').value;
    const username = document.getElementById('sftpUsername').value;
    const password = document.getElementById('sftpPassword').value;

    if (!username || !password) {
        showToast('Please enter username and password', 'error');
        return;
    }

    try {
        const response = await fetch('/api/sftp/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host, port, username, password })
        });

        const data = await response.json();

        if (data.success) {
            state.sftpConnected = true;
            showToast('SFTP connected successfully', 'success');
            loadFileList();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('SFTP connection error:', error);
        showToast('SFTP connection failed', 'error');
    }
}

async function loadFileList(path = '/') {
    if (!state.sftpConnected) {
        return;
    }

    try {
        const response = await fetch(`/api/sftp/list?path=${encodeURIComponent(path)}`);
        const data = await response.json();

        if (data.success) {
            state.currentPath = data.path;
            document.getElementById('currentPath').textContent = data.path;
            renderFileList(data.files);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('File list error:', error);
        showToast('Failed to load files', 'error');
    }
}

function renderFileList(files) {
    const fileList = document.getElementById('fileList');

    if (!files || files.length === 0) {
        fileList.innerHTML = '<tr><td colspan="4" class="no-files">No files found</td></tr>';
        return;
    }

    fileList.innerHTML = files.map(file => {
        const icon = file.type === 'directory' ? 'fa-folder' : 'fa-file';
        const size = file.type === 'directory' ? '-' : formatFileSize(file.size);
        const date = new Date(file.modified).toLocaleString();

        return `
            <tr>
                <td>
                    <div class="file-name" onclick="handleFileClick('${file.name}', '${file.type}')">
                        <i class="fas ${icon}"></i>
                        <span>${file.name}</span>
                    </div>
                </td>
                <td>${size}</td>
                <td>${date}</td>
                <td>
                    <div class="file-actions">
                        ${file.type === 'file' ? `<button onclick="downloadFile('${file.name}')" title="Download"><i class="fas fa-download"></i></button>` : ''}
                        <button onclick="renameFile('${file.name}')" title="Rename"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteFile('${file.name}', '${file.type}')" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function handleFileClick(fileName, fileType) {
    if (fileType === 'directory') {
        const newPath = state.currentPath === '/' ? `/${fileName}` : `${state.currentPath}/${fileName}`;
        loadFileList(newPath);
    }
}

async function downloadFile(fileName) {
    const filePath = state.currentPath === '/' ? `/${fileName}` : `${state.currentPath}/${fileName}`;
    window.open(`/api/sftp/download?path=${encodeURIComponent(filePath)}`, '_blank');
}

async function deleteFile(fileName, fileType) {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
        return;
    }

    const filePath = state.currentPath === '/' ? `/${fileName}` : `${state.currentPath}/${fileName}`;

    try {
        const response = await fetch('/api/sftp/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: filePath,
                isDirectory: fileType === 'directory'
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Deleted successfully', 'success');
            loadFileList(state.currentPath);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Delete failed', 'error');
    }
}

async function renameFile(fileName) {
    const newName = prompt('Enter new name:', fileName);
    if (!newName || newName === fileName) {
        return;
    }

    const oldPath = state.currentPath === '/' ? `/${fileName}` : `${state.currentPath}/${fileName}`;
    const newPath = state.currentPath === '/' ? `/${newName}` : `${state.currentPath}/${newName}`;

    try {
        const response = await fetch('/api/sftp/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ oldPath, newPath })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Renamed successfully', 'success');
            loadFileList(state.currentPath);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Rename error:', error);
        showToast('Rename failed', 'error');
    }
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('remotePath', state.currentPath);

    try {
        const response = await fetch('/api/sftp/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showToast('File uploaded successfully', 'success');
            loadFileList(state.currentPath);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed', 'error');
    }

    e.target.value = '';
}

async function handleCreateFolder() {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    const folderPath = state.currentPath === '/' ? `/${folderName}` : `${state.currentPath}/${folderName}`;

    try {
        const response = await fetch('/api/sftp/mkdir', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: folderPath })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Folder created successfully', 'success');
            loadFileList(state.currentPath);
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('Create folder error:', error);
        showToast('Create folder failed', 'error');
    }
}

// Service Management
async function handleServiceAction(action) {
    const serviceName = document.getElementById('serviceName').value;

    if (!serviceName) {
        showToast('Please enter a service name', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/system/service/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ service: serviceName })
        });

        const data = await response.json();
        const output = document.getElementById('serviceOutput');

        if (data.success) {
            output.textContent = `[${new Date().toLocaleTimeString()}] ${data.message}\n${data.output || ''}`;
            showToast(`Service ${action} completed`, 'success');
        } else {
            output.textContent = `[${new Date().toLocaleTimeString()}] Error: ${data.message}\n${data.stderr || ''}`;
            showToast(`Service ${action} failed`, 'error');
        }
    } catch (error) {
        console.error('Service action error:', error);
        showToast('Service action failed', 'error');
    }
}

// Network Information
async function loadNetworkInfo() {
    try {
        const response = await fetch('/api/system/network');
        const data = await response.json();

        if (data.success) {
            renderNetworkInfo(data.interfaces);
        }
    } catch (error) {
        console.error('Network info error:', error);
    }
}

function renderNetworkInfo(interfaces) {
    const networkInfo = document.getElementById('networkInfo');

    networkInfo.innerHTML = Object.entries(interfaces).map(([name, addrs]) => {
        const addrList = addrs.map(addr => `
            <div style="padding: 10px; margin: 5px 0; background: var(--darker-bg); border-radius: 5px;">
                <strong>Family:</strong> ${addr.family}<br>
                <strong>Address:</strong> ${addr.address}<br>
                <strong>Netmask:</strong> ${addr.netmask}<br>
                <strong>MAC:</strong> ${addr.mac}
            </div>
        `).join('');

        return `
            <div class="network-interface">
                <h3>${name}</h3>
                ${addrList}
            </div>
        `;
    }).join('');
}

// Utility Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
