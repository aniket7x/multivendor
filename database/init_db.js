const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
    console.log('====================================================');
    console.log('  Multi-Vendor Management System - Database Initializer');
    console.log('====================================================\n');

    const host = process.env.DB_HOST || '127.0.0.1';
    const port = process.env.DB_PORT || 3306;
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'multivendor_db';

    console.log(`Connecting to MySQL server at ${host}:${port} as "${user}"...`);

    let connection;
    try {
        // Connect to server without specific database first
        connection = await mysql.createConnection({
            host,
            port,
            user,
            password,
            multipleStatements: true
        });

        console.log('✓ Successfully connected to MySQL server.');

        // Read schema and sample data files
        const schemaPath = path.join(__dirname, 'schema.sql');
        const sampleDataPath = path.join(__dirname, 'sample_data.sql');

        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at: ${schemaPath}`);
        }

        console.log('\n[1/2] Executing schema.sql (Tables, Constraints, Triggers, Views, Stored Procedures)...');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await connection.query(schemaSql);
        console.log('✓ Schema executed successfully. All tables, triggers, and views created!');

        if (fs.existsSync(sampleDataPath)) {
            console.log('\n[2/2] Executing sample_data.sql (Realistic demo users, vendors, products, orders)...');
            const sampleSql = fs.readFileSync(sampleDataPath, 'utf8');
            await connection.query(sampleSql);
            console.log('✓ Sample data imported successfully!');
        }

        // Run validation check
        await connection.changeUser({ database });
        const [users] = await connection.query('SELECT count(*) as count FROM users');
        const [vendors] = await connection.query('SELECT count(*) as count FROM vendors');
        const [products] = await connection.query('SELECT count(*) as count FROM products');
        const [orders] = await connection.query('SELECT count(*) as count FROM orders');

        console.log('\n---------------- Verification Summary ----------------');
        console.log(`• Users:     ${users[0].count}`);
        console.log(`• Vendors:   ${vendors[0].count}`);
        console.log(`• Products:  ${products[0].count}`);
        console.log(`• Orders:    ${orders[0].count}`);
        console.log('------------------------------------------------------');
        console.log('\nDatabase setup complete! You can now start the application with: npm start\n');

    } catch (err) {
        console.error('\n✖ Database initialization failed:', err.message);
        console.error('Please ensure MySQL service is running (e.g. XAMPP, MySQL Workbench, or Windows Service) and verify credentials in .env');
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

if (require.main === module) {
    initDatabase();
}

module.exports = { initDatabase };
