// Core dispatch logic shared by the admin endpoint and the scheduled trigger.
// Picks the audience, issues a magic link per member, and sends email/SMS.
const { randomUUID } = require('crypto');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { doc, TABLES } = require('./db');
const { issueToken } = require('./tokens');

const ses = new SESClient({});
const sns = new SNSClient({});

const FROM_EMAIL = process.env.FROM_EMAIL;
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');

async function listMembers() {
  const { Items = [] } = await doc.send(new ScanCommand({ TableName: TABLES.members }));
  return Items;
}

// memberIds that already submitted today (UTC day). Used for the morning follow-up.
async function respondedTodayIds() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { Items = [] } = await doc.send(new ScanCommand({
    TableName: TABLES.responses,
    FilterExpression: 'begins_with(submittedAt, :d)',
    ExpressionAttributeValues: { ':d': today },
    ProjectionExpression: 'memberId',
  }));
  return new Set(Items.map((i) => i.memberId));
}

// audience: 'all' | 'nonresponders' | a role string (e.g. 'Director')
async function pickAudience(audience) {
  const members = (await listMembers()).filter((m) => m.status !== 'paused');
  if (audience === 'all' || !audience) return members;
  if (audience === 'nonresponders') {
    const done = await respondedTodayIds();
    return members.filter((m) => !done.has(m.memberId));
  }
  return members.filter((m) => m.role === audience);
}

function emailBody(member, link, note) {
  const hi = member.fname ? `Hi ${member.fname},` : 'Hi,';
  const extra = note ? `\n${note}\n` : '';
  return {
    text: `${hi}\n${extra}\nTime for your NETT activity report. It takes 2–5 minutes.\n\nOpen your form: ${link}\n\nThis link is personal to you and expires soon.\n\n— Tower5 / NETT`,
    html: `<p>${hi}</p>${note ? `<p>${note}</p>` : ''}<p>Time for your NETT activity report. It takes 2–5 minutes.</p>
<p><a href="${link}" style="background:#c0392b;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:bold;letter-spacing:.06em">OPEN YOUR FORM</a></p>
<p style="color:#777;font-size:12px">This link is personal to you and expires soon.</p><p style="color:#777;font-size:12px">— Tower5 / NETT</p>`,
  };
}

async function sendToMember(member, channel, note, dispatchId) {
  const token = await issueToken(member.memberId, dispatchId);
  const link = `${APP_BASE_URL}/nett-form.html?t=${token}`;
  const result = { memberId: member.memberId, name: `${member.fname} ${member.lname}`, sent: [], errors: [] };

  if ((channel === 'both' || channel === 'email') && member.email) {
    try {
      const b = emailBody(member, link, note);
      await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [member.email] },
        Message: {
          Subject: { Data: 'NETT — your daily activity report' },
          Body: { Text: { Data: b.text }, Html: { Data: b.html } },
        },
      }));
      result.sent.push('email');
    } catch (e) { result.errors.push(`email: ${e.message}`); }
  }

  if ((channel === 'both' || channel === 'sms') && member.phone) {
    try {
      await sns.send(new PublishCommand({
        PhoneNumber: member.phone,
        Message: `NETT activity report — takes 2–5 min: ${link}`,
      }));
      result.sent.push('sms');
    } catch (e) { result.errors.push(`sms: ${e.message}`); }
  }

  return result;
}

// Main entry: send forms to an audience over a channel.
async function dispatch({ audience = 'all', channel = 'both', note = '' } = {}) {
  const dispatchId = randomUUID();
  const recipients = await pickAudience(audience);
  const results = [];
  for (const m of recipients) {
    results.push(await sendToMember(m, channel, note, dispatchId));
  }
  const sentCount = results.filter((r) => r.sent.length > 0).length;
  return {
    dispatchId,
    audience,
    channel,
    recipients: recipients.length,
    sent: sentCount,
    failed: results.filter((r) => r.errors.length > 0).length,
    at: new Date().toISOString(),
    results,
  };
}

module.exports = { dispatch };
