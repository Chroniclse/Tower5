// Scheduler service. Fires on a fixed cadence (EventBridge rate, e.g. every
// 15 min) and sends each survey on its own schedule:
//   • send_time   → dispatch the survey link to everyone on the project
//   • resend_time → dispatch to non-responders only
// Times are interpreted in SCHEDULE_TZ (default America/Los_Angeles).
const { rows } = require('../shared/sql');
const { dispatch } = require('../shared/dispatch');

const TZ = process.env.SCHEDULE_TZ || 'America/Los_Angeles';
const INTERVAL = Number(process.env.SCHEDULE_INTERVAL_MIN || 15);

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

    const key = `${s.project_uuid}:${audience}`;
    if (done.has(key)) continue;
    done.add(key);

    try {
      const r = await dispatch({
        tenantId: s.tenant_id, projectId: s.project_uuid,
        audience, channel: 'both', note, reason: audience === 'all' ? 'scheduled' : 'resend',
      });
      results.push({ survey: s.title, audience, recipients: r.recipients, queued: r.queued });
    } catch (e) {
      console.error(`Scheduled dispatch failed for survey ${s.id}:`, e.message);
    }
  }

  console.log(`Scheduler tick ${weekday} ${minutes}min (${TZ}):`, JSON.stringify(results));
  return { weekday, minutes, tz: TZ, dispatched: results.length, results };
};
