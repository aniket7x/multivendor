require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 5000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_dbms_multivendor_2026',
    JWT_EXPIRES_IN: '7d',
    PLATFORM_COMMISSION_PERCENT: parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || '10')
};
