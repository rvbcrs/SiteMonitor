const nodemailer = require('nodemailer');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Config, initializeDatabase } = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

let emailApiKey;

// Function to get current email config from DB or defaults
async function getEmailConfig() {
    try {
        const record = await Config.findOne({ where: { key: 'email' } });
        if (record) {
            return JSON.parse(record.value);
        } else {
            // Defaults using potentially new env var names
            return {
                service: process.env.EMAIL_SERVICE || 'gmail',
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT || '465', 10),
                secure: process.env.EMAIL_SECURE !== 'false', // true unless explicitly false
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: process.env.EMAIL_TO || process.env.EMAIL_FROM || process.env.EMAIL_USER,
                subject: 'SiteMonitor Notification',
                apiKey: process.env.EMAIL_SERVICE_API_KEY
            };
        }
    } catch (error) {
        console.error("Error fetching email config:", error);
        // Return defaults on error
        return {
            service: process.env.EMAIL_SERVICE || 'gmail',
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || '465', 10),
            secure: process.env.EMAIL_SECURE !== 'false',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: process.env.EMAIL_TO || process.env.EMAIL_FROM || process.env.EMAIL_USER,
            subject: 'SiteMonitor Notification',
            apiKey: process.env.EMAIL_SERVICE_API_KEY
        };
    }
}

// Initialize database and start server
async function initEmailService() {
    await initializeDatabase();
    const initialConfig = await getEmailConfig();
    emailApiKey = initialConfig.apiKey;

    // Verify initial config IF possible (optional check)
    if (initialConfig.auth && initialConfig.auth.user && initialConfig.auth.pass) {
        try {
            const tempTransporter = nodemailer.createTransport({
                service: initialConfig.service,
                host: initialConfig.host,
                port: initialConfig.port,
                secure: initialConfig.secure,
                auth: initialConfig.auth,
                tls: { rejectUnauthorized: false }
            });
            await tempTransporter.verify();
            console.log('Initial email config verified successfully.');
        } catch (error) {
            console.warn('Initial email config verification failed:', error.message);
        }
    }

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Email service running on port ${port}`);
        console.log('Initial email config loaded (user):', initialConfig.auth?.user);
        console.log('Email API Key is', emailApiKey ? 'set' : 'missing');
    });
}

initEmailService();

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
    const { to } = req.body;
    const apiKey = req.headers['x-api-key'];
    console.log('Received test email request:', { to, apiKey: apiKey ? 'present' : 'missing' });
    // Load API key from database
    const record = await Config.findOne({ where: { key: 'email' } });
    const dbEmailConf = record ? JSON.parse(record.value) : {};
    //const expectedKey = dbEmailConf.apiKey || process.env.EMAIL_SERVICE_API_KEY;
    const emailConf = await getEmailConfig();
    console.log('DEBUG: Fetched emailConf inside test-email:', JSON.stringify(emailConf));
    const expectedKey = emailConf.apiKey;

    if (apiKey !== expectedKey) {
        console.error('Invalid API key provided');
        return res.status(401).json({ error: 'Invalid API key' });
    }



    if (!emailConf.auth || !emailConf.auth.user || !emailConf.auth.pass || !emailConf.from) {
        console.error('Email configuration (auth/from) is missing in the database or env vars.');
        return res.status(500).json({ error: 'Email service not configured', details: 'Missing credentials or from address' });
    }

    try {
        // Create transporter just-in-time with current config
        const transporter = nodemailer.createTransport({
            service: emailConf.service,
            host: emailConf.host,
            port: emailConf.port,
            secure: emailConf.secure,
            auth: emailConf.auth,
            tls: { rejectUnauthorized: false } // Consider making this configurable
        });

        const mailOptions = {
            from: emailConf.from, // Use FROM from config
            to: to || emailConf.to, // Use TO from request body or config
            subject: 'Test Email from Website Monitor',
            html: `
                <h2>Test Email</h2>
                <p>This is a test email from your website monitor service.</p>
                <p>If you received this email, your email service is working correctly!</p>
                <p>Time sent: ${new Date().toLocaleString()}</p>
            `
        };

        console.log('Sending test email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });

        const info = await transporter.sendMail(mailOptions);
        console.log('Test email sent successfully:', info.response);

        res.json({
            success: true,
            message: 'Test email sent successfully',
            info: info.response
        });
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({
            error: 'Failed to send test email',
            details: error.message,
            code: error.code // Include error code (like EAUTH)
        });
    }
});

// Send email endpoint
app.post('/api/send-email', async (req, res) => {
    const { to, subject, content } = req.body;
    const apiKey = req.headers['x-api-key'];
    console.log('Received email request:', { to, subject, contentLength: content?.length, apiKey: apiKey ? 'present' : 'missing' });

    const emailConf = await getEmailConfig();
    console.log('DEBUG: Fetched emailConf inside send-email:', JSON.stringify(emailConf));
    const expectedKey = emailConf.apiKey;

    if (apiKey !== expectedKey) {
        console.error('Invalid API key provided');
        return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!emailConf.auth || !emailConf.auth.user || !emailConf.auth.pass || !emailConf.from) {
        console.error('Email configuration (auth/from) is missing in the database or env vars.');
        return res.status(500).json({ error: 'Email service not configured', details: 'Missing credentials or from address' });
    }

    try {
        // Create transporter just-in-time with current config
        const transporter = nodemailer.createTransport({
            service: emailConf.service,
            host: emailConf.host,
            port: emailConf.port,
            secure: emailConf.secure,
            auth: emailConf.auth,
            tls: { rejectUnauthorized: false } // Consider making this configurable
        });

        const mailOptions = {
            from: emailConf.from, // Use FROM from config
            to, // Use TO from request
            subject,
            html: content
        };

        console.log('Sending email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.response);

        res.json({
            success: true,
            message: 'Email sent successfully',
            info: info.response
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({
            error: 'Failed to send email',
            details: error.message,
            code: error.code // Include error code
        });
    }
}); 