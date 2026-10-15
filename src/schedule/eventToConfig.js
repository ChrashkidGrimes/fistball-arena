// Build the schedule-generator config straight from the event's saved setup
// (categories chip-builder + teams matrix + format overrides + courts/slots).
// Used by both the Schedule wizard and the in-Settings "Generate & publish" step.

import { eventCategoryNames } from "../categories.js";
import { assignGroups } from "./format.js";

export function eventToConfig(event, startNr = 1) {
  const names = eventCategoryNames(event);
  const entries = event?.entries || [];
  const overrides = event?.formatOverrides || {};
  const variants = event?.formatVariants || {};
  const categories = names.map((name) => {
    const v = variants[name] || {};
    const bestOf = Number(v.bestOf) || 3;
    return {
      name, bestOf, bestOfKo: Number(v.bestOfKo) || bestOf, override: overrides[name] || null,
      double: !!v.double, knockout: v.knockout !== false, qualifiersPerGroup: 2,
      qualifiers: Number(v.qualifiers) || undefined, placements: v.placements !== false,
      groups: assignGroups(entries.filter((t) => (t.cats || []).includes(name)).map((t) => t.name), v.groups, v.groupOf),
    };
  });
  return { categories, slots: event?.slots || { courts: [], days: [], gameMinutes: 45, breakMinutes: 0 }, startNr };
}
