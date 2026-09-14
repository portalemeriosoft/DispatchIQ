# DispatchIQ — Cursor Build Prompt

## Project Name
**DispatchIQ** (Twilio-powered SMS CRM & Dispatch Platform)

---

## 1. Project Overview

Build a full-stack **CRM + SMS Dispatch platform** called **DispatchIQ**, powered by Twilio's Messaging API. This is a business tool that lets a team manage customer contacts, send/receive SMS (2-way live chat), run bulk SMS campaigns, track delivery logs/errors, view analytics, and configure Twilio credentials dynamically — all from a clean, custom-designed web dashboard.

I will share reference screenshots of a similar existing tool ("Tele-Dispatch") for layout/feature reference — **match the functionality and information architecture exactly**, but design the UI to look **polished, modern, and custom** — NOT like a generic AI-generated admin template. Avoid default flat dark-card layouts with no visual hierarchy; use intentional typography, spacing, subtle depth, and a cohesive color system.

Voice calling (Twilio Programmable Voice) will be added in a **later phase** — architect the database and codebase so a `calls` module can be added later without refactoring, but do NOT build it now. Concretely, this means: keep the `settings` table provider-agnostic (not hardcoded to "SMS only"), keep a `contacts`-centric relation pattern so a future `calls` table plugs in the same way `messages` does, and keep the Twilio service class structured so a `VoiceService` can sit next to the `MessagingService` later without touching existing SMS code. No Voice UI, routes, or TwiML logic should be built in this phase — just don't design anything that would block adding it.

---

## 2. Tech Stack

- **Backend:** Laravel (latest stable), PHP
- **Database:** MySQL
- **Frontend:** React (Vite) — separate SPA consuming a REST API from Laravel
- **Auth:** Laravel Sanctum (API token-based auth)
- **Queue:** Laravel Queue (`database` driver) + Laravel Scheduler (for cron-based bulk SMS throttling and delivery status polling)
- **SMS Provider:** Twilio (official `twilio/sdk` PHP package)
- **Hosting target:** Namecheap Stellar shared hosting (cPanel, SSH/Composer available, PHP + MySQL native, no Node.js runtime dependency) — keep deployment cPanel-friendly (no long-running Node processes, no persistent WebSocket server as a hard requirement)
- **Real-time updates:** Use short-interval polling (every 3-5s) for the Live Chat Inbox as the default/reliable approach on shared hosting. Structure the API so a WebSocket/Pusher-based real-time layer could be swapped in later without breaking the frontend contract.

---

## 3. Core Modules (must match reference screenshots' functionality)

### 3.1 Live Chat Inbox (2-Way)
- List of conversations (contact name, phone, last message preview, timestamp, lead status badge)
- Selected conversation thread view (inbound vs outbound messages visually distinct, timestamps, delivery ticks)
- Conversation header: assigned agent's name (from `contacts.assigned_to`) + live/connection status indicator
- Message composer with send button
- Quick Reply shortcuts (e.g. `/thanks`, `/price`, `/timing`, `/discount`, `/offer`) — admin-configurable canned responses; "+ Quick Reply" button in the composer to create a new quick reply on the fly
- Side panel: CRM Customer Profile (name, phone, email, lead status dropdown, CRM tags, internal notes textarea, "Save CRM Profile" button) — editable inline while chatting
- Incoming messages arrive via Twilio webhook and appear in the thread (via polling refresh)

### 3.2 CRM Contacts
- Table: Customer Name, Phone Number, Email, Lead Status (Lead/Customer/etc.), CRM Tags, "Open Live Chat" button, Edit/Delete actions
- Add New Contact modal/form
- Search by name/phone/email/tag
- Filter by lead status
- Pagination

### 3.3 SMS Dispatcher & Campaign Engine
Three modes (tabbed):
1. **Paste Multiple Numbers (Bulk)** — textarea for comma/line-separated numbers, campaign name (optional), queue throttle speed dropdown (e.g. Slow/Normal/Fast — delay per message), recipient count indicator, auto-format missing country prefix using a default region setting
2. **CSV File Upload (Bulk)** — upload CSV of numbers (+ optional name/merge fields), with a downloadable sample CSV template
3. **Single SMS Dispatch** — one number, one message

All modes: dispatch via a **queued job** (respecting throttle delay) so it doesn't block the request and respects Twilio rate limits.

### 3.4 Master Delivery Logs
- Table: Recipient Number, Message Preview, Carrier Status (Delivered/Sent-Pending/Invalid-Landline/Locked-Blacklisted), Error Code & Diagnostic, Timestamp, Blacklist Action (Lock/Unlock toggle), Delete Log
- Search by phone/message/message ID
- Filter by status
- "Clear All Logs" button (with confirmation) — bulk-deletes all delivery logs
- Populated both from bulk campaigns and single sends, and updated via Twilio status callback webhook

### 3.5 Analytics Dashboard
- Summary cards: Total Sent, Delivered (Normal), Spam Filtered, Failed/Invalid, Locked/Opted-Out
- Charts: Carrier Status Ratio (pie/donut), Daily Delivery Volume & Status Trend (line/bar over time)
- "Refresh Data" button
- All numbers computed from the `delivery_logs` table

### 3.6 Dynamic Settings
- SMS Provider selection (Twilio for now, architect as a dropdown for future providers)
- Account SID / API Key field (masked, toggle visibility)
- Auth Token / Secret Key field (masked, toggle visibility)
- Active Sender Phone Number (E.164 format)
- Default Country/Region Prefix (dropdown, used for auto-formatting numbers missing a country code)
- **On save: backend must call the Twilio API to automatically update the given phone number's SMS webhook URL (`SmsUrl`) to point to this app's fixed webhook endpoint, and verify the number's capabilities (SMS enabled) — surface a clear error if the number is not SMS-capable, before persisting.**
- Store Account SID / Auth Token **encrypted at rest** (Laravel's built-in encryption), never log them in plaintext

### 3.7 Team Accounts
- List of admin/agent users, roles, invite/add new user, remove user
- Login via Sanctum token auth

---

## 4. Additional Features To Include (low complexity, high value)

- **Auto opt-out handling**: detect "STOP"/"UNSUBSCRIBE" replies via webhook and automatically blacklist that number, sending the compliant opt-out confirmation reply
- **Scheduled campaigns**: optional "send at" datetime field on bulk campaigns
- **Agent assignment**: assign a conversation to a specific team member
- **Export logs to CSV** button on Master Logs
- **Unread message badge** on Live Chat Inbox conversation list
- **Webhook failure logging**: if a Twilio status callback fails to process, log it for retry/debugging

---

## 5. Database Schema (MySQL / Laravel migrations)

```
users
  id, name, email, password, role (admin|agent), timestamps

contacts
  id, name, phone_number (unique), email, lead_status (lead|customer), tags (json or comma string),
  internal_notes (text), assigned_to (FK -> users, nullable — for the Agent Assignment feature), timestamps

messages
  id, contact_id (FK -> contacts), sent_by (FK -> users, nullable — which agent sent this outbound message),
  direction (inbound|outbound), body (text), twilio_message_sid, status, created_at

campaigns
  id, name, created_by (FK -> users), total_recipients (int), throttle_delay_ms (int),
  status (pending|running|completed|failed), scheduled_at (nullable), timestamps

delivery_logs
  id, campaign_id (FK -> campaigns, nullable), recipient_number, message_body (text),
  twilio_sid, carrier_status, error_code (nullable), is_blacklisted (bool), created_at

blacklist
  id, phone_number (unique), reason, created_at

settings
  id, provider (string, default 'twilio'), twilio_account_sid (encrypted),
  twilio_auth_token (encrypted), sender_number, default_country_code, updated_at

quick_replies
  id, shortcut, body, timestamps

-- Phase 2 (create migration structure now, do not build UI/logic yet):
calls
  id, contact_id (FK -> contacts), direction, duration_seconds, status,
  recording_url (nullable), twilio_call_sid, created_at
```

---

## 6. API Structure (Laravel, prefix `/api`)

```
POST   /api/auth/login
GET    /api/contacts
POST   /api/contacts
PUT    /api/contacts/{id}
DELETE /api/contacts/{id}

GET    /api/contacts/{id}/messages
POST   /api/contacts/{id}/messages        (send SMS to this contact)

POST   /api/campaigns                     (bulk dispatch: paste/CSV/single)
GET    /api/campaigns
GET    /api/campaigns/{id}

GET    /api/logs
DELETE /api/logs                          (clear all delivery logs)
DELETE /api/logs/{id}
POST   /api/logs/{id}/blacklist
POST   /api/logs/{id}/unblacklist

GET    /api/analytics/summary
GET    /api/analytics/trend

GET    /api/settings
PUT    /api/settings                      (triggers Twilio webhook auto-config)

GET    /api/users                         (admin-only team list)
POST   /api/users                         (admin-only invite/add user)
DELETE /api/users/{id}                    (admin-only remove user)

GET    /api/quick-replies
POST   /api/quick-replies
DELETE /api/quick-replies/{id}

POST   /api/webhooks/twilio/sms           (incoming SMS + status callbacks — public, Twilio-signature verified)
```

### Global layout (all authenticated pages)
- Persistent top bar: current Carrier + active region from Dynamic Settings (e.g. `Carrier: TWILIO +61`)
- Quick-action buttons: `+ Live Chat` and `+ Bulk Campaign` — navigate to those modules from anywhere

---

## 7. Non-Functional Requirements

- Twilio Auth Token / Account SID stored encrypted, never exposed to frontend
- Validate all Twilio webhook requests using Twilio's request signature validation
- Rate-limit/queue bulk dispatch to respect Twilio throughput and the configured throttle delay
- Clean separation: Laravel = API only, React = SPA frontend calling that API
- Mobile-responsive layout
- Environment-based config (`.env`) for local vs production, but Twilio creds themselves live in the DB (`settings` table) per the Dynamic Settings requirement — `.env` is only for app-level config (DB connection, app key, etc.)

---

## 8. Design Direction

- Custom, modern SaaS dashboard aesthetic — not a generic dark-admin-template look
- Intentional type scale, real spacing rhythm, a distinct accent color (not default Tailwind blue-on-black with no contrast variation)
- Sidebar nav + top bar matching the reference screenshots' information architecture, but with better visual polish, subtle shadows/depth, clear active-state styling
- I will share reference screenshots of the layout/feature set for context — match structure, elevate visual design
