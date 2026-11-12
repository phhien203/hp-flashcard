/** A card is mastered after this many correct answers. */
export const MAX_PROGRESS = 5

/** A card's progress as a whole number from 0 to 5; a non-finite value counts as 0. */
export const clampProgress = (progress: number) =>
  Number.isFinite(progress)
    ? Math.min(Math.max(Math.round(progress), 0), MAX_PROGRESS)
    : 0
