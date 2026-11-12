/**
 * Waits for an element's running transitions and animations to finish, so
 * computed styles read the end state rather than a frame in between.
 */
export const settle = (element: Element) =>
  Promise.all(element.getAnimations().map(({ finished }) => finished))
