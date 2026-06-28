// EventBridge-triggered dispatch. Two rules fire this (see template.yaml):
//   { audience:'all',           reason:'eod'     } → 4:00 PM PT end-of-day reminder
//   { audience:'nonresponders', reason:'morning' } → 8:30 AM PT follow-up for non-responders
const { dispatch } = require('../shared/dispatch');

exports.handler = async (event) => {
  const audience = (event && event.audience) || 'all';
  const reason = (event && event.reason) || 'scheduled';
  const note = reason === 'morning'
    ? 'A quick reminder — we did not get your report yesterday. Please take a moment now.'
    : '';

  const summary = await dispatch({ audience, channel: 'both', note });
  console.log(`Scheduled dispatch (${reason}):`, JSON.stringify({ ...summary, results: undefined }));
  return summary;
};
