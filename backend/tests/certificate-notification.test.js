const test = require('node:test');
const assert = require('node:assert/strict');
const EmailService = require('../src/services/emailService');

const originalTransporter = EmailService.transporter;
const originalConfigurationStatus = EmailService.getConfigurationStatus;

test.after(() => {
  EmailService.transporter = originalTransporter;
  EmailService.getConfigurationStatus = originalConfigurationStatus;
});

test('certificate issuance email includes details, status terms, and generic attachment', async () => {
  let message;
  EmailService.transporter = {
    async sendMail(options) {
      message = options;
      return { response: '250 accepted' };
    }
  };
  EmailService.getConfigurationStatus = () => ({ mode: 'smtp' });

  const notification = await EmailService.sendCertificateIssued({
    holderEmail: 'holder@example.com',
    holderName: 'Avery Holder',
    certificateId: 'CERT-2026-123',
    certificateType: 'Degree Certificate',
    issuerName: 'Example University',
    issuerWallet: 'wallet-123',
    issuedAt: '2026-09-27T12:00:00.000Z',
    ipfsCid: 'bafy-example',
    blockchainTransactionId: 'transaction-123',
    metadata: {
      course: 'Computer Science',
      grade: 'Distinction',
      attachment: {
        name: 'degree.pdf',
        type: 'application/pdf',
        size: 9,
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ='
      }
    }
  });

  assert.equal(notification.sent, true);
  assert.equal(message.to, 'holder@example.com');
  assert.match(message.subject, /Degree Certificate/);
  assert.match(message.html, /CERT-2026-123/);
  assert.match(message.html, /Computer Science/);
  assert.match(message.html, /issuer may revoke/i);
  assert.equal(message.attachments[0].filename, 'degree.pdf');
  assert.equal(message.attachments[0].contentType, 'application/pdf');
  assert.equal(message.attachments[0].content.toString(), '%PDF-1.4');
  assert.match(message.html, /Your mini-certificate is attached as an SVG/i);
  assert.equal(message.attachments[1].filename, 'certicheck-mini-certificate-CERT-2026-123.svg');
  assert.equal(message.attachments[1].contentType, 'image/svg+xml');
  assert.match(message.attachments[1].content.toString(), /Avery Holder/);
  assert.match(message.attachments[1].content.toString(), /CERT-2026-123/);
});

test('mini-certificate email attachment safely escapes certificate details', async () => {
  let message;
  EmailService.transporter = {
    async sendMail(options) {
      message = options;
      return { response: '250 accepted' };
    }
  };
  EmailService.getConfigurationStatus = () => ({ mode: 'smtp' });

  await EmailService.sendCertificateIssued({
    holderEmail: 'holder@example.com',
    holderName: '<script>alert(1)</script>',
    certificateId: 'CERT-ESCAPE-001',
    certificateType: 'Degree & Diploma',
    issuerName: 'Example <University>'
  });

  const svg = message.attachments[0].content.toString();
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /Degree &amp; Diploma/);
  assert.match(message.html, /Example &lt;University&gt;/);
});

test('certificate issuance email rejects invalid holder email', async () => {
  let sendCount = 0;
  EmailService.transporter = { async sendMail() { sendCount += 1; } };
  EmailService.getConfigurationStatus = () => ({ mode: 'smtp' });

  const result = await EmailService.sendCertificateIssued({ holderEmail: 'not-an-email' });

  assert.equal(result.success, false);
  assert.equal(sendCount, 0);
});
