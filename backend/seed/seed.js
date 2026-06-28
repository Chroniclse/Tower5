// Load the initial team into the Members table.
// Usage:  MEMBERS_TABLE=<name> AWS_REGION=<region> node seed.js
//
// Find the table name with:
//   aws cloudformation describe-stack-resources --stack-name nett \
//     --query "StackResources[?ResourceType=='AWS::DynamoDB::Table'].[LogicalResourceId,PhysicalResourceId]" --output table
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.MEMBERS_TABLE;
if (!TABLE) { console.error('Set MEMBERS_TABLE env var.'); process.exit(1); }

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const members = JSON.parse(fs.readFileSync(path.join(__dirname, 'members.json'), 'utf8'));

(async () => {
  for (const m of members) {
    const item = { memberId: randomUUID(), createdAt: new Date().toISOString(), ...m };
    await doc.send(new PutCommand({ TableName: TABLE, Item: item }));
    console.log(`+ ${item.fname} ${item.lname} (${item.role})`);
  }
  console.log(`\nSeeded ${members.length} members into ${TABLE}.`);
})().catch((e) => { console.error(e); process.exit(1); });
