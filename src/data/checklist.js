/**
 * Pure helpers for the field checklist (T2.4/R2.6).
 *
 * A checklist group may carry `appliesTo: 'camera' | 'lidar' | 'face' |
 * 'corridor'`; groups without it are universal. 'camera'/'lidar' follow the
 * active sensor type; 'face' and 'corridor' show only when a mission of that
 * mode is active (opts.face / opts.corridor). Filtering happens inside the iteration loops WITHOUT
 * re-indexing the groups array — the persisted check state is keyed by
 * phase/group-index/item-index, so indices must stay stable whichever
 * payload or mission mode is active.
 */
export function groupApplies(group, sensorType, opts = {}) {
  if (!group.appliesTo) return true
  if (group.appliesTo === 'face') return Boolean(opts.face)
  if (group.appliesTo === 'corridor') return Boolean(opts.corridor)
  return group.appliesTo === sensorType
}
