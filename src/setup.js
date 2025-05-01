const fs = require('fs');
const path = require('path');

// Create necessary directories
const directories = [
    path.join(__dirname, '..', 'data'),
    path.join(__dirname, '..', 'frontend', 'build')
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

console.log('Setup completed successfully.'); 