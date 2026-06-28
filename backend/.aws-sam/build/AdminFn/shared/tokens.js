// Magic-link token lifecycle: issue, validate, consume.
const { randomUUID } = require('crypto');
const { PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { doc, TABLES } = require('./db');

const TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS || 36);

// Create a one-time token for a member and store it with a DynamoDB TTL.
async function issueToken(memberId, dispatchId) {
  const token = randomUUID().replace(/-/g, '');
  const now = Date.now();
  const expiresAt = Math.floor((now + TTL_HOURS * 3600 * 1000) / 1000); // epoch seconds for TTL
  await doc.send(new PutCommand({
    TableName: TABLES.tokens,
    Item: {
      token,
      memberId,
      dispatchId: dispatchId || null,
      issuedAt: new Date(now).toISOString(),
      expiresAt,
      used: false,
    },
  }));
  return token;
}

// Returns the token record if valid (exists, unused, unexpired), else null.
async function validateToken(token) {
  if (!token) return null;
  const { Item } = await doc.send(new GetCommand({
    TableName: TABLES.tokens,
    Key: { token },
  }));
  if (!Item) return null;
  if (Item.used) return null;
  if (Item.expiresAt && Item.expiresAt * 1000 < Date.now()) return null;
  return Item;
}

// Mark a token consumed so the link can't be reused.
async function consumeToken(token) {
  await doc.send(new UpdateCommand({
    TableName: TABLES.tokens,
    Key: { token },
    UpdateExpression: 'SET used = :t, usedAt = :now',
    ExpressionAttributeValues: { ':t': true, ':now': new Date().toISOString() },
  }));
}

module.exports = { issueToken, validateToken, consumeToken };
