const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    // Proxy API requests
    app.use(
        '/api',
        createProxyMiddleware({
            target: 'http://localhost:3001',
            changeOrigin: true,
        })
    );

    // Proxy WebSocket requests
    app.use(
        '/socket.io',
        createProxyMiddleware({
            target: 'http://localhost:3001',
            ws: true,
            changeOrigin: true,
            logLevel: 'debug'
        })
    );
}; 