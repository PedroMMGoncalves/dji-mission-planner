/**
 * Pure helpers for the field checklist (T2.4/R2.6).
 *
 * A checklist group may carry `appliesTo: 'camera' | 'lidar' | 'face'`;
 * groups without it are universal. 'camera'/'lidar' follow the active
 * sensor type; 'face' shows only when a face-mode mission is active
 * (opts.face). Filtering happens inside the iteration loops WITHOUT
 * re-indexing the groups array — the persisted check state is keyed by
 * phase/group-index/item-index, so indices must stay stable whichever
 * payload or mission mode is active.
 */
export function groupApplies(group, sensorType, opts = {}) {
  if (!group.appliesTo) return true
  if (group.appliesTo === 'face') return Boolean(opts.face)
  return group.appliesTo === sensorType
}
