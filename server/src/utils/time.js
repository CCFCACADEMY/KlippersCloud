import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export { dayjs };

/** Build a zoned dayjs from a 'YYYY-MM-DD' date and 'HH:mm[:ss]' time in the given IANA zone. */
export const zoned = (date, time, tz) => dayjs.tz(`${date} ${time.slice(0, 5)}`, 'YYYY-MM-DD HH:mm', tz);
