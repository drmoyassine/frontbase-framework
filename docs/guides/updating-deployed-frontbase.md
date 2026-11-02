# Updating a deployed Frontbase installation

Framework source, application configuration and published content have separate lifecycles. A source update rebuilds the application; it does not require reinstalling Booking for X or replacing its documents.

## Cloudflare and Vercel Git installations

1. Identify the exact Git repository, production branch and root directory linked to the service. A repository created by a README deployment button is an independent copy: pushes to the Frontbase framework repository do not automatically propagate to it.
2. Review the chosen framework release/commit and its migration and binding requirements. Merge that reviewed source into the installation repository, preserving installation-specific deployment configuration. Resolve conflicts explicitly; do not overwrite its Wrangler bindings, Worker/project name, custom domains or bootstrap settings with example values.
3. Keep runtime secrets in the provider secret store. Do not copy setup links, database tokens or Connected Account credentials into Git. Preserve the same state database, encryption secrets and durable resources.
4. Push to the linked production branch. Its existing provider Git build performs the configured install/build/deploy commands. Verify the deployment reports the selected commit; a successful local push alone is not a successful deployment.
5. Check public English/Arabic pages, an existing signed-in administrator session, save/publish and retained connections. Verify setup remains closed on an installed app. Record source commit and provider deployment/version ID.

Use an isolated installation or preview before a production update. Source promotion and customer deployment promotion are separate actions. This document does not claim an automatic upstream synchronization or in-app updater exists.

## Docker / EasyPanel

Build a versioned image from the reviewed source (or select a published supported image version), update the service image and redeploy. Preserve mounted state/storage volumes and environment secrets. On EasyPanel Git-source services, select the reviewed source revision and rebuild through the existing service configuration. Verify the running image digest/source revision and the same application checks above.

## Migration and recovery

Existing startup migration mechanisms apply pending state migrations. Read the release-specific migration notes before updating; arbitrary downgrades are not guaranteed safe. Capture a restorable backup of real state before a migration-bearing production upgrade. Reverting application code does not reverse database migrations. Recover through the release's verified rollback/restore procedure while preserving encryption keys and resource identity.

Template installation is for a clean app. Re-running it is not the framework upgrade mechanism. Existing builder layouts and translations remain persisted application data, and changing an installed template's design is a separate reviewed content change.
