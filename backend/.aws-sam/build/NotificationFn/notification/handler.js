// Notification service — the messaging boundary. Invoked asynchronously by the
// Admin and Scheduler services with an already-resolved batch of messages
// (recipient + their personal magic link). It does one thing: send via SES
// (email) and SNS (SMS). No RDS, no token logic.
//
// Event payload (from dispatch.js):
//   {
//     channel: 'both' | 'email' | 'sms',
//     note:    'optional reminder line',
//     reason:  'admin' | 'eod' | 'morning',
//     messages: [ { email, phone, fname, lname, link } ]
//   }
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const ses = new SESClient({});
const sns = new SNSClient({});
const FROM_EMAIL = process.env.FROM_EMAIL;

function emailBody(m, note) {
  const hi = m.fname ? `Hi ${m.fname},` : 'Hi,';
  const extra = note ? `\n${note}\n` : '';
  return {
    text: `${hi}\n${extra}\nTime for your activity report. It takes 2–5 minutes.\n\nOpen your form: ${m.link}\n\nThis link is personal to you and expires soon.\n\n— Tower5`,
    html: `<p>${hi}</p>${note ? `<p>${note}</p>` : ''}<p>Time for your activity report. It takes 2–5 minutes.</p>
<p><a href="${m.link}" style="background:#c0392b;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:bold;letter-spacing:.06em">OPEN YOUR FORM</a></p>
<p style="color:#777;font-size:12px">This link is personal to you and expires soon.</p><p style="color:#777;font-size:12px">— Tower5</p>`,
  };
}

async function sendOne(m, channel, note) {
  const result = { to: m.email || m.phone, sent: [], errors: [] };

  if ((channel === 'both' || channel === 'email') && m.email) {
    try {
      const b = emailBody(m, note);
      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [m.email] },
        Message: {
          Subject: { Data: 'Tower5 — your activity report' },
          Body: { Text: { Data: b.text }, Html: { Data: b.html } },
        },
      }));
      result.sent.push('email');
    } catch (e) { result.errors.push(`email: ${e.message}`); }
  }

  if ((channel === 'both' || channel === 'sms') && m.phone) {
    try {
      await sns.send(new PublishCommand({
        PhoneNumber: m.phone,
        Message: `Tower5 activity report — takes 2–5 min: ${m.link}`,
      }));
      result.sent.push('sms');
    } catch (e) { result.errors.push(`sms: ${e.message}`); }
  }

  return result;
}

exports.handler = async (event = {}) => {
  const { messages = [], channel = 'both', note = '', reason = 'admin' } = event;
  const results = [];
  for (const m of messages) results.push(await sendOne(m, channel, note));

  const summary = {
    reason,
    total: messages.length,
    sent: results.filter((r) => r.sent.length > 0).length,
    failed: results.filter((r) => r.errors.length > 0).length,
  };
  console.log('Notification dispatch:', JSON.stringify(summary));
  if (summary.failed) {
    console.warn('Notification failures:', JSON.stringify(results.filter((r) => r.errors.length)));
  }
  return summary;
};
