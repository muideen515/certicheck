const test = require('node:test');
const assert = require('node:assert/strict');

const EmailService = require('../src/services/emailService');

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
