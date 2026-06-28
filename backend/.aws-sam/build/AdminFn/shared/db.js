// Shared DynamoDB document client + table-name constants.
// AWS SDK v3 ships with the nodejs20.x Lambda runtime, so nothing to install.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLES = {
  members: process.env.MEMBERS_TABLE,
  config: process.env.CONFIG_TABLE,
  tokens: process.env.TOKENS_TABLE,
  responses: process.env.RESPONSES_TABLE,
};

module.exports = { doc, TABLES };
