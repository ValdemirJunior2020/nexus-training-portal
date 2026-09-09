# Nexus Zendesk Copilot Chrome Extension

## Load it
1. Run `INSTALL_EXTENSION.bat`.
2. Open `chrome://extensions`.
3. Turn on Developer mode.
4. Click **Load unpacked** and select the `chrome-extension` folder.
5. Open **Extension options** and set the server URL (default `http://localhost:3000`).

The extension only runs on `https://hotelplanner.zendesk.com/*`. It reads the current Zendesk ticket through Zendesk's same-origin API, sanitizes the payload, and sends structured ticket data to the Nexus training/control server. Ticket contents are not saved in Chrome storage.

## Server-side data
Operational access data is saved on the server in `data/zendesk-control.json`: authorized users, centers, admin Matrix additions, settings, audit history, and training audit records. Existing Nexus learned memory remains in the Nexus Agent database.

## Roles
- `April.Grantham@HotelPlanner.com`: Super Admin. Full control, including maintenance/server availability controls.
- `karen.caldas@hotelplanner.com`: Admin. User, center, Matrix, and training administration. No Super Admin grant/server ownership control.
- Only April and Karen are authorized trainers.

## Queue and progress
Every extension request joins the shared server queue. The panel shows percentage, elapsed timer, queue position, waited time, estimated remaining time, and running elapsed time. The queue defaults to one Nexus inference at a time so concurrent agents do not overload the local model.

## Cloudflare
The control database records the tunnel name `NEXUS-ZENDESK-AGENT` and tunnel ID `0dc09a1c-c395-4a4c-b501-5ec4fd855202` for identification only. The Cloudflare service-install credential is intentionally not stored in source code, the extension, or the repository. Configure or rotate that credential only on the server.

## Admin Console
Open `/admin` on the Nexus training portal server. Admins can manage users, centers, Matrix additions, queue/system controls and audit history. For production remote access, put the Admin Console behind Cloudflare Access or another trusted identity layer; do not rely on a public tunnel alone.
