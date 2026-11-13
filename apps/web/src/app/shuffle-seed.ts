/** A random 32-bit unsigned seed for the backend's seeded Shuffle. */
export const randomShuffleSeed = () =>
  crypto.getRandomValues(new Uint32Array(1))[0]!
