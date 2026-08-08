process.env.NODE_ENV ??= 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/assetdesk_test';
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-secret'.repeat(6);
