// VPS Console Manager Configuration
// Edit values below according to your environment

module.exports = {
    // Server Configuration
    server: {
        port: 3000,
        nodeEnv: 'development' // 'development' or 'production'
    },

    // Session Configuration
    session: {
        secret: 'change-this-to-random-string-for-production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    },

    // Default VNC Configuration (can be overridden by user)
    vnc: {
        host: 'localhost',
        port: 5900,
        password: '' // Leave empty if no password
    },

    // Default SSH/SFTP Configuration (can be overridden by user)
    ssh: {
        host: 'localhost',
        port: 22
    },

    // File Upload Settings
    upload: {
        maxFileSize: 100 * 1024 * 1024, // 100MB in bytes
        uploadDir: './uploads'
    },

    // Security Settings
    security: {
        rateLimitWindow: 15, // minutes
        rateLimitMax: 100 // max requests per window
    },

    // Default Admin Credentials (only for fallback, SSH is primary auth)
    admin: {
        username: 'admin',
        password: 'admin123' // Change this!
    }
};
