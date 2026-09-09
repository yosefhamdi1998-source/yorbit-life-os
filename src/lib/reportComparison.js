import { addDays, differenceInCalendarDays, endOfDay } from 'date-fns';

export function previousComparisonCutoff(start, end, previous, today = new Date()) {
  if (end <= today) return previous.end;
  const elapsedDays = differenceInCalendarDays(today, start);
  const candidate = endOfDay(addDays(previous.start, elapsedDays));
  return candidate > previous.end ? previous.end : candidate;
}
