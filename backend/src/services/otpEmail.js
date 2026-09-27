const EmailService = require('./emailService');

async function sendOtpEmail(email, otp, otpType = 'signup') {
  return EmailService.sendOTP(email, otp, otpType);
}

module.exports = { sendOtpEmail };
