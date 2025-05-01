const path = require('path');
require('dotenv').config();

// Configuratie - Je kunt deze waarden ook via omgevingsvariabelen instellen
const config = {
    // Website informatie
    website: {
        loginUrl: process.env.LOGIN_URL,
        targetUrl: process.env.TARGET_URL,
        selectors: [process.env.CONTENT_SELECTOR],
    },

    // Login gegevens
    credentials: {
        username: process.env.USERNAME,
        password: process.env.PASSWORD,
        usernameSelector: process.env.USERNAME_SELECTOR,
        passwordSelector: process.env.PASSWORD_SELECTOR,
        submitSelector: process.env.SUBMIT_SELECTOR,
    },

    // Email instellingen
    email: {
        enabled: process.env.EMAIL_ENABLED === 'true',
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: process.env.EMAIL_SUBJECT,
    },

    // Bestandslocatie voor het opslaan van de vorige staat
    dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

    // Hoe vaak controleren (cron syntax)
    // Standaard: elke dag om 8:00
    schedule: process.env.SCHEDULE || '0 8 * * *',
};

// Laad de configuratie uit het bestand als deze bestaat
const configFile = path.join(config.dataDir, 'config.json');
if (require('fs').existsSync(configFile)) {
    const savedConfig = JSON.parse(require('fs').readFileSync(configFile, 'utf8'));

    // Handle the case where saved config has 'selector' instead of 'selectors'
    if (savedConfig.website && savedConfig.website.selector && !savedConfig.website.selectors) {
        savedConfig.website.selectors = [savedConfig.website.selector];
        delete savedConfig.website.selector;
    }

    Object.assign(config, savedConfig);
}

module.exports = config; 