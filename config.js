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

    // Server Monitoring Settings
    monitoring: {
        updateInterval: 5000, // Update every 5 seconds (reduced to prevent SSH channel exhaustion)
        historyLimit: 60 // Keep last 60 data points for graphs
    }
};
