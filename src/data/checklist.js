/**
 * Pure helpers for the field checklist (T2.4).
 *
 * A checklist group may carry `appliesTo: 'camera' | 'lidar'`; groups without
 * it are universal. Filtering happens inside the iteration loops WITHOUT
 * re-indexing the groups array — the persisted check state is keyed by
 * phase/group-index/item-index, so indices must stay stable whichever
 * payload is active.
 */
export function groupApplies(group, sensorType) {
  return !group.appliesTo || group.appliesTo === sensorType
}
