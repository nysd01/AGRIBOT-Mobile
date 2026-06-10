/**
 * AGRIBOT — Supabase Edge Function: alert-email
 * ──────────────────────────────────────────────
 * Sends a professional HTML alert email via Resend whenever the mobile app
 * detects a FLAME or SMOKE event from the ESP32 sensor.
 *
 * Deploy:
 *   supabase functions deploy alert-email --no-verify-jwt
 *
 * Required secret (set once):
 *   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
 *
 * Get a free Resend API key at: https://resend.com
 * Free tier: 3 000 emails/month, no credit card required.
 * The "from" address onboarding@resend.dev works immediately with no domain setup.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ── CORS headers (allow the Expo app to call this function) ───────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Email HTML builder ────────────────────────────────────────────────────────

function buildHtml(payload: {
  type:      'FLAME' | 'SMOKE';
  userEmail: string;
  temp:      number;
  humidity:  number;
  moisture:  number;
  smokeRaw:  number;
  timestamp: string;
  lat?:      number;
  lng?:      number;
}): string {
  const { type, temp, humidity, moisture, smokeRaw, timestamp, lat, lng } = payload;

  const isFlame   = type === 'FLAME';
  const alertColor = isFlame ? '#FF4444' : '#FF8C42';
  const alertBg    = isFlame ? '#2A0808' : '#2A1506';
  const alertEmoji = isFlame ? '🔥' : '⚠️';
  const alertLabel = isFlame ? 'FIRE DETECTED' : 'SMOKE / GAS DETECTED';

  const localTime  = new Date(timestamp).toLocaleString('en-GB', {
    dateStyle: 'long',
    timeStyle: 'medium',
    hour12:    false,
  });

  const gpsBlock = lat && lng
    ? `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1E2820;">
          <span style="color:#6C8070;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
            GPS Location
          </span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #1E2820;text-align:right;">
          <a href="https://maps.google.com/?q=${lat},${lng}"
             style="color:#72F88A;font-size:14px;font-weight:700;text-decoration:none;">
            ${lat.toFixed(5)}, ${lng.toFixed(5)} ↗
          </a>
        </td>
      </tr>`
    : '';

  const recommendations = isFlame
    ? [
        'STOP all robot operations immediately and move it to a safe zone',
        'DO NOT enter the field without visual confirmation of fire status',
        'Call emergency fire services if the fire has spread beyond the robot area',
        'If safe to do so, activate irrigation remotely to contain fire spread',
        'Evacuate all field personnel and secure the perimeter',
        'After fire is out: inspect soil for contamination before resuming crop work',
      ]
    : [
        'Visually inspect the field perimeter BEFORE sending the robot in',
        'If smoke is from a fire source — immediately escalate to fire protocol above',
        'If from pesticides or field burning: delay all operations until air clears',
        'Keep personnel out of the area until sensor reads clear (not detected)',
        'Log this event with the timestamp for insurance and compliance records',
        `Smoke sensor raw value ${smokeRaw} — re-check every 5 minutes for trend`,
      ];

  const situationText = isFlame
    ? `The AGRIBOT flame sensor has triggered, indicating the presence of an <strong style="color:${alertColor}">open flame or intense heat source</strong> in proximity to the robot at your field location. This is the highest-severity alert in the AGRIBOT system. The situation requires your immediate attention.`
    : `The AGRIBOT smoke and gas sensor has triggered at raw reading <strong style="color:${alertColor}">${smokeRaw}</strong>. ${smokeRaw > 2500 ? 'This is a <strong style="color:' + alertColor + '">dense smoke / high-concentration gas</strong> reading.' : smokeRaw > 1500 ? 'This is a moderate smoke or gas concentration reading.' : 'This is a light smoke or gas presence reading.'} Possible sources include field fire, crop burning, pesticide vapour, or decomposition gases. Field inspection is required.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>AGRIBOT Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#060A08;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#060A08;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- ── HEADER ─────────────────────────────────────────────────── -->
        <tr>
          <td style="padding:0 0 24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#72F88A;font-size:22px;font-weight:900;letter-spacing:1px;">
                    🌱 AGRIBOT
                  </span>
                  <span style="color:#3A4C3E;font-size:12px;font-weight:700;letter-spacing:2px;margin-left:10px;">
                    FIELD INTELLIGENCE SYSTEM
                  </span>
                </td>
                <td align="right">
                  <span style="color:#3A4C3E;font-size:11px;">AG-01-DELTA</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── ALERT HERO ──────────────────────────────────────────────── -->
        <tr>
          <td>
            <div style="background-color:${alertBg};border:2px solid ${alertColor}40;border-radius:16px;
                        padding:28px 28px 24px;margin-bottom:20px;">
              <div style="display:inline-block;background-color:${alertColor}22;border:1px solid ${alertColor}55;
                          border-radius:8px;padding:6px 14px;margin-bottom:16px;">
                <span style="color:${alertColor};font-size:10px;font-weight:900;letter-spacing:2.5px;">
                  CRITICAL ALERT · IMMEDIATE ACTION REQUIRED
                </span>
              </div>
              <div style="font-size:36px;font-weight:900;color:#EEF4F0;margin-bottom:6px;line-height:1.1;">
                ${alertEmoji} ${alertLabel}
              </div>
              <div style="color:#B8C9BC;font-size:14px;margin-bottom:16px;">
                Detected at <strong style="color:#EEF4F0;">${localTime}</strong>
              </div>
              <div style="background-color:#FFFFFF08;border-radius:10px;padding:14px 16px;">
                <p style="margin:0;color:#C8D9CC;font-size:14px;line-height:22px;">
                  ${situationText}
                </p>
              </div>
            </div>
          </td>
        </tr>

        <!-- ── SENSOR READINGS ─────────────────────────────────────────── -->
        <tr>
          <td>
            <div style="background-color:#0C1110;border:1px solid #1A2520;border-radius:16px;
                        padding:20px 24px;margin-bottom:20px;">
              <div style="color:#3A4C3E;font-size:9px;font-weight:900;letter-spacing:2.5px;
                          text-transform:uppercase;margin-bottom:16px;">
                Sensor Readings at Time of Alert
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;">
                    <span style="color:#6C8070;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
                      🌡 Temperature
                    </span>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;text-align:right;">
                    <span style="color:${temp > 35 ? '#FF6B6B' : '#EEF4F0'};font-size:16px;font-weight:900;">
                      ${temp.toFixed(1)}°C
                    </span>
                    ${temp > 35 ? '<span style="color:#FF6B6B;font-size:11px;margin-left:6px;">⚠ HIGH</span>' : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;">
                    <span style="color:#6C8070;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
                      💧 Humidity
                    </span>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;text-align:right;">
                    <span style="color:#EEF4F0;font-size:16px;font-weight:900;">${humidity.toFixed(0)}%</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;">
                    <span style="color:#6C8070;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
                      🌱 Soil Moisture
                    </span>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;text-align:right;">
                    <span style="color:${moisture < 25 ? '#FF6B6B' : '#EEF4F0'};font-size:16px;font-weight:900;">
                      ${moisture.toFixed(0)}%
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;">
                    <span style="color:#6C8070;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
                      ${isFlame ? '🔥 Flame Sensor' : '🌫 Smoke Raw Value'}
                    </span>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #1E2820;text-align:right;">
                    <span style="color:${alertColor};font-size:16px;font-weight:900;">
                      ${isFlame ? 'TRIGGERED' : smokeRaw}
                    </span>
                  </td>
                </tr>
                ${gpsBlock}
              </table>
            </div>
          </td>
        </tr>

        <!-- ── RECOMMENDATIONS ─────────────────────────────────────────── -->
        <tr>
          <td>
            <div style="background-color:#0C1110;border:1px solid #1A2520;border-left:4px solid ${alertColor};
                        border-radius:16px;padding:20px 24px;margin-bottom:20px;">
              <div style="color:${alertColor};font-size:9px;font-weight:900;letter-spacing:2.5px;
                          text-transform:uppercase;margin-bottom:16px;">
                ✅ Recommended Actions — In Order of Priority
              </div>
              ${recommendations.map((step, i) => `
              <div style="display:flex;align-items:flex-start;margin-bottom:12px;">
                <div style="min-width:24px;height:24px;background-color:${alertColor}22;border:1px solid ${alertColor}44;
                            border-radius:6px;display:flex;align-items:center;justify-content:center;
                            margin-right:12px;flex-shrink:0;">
                  <span style="color:${alertColor};font-size:11px;font-weight:900;">${i + 1}</span>
                </div>
                <p style="margin:0;color:#C8D9CC;font-size:13px;line-height:20px;padding-top:2px;">${step}</p>
              </div>`).join('')}
            </div>
          </td>
        </tr>

        <!-- ── FIELD STATUS SUMMARY ────────────────────────────────────── -->
        <tr>
          <td>
            <div style="background-color:#0A1410;border:1px solid #1A2520;border-radius:16px;
                        padding:16px 24px;margin-bottom:20px;">
              <div style="color:#3A4C3E;font-size:9px;font-weight:900;letter-spacing:2.5px;margin-bottom:12px;">
                FIELD STATUS ASSESSMENT
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:33%;text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:900;color:${isFlame ? '#FF4444' : '#FF8C42'};">
                      ${isFlame ? '🔥' : '⚠️'}
                    </div>
                    <div style="font-size:10px;font-weight:700;color:#3A4C3E;letter-spacing:1px;margin-top:4px;">
                      THREAT
                    </div>
                    <div style="font-size:13px;font-weight:900;color:${isFlame ? '#FF4444' : '#FF8C42'};">
                      ${isFlame ? 'CRITICAL' : 'HIGH'}
                    </div>
                  </td>
                  <td style="width:33%;text-align:center;padding:8px;border-left:1px solid #1E2820;border-right:1px solid #1E2820;">
                    <div style="font-size:24px;font-weight:900;color:${temp > 35 ? '#FF6B6B' : '#72F88A'};">
                      🌡
                    </div>
                    <div style="font-size:10px;font-weight:700;color:#3A4C3E;letter-spacing:1px;margin-top:4px;">
                      TEMPERATURE
                    </div>
                    <div style="font-size:13px;font-weight:900;color:${temp > 35 ? '#FF6B6B' : '#72F88A'};">
                      ${temp.toFixed(1)}°C
                    </div>
                  </td>
                  <td style="width:33%;text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:900;color:${moisture < 30 ? '#FF6B6B' : '#72F88A'};">
                      💧
                    </div>
                    <div style="font-size:10px;font-weight:700;color:#3A4C3E;letter-spacing:1px;margin-top:4px;">
                      SOIL
                    </div>
                    <div style="font-size:13px;font-weight:900;color:${moisture < 30 ? '#FF6B6B' : '#72F88A'};">
                      ${moisture.toFixed(0)}%
                    </div>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- ── FOOTER ──────────────────────────────────────────────────── -->
        <tr>
          <td style="padding-top:8px;">
            <div style="border-top:1px solid #1A2520;padding-top:20px;text-align:center;">
              <p style="margin:0 0 6px;color:#3A4C3E;font-size:11px;">
                This is an automated alert from <strong style="color:#72F88A;">AGRIBOT Field Intelligence System</strong>.
              </p>
              <p style="margin:0 0 6px;color:#2E3C32;font-size:11px;">
                Do not reply to this email. Open the AGRIBOT mobile app for live data and remote control.
              </p>
              <p style="margin:0;color:#2E3C32;font-size:10px;">
                Alert ID: ${Date.now()} · Robot: AG-01-DELTA · ${localTime}
              </p>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Edge Function handler ─────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY secret is not set.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const payload = await req.json();
    const { userEmail, type } = payload;

    if (!userEmail || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing userEmail or type in request body.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const isFlame   = type === 'FLAME';
    const subject   = isFlame
      ? '🔥 AGRIBOT FIRE ALERT — Immediate Action Required'
      : '⚠️ AGRIBOT SMOKE ALERT — Field Hazard Detected';

    const html = buildHtml(payload);

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'AGRIBOT Alerts <alerts@agribot.alert.oxbiy.com>',
        to:      [userEmail],
        subject,
        html,
      }),
    });

    const data = await resendRes.json();

    if (!resendRes.ok) {
      console.error('[alert-email] Resend error:', data);
      return new Response(
        JSON.stringify({ error: 'Resend delivery failed', detail: data }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[alert-email] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
