import type { YouthEntry, YouthSpan } from "./youth-types";

type TravelDetails = NonNullable<YouthEntry["school"] | YouthEntry["exam"]>;

/** null means the necessary route has not been tied to a non-overlapping service. */
function locatedTrainingTravel(
  trainingEntry: YouthEntry,
  entries: readonly YouthEntry[],
  details: TravelDetails | null,
): readonly YouthSpan[] | null {
  if (details === null) return [];
  const directions = [
    {
      minutes: details.travelFromWorkMinutes,
      interval: details.travelFromWorkInterval,
      before: true,
    },
    { minutes: details.travelToWorkMinutes, interval: details.travelToWorkInterval, before: false },
  ];
  const work = entries.filter((entry) => entry.school === null && entry.exam == null);
  const routes: YouthSpan[] = [];
  for (const direction of directions) {
    if (direction.minutes === null) return null;
    if (direction.minutes === 0) continue;
    if (!direction.interval) return null;
    const route = {
      start: Date.parse(direction.interval.start),
      end: Date.parse(direction.interval.end),
    };
    const matching = work.some((entry) =>
      direction.before
        ? entry.end <= route.start && route.end <= trainingEntry.start
        : trainingEntry.end <= route.start && route.end <= entry.start,
    );
    if (!matching) return null;
    if (
      entries.some(
        (entry) => entry !== trainingEntry && entry.start < route.end && entry.end > route.start,
      )
    )
      return null;
    routes.push(route);
  }
  return routes;
}

export function locatedSchoolTravel(
  schoolEntry: YouthEntry,
  entries: readonly YouthEntry[],
): readonly YouthSpan[] | null {
  return locatedTrainingTravel(schoolEntry, entries, schoolEntry.school);
}

export function locatedExamTravel(
  examEntry: YouthEntry,
  entries: readonly YouthEntry[],
): readonly YouthSpan[] | null {
  return locatedTrainingTravel(examEntry, entries, examEntry.exam ?? null);
}

/** A located route is activity, not a rest break. */
export function trainingActivityBounds(
  entry: YouthEntry,
  entries: readonly YouthEntry[],
): YouthSpan {
  const routes = entry.school
    ? locatedSchoolTravel(entry, entries)
    : locatedExamTravel(entry, entries);
  return routes === null || routes.length === 0
    ? { start: entry.start, end: entry.end }
    : {
        start: Math.min(entry.start, ...routes.map((route) => route.start)),
        end: Math.max(entry.end, ...routes.map((route) => route.end)),
      };
}
