# NETT — Backend (AWS SAM)

Magic-link activity-report forms for Tower5. Employees get a personal link by
email/SMS, fill out the form ([../nett-form.html](../nett-form.html)), and their
report lands in DynamoDB. You manage the team, dropdown options, dispatches, and
CSV export from the admin panel ([../nett-admin.html](../nett-admin.html)).

## Architecture

```
Admin panel ──POST /admin/dispatch──►  AdminFn ──┐
EventBridge (4PM / 8:30AM PT) ──────►  Scheduled ─┼─► issue magic token (TokensTable, TTL)
                                                   └─► send via SES (email) + SNS (SMS)
                                                          │
Employee opens nett-form.html?t=TOKEN ─GET /form─► PublicFn ─► reads MembersTable + ConfigTable
Employee submits ───────────────────POST /submit─► PublicFn ─► writes ResponsesTable, burns token

Admin ─GET /admin/export─► AdminFn ─► flatten ResponsesTable → one CSV row per activity
```

**Tables:** `Members`, `Config` (single item: dropdowns + role overrides + examples),
`Tokens` (TTL auto-expiry), `Responses` (PK=memberId, SK=submittedAt).

## Prerequisites (one-time, on your machine)

This environment has Node but **not** the AWS CLIs. Install them first:

```bash
# macOS (Homebrew)
brew install awscli aws-sam-cli

# Configure your AWS credentials + default region
aws configure          # enter Access Key, Secret, region e.g. us-west-2, output json
aws sts get-caller-identity   # should print your account — confirms creds work
```

## Verify SES + SNS before deploying

- **Email (SES):** new accounts are in the SES *sandbox* — you can only send to
  **verified** addresses, and your `FromEmail` must be verified too.
  ```bash
  aws ses verify-email-identity --email-address nett@tower5.com
  # verify a couple of test recipients the same way while in sandbox
  ```
  Request production access in the SES console to email anyone.
- **SMS (SNS):** sandbox SNS only sends to verified phone numbers; new US numbers
  may also need a registered origination number. Verify a test number in the SNS console.
  Email-only works fine if you want to skip SMS initially.

## Deploy

```bash
cd backend
sam build
sam deploy --guided          # first time — answer the prompts:
#   Stack Name:        nett
#   Region:            us-west-2   (use a Pacific-friendly region)
#   FromEmail:         nett@tower5.com   (verified above)
#   AppBaseUrl:        (leave EMPTY — the stack's CloudFront URL is used automatically)
#   TokenTtlHours:     36
#   Confirm changes / allow IAM role creation:  Y
```

⏱️ First deploy takes ~10–15 min because it provisions a CloudFront distribution.
Save the answers (it offers to write `samconfig.toml`); later deploys are just `sam deploy`.

After deploy, note the **Outputs**:
- `ApiBaseUrl`     → the API base (used in the next step)
- `SiteUrl`        → the CloudFront URL where the form lives (= the magic-link base)
- `SiteBucketName` → the S3 bucket to upload the HTML into
- `ApiKeyId`       → fetch the actual admin key value:
  ```bash
  aws apigateway get-api-key --api-key <ApiKeyId> --include-value --query value --output text
  ```

## Publish the form (S3 + CloudFront)

The form needs its `API_BASE` set before upload so the hosted copy is live:

```bash
API=<ApiBaseUrl>
BUCKET=<SiteBucketName>

# inject the API base into a build copy, then upload both pages
sed "s#const API_BASE = '';#const API_BASE = '$API';#" ../nett-form.html > /tmp/nett-form.html
aws s3 cp /tmp/nett-form.html  "s3://$BUCKET/nett-form.html"  --content-type text/html
aws s3 cp ../nett-admin.html   "s3://$BUCKET/nett-admin.html" --content-type text/html
```

Now open `SiteUrl` → the form loads. For the admin panel, open `SiteUrl/nett-admin.html`,
click **Connection**, and paste `ApiBaseUrl` + the API key. (Admin needs the key to do
anything, so hosting it behind CloudFront without extra auth is fine for the MVP.)

## Seed the team

```bash
# get the Members table's physical name
aws cloudformation describe-stack-resources --stack-name nett \
  --query "StackResources[?contains(LogicalResourceId,'MembersTable')].PhysicalResourceId" --output text

cd seed && npm install
MEMBERS_TABLE=<that-name> AWS_REGION=us-west-2 node seed.js
```

Or just add members from the admin panel once it's wired up. Edit
[seed/members.json](seed/members.json) to change the starting roster.

## Smoke test the API

```bash
API=<ApiBaseUrl>
KEY=<admin key value>

# 1. Send forms to everyone (also creates the magic links)
curl -s -X POST "$API/admin/dispatch" -H "x-api-key: $KEY" \
  -H 'Content-Type: application/json' -d '{"audience":"all","channel":"email"}'

# 2. List the team
curl -s "$API/admin/members" -H "x-api-key: $KEY"

# 3. Export everything as CSV
curl -s "$API/admin/export" -H "x-api-key: $KEY" -o nett-responses.csv

# (employee side: open the link from the email, or hit GET $API/form?t=TOKEN)
```

## The twice-a-day schedule

Defined in [template.yaml](template.yaml) as two EventBridge rules:

| Rule | Cron (UTC) | Pacific (PDT) | Audience |
|------|-----------|---------------|----------|
| End-of-day reminder | `cron(0 23 * * ? *)`  | 4:00 PM | everyone |
| Morning follow-up   | `cron(30 15 * * ? *)` | 8:30 AM | non-responders only |

⚠️ **DST:** EventBridge cron is UTC and does **not** observe daylight saving. The
times above are correct for PDT (summer). In PST (winter) they land an hour
earlier (3 PM / 7:30 AM) — bump both crons by 1 hour when the clocks change, or
switch to a Lambda that checks the Pacific hour itself.

## Local development

```bash
sam local start-api          # serves the API on http://127.0.0.1:3000
# point nett-form.html API_BASE at it, or curl the routes directly
```

## Cost

All pay-per-request / serverless. At this team size (≈12 people, 2 dispatches/day)
this runs in the AWS free tier or a few cents/month. SES is ~$0.10 per 1,000
emails; SNS SMS is a few cents per US message.

## Migrating to the MVP tool later

Everything is in DynamoDB with a stable shape (`Responses`: memberId, submittedAt,
role, activities[]). Export to CSV/JSON anytime via `/admin/export`, or stream the
tables straight into the MVP store — no re-keying, no data loss, and employees keep
using the exact same form, so there's nothing to relearn.
```
