const test = require('node:test');
const assert = require('node:assert/strict');

const nodemailer = require('nodemailer');
const EmailService = require('../src/services/emailService');

test('sendOtpEmail uses an object-style CommonJS export and forwards to OTP delivery', async () => {
  const originalSendOTP = EmailService.sendOTP;
  let receivedArgs;
  EmailService.sendOTP = async (...args) => {
    receivedArgs = args;
    return { success: true };
  };

  try {
    const otpEmailModule = require('../src/services/otpEmail');
    assert.deepEqual(Object.keys(otpEmailModule), ['sendOtpEmail']);
    const { sendOtpEmail } = otpEmailModule;
    const result = await sendOtpEmail('user@example.edu', '123456', 'forgot_password');

    assert.deepEqual(receivedArgs, ['user@example.edu', '123456', 'forgot_password']);
    assert.deepEqual(result, { success: true });
  } finally {
    EmailService.sendOTP = originalSendOTP;
  }
});

test('all outgoing email types use EMAIL_FROM as the sender', async () => {
  const originalTransporter = EmailService.transporter;
  const originalEnv = Object.fromEntries(['EMAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_USER']
    .map(name => [name, process.env[name]]));
  const sentMessages = [];
  process.env.EMAIL_FROM = 'CertiCheck <mail@example.org>';
  process.env.SMTP_HOST = 'smtp.example.org';
  process.env.SMTP_USER = 'mail@example.org';
  delete process.env.EMAIL_USER;
  EmailService.transporter = {
    sendMail: async message => {
      sentMessages.push(message);
      return { messageId: `test-${sentMessages.length}` };
    }
  };

  try {
    await EmailService.sendOTP('user@gmail.com', '123456', 'signup');
    await EmailService.sendOTP('user@yahoo.com', '123456', 'forgot_password');
    await EmailService.sendWelcome('user@school.edu', 'Student');
    await EmailService.sendApplicationReceived('applicant@school.edu', 'Student', 'Example University');
    await EmailService.sendApplicationDecision('applicant@school.edu', 'Student', 'Example University', true);
    await EmailService.sendCertificateIssued({
      holderEmail: 'holder@gmail.com',
      holderName: 'Certificate Holder',
      certificateId: 'CERT-001',
      certificateType: 'Degree',
      issuerName: 'Example University',
      issuedAt: new Date().toISOString()
    });

    assert.equal(sentMessages.length, 6);
    assert.ok(sentMessages.every(message => message.from === process.env.EMAIL_FROM));
  } finally {
    EmailService.transporter = originalTransporter;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('sender defaults to the authenticated SMTP account without a hardcoded address', () => {
  const originalEnv = Object.fromEntries(['EMAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'EMAIL_USER']
    .map(name => [name, process.env[name]]));
  delete process.env.EMAIL_FROM;
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_USER = 'sender@gmail.com';
  delete process.env.EMAIL_USER;

  try {
    assert.equal(EmailService.getFromAddress(), 'sender@gmail.com');
  } finally {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('configured EMAIL_FROM must match the SMTP authentication account', () => {
  const originalEnv = Object.fromEntries(['EMAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'EMAIL_USER']
    .map(name => [name, process.env[name]]));
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_USER = 'sender@gmail.com';
  process.env.EMAIL_FROM = 'CertiCheck <different@gmail.com>';
  delete process.env.EMAIL_USER;

  try {
    assert.throws(() => EmailService.getFromAddress(), /EMAIL_FROM must match/);
  } finally {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('SMTP transport authenticates with SMTP_USER and SMTP_PASS', () => {
  const originalTransporter = EmailService.transporter;
  const originalCreateTransport = nodemailer.createTransport;
  const originalEnv = Object.fromEntries(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']
    .map(name => [name, process.env[name]]));
  let transportOptions;
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_USER = 'sender@gmail.com';
  process.env.SMTP_PASS = 'example-test-app-password';
  process.env.EMAIL_FROM = 'CertiCheck <sender@gmail.com>';
  EmailService.transporter = null;
  nodemailer.createTransport = options => {
    transportOptions = options;
    return { sendMail: async () => ({}) };
  };

  try {
    EmailService.initTransporter();
    assert.equal(transportOptions.auth.user, process.env.SMTP_USER);
    assert.equal(transportOptions.auth.pass, process.env.SMTP_PASS);
  } finally {
    EmailService.transporter = originalTransporter;
    nodemailer.createTransport = originalCreateTransport;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
