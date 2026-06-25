const jwt = require('jsonwebtoken');
require('dotenv').config();
const s = process.env.JWT_SECRET;
const t = jwt.sign({sub: 'test-user-123', email: 'test@test.com'}, s, {expiresIn: '1h'});
console.log(t);
