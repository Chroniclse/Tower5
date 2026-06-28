# Tower5 backend helpers.
#
# db/schema.sql is the canonical schema. The migration Lambda ships its own copy
# under src/migrate/ (SAM only packages files inside CodeUri=src/), so re-sync it
# before every build.

.PHONY: build deploy migrate sync-schema

sync-schema:
	cp db/schema.sql src/migrate/schema.sql

build: sync-schema
	sam build

deploy: build
	sam deploy

# Re-run the schema migration on demand (idempotent).
migrate:
	@FN=$$(aws cloudformation describe-stack-resources --stack-name nett \
	  --query "StackResources[?contains(LogicalResourceId,'MigrateFn')].PhysicalResourceId" \
	  --output text); \
	echo "Invoking $$FN..."; \
	aws lambda invoke --function-name "$$FN" /tmp/tower5-migrate.json >/dev/null && \
	cat /tmp/tower5-migrate.json; echo
