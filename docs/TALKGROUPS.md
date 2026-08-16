# Talkgroup Manager

YWD-Hotspot includes a lightweight BrandMeister Talkgroup Manager on the `dev` channel beginning with `0.1.0-alpha8-dev`.

The manager is designed around one safety rule: **browsing and planning do not change BrandMeister.** Static talkgroup changes happen only after the operator reviews a change plan, presses **APPLY PLAN**, and confirms it.

## BrandMeister behavior

BrandMeister distinguishes between static and dynamic talkgroups:

- **Static** talkgroups remain subscribed on the hotspot until they are removed.
- **Dynamic** talkgroups are created by RF activity and can be cleared with **DROP ALL DYNAMIC**.

YWD-Hotspot uses the BrandMeister API v2 key already configured with:

```bash
sudo ywd-hotspotctl bm-api-key
```

The API key stays on the Pi and is never returned to browser JavaScript.

For this simplex hotspot, BrandMeister API talkgroup operations use slot `0`.

## Talkgroup Manager page

The WebUI has a dedicated **TALKGROUPS** tab with:

- current static subscriptions
- current dynamic subscriptions
- BrandMeister directory search by talkgroup ID or name
- favorites
- saved static sets
- a desired static-talkgroup change plan
- a preview of additions/removals before apply
- explicit confirmation before BrandMeister is changed
- Drop All Dynamic

The older direct static-TG controls remain available on the Control page while the Talkgroup Manager is being tested.

## Directory search and Pi Zero performance

The manager searches the public BrandMeister v2 talkgroup directory through the local YWD-Hotspot dashboard. The browser does not talk directly to BrandMeister.

To stay lightweight on the original Pi Zero W:

- the full directory is downloaded only on demand
- the normalized directory is cached at `/var/lib/ywd-hotspot/talkgroup-directory.json`
- the normal cache lifetime is 24 hours
- searches use the local cached copy
- a manual **REFRESH DIRECTORY** is available while control mode is unlocked
- if BrandMeister is temporarily unavailable, a stale local directory can still be used for search

The directory cache contains public talkgroup IDs/names only; it contains no API key or hotspot password.

## Static change plan

Opening the Talkgroup Manager initializes the desired plan from the hotspot's current BrandMeister static subscriptions.

Adding/removing a talkgroup in the manager changes only the local browser plan. A plan might look like:

```text
ADD    3106, 31073
REMOVE 91
```

Nothing is sent to BrandMeister until **APPLY PLAN** is pressed and the confirmation dialog is accepted.

When applying a plan, YWD-Hotspot sends additions first. Existing static subscriptions are therefore not removed merely because BrandMeister rejected a new addition. Removals are attempted only after additions succeed.

If an API operation fails partway through, the manager stops the batch and refreshes live BrandMeister state rather than pretending the whole plan succeeded.

## Favorites

Search results can be starred as favorites for quick access.

Favorites are stored in browser `localStorage`. They are convenience metadata only and do not change BrandMeister.

Because they are browser-local, favorites saved on one phone/browser will not automatically appear on another device. A future build may optionally move favorites into appliance-side storage.

## Saved static sets

A desired plan can be saved with a name such as:

```text
Local
Travel
Nets
Experiment
```

Saved sets are also browser-local. Loading a saved set replaces the current **plan only**. It does not immediately alter BrandMeister; **APPLY PLAN** and confirmation are still required.

## Existing CLI controls

Direct BrandMeister controls remain available:

```bash
sudo ywd-hotspotctl bm profile
sudo ywd-hotspotctl bm addtg 3100
sudo ywd-hotspotctl bm deltg 3100
sudo ywd-hotspotctl bm dropqso
sudo ywd-hotspotctl bm dropdyn
```

## Security

Talkgroup directory search is read-only and does not require the BrandMeister API key.

Changing static subscriptions or clearing dynamic routes still requires:

1. a configured BrandMeister API key
2. an unlocked YWD-Hotspot WebUI control session
3. the existing authenticated dashboard API

The Talkgroup Manager never exposes the BrandMeister API key to the browser.
