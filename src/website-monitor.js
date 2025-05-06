const puppeteer = require('puppeteer');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const config = require('./config');
const { Listing, Config, initializeDatabase } = require('./database');
const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 3000;
const fs = require('fs');

// Initialize database
initializeDatabase();

// Global browser instance and login state
let browser = null;
let isLoggedIn = false;
let lastLoginTime = null;
let loginInProgress = false;
const LOGIN_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const BROWSER_RESTART_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
let lastBrowserStart = null;

// Middleware
const app = express();
app.use(cors());
app.use(express.json());

// Load configuration from database
async function loadConfig() {
    try {
        const configs = await Config.findAll();
        configs.forEach(item => {
            const value = JSON.parse(item.value);
            if (item.key === 'website') {
                config.website = { ...config.website, ...value };
            } else if (item.key === 'schedule') {
                config.schedule = value;
            } else if (item.key === 'email') {
                config.email = { ...config.email, ...value };
            }
        });

        // Seed defaults if we didn't find any configs
        if (configs.length === 0) {
            console.log('Debug - No configuration found in database, seeding with default values...');

            // Website configuration
            const defaultWebsite = {
                loginUrl: 'https://www.marktplaats.nl/identity/v2/login',
                targetUrl: 'https://www.marktplaats.nl/q/nintendo+switch/#searchInTitleAndDescription:true|Language:nl-NL|f:13940|asSavedSearch:true',
                usernameSelector: 'input[name="email"]',
                passwordSelector: 'input[name="password"]',
                submitSelector: 'button[type="submit"], button.hz-Button--primary, button.hz-Button',
                username: 'ramonvanbruggen@gmail.com',
                password: 'guxtop-gifqy5-dukCeh',
            };
            await Config.upsert({ key: 'website', value: JSON.stringify(defaultWebsite) });
            config.website = { ...config.website, ...defaultWebsite };
            console.log('Debug - Seeded website config with default values');

            // Schedule configuration
            const defaultSchedule = '*/10 * * * *';
            await Config.upsert({ key: 'schedule', value: JSON.stringify(defaultSchedule) });
            config.schedule = defaultSchedule;
            console.log('Debug - Seeded schedule config with default values');

            // Email configuration
            const defaultEmail = {
                enabled: true,
                service: 'gmail',
                auth: {
                    user: 'ramonvanbruggen@gmail.com',
                    pass: 'dpsqicvcvwxgmtfe',
                },
                from: 'ramonvanbruggen@gmail.com',
                to: 'ramonvanbruggen@gmail.com',
                subject: 'SiteMonitor Notification',
            };
            await Config.upsert({ key: 'email', value: JSON.stringify(defaultEmail) });
            config.email = { ...config.email, ...defaultEmail };
            console.log('Debug - Seeded email config with default values');
        } else {
            // If we have some configs but not all, seed the missing ones
            if (!config.website || !config.website.loginUrl) {
                const seededWebsite = {
                    loginUrl: process.env.LOGIN_URL || '',
                    targetUrl: process.env.TARGET_URL || '',
                    usernameSelector: process.env.USERNAME_SELECTOR || '',
                    passwordSelector: process.env.PASSWORD_SELECTOR || '',
                    submitSelector: process.env.SUBMIT_SELECTOR || '',
                    username: process.env.USERNAME || '',
                    password: process.env.PASSWORD || '',
                };
                config.website = { ...config.website, ...seededWebsite };
                await Config.upsert({ key: 'website', value: JSON.stringify(config.website) });
                console.log('Debug - Seeded website config from environment variables');
            }

            if (!config.schedule || config.schedule === '') {
                const defaultSchedule = process.env.SCHEDULE || '*/10 * * * *';
                config.schedule = defaultSchedule;
                await Config.upsert({ key: 'schedule', value: JSON.stringify(config.schedule) });
                console.log('Debug - Seeded schedule config from environment variables');
            }

            // Email config remains as stored in the database, no automatic seeding to prevent overrides
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
    }
}

/**
 * Check if the response indicates we need to log in again
 */
async function checkUnauthorized(page) {
    const response = await page.evaluate(() => {
        const url = window.location.href.toLowerCase();
        const hasUserMenu = !!document.querySelector('[data-testid="user-menu"], .user-menu, [class*="UserMenu"], [class*="user-menu"]');
        const hasLogoutButton = !!document.querySelector('[data-testid="logout-button"], .logout-button, [class*="LogoutButton"], [class*="logout-button"]');
        const hasUserAvatar = !!document.querySelector('[data-testid="user-avatar"], .user-avatar, [class*="UserAvatar"], [class*="user-avatar"]');
        const hasLoginButton = !!document.querySelector('[data-testid="login-button"], .login-button, [class*="LoginButton"], [class*="login-button"]');
        const hasUserProfile = !!document.querySelector('[href*="/mijn-marktplaats"], [href*="/my-marktplaats"]');

        return {
            isLoginPage: url.includes('/login') || url.includes('/identity'),
            isHomePage: url === 'https://www.marktplaats.nl/' || url === 'https://www.marktplaats.nl',
            isLoggedIn: (hasUserMenu || hasLogoutButton || hasUserAvatar || hasUserProfile) && !hasLoginButton,
            title: document.title,
            url: window.location.href
        };
    });

    console.log('Debug - Session check:', response);
    return !response.isLoggedIn;
}

/**
 * Initialize browser and login if needed
 */
async function initializeBrowser() {
    const now = Date.now();

    // Check if we need to restart the browser
    if (browser && lastBrowserStart && (now - lastBrowserStart) > BROWSER_RESTART_TIMEOUT) {
        console.log('Debug - Browser session too old, restarting...');
        try {
            await browser.close();
        } catch (error) {
            console.error('Error closing old browser:', error);
        }
        browser = null;
    }

    if (!browser) {
        console.log('Debug - Initializing browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080',
                '--disable-blink-features=AutomationControlled'
            ],
            defaultViewport: null
        });
        lastBrowserStart = now;
    }

    // Check if we need to login
    if (!isLoggedIn || !lastLoginTime || (now - lastLoginTime) > LOGIN_TIMEOUT) {
        if (loginInProgress) {
            console.log('Debug - Login already in progress, waiting...');
            // Wait for the login to complete
            while (loginInProgress) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return;
        }

        console.log('Debug - Login required:', {
            isLoggedIn,
            lastLoginTime: lastLoginTime ? new Date(lastLoginTime).toISOString() : 'never',
            timeSinceLastLogin: lastLoginTime ? `${(now - lastLoginTime) / 1000}s` : 'never'
        });

        loginInProgress = true;
        try {
            await login();
            lastLoginTime = now;
            isLoggedIn = true;
        } finally {
            loginInProgress = false;
        }
    } else {
        console.log('Debug - Using existing login session');
    }
}

/**
 * Perform the login process
 */
async function login() {
    console.log('Debug - Logging in...');
    const page = await browser.newPage();
    try {
        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Set viewport and other settings
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });

        // Navigate to login page
        await page.goto(config.website.loginUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for and fill username
        const uSelector = config.website.usernameSelector || process.env.USERNAME_SELECTOR;
        const pSelector = config.website.passwordSelector || process.env.PASSWORD_SELECTOR;
        const sSelector = config.website.submitSelector || process.env.SUBMIT_SELECTOR;

        await page.waitForSelector(uSelector, {
            visible: true,
            timeout: 30000
        });
        await page.type(uSelector, config.website.username || process.env.USERNAME, { delay: 100 });

        // Wait for and fill password
        await page.waitForSelector(pSelector, {
            visible: true,
            timeout: 30000
        });
        await page.type(pSelector, config.website.password || process.env.PASSWORD, { delay: 100 });

        // Click submit button
        await page.click(sSelector);

        // Wait for navigation
        await page.waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Verify login success
        const loginStatus = await page.evaluate(() => {
            const url = window.location.href.toLowerCase();
            const hasUserMenu = !!document.querySelector('[data-testid="user-menu"], .user-menu, [class*="UserMenu"]');
            const hasLogoutButton = !!document.querySelector('[data-testid="logout-button"], .logout-button, [class*="LogoutButton"]');
            const hasUserAvatar = !!document.querySelector('[data-testid="user-avatar"], .user-avatar, [class*="UserAvatar"]');
            return {
                isLoginPage: url.includes('/login') || url.includes('/identity'),
                isHomePage: url === 'https://www.marktplaats.nl/' || url === 'https://www.marktplaats.nl',
                isLoggedIn: hasUserMenu || hasLogoutButton || hasUserAvatar,
                title: document.title,
                url: window.location.href
            };
        });

        console.log('Debug - Login status:', loginStatus);

        if (loginStatus.isLoginPage || (!loginStatus.isHomePage && !loginStatus.isLoggedIn)) {
            throw new Error(`Login verification failed. Current page: ${loginStatus.title} (${loginStatus.url})`);
        }

        isLoggedIn = true;
        lastLoginTime = Date.now();
        console.log('Debug - Successfully logged in');
    } catch (error) {
        console.error('Debug - Login failed:', error);
        isLoggedIn = false;
        lastLoginTime = null;
        throw error;
    } finally {
        await page.close();
    }
}

/**
 * Genereer een hash van de inhoud voor het vergelijken
 */
function generateHash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Sla de inhoud op
 */
async function saveContent(selector, content) {
    try {
        console.log('\nDebug - Saving content to database:');
        console.log('Selector:', selector);
        console.log('Number of items:', content.items.length);

        // Delete old listings for this selector
        const deletedCount = await Listing.destroy({
            where: { selector }
        });
        console.log(`Deleted ${deletedCount} old listings for selector ${selector}`);

        // Get existing listings from database
        const existingItems = await Listing.findAll({
            where: { selector }
        });
        console.log(`Found ${existingItems.length} existing items in database`);

        // Filter out duplicates based on multiple fields
        const uniqueItems = content.items.reduce((acc, item) => {
            // Create a unique key using title, price, and URL
            const key = `${item.title}-${item.price}-${item.url}`;

            // Check if this item already exists in the database
            const existsInDb = existingItems.some(existing =>
                existing.title === item.title &&
                existing.price === item.price &&
                existing.url === item.url
            );

            // Only add if we haven't seen this exact combination before
            if (!acc.has(key) && !existsInDb) {
                acc.set(key, item);
            } else {
                console.log('Debug - Found duplicate item:', {
                    title: item.title,
                    price: item.price,
                    url: item.url,
                    existsInDb
                });
            }
            return acc;
        }, new Map());

        const uniqueItemsArray = Array.from(uniqueItems.values());
        console.log(`Filtered out ${content.items.length - uniqueItemsArray.length} duplicate items`);

        // Save new listings
        const listings = uniqueItemsArray.map(item => ({
            title: item.title,
            price: item.price,
            imageUrl: item.image,
            url: item.url,
            selector,
            timestamp: new Date(),
            description: item.description,
            seller: item.seller,
            location: item.location,
            date: item.date,
            condition: item.attributes.find(attr => attr.toLowerCase().includes('conditie')) || null,
            category: item.attributes.find(attr => attr.toLowerCase().includes('categorie')) || null,
            attributes: JSON.stringify(item.attributes)
        }));

        if (listings.length > 0) {
            console.log('Sample listing to save:', listings[0]);
        }

        console.log(`Saving ${listings.length} new items`);

        if (listings.length > 0) {
            const createdListings = await Listing.bulkCreate(listings);
            console.log(`Successfully saved ${createdListings.length} unique listings to database`);
        } else {
            console.log('No new items to save');
        }

        // Verify the save
        const count = await Listing.count({ where: { selector } });
        console.log(`Total listings in database for selector ${selector}: ${count}`);
    } catch (error) {
        console.error('Error saving content:', error);
        throw error;
    }
}

/**
 * Haal de vorige hash op
 */
async function getPreviousHash(selector) {
    try {
        const listings = await Listing.findAll({
            where: { selector },
            order: [['timestamp', 'DESC']]
        });

        if (listings.length === 0) return null;

        const stable = listings.map(l => ({ title: l.title, price: l.price, url: l.url }))
            .sort((a, b) => a.url.localeCompare(b.url));

        return generateHash(JSON.stringify(stable));
    } catch (error) {
        console.error('Error getting previous hash:', error);
        return null;
    }
}

/**
 * Stuur een e-mail notificatie
 */
async function sendEmailNotification(content, selector) {
    if (!config.email.enabled) return;

    const transporter = nodemailer.createTransport({
        service: config.email.service,
        auth: config.email.auth,
    });

    // Build email HTML matching dashboard card layout
    const emailHtml = `
      <div style="font-family: 'Abel', sans-serif; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #333;">Nieuwe items gevonden</h1>
        <p style="color: #666;">De volgende nieuwe items werden gevonden op ${config.website.targetUrl}:</p>
        <div style="margin-top: 20px;">
          ${content.items.map(item => `
            <div style="display: flex; flex-direction: row; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px; overflow: hidden;">
              <!-- Left side -->
              <div style="width: 220px; padding: 16px; background-color: #c96b60; color: #fff; text-align: center;">
                <div style="margin-bottom: 12px;">
                  <span style="display: inline-block; background-color: #b45b52; color: #fff; padding: 4px 8px; border-radius: 16px; font-weight: 600; font-size: 0.875rem;">
                    ${item.seller || item.title.split(' ')[0]}
                  </span>
                </div>
                <div style="margin-bottom: 12px;">
                  ${item.image ? `<img src="${item.image}" alt="${item.title}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 4px;">`
            : `<div style="width: 120px; height: 120px; background: #ccc; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: #555;">
                        ${item.title.charAt(0)}
                      </div>`}
                </div>
                <div>
                  <span style="display: inline-block; background-color: #b45b52; color: #fff; padding: 4px 8px; border-radius: 16px; font-weight: 600; font-size: 0.875rem;">
                    ${item.price}
                  </span>
                </div>
              </div>
              <!-- Right side -->
              <div style="flex: 1; background: #fff; padding: 16px; display: flex; flex-direction: column;">
                <h3 style="margin: 0 0 8px; font-size: 1.25rem; color: #000;">${item.title}</h3>
                <p style="margin: 0 0 12px; font-size: 1rem; color: #333;">${item.description}</p>
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                  ${item.url ? `<a href="${item.url}" style="padding: 6px 12px; background: #1976d2; color: #fff; text-decoration: none; border-radius: 4px; font-size: 0.875rem;">Zie omschrijving</a>` : ''}
                  <span style="font-size: 0.75rem; color: #888;">${new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style="font-size: 0.75rem; color: #888;">${item.location}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${item.attributes.map(attr => `<span style="border: 1px solid #ccc; border-radius: 4px; padding: 2px 6px; font-size: 0.75rem; color: #555;">${attr}</span>`).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <p style="margin-top: 20px; color: #666; font-size: 12px;">
          This email was sent by the SiteMonitor application. You can manage your notification settings in the dashboard.
        </p>
      </div>
    `;

    const mailOptions = {
        from: config.email.from,
        to: config.email.to,
        subject: config.email.subject,
        html: emailHtml
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent for selector ${selector}:`, info.response);
    } catch (error) {
        console.error(`Error sending email for selector ${selector}:`, error);
    }
}
/* test */
/**
 * Controleer de website op wijzigingen
 */
async function checkWebsite() {
    console.log('\nDebug - Starting website check...');

    // Ensure we have the latest settings from the database
    await loadConfig();

    try {
        await initializeBrowser();
        let page = await browser.newPage();

        // Navigate to target page
        console.log(`Debug - Navigating to target page: ${config.website.targetUrl}`);
        await page.goto(config.website.targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wacht kort tot eventuele user-menu elementen geladen zijn
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check of we opnieuw moeten inloggen
        let needsLogin = await checkUnauthorized(page);

        // Als we zeer recent (binnen 10 min) hebben ingelogd, neem aan dat sessie nog geldig is
        const RECENT_LOGIN_GRACE_MS = 10 * 60 * 1000; // 10 minuten
        if (needsLogin && lastLoginTime && (Date.now() - lastLoginTime) < RECENT_LOGIN_GRACE_MS) {
            console.log('Session check indicated login required, but we logged in recently. Continuing without re-login.');
            needsLogin = false;
        }

        if (needsLogin) {
            console.log('Debug - Session expired, re-logging in...');
            isLoggedIn = false;
            lastLoginTime = null;
            await page.close();
            await login();
            page = await browser.newPage();
            await page.goto(config.website.targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
        } else {
            console.log('Debug - Session is valid, proceeding with check');
        }

        // Wait for the content and add delay for filtering
        console.log('Debug - Waiting for content and filters to be applied...');
        await page.waitForSelector(config.website.selectors[0], {
            visible: true,
            timeout: 30000
        });

        // Verify the listing selector exists
        const listingCount = await page.evaluate(() => {
            // Try multiple selectors to find listings
            const selectors = [
                'li.hz-Listing.hz-Listing--list-item',
                'li.hz-Listing',
                'article.hz-Listing',
                'div.hz-Listing'
            ];

            let totalItems = 0;
            selectors.forEach(selector => {
                const items = document.querySelectorAll(selector);
                console.log(`Debug - Found ${items.length} items with selector: ${selector}`);
                totalItems += items.length;
            });

            return totalItems;
        });
        console.log(`Debug - Total listing count: ${listingCount}`);

        // Wait for listings to be loaded
        console.log('Debug - Waiting for listings to be loaded...');
        await page.waitForSelector('li.hz-Listing, article.hz-Listing, div.hz-Listing', {
            visible: true,
            timeout: 30000
        });

        // Add delay to allow all listings to be fully loaded
        console.log('Debug - Waiting for listings to be fully loaded (5 seconds)...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Clean up old screenshots
        const dataDir = path.join(__dirname, '../data');
        fs.readdirSync(dataDir)
            .filter(f => f.startsWith('screenshot-') && f.endsWith('.png'))
            .forEach(f => fs.unlinkSync(path.join(dataDir, f)));
        console.log('Debug - Old screenshots removed.');

        // Take screenshot of the page
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = path.join(__dirname, '../data', `screenshot-${timestamp}.png`);
        await page.screenshot({
            path: screenshotPath,
            fullPage: true
        });
        console.log(`Debug - Screenshot saved to: ${screenshotPath}`);

        // Extract content
        console.log('Debug - Starting content extraction...');

        // First, let's log the page content directly
        const pageContent = await page.content();
        console.log('Debug - Page content length:', pageContent.length);
        console.log('Debug - First 500 chars of page content:', pageContent.substring(0, 500));

        // Now try to find the listings container
        const listingsContainer = await page.evaluate(() => {
            const container = document.querySelector('.hz-Listings.hz-Listings--list-view');
            if (container) {
                return {
                    exists: true,
                    children: container.children.length,
                    classList: Array.from(container.classList),
                    html: container.innerHTML.substring(0, 200) + '...'
                };
            }
            return { exists: false };
        });

        console.log('Debug - Listings container info:', listingsContainer);

        // Try to find all listing items
        const listingItems = await page.evaluate(() => {
            const items = document.querySelectorAll('li.hz-Listing.hz-Listing--list-item');
            return Array.from(items).map(item => ({
                title: item.querySelector('h3')?.textContent?.trim(),
                classList: Array.from(item.classList),
                html: item.outerHTML.substring(0, 200) + '...'
            }));
        });

        console.log('Debug - Found listing items:', listingItems);

        // Now proceed with the original content extraction
        const content = await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (!element) {
                return null;
            }

            // Log the entire page HTML for debugging
            console.log('Debug - Full page HTML:', document.documentElement.outerHTML);

            // Log basic page info
            console.log('Debug - Page title:', document.title);
            console.log('Debug - Page URL:', window.location.href);

            // Log all elements with Listings in their class
            const allElements = Array.from(document.querySelectorAll('*'));
            console.log('Debug - Total elements on page:', allElements.length);

            const listingElements = allElements.filter(el =>
                Array.from(el.classList).some(cls => cls.includes('Listings'))
            );
            console.log('Debug - Elements with Listings in class:', listingElements.map(el => ({
                tagName: el.tagName,
                classList: Array.from(el.classList),
                children: el.children.length
            })));

            // Find the listings container
            const listingsContainer = element.querySelector('.hz-Listings.hz-Listings--list-view');
            if (!listingsContainer) {
                console.log('Debug - No listings container found with exact class match');
                // Try to find any element with listings
                console.log('Debug - Found potential listing containers:', listingElements.map(el => ({
                    tagName: el.tagName,
                    classList: Array.from(el.classList),
                    children: el.children.length,
                    html: el.outerHTML.substring(0, 200) + '...' // First 200 chars of HTML
                })));
                return null;
            }

            // Log detailed container info
            console.log('Debug - Listings container found:', {
                tagName: listingsContainer.tagName,
                classList: Array.from(listingsContainer.classList),
                children: listingsContainer.children.length,
                html: listingsContainer.outerHTML.substring(0, 200) + '...'
            });

            // Try different ways to find listings
            const items1 = Array.from(listingsContainer.querySelectorAll('li.hz-Listing.hz-Listing--list-item'));
            const items2 = Array.from(listingsContainer.querySelectorAll('li[class*="Listing"]'));
            const items3 = Array.from(listingsContainer.querySelectorAll('li'));

            console.log(`Debug - Found ${items1.length} items with exact class match`);
            console.log(`Debug - Found ${items2.length} items with partial class match`);
            console.log(`Debug - Found ${items3.length} total li elements`);

            // Log details of first few items if found
            if (items1.length > 0) {
                console.log('Debug - First item with exact match:', {
                    classList: Array.from(items1[0].classList),
                    html: items1[0].outerHTML.substring(0, 200) + '...'
                });
            }
            if (items2.length > 0 && items2.length !== items1.length) {
                console.log('Debug - First item with partial match:', {
                    classList: Array.from(items2[0].classList),
                    html: items2[0].outerHTML.substring(0, 200) + '...'
                });
            }
            if (items3.length > 0 && items3.length !== items2.length) {
                console.log('Debug - First item with any li:', {
                    classList: Array.from(items3[0].classList),
                    html: items3[0].outerHTML.substring(0, 200) + '...'
                });
            }

            // Use the most complete set of items
            const items = items1.length > 0 ? items1 : items2.length > 0 ? items2 : items3;
            console.log(`Debug - Using ${items.length} items`);

            if (items.length > 0) {
                console.log('Debug - First item HTML:', items[0].outerHTML);
                console.log('Debug - First item classList:', Array.from(items[0].classList));
            }

            // Process items
            const processedItems = items.map(item => {
                // Extract title - try multiple selectors
                const titleSelectors = [
                    'h3.hz-Listing-title',
                    'h3[class*="Listing-title"]',
                    'h3[class*="title"]',
                    'h3'
                ];
                let title = '';
                for (const selector of titleSelectors) {
                    const titleElement = item.querySelector(selector);
                    if (titleElement) {
                        title = titleElement.textContent.trim();
                        break;
                    }
                }

                // Extract price - try multiple selectors
                const priceSelectors = [
                    'p.hz-Listing-price',
                    'span.hz-Listing-price',
                    'p[class*="Listing-price"]',
                    'span[class*="Listing-price"]',
                    'p[class*="price"]',
                    'span[class*="price"]'
                ];
                let price = '';
                for (const selector of priceSelectors) {
                    const priceElement = item.querySelector(selector);
                    if (priceElement) {
                        price = priceElement.textContent.trim();
                        break;
                    }
                }

                // Extract image - try multiple selectors
                const imageSelectors = [
                    'img.hz-Listing-image-item',
                    'img.hz-Listing-image',
                    'img[class*="Listing-image"]',
                    'img[class*="image"]',
                    'img'
                ];
                let image = '';
                for (const selector of imageSelectors) {
                    const imageElement = item.querySelector(selector);
                    if (imageElement) {
                        image = imageElement.getAttribute('src') ||
                            imageElement.getAttribute('data-src') ||
                            (imageElement.getAttribute('srcset') ? imageElement.getAttribute('srcset').split(' ')[0] : '');
                        if (image) break;
                    }
                }

                // Convert relative image URL to absolute
                if (image && image.startsWith('/')) {
                    try {
                        image = new URL(image, window.location.origin).href;
                    } catch (e) {
                        console.warn('Debug - Failed to convert relative image URL', image, e);
                    }
                }

                // Extract link - try multiple selectors (broader list and fallback)
                const linkSelectors = [
                    'a.hz-Listing-coverLink',           // explicit listing cover link
                    'a.hz-Link.hz-Link--block',        // generic block link
                    'a.hz-Link--secondary',            // secondary style link
                    'a[class*="Link"]',              // any element with Link in class
                    'a[href]'                          // any anchor with href
                ];
                let url = '';
                for (const selector of linkSelectors) {
                    const linkElement = item.querySelector(selector);
                    if (linkElement && linkElement.getAttribute('href')) {
                        url = linkElement.getAttribute('href');
                        break;
                    }
                }

                // Convert relative URL to absolute if needed
                if (url && url.startsWith('/')) {
                    try {
                        url = new URL(url, window.location.origin).href;
                    } catch (e) {
                        console.warn('Debug - Failed to convert relative URL', url, e);
                    }
                }

                // Fallback: if still no URL, try the first anchor anywhere inside the item
                if (!url) {
                    const fallbackAnchor = item.querySelector('a[href]');
                    if (fallbackAnchor) {
                        url = fallbackAnchor.getAttribute('href');
                        if (url && url.startsWith('/')) {
                            try {
                                url = new URL(url, window.location.origin).href;
                            } catch (e) {
                                console.warn('Debug - Failed to convert fallback relative URL', url, e);
                            }
                        }
                    }
                }

                // Extract description - try multiple selectors
                const descriptionSelectors = [
                    'p.hz-Listing-description',
                    'p[class*="Listing-description"]',
                    'p[class*="description"]',
                    'p'
                ];
                let description = '';
                for (const selector of descriptionSelectors) {
                    const descriptionElement = item.querySelector(selector);
                    if (descriptionElement) {
                        description = descriptionElement.textContent.trim();
                        break;
                    }
                }

                // Extract seller - try multiple selectors
                const sellerSelectors = [
                    'span.hz-Listing-seller-name',
                    'span[class*="Listing-seller"]',
                    'span[class*="seller"]',
                    'span'
                ];
                let seller = '';
                for (const selector of sellerSelectors) {
                    const sellerElement = item.querySelector(selector);
                    if (sellerElement) {
                        seller = sellerElement.textContent.trim();
                        break;
                    }
                }

                // Extract location - try multiple selectors
                const locationSelectors = [
                    'span.hz-Listing-distance-label',
                    'span[class*="Listing-distance"]',
                    'span[class*="distance"]',
                    'span[class*="location"]'
                ];
                let location = '';
                for (const selector of locationSelectors) {
                    const locationElement = item.querySelector(selector);
                    if (locationElement) {
                        location = locationElement.textContent.trim();
                        break;
                    }
                }

                // Extract date - try multiple selectors
                const dateSelectors = [
                    'span.hz-Listing-date',
                    'span[class*="Listing-date"]',
                    'span[class*="date"]'
                ];
                let date = '';
                for (const selector of dateSelectors) {
                    const dateElement = item.querySelector(selector);
                    if (dateElement) {
                        date = dateElement.textContent.trim();
                        break;
                    }
                }

                // Extract attributes
                const attributes = [];
                const attributesSelectors = [
                    'div.hz-Listing-attributes',
                    'div[class*="Listing-attributes"]',
                    'div[class*="attributes"]'
                ];
                for (const selector of attributesSelectors) {
                    const attributesElement = item.querySelector(selector);
                    if (attributesElement) {
                        const attributeElements = attributesElement.querySelectorAll('span.hz-Attribute, span[class*="Attribute"]');
                        attributeElements.forEach(attr => {
                            const text = attr.textContent.trim();
                            if (text) attributes.push(text);
                        });
                        break;
                    }
                }

                // Basic validation (require title, URL can be empty but log warning)
                const isValidItem = title && title.length > 0;

                if (isValidItem) {
                    if (!url) {
                        console.warn('Debug - Item missing URL, keeping anyway:', title);
                    }
                    console.log('Found item:', {
                        title,
                        price,
                        image,
                        url,
                        description,
                        seller,
                        location,
                        date,
                        attributes,
                        classList: Array.from(item.classList),
                        hasBanner: !!item.querySelector('.hz-Banner'),
                        hasAd: !!item.querySelector('.hz-Ad'),
                        isPromoted: !!item.querySelector('.hz-Listing--promoted'),
                        isSponsored: !!item.querySelector('.hz-Listing--sponsored')
                    });
                    return {
                        title,
                        price,
                        image,
                        url,
                        description,
                        seller,
                        location,
                        date,
                        attributes
                    };
                } else {
                    console.log('Skipping item - missing required fields:', {
                        hasTitle: !!title && title.length > 0,
                        hasUrl: !!url && url.length > 0,
                        title,
                        url
                    });
                    return null;
                }
            }).filter(item => item !== null); // Remove null items

            console.log(`Total valid items after filtering: ${processedItems.length}`);

            // Debug: Log all found items before filtering
            console.log('All found items before filtering:', items.map(item => ({
                title: item.querySelector('h3.hz-Listing-title')?.textContent.trim(),
                price: item.querySelector('p.hz-Listing-price, span.hz-Listing-price')?.textContent.trim(),
                url: item.querySelector('a.hz-Link.hz-Link--block')?.href
            })));

            return {
                html: element.innerHTML,
                items: processedItems
            };
        }, config.website.selectors[0]);

        if (!content) {
            throw new Error(`Content not found for selector: ${config.website.selectors[0]}`);
        }

        console.log(`Debug - Extracted ${content.items.length} items`);

        // Generate hash based on stable fields (title, price, url) for all items
        const stableCurrent = content.items.map(i => ({ title: i.title, price: i.price, url: i.url })).sort((a, b) => a.url.localeCompare(b.url));
        const currentHash = generateHash(JSON.stringify(stableCurrent));
        const previousHash = await getPreviousHash(config.website.selectors[0]);

        // Determine which items are new (initial run counts all as new)
        let newItems = [];
        if (previousHash === null || currentHash !== previousHash) {
            console.log('Debug - Content is new or has changed, saving to database...');

            // Fetch previous listings before we overwrite them
            const previousListings = await Listing.findAll({
                where: { selector: config.website.selectors[0] },
                order: [['timestamp', 'DESC']]
            });

            await saveContent(config.website.selectors[0], content);

            if (previousHash === null) {
                // First run -> everything is new
                newItems = content.items;
            } else {
                const previousItems = previousListings.map(l => ({
                    title: l.title,
                    price: l.price,
                    url: l.url
                }));
                newItems = content.items.filter(newItem =>
                    !previousItems.some(oldItem =>
                        oldItem.title === newItem.title &&
                        oldItem.price === newItem.price &&
                        oldItem.url === newItem.url
                    )
                );
            }
        }
        // Send email only with new items if any
        if (newItems.length > 0) {
            console.log('Debug - Sending email notification for new items:', newItems.length);
            await sendEmailNotification({ items: newItems }, config.website.selectors[0]);
        }

        await page.close();
        return { success: true, message: 'Website check completed' };
    } catch (error) {
        console.error('Debug - Error during website check:', error);
        if (error.message.includes('login') || error.message.includes('unauthorized')) {
            isLoggedIn = false;
            lastLoginTime = null;
        }
        throw error;
    }
}

// Export the functions
module.exports = { checkWebsite, generateHash, saveContent, getPreviousHash, sendEmailNotification };

/**
 * Voer de website controle uit volgens het schema
 */
function startMonitoring() {
    // Geef configuratie weer bij het opstarten
    console.log('Website Monitor gestart met configuratie:');
    console.log(`Login URL: ${config.website.loginUrl}`);
    console.log(`Target URL: ${config.website.targetUrl}`);
    console.log(`Controle schema: ${config.schedule}`);
    console.log(`Data directory: ${config.dataDir}`);
    console.log(`Email notificaties: ${config.email.enabled ? 'Ingeschakeld' : 'Uitgeschakeld'}`);

    // Stop eventuele bestaande cron job
    if (global.cronJob) {
        global.cronJob.stop();
    }

    // Voer direct een controle uit bij het starten
    checkWebsite();

    // Planning instellen voor herhaalde controles
    global.cronJob = cron.schedule(config.schedule, () => {
        console.log(`Uitvoeren van geplande controle op ${new Date().toISOString()}`);
        checkWebsite();
    });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Get current items
app.get('/api/items', async (req, res) => {
    try {
        console.log('\nDebug - Fetching listings from database...');
        const listings = await Listing.findAll({
            order: [['timestamp', 'DESC']]
        });
        console.log(`Retrieved ${listings.length} listings from database`);
        res.json({ listings });
    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({ error: 'Error fetching listings', details: error.message });
    }
});

// Get current configuration
app.get('/api/config', async (req, res) => {
    try {
        console.log('\nDebug - Fetching configuration...');
        const websiteConfig = await Config.findOne({ where: { key: 'website' } });
        const scheduleConfig = await Config.findOne({ where: { key: 'schedule' } });
        const emailConfig = await Config.findOne({ where: { key: 'email' } });

        const configResponse = {
            website: websiteConfig ? JSON.parse(websiteConfig.value) : {},
            schedule: scheduleConfig ? JSON.parse(scheduleConfig.value) : null,
            email: emailConfig ? JSON.parse(emailConfig.value) : {}
        };

        console.log('Configuration retrieved:', configResponse);
        res.json(configResponse);
    } catch (error) {
        console.error('Error fetching configuration:', error);
        res.status(500).json({ error: 'Error fetching configuration', details: error.message });
    }
});

// Update configuration
app.post('/api/config', async (req, res) => {
    try {
        const { website, schedule, email, theme } = req.body;

        if (website) {
            await Config.upsert({ key: 'website', value: JSON.stringify(website) });
            config.website = website;
            console.log('Debug - Updated website config');
        }
        if (schedule) {
            await Config.upsert({ key: 'schedule', value: JSON.stringify(schedule) });
            config.schedule = schedule;
            console.log('Debug - Updated schedule config');
            // Restart cron job with new schedule
            stopMonitoring();
            startMonitoring();
        }
        if (email) {
            await Config.upsert({ key: 'email', value: JSON.stringify(email) });
            config.email = email;
            console.log('Debug - Updated email config');
        }
        // Voeg logica toe om thema op te slaan
        if (theme) {
            await Config.upsert({ key: 'theme', value: JSON.stringify(theme) });
            // We hoeven het thema waarschijnlijk niet in het in-memory 'config' object op te slaan,
            // tenzij de backend het thema ergens direct gebruikt.
            // De frontend zal het thema ophalen via GET /api/config.
            console.log('Debug - Updated theme config');
        }

        res.json({ success: true, message: 'Configuration updated successfully' });
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

// Trigger manual check
app.post('/api/check', async (req, res) => {
    try {
        console.log('\nDebug - Manual website check triggered');
        const results = await checkWebsite();
        console.log('Debug - Website check completed:', results);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Debug - Error during manual website check:', error);
        res.status(500).json({
            error: 'Error checking website',
            details: error.message
        });
    }
});

// Only start monitoring and server if this file is executed directly
if (require.main === module) {
    // Start the monitoring cron job
    startMonitoring();

    // Start HTTP server
    app.listen(port, () => {
        console.log(`Website monitor service running on port ${port}`);
    });
}