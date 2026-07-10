// Scheduler service. Fires on a fixed cadence (EventBridge rate, e.g. every
// 15 min) and sends each survey on its own schedule:
//   • send_time   → dispatch the survey link to everyone on the project
//   • resend_time → dispatch to non-responders only
// Times are interpreted in SCHEDULE_TZ (default America/Los_Angeles).
const { rows } = require('../shared/sql');
const { dispatch, dispatchReflection } = require('../shared/dispatch');

const TZ = process.env.SCHEDULE_TZ || 'America/Los_Angeles';
const INTERVAL = Number(process.env.SCHEDULE_INTERVAL_MIN || 15);

// Bi-weekly "review your log & reflect" reminder: fires on REFLECTION_DAY at
// REFLECTION_TIME, on even ISO weeks (≈ every 2 weeks).
const REFLECTION_ENABLED = (process.env.REFLECTION_ENABLED || 'true') !== 'false';
const REFLECTION_DAY = (process.env.REFLECTION_DAY || 'mon').toLowerCase().slice(0, 3);
const REFLECTION_TIME = process.env.REFLECTION_TIME || '09:00';

// ISO-8601 week number (used only for even/odd parity, so UTC is fine).
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((date - firstThursday) / 604800000);
}

// Current weekday ('mon'..'sun') + minutes-since-midnight in the target TZ.
function nowInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => (parts.find((x) => x.type === t) || {}).value;
  const weekday = String(get('weekday') || '').toLowerCase().slice(0, 3);
  let hh = parseInt(get('hour'), 10); if (hh === 24) hh = 0;
  const mm = parseInt(get('minute'), 10);
  return { weekday, minutes: hh * 60 + mm };
}
const toMin = (t) => { if (!t) return null; const [h, m] = String(t).split(':'); return (+h) * 60 + (+m); };

exports.handler = async () => {
  const { weekday, minutes } = nowInTz(TZ);
  const lo = minutes - INTERVAL; // due if scheduled time is in (lo, minutes]

  const surveys = await rows(
    `select id, tenant_id, project_uuid, title, send_days, send_time, resend_time
       from surveys
      where project_uuid is not null and send_days is not null and send_days <> ''`);

  const done = new Set();   // avoid double-dispatching a project+audience in one tick
  const results = [];
  for (const s of surveys) {
    const days = (s.send_days || '').split(',').map((x) => x.trim());
    if (!days.includes(weekday)) continue;

    const st = toMin(s.send_time);
    const rt = toMin(s.resend_time);
    let audience = null; let note = '';
    if (st != null && st > lo && st <= minutes) { audience = 'all'; }
    else if (rt != null && rt > lo && rt <= minutes) { audience = 'nonresponders'; note = 'A quick reminder — we haven’t received your log yet.'; }
    if (!audience) continue;

    const key = `${s.id}:${audience}`; // per-survey (surveys can target different audiences on one project)
    if (done.has(key)) continue;
    done.add(key);

    try {
      const r = await dispatch({
        tenantId: s.tenant_id, projectId: s.project_uuid, surveyId: s.id,
        audience, channel: 'both', note, reason: audience === 'all' ? 'scheduled' : 'resend',
      });
      results.push({ survey: s.title, audience, recipients: r.recipients, queued: r.queued });
    } catch (e) {
      console.error(`Scheduled dispatch failed for survey ${s.id}:`, e.message);
    }
  }

  const reflections = await maybeReflectionReminders({ weekday, minutes, lo });

  console.log(`Scheduler tick ${weekday} ${minutes}min (${TZ}):`, JSON.stringify(results));
  return { weekday, minutes, tz: TZ, dispatched: results.length, results, reflectionReminders: reflections };
};

// Send the bi-weekly reflection reminder if this tick lands on the configured
// day/time and it's an "on" (even-ISO-week) fortnight. The time-window check
// (same as surveys) ensures it fires in exactly one 15-min tick per day.
async function maybeReflectionReminders({ weekday, minutes, lo }) {
  if (!REFLECTION_ENABLED || weekday !== REFLECTION_DAY) return 0;
  const rt = toMin(REFLECTION_TIME);
  if (!(rt != null && rt > lo && rt <= minutes)) return 0;
  if (isoWeek(new Date()) % 2 !== 0) return 0; // every other week
  const tenants = await rows('select distinct tenant_id from project_user_mapping');
  let queued = 0;
  for (const t of tenants) {
    try { queued += (await dispatchReflection({ tenantId: t.tenant_id })).queued; }
    catch (e) { console.error('Reflection reminder failed for tenant', t.tenant_id, e.message); }
  }
  console.log(`Reflection reminders queued: ${queued} across ${tenants.length} tenant(s)`);
  return queued;
}
