// A small, always-available fallback for browsers without Intl.supportedValuesOf
// (Safari < 15.4, older WebViews) -- covers the timezones this CRM's team is
// most likely to actually pick.
const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
];

export function getTimezoneOptions(): string[] {
  try {
    const supported = Intl.supportedValuesOf?.('timeZone');
    if (supported && supported.length > 0) {
      return ['UTC', ...supported.filter((tz) => tz !== 'UTC')];
    }
  } catch {
    // Fall through to the static list below.
  }
  return FALLBACK_TIMEZONES;
}
