module.exports = {
    ...require('./jest.config.json'),
    testPathIgnorePatterns: [],
    testMatch: ['**/tests/integration/**/*.test.ts'],
};