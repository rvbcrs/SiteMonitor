const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const { Listing, Config } = require('./database');
const { checkWebsite } = require('./website-monitor');

const app = express();
const httpServer = createServer(app);
// Initialize Socket.IO server with NO options initially
const io = new Server(httpServer);

const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Check required environment variables
const requiredEnvVars = [
    'WEBSITE_MONITOR_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    process.exit(1);
}

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory:', dataDir);
}

// Cache of interval in ms
let scheduleIntervalMs = 5 * 60 * 1000;
// Timestamp (ms) of next expected check
let nextCheckTs = Date.now() + scheduleIntervalMs;

// Helper to convert cron-like schedule (supports */N minutes or hourly) to milliseconds
const parseCronToMs = (cron) => {
    if (!cron || typeof cron !== 'string') return 5 * 60 * 1000; // default 5 min
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return 5 * 60 * 1000;
    const [minute, hour] = parts;
    if (minute.startsWith('*/')) {
        const n = parseInt(minute.slice(2), 10);
        return isNaN(n) ? 5 * 60 * 1000 : n * 60 * 1000;
    }
    if (minute === '0') {
        if (hour.startsWith('*/')) {
            const h = parseInt(hour.slice(2), 10);
            return isNaN(h) ? 60 * 60 * 1000 : h * 60 * 60 * 1000;
        }
        return 60 * 60 * 1000; // hourly default
    }
    return 5 * 60 * 1000;
};

// Load interval from DB at startup
(async () => {
    try {
        const scheduleConfig = await Config.findOne({ where: { key: 'schedule' } });
        if (scheduleConfig) {
            let cronStr = scheduleConfig.value;
            try { cronStr = JSON.parse(scheduleConfig.value); } catch (_) { }
            scheduleIntervalMs = parseCronToMs(cronStr);
            console.log('Parsed schedule interval (ms):', scheduleIntervalMs);
        }
        // determine nextCheckTs based on latest listing timestamp if available
        const latest = await Listing.findOne({ order: [['timestamp', 'DESC']] });
        const lastTs = latest ? new Date(latest.timestamp).getTime() : Date.now();
        nextCheckTs = lastTs + scheduleIntervalMs;
        // Ensure nextCheckTs is in the future; if not, schedule from now
        if (nextCheckTs <= Date.now()) {
            nextCheckTs = Date.now() + scheduleIntervalMs;
        }
        console.log('Initial nextCheckTs set to', new Date(nextCheckTs).toISOString());
    } catch (e) {
        console.error('Failed to load schedule interval:', e);
    }
})();

// API Routes
app.get('/api/items', async (req, res) => {
    try {
        const listings = await Listing.findAll({
            order: [['timestamp', 'DESC']]
        });
        res.json({ listings });
    } catch (error) {
        console.error('Error fetching items:', error.message);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const websiteConfig = await Config.findOne({ where: { key: 'website' } });
        const scheduleConfig = await Config.findOne({ where: { key: 'schedule' } });
        const emailConfig = await Config.findOne({ where: { key: 'email' } });

        const config = {
            website: websiteConfig ? JSON.parse(websiteConfig.value) : {},
            schedule: scheduleConfig ? JSON.parse(scheduleConfig.value) : null,
            email: emailConfig ? JSON.parse(emailConfig.value) : {}
        };

        res.json(config);
    } catch (error) {
        console.error('Error fetching config:', error.message);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { website, schedule, email } = req.body;

        if (website) {
            await Config.upsert({
                key: 'website',
                value: JSON.stringify(website)
            });
        }

        if (schedule) {
            await Config.upsert({
                key: 'schedule',
                value: JSON.stringify(schedule)
            });
            scheduleIntervalMs = parseCronToMs(schedule);
            // update nextCheckTs relative to last listing timestamp
            const latest = await Listing.findOne({ order: [['timestamp', 'DESC']] });
            const lastTs = latest ? new Date(latest.timestamp).getTime() : Date.now();
            nextCheckTs = lastTs + scheduleIntervalMs;
            // Ensure nextCheckTs is in the future; if not, schedule from now
            if (nextCheckTs <= Date.now()) {
                nextCheckTs = Date.now() + scheduleIntervalMs;
            }
            emitNextCheck();
        }

        if (email) {
            await Config.upsert({
                key: 'email',
                value: JSON.stringify(email)
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating config:', error.message);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

// Log handshake info for every new WebSocket connection
io.use((socket, next) => {
    console.log('DEBUG WS: handshake from', socket.handshake.address, 'headers:', socket.handshake.headers);
    next();
});

// Add default handlers *after* initialization
io.on('connection', (socket) => {
    console.log('Client connected');
    console.log(`DEBUG WS: client ${socket.id} connected, nextCheckTs=${new Date(nextCheckTs).toISOString()}`);

    // Send current nextCheck to the newly connected client
    socket.emit('nextCheck', { nextCheck: nextCheckTs });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Modify the checkWebsite function to emit updates
const emitListingsUpdate = async () => {
    try {
        const listings = await Listing.findAll({
            order: [['timestamp', 'DESC']]
        });
        const now = Date.now();
        nextCheckTs = now + scheduleIntervalMs;

        console.log(`DEBUG WS: emitting listingsUpdate with ${listings.length} items, nextCheckTs=${new Date(nextCheckTs).toISOString()}`);
        io.emit('listingsUpdate', { listings, nextCheck: nextCheckTs });
        // broadcast separate nextCheck event as well
        emitNextCheck();
    } catch (error) {
        console.error('Error emitting listings update:', error);
    }
};

// Add helper to notify clients that a check is running
const emitChecking = () => {
    console.log('DEBUG WS: emitting checking event');
    io.emit('checking');
};

// Guard to prevent overlapping checks
let isCheckingRunning = false;

// Modify the check endpoint to emit updates
app.post('/api/check', async (req, res) => {
    if (isCheckingRunning) {
        return res.status(429).json({ error: 'Check already running' });
    }
    try {
        isCheckingRunning = true;
        emitChecking(); // notify clients
        // Immediately push nextCheckTs forward to avoid duplicate triggers
        nextCheckTs = Date.now() + scheduleIntervalMs;
        const results = await checkWebsite();
        await emitListingsUpdate();
        res.json({ success: true, results });
    } catch (error) {
        console.error('Error triggering check:', error.message);
        res.status(500).json({ error: 'Failed to trigger check' });
    } finally {
        isCheckingRunning = false;
    }
});

// Proxy test email requests to email-service
app.post('/api/test-email', async (req, res) => {
    try {
        const emailServiceUrl = process.env.EMAIL_SERVICE_URL;
        const response = await axios.post(
            `${emailServiceUrl}/api/test-email`,
            req.body,
            { headers: { 'x-api-key': req.headers['x-api-key'] || '' } }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Error proxying test-email:', error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Proxy send email requests to email-service
app.post('/api/send-email', async (req, res) => {
    try {
        const emailServiceUrl = process.env.EMAIL_SERVICE_URL;
        const response = await axios.post(
            `${emailServiceUrl}/api/send-email`,
            req.body,
            { headers: { 'x-api-key': req.headers['x-api-key'] || '' } }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Error proxying send-email:', error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Proxy endpoint for images
app.get('/api/proxy-image', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': req.headers['referer'] || ''
            }
        });

        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        res.send(response.data);
    } catch (error) {
        console.error('Image proxy error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// Start server
httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}, listening on all interfaces`);
    console.log(`Using website-monitor service at ${process.env.WEBSITE_MONITOR_URL}`);
});

// -------------------------------------------------------------
// Periodic scheduler that emits updates when a check is due
// -------------------------------------------------------------
// Every second we compare the current timestamp with the next scheduled
// check moment. If we have passed (or reached) that moment we trigger
// emitListingsUpdate() which will in turn recalculate a new nextCheckTs
// and broadcast it (together with latest listings) to all connected
// WebSocket clients.
setInterval(async () => {
    if (isCheckingRunning) return;
    if (Date.now() >= nextCheckTs) {
        isCheckingRunning = true;
        // bump next check immediately to prevent re-entry until this run finishes
        nextCheckTs = Date.now() + scheduleIntervalMs;
        console.log(`[Scheduler] nextCheckTs reached, starting automated check...`);
        emitChecking();
        try {
            await checkWebsite();
        } catch (err) {
            console.error('Scheduler automated check error:', err);
        }
        await emitListingsUpdate();
        isCheckingRunning = false;
    }
}, 1000);

const emitNextCheck = () => {
    console.log(`DEBUG WS: emitting nextCheck event with nextCheckTs=${new Date(nextCheckTs).toISOString()}`);
    io.emit('nextCheck', { nextCheck: nextCheckTs });
};