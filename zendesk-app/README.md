# Nexus Zendesk Copilot — Private ZAF App

This directory replaces the Chrome-extension integration with a native Zendesk Support private app using the Zendesk Apps Framework (ZAF).

## Architecture

Zendesk Agent Workspace → ZAF ticket sidebar → Nexus server → shared queue → existing Nexus agent → Ticket Matrix / knowledge / learned memory → llama.cpp → recommendation.

The app uses Zendesk's supported ticket-sidebar APIs instead of scraping Zendesk HTML. It reads the current agent identity, ticket fields, requester/assignee context, tags, comments and ticket-change events through ZAF.

## Security

Production uses Zendesk server-side signed URLs (`signedUrls: true`) and verifies the RS256 ZAF JWT before issuing a short-lived HttpOnly session cookie. The server then checks the authenticated Zendesk user against the Nexus authorization database.

Only `@hotelplanner.com` identities are accepted. The server returns a clear authorization message for other domains. Never trust a browser-supplied email by itself.

Initial roles:

- April.Grantham@HotelPlanner.com — Super Admin
- karen.caldas@hotelplanner.com — Admin + approved trainer
- valdemir.goncalves@hotelplanner.com — Admin

Training permission remains restricted to April and Karen by the existing Nexus control layer.

## Local development

Install ZCLI using Node.js 20.17+:

`npm install @zendesk/zcli -g`

Authenticate:

`zcli login -s hotelplanner`

For a local ZCLI preview, temporarily set `NEXUS_ZENDESK_DEV_MODE=true` in the local `.env` (do not commit `.env`). Start the Nexus portal, then run from this directory:

`zcli apps:server .`

Open a Zendesk ticket and append `?zcli_apps=true` to the ticket URL, then open the Apps tray.

For production/private installation, set the real Nexus HTTPS URL in `manifest.json`, package with:

`zcli apps:package .`

or install/update from the authenticated Zendesk instance with ZCLI.

## Production signed app

After the private app is installed, obtain the app public key and installation ID from Zendesk. Store the public key and audience in the server's `.env`:

`ZENDESK_APP_PUBLIC_KEY=`

`ZENDESK_APP_AUDIENCE=https://hotelplanner.zendesk.com/api/v2/apps/installations/<INSTALLATION_ID>.json`

Keep `NEXUS_ZENDESK_DEV_MODE=false` in production.

The app's remote URL should be the secure Nexus URL exposed by the `NEXUS-ZENDESK-AGENT` Cloudflare tunnel. Do not commit the Cloudflare credential.

## Data flow

The ZAF app sanitizes ticket content before analysis. IP addresses, phone numbers and email addresses are redacted in the payload. Ticket content is not stored in browser local storage. Training/audit/authorization data remain server-side.

## Queue

All Zendesk analyses use the existing Nexus shared queue. Agents see queue position, elapsed wait, estimated wait, running time, progress and current analysis stage. The queue prevents simultaneous browser clients from overwhelming the local AI engine.

## Important

The old `chrome-extension/` folder is retained during migration so the current implementation is not destroyed before the ZAF app is validated in the HotelPlanner Zendesk instance. Once the private ZAF app is confirmed in production, the legacy extension can be retired in a separate cleanup change.
