# StudyLoop
## Product Requirements Document
**Version:** 2.0
**Date:** February 28, 2026
**Status:** Draft
**Tech Stack:** HTML, CSS, JavaScript, Tailwind CSS (CDN), Supabase
**Tagline:** *Just you and your study buddy. Nothing else.*

---

## 1. Product Overview

StudyLoop is a minimalist web-based study accountability app built for exactly two people. You and a study buddy each sign up with your own account, and the app becomes your shared study space — individual timers, full mutual stats visibility, live presence, and a chat window, all in one place.

There are no rooms to create, no discovery feeds, no social graphs. The entire experience is focused on one relationship: you and the person studying alongside you.

### 1.1 Problem Statement

Existing study accountability apps either go too broad (public leaderboards, global rooms, strangers) or require too much setup. StudyLoop is for people who already have one specific person they want to study with, and just need a clean shared space to do it.

### 1.2 Target Users

- Two friends, classmates, or partners who want to study together remotely
- A student and a tutor or accountability partner
- Any two people who want to motivate each other through shared visibility

### 1.3 Goals

- Give each user a personal study timer with subject tagging
- Make each user's full stats (hours, subjects, streaks) visible to their partner
- Show live study presence so both people can see each other studying in real time
- Support persistent real-time chat between the two users
- Keep the app dead simple — no rooms, no discovery, no social complexity

---

## 2. Scope

### 2.1 In Scope

- User authentication (sign up, log in, log out)
- Personal study timer with subject tagging
- Study session logging
- Personal statistics dashboard (daily, weekly, monthly, all time)
- Daily study goal and progress tracking
- Study streaks (consecutive days with at least one session)
- Shared view — each user can see their partner's full stats, live timer, and study history
- Live presence panel showing both users' current study status in real time
- Persistent real-time chat between the two users stored in Supabase

### 2.2 Out of Scope

- Rooms, room discovery, or room management
- Friends system or invite codes
- More than two users interacting at once (app is designed for pairs)
- Push notifications
- Mobile native apps
- Paid features or monetization
- Video or audio sessions
- AI-powered features

---

## 3. Feature Requirements

### 3.1 Feature Summary

| Feature | Description | Priority |
|---|---|---|
| User Auth | Sign up, log in, log out via Supabase Auth | Must Have |
| Study Timer | Start, pause, stop with subject tagging | Must Have |
| Session Logging | Every session saved to database | Must Have |
| Personal Stats | Daily / weekly / monthly / all-time breakdown | Must Have |
| Partner Stats | Full visibility into partner's stats and history | Must Have |
| Daily Goal | Set a daily target and track progress | Must Have |
| Study Streaks | Track and display consecutive study days | Must Have |
| Live Presence | See both users' live timers and current subject in real time | Must Have |
| Persistent Chat | Real-time chat stored in Supabase, history preserved | Must Have |
| Chat Reactions | Emoji reactions on messages | Should Have |
| Subject Breakdown | Hours per subject shown as chart | Should Have |
| Calendar Heatmap | Visual daily activity over past 3 months | Could Have |

---

### 3.2 Authentication

StudyLoop uses Supabase Auth. No custom auth logic is needed on the frontend.

- Email and password sign up with email verification
- Log in and log out
- Session persistence via the Supabase client
- Each user sets a username and display name at sign up
- Password reset via email link

---

### 3.3 Study Timer

The timer is the core feature. Each user runs their own independent timer.

- Displays elapsed time in HH:MM:SS format
- User selects or types a subject before starting (e.g. Math, Biology, English)
- Previously used subjects are saved as a quick-select list per user
- Pause and resume supported within the same session
- Stopping the timer saves the session with total duration
- Active session is written to the database immediately on start and updated via a heartbeat every 30 seconds — if the user closes the tab, the session is saved up to the last heartbeat
- Only one active timer per user at a time

---

### 3.4 Session Logging & Personal Statistics

Every completed session is stored and used to power the stats dashboard.

- Stats views: today, this week, this month, all time
- Hours studied broken down by subject (bar or pie chart)
- Calendar heatmap showing daily activity over the past 3 months
- Total sessions count and average session length
- Full session history list (subject, duration, date/time)

---

### 3.5 Partner Stats Visibility

Both users can see each other's full stats. There are no private stats — the entire stats view is mirrored for both users.

- A tab or toggle on the stats page switches between "My Stats" and "[Partner's Name]'s Stats"
- Partner's view shows the exact same data as one's own: daily/weekly/monthly hours, subject breakdown, heatmap, session history, current streak, longest streak, and daily goal progress
- Stats are read-only for the viewing partner — no editing another user's data
- If the partner has not yet studied today their stats show zero progress for the day

---

### 3.6 Daily Study Goal

- Each user sets their own daily goal independently (in hours)
- A progress bar on the dashboard shows today's hours vs. their goal
- The partner's goal progress is also visible on the shared view
- Goal resets daily at midnight local time
- Goal can be updated at any time from settings

---

### 3.7 Study Streaks

- Streak increments by 1 for each consecutive calendar day where the user logs at least one session
- Missing a day resets the streak to 0
- Current streak and longest streak displayed on both the personal and partner stats view
- Streak logic calculated server-side via a Supabase database trigger or Edge Function to avoid client clock drift

---

### 3.8 Live Presence Panel

The live presence panel is the real-time heartbeat of the app. It shows both users' current study status at a glance and is visible on the main dashboard at all times.

- Two cards side by side — one for the logged-in user, one for their partner
- Each card shows: display name, current subject (if studying), live elapsed timer updating every second, and a status badge (Studying / Idle)
- If a user is idle their card shows the subject and duration of their last session
- Live updates delivered via Supabase Realtime Presence — no page refresh needed
- Both users see the same presence panel simultaneously

---

### 3.9 Persistent Real-Time Chat

A single chat channel shared between both users. Messages are stored in Supabase so history is always available.

- Messages include sender display name, content, and timestamp
- New messages appear in real time via Supabase Realtime
- Full chat history loaded on app open — 50 most recent messages, scroll up to load more
- Text messages only in v1 (no file or image uploads)
- Emoji reactions can be added to any message
- Chat auto-scrolls to the latest message
- Sender's own messages are visually distinguished (right-aligned, different colour)

---

## 4. Database Schema

All tables use Row Level Security (RLS). The schema runs as a single SQL migration in the Supabase SQL editor.

---

### 4.1 Tables

#### users (extends auth.users)
App profile, auto-created on sign up via trigger.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, FK → auth.users | Supabase auth user ID |
| username | text | unique, not null | Chosen at sign up |
| display_name | text | not null | Name shown in the UI |
| avatar_url | text | | Optional profile picture URL |
| daily_goal_hours | float | not null, default 0 | User's daily study goal in hours |
| current_streak | integer | not null, default 0 | Consecutive study day streak |
| longest_streak | integer | not null, default 0 | All-time longest streak |
| created_at | timestamptz | not null, default now() | Account creation timestamp |

#### sessions
One row per study session. Heartbeat written every 30s to support tab-close recovery.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default uuid_generate_v4() | Unique session ID |
| user_id | uuid | FK → users.id, not null | Session owner |
| subject | text | not null | Subject label |
| started_at | timestamptz | not null, default now() | Timer start time |
| ended_at | timestamptz | | Timer stop time (null while active) |
| duration_seconds | integer | not null, default 0 | Total study time in seconds |
| is_active | boolean | not null, default true | True while timer is running |
| last_heartbeat_at | timestamptz | not null, default now() | Updated every 30s for crash recovery |

**Indexes:**
- `(user_id, started_at DESC)` — fast per-user stats queries
- `(is_active) WHERE is_active = true` — partial index for finding active sessions

#### subjects
Saved subject labels per user, populated automatically when a session starts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default uuid_generate_v4() | Unique subject ID |
| user_id | uuid | FK → users.id, not null | Subject owner |
| name | text | not null | Subject label (e.g. Math, Biology) |
| created_at | timestamptz | not null, default now() | First used timestamp |

**Constraint:** unique `(user_id, name)`

#### messages
Single shared chat channel. No room_id needed — there is only one channel in the app.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default uuid_generate_v4() | Unique message ID |
| sender_id | uuid | FK → users.id, not null | Message author |
| content | text | not null, length 1–2000 chars | Message body |
| created_at | timestamptz | not null, default now() | Send timestamp |

**Index:** `(created_at DESC)` — for paginated chat history

#### message_reactions
Emoji reactions on messages. One reaction per emoji per user per message.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default uuid_generate_v4() | Unique reaction ID |
| message_id | uuid | FK → messages.id, not null | Reacted message |
| user_id | uuid | FK → users.id, not null | Reactor |
| emoji | text | not null | Emoji character (e.g. 🔥, 👍) |
| created_at | timestamptz | not null, default now() | Reaction timestamp |

**Constraint:** unique `(message_id, user_id, emoji)`
**Index:** `(message_id)` — for fetching reactions per message

---

### 4.2 Triggers

#### on_auth_user_created
Fires after insert on `auth.users`. Auto-creates a `public.users` profile row using `username` and `display_name` passed in signup metadata. Falls back to `user_<id_prefix>` if metadata is missing.

#### on_session_completed
Fires after update on `sessions` when `is_active` flips from `true` to `false`. Walks backwards day by day from today counting consecutive days with at least one completed session, then updates `current_streak` and `longest_streak` on the user row.

#### on_session_insert_save_subject
Fires after insert on `sessions`. Upserts the session's subject into the `subjects` table so the user's quick-select list stays current automatically — no extra frontend call needed.

---

### 4.3 Row Level Security

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| users | Any authenticated user | Via trigger only | Own row only | Own row only |
| sessions | Any authenticated user (partner stats) | Own rows only | Own rows only | Own rows only |
| subjects | Own rows only | Own rows only | — | Own rows only |
| messages | Any authenticated user | Own rows only (sender_id = auth.uid()) | — | Own rows only |
| message_reactions | Any authenticated user | Own rows only (user_id = auth.uid()) | — | Own rows only |

---

### 4.4 Realtime Publication

The following tables are added to `supabase_realtime` publication so the frontend can subscribe to live changes:

- `messages` — drives real-time chat delivery
- `message_reactions` — drives live reaction updates
- `sessions` — drives live presence panel updates

Presence state (live timer ticks) is handled separately via Supabase Realtime Presence on a client-side channel (`studyloop:presence`) and does not require a table subscription.

---

### 4.5 Helper Views

#### active_sessions
Returns all currently running timers joined with the user's display name and avatar. Includes a computed `elapsed_seconds` column derived from `now() - started_at`. Used directly by the live presence panel on the dashboard.

#### daily_stats
Aggregates `duration_seconds` and session count per `user_id` per calendar day from completed sessions. Used for the calendar heatmap, streak calculation, and daily goal progress bar.

---

## 5. Technical Architecture

### 5.1 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Styling | Tailwind CSS via CDN — no build step |
| Backend / Database | Supabase (PostgreSQL, Auth, Realtime) |
| Realtime | Supabase Realtime Presence (live timers) + DB subscriptions (chat) |
| Auth | Supabase Auth — email and password |
| Hosting | Any static host (Vercel, Netlify, GitHub Pages) |

### 5.2 Supabase Realtime Usage

- **Live presence** — a single Supabase Presence channel (`studyloop:presence`) broadcasts each user's active timer state (subject, elapsed seconds, is_studying) to both clients in real time
- **Chat** — Supabase Realtime subscribes to INSERT events on the `messages` table, delivering new messages to both users instantly
- **Heartbeat** — the active session row is updated every 30 seconds so the session survives a tab close

### 5.3 RLS Policy Summary

- **users** — any authenticated user can read any other user's profile (needed for partner stats); users can only update their own row
- **sessions** — any authenticated user can read any session (needed for partner stats); users can only insert and update their own sessions
- **subjects** — users can only read and write their own subjects
- **messages** — any authenticated user can read and insert messages
- **message_reactions** — any authenticated user can read reactions; users can only insert or delete their own reactions

---

## 6. Non-Functional Requirements

### 6.1 Performance

- Initial page load under 3 seconds on standard broadband
- Timer accuracy within 1 second of real elapsed time on both clients
- Presence updates (live timer ticks) delivered within 500ms
- New chat messages visible to both users within 500ms

### 6.2 Security

- All Supabase access uses the anon key; RLS enforces all data boundaries
- No sensitive data stored in the browser beyond the Supabase session token
- Users cannot modify another user's sessions, subjects, or profile

### 6.3 Usability

- Fully functional on modern desktop and mobile browsers (Chrome, Firefox, Safari, Edge)
- Responsive layout from 375px screen width upward
- Active timer state recovers on page reload from the database

### 6.4 Reliability

- Session preserved via last heartbeat if the user loses connection mid-session
- Supabase Realtime reconnects automatically on temporary disconnection
- Streak calculation runs server-side to avoid client clock drift

---

## 7. Key User Stories

**Authentication**
- As a new user, I can sign up with my email and choose a username so I have an identity in the app.
- As a returning user, I can log in to access my timer, stats, and chat.

**Timer & Sessions**
- As a user, I can start a study timer tagged with a subject so my session is logged accurately.
- As a user, I can pause and resume my timer so interruptions are handled cleanly.
- As a user, I can stop my timer and have the session automatically saved.

**Stats & Goals**
- As a user, I can view my study hours broken down by day, week, month, and all time.
- As a user, I can switch to my partner's stats view and see their full history, subject breakdown, streaks, and goal progress.
- As a user, I can set a daily study goal and track my progress toward it on the dashboard.
- As a user, I can see my current and longest study streaks.

**Live Presence**
- As a user, I can see at a glance whether my partner is currently studying, what subject they are on, and how long they have been at it — without opening any separate view.
- As a user, my partner can see the same live information about me in real time.

**Chat**
- As a user, I can send messages in the shared chat and my partner sees them instantly.
- As a user, I can read the full chat history when I open the app.
- As a user, I can react to any message with an emoji.

---

## 8. Suggested Development Milestones

### Phase 1 — Foundation
- Project setup: HTML shell, Tailwind via CDN, Supabase client initialised
- Supabase schema created with all tables and RLS policies
- Auth flow: sign up (with username and display name), log in, log out
- User profile row auto-created on sign up via database trigger

### Phase 2 — Core Timer
- Study timer UI: start, pause, stop
- Subject tagging with quick-select from saved subjects
- Session saved to Supabase on stop
- Heartbeat writing to active session every 30 seconds
- Active session recovered on page reload

### Phase 3 — Stats, Goals & Streaks
- Personal stats dashboard with all time range views
- Subject breakdown chart
- Calendar heatmap
- Daily goal progress bar
- Streak calculation via database trigger

### Phase 4 — Partner Stats View
- "My Stats / Partner's Stats" toggle on the stats page
- Partner stats read from Supabase using the same query as personal stats
- Partner's goal progress and streaks visible

### Phase 5 — Live Presence
- Supabase Realtime Presence channel set up
- Two-card presence panel on the dashboard
- Live timer ticking in real time for both users

### Phase 6 — Chat
- Persistent chat UI with message history
- Supabase Realtime subscription for new messages
- Paginated history (load more on scroll)
- Emoji reactions

### Phase 7 — Polish
- Mobile responsiveness review
- Loading states and skeleton screens
- Error handling and empty states throughout
- Avatar upload via Supabase Storage (optional)

---

*StudyLoop PRD v2.0 — February 2026 — For internal use only*
