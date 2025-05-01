const { Sequelize } = require('sequelize');
const path = require('path');

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', 'data', 'sitemonitor.db'),
    logging: false
});

// Define the Listing model
const Listing = sequelize.define('Listing', {
    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    price: {
        type: Sequelize.STRING,
        allowNull: false
    },
    imageUrl: {
        type: Sequelize.STRING,
        allowNull: true
    },
    url: {
        type: Sequelize.STRING,
        allowNull: false
    },
    selector: {
        type: Sequelize.STRING,
        allowNull: false
    },
    timestamp: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
    },
    description: {
        type: Sequelize.TEXT,
        allowNull: true
    },
    seller: {
        type: Sequelize.STRING,
        allowNull: true
    },
    location: {
        type: Sequelize.STRING,
        allowNull: true
    },
    date: {
        type: Sequelize.STRING,
        allowNull: true
    },
    condition: {
        type: Sequelize.STRING,
        allowNull: true
    },
    category: {
        type: Sequelize.STRING,
        allowNull: true
    },
    attributes: {
        type: Sequelize.TEXT,
        allowNull: true
    }
});

// Define the Config model
const Config = sequelize.define('Config', {
    key: {
        type: Sequelize.STRING,
        primaryKey: true
    },
    value: {
        type: Sequelize.TEXT,
        allowNull: false
    }
});

// Initialize the database
async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully.');

        // Sync all models
        await sequelize.sync();
        console.log('Database models synchronized.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

module.exports = {
    sequelize,
    Listing,
    Config,
    initializeDatabase
}; 