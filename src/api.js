const express = require('express');
const router = express.Router();
const axios = require('axios');
const puppeteer = require('puppeteer');
const { Listing } = require('./database');
require('dotenv').config();

// Check if website-monitor URL is configured
if (!process.env.WEBSITE_MONITOR_URL) {
    console.error('WEBSITE_MONITOR_URL environment variable is not set');
    process.exit(1);
}

// API endpoint to get current items
router.get('/items', async (req, res) => {
    try {
        const response = await axios.get(`${process.env.WEBSITE_MONITOR_URL}/api/items`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching items:', error.message);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// API endpoint to get configuration
router.get('/config', async (req, res) => {
    try {
        const response = await axios.get(`${process.env.WEBSITE_MONITOR_URL}/api/config`);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching config:', error.message);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

// API endpoint to update configuration
router.post('/config', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.WEBSITE_MONITOR_URL}/api/config`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Error updating config:', error.message);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

// Proxy endpoint to fetch website content
router.post('/proxy', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Try direct fetch first with custom headers
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            return res.json({
                success: true,
                content: response.data
            });
        } catch (directError) {
            console.log('Direct fetch failed, trying CORS proxies...');

            // Try CORS proxies
            const corsProxies = [
                `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`,
                `https://cors-anywhere.herokuapp.com/${url}`
            ];

            for (const proxyUrl of corsProxies) {
                try {
                    console.log(`Trying CORS proxy: ${proxyUrl}`);
                    const response = await axios.get(proxyUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    });
                    const data = response.data;

                    if (typeof data === 'object' && data.contents) {
                        return res.json({
                            success: true,
                            content: data.contents
                        });
                    } else if (typeof data === 'string') {
                        return res.json({
                            success: true,
                            content: data
                        });
                    }
                } catch (proxyError) {
                    console.log(`Proxy ${proxyUrl} failed:`, proxyError.message);
                    continue;
                }
            }

            // If all proxies fail, try Puppeteer as a last resort
            console.log('All proxies failed, trying Puppeteer...');
            const browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080'
                ]
            });

            try {
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en-US,en;q=0.5'
                });
                await page.goto(url, {
                    waitUntil: 'networkidle0',
                    timeout: 30000
                });
                const content = await page.content();
                await browser.close();

                return res.json({
                    success: true,
                    content: content
                });
            } catch (puppeteerError) {
                await browser.close();
                throw puppeteerError;
            }
        }
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Proxy endpoint for images
router.get('/proxy-image', async (req, res) => {
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
                'Referer': 'https://www.marktplaats.nl/'
            }
        });

        // Set appropriate content type based on the image
        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        res.send(response.data);
    } catch (error) {
        console.error('Image proxy error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to manually trigger website check
router.post('/check', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.WEBSITE_MONITOR_URL}/api/check`);
        res.json(response.data);
    } catch (error) {
        console.error('Error triggering check:', error.message);
        res.status(500).json({ error: 'Failed to trigger check' });
    }
});

// Proxy test email endpoint to email-service
router.post('/test-email', async (req, res) => {
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

// Proxy send email endpoint to email-service
router.post('/send-email', async (req, res) => {
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

// Add reset endpoint
router.post('/reset', async (req, res) => {
    try {
        console.log('Debug - Resetting database...');
        await Listing.destroy({
            where: {},
            truncate: true
        });
        console.log('Debug - Database reset complete');
        res.json({ success: true, message: 'Database reset complete' });
    } catch (error) {
        console.error('Debug - Error resetting database:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router; 