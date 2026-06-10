# AGRIBOT Alert Email — Setup Guide

## What this does
When the ESP32 detects **FLAME** or **SMOKE**, the app sends:
1. An instant **OS push notification** (even when you're on the home screen)
2. A professional **HTML email** to your login email address

---

## Step 1 — Get a free Resend API key

1. Go to **https://resend.com** and create a free account (no credit card)
2. In the Resend dashboard → **API Keys** → **Create API Key**
3. Name it `AGRIBOT` and copy the key (starts with `re_`)
4. Free tier: **3 000 emails / month** — more than enough

---

## Step 2 — Install Supabase CLI (if not already)

```bash
npm install -g supabase
```

Then log in:
```bash
supabase login
```

---

## Step 3 — Link your project

In the AGRIBOT-Mobile folder:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Your project ref is the part after `https://supabase.com/dashboard/project/` in your Supabase URL.

---

## Step 4 — Set the Resend API key as a secret

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
```

Replace `re_xxxx...` with your actual Resend API key.

---

## Step 5 — Deploy the edge function

```bash
supabase functions deploy alert-email --no-verify-jwt
```

`--no-verify-jwt` lets the mobile app call this function using the anon key
without requiring a Supabase user session (the app verifies its own auth).

---

## Step 6 — Test it

Trigger the smoke sensor on your ESP32 (or temporarily set `flame.detected = true`
in the firmware) while the app is running. You should receive:

- A push notification on your phone within 2 seconds
- An email at your AGRIBOT login address within 10–15 seconds

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No email received | Check Supabase → Edge Functions → Logs for errors |
| `RESEND_API_KEY not set` error | Re-run Step 4 with the correct key |
| Email goes to spam | Add `onboarding@resend.dev` to your contacts |
| No push notification | Open the app once so it can request notification permission |
| Push works, email doesn't | Ensure the app is in **Online mode** (Network tab) so `cloudConfig` is set |

---

## How the anti-spam works

- **Rising-edge only**: alert fires when sensor goes `false → true`, not while it stays on
- **5-minute cooldown**: even if sensor keeps triggering, email+push won't repeat for 5 minutes
- **Both alerts independent**: flame and smoke each have their own cooldown timer
