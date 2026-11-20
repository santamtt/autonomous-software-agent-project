/* Map key of a tile; positions can be fractional while an agent is moving */
export const tileKey = (x, y) => `${Math.round(x)}_${Math.round(y)}`;

export const manhattanDistance = (a, b) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Element of `targets` closest to `from` (undefined if the list is empty) */
export function closest(from, targets) {
  let best, bestDistance = Infinity;
  for (const target of targets) {
    const d = manhattanDistance(from, target);
    if (d < bestDistance) { best = target; bestDistance = d; }
  }
  return best;
}
