const OTP = require('./src/models/OTP');
(async () => {
  const email = 'api_test_user@example.com';
  const normalized = OTP.normalizeEmail ? OTP.normalizeEmail(email) : email;
  console.log('normalized', normalized);
  const isVerified = await OTP.isVerified(email, 'signup');
  console.log('isVerified', isVerified);
  const verifyAgain = await OTP.verify(email, '434534', 'signup');
  console.log('verifyAgain', verifyAgain);
})();
