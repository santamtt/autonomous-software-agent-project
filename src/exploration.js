import { GAMMA } from './config.js';
import { manhattanDistance } from './utils.js';

/**
 * Formula 3 (Poisson spawns, persistent monitoring):
 *
 *   U(c) = (1 - e^{-λ_c · τ_c}) · R̄_c · γ^{d(c)}
 *
 *   λ_c  spawn rate of c (parcels / s)
 *   τ_c  seconds since c was last in view
 *   R̄_c  expected reward of a parcel spawned on c
 *   d(c) manhattan distance from the agent
 *
 * (1 - e^{-λτ}) is the probability that at least one parcel spawned on c
 * since we last looked at it: the longer a cell is unobserved, the more it
 * is worth revisiting.
 */
export function explorationUtility(tile, beliefs, now) {
  const tau = (now - tile.lastSeen) / 1000;   // lastSeen = 0 → never seen → τ huge
  const pSpawned = 1 - Math.exp(-tile.spawnRate(now) * tau);
  const reward = tile.expectedReward(beliefs.rewardPrior);
  const discount = Math.pow(GAMMA, manhattanDistance(beliefs.me, tile));
  return pSpawned * reward * discount;
}

/* Spawn tile with the highest utility (ties broken at random) */
export function chooseTileToExplore(beliefs, now = Date.now()) {
  let best, bestUtility = -Infinity;

  for (const tile of beliefs.spawnTiles.values()) {
    if (tile.unreachableUntil > now) continue;
    if (manhattanDistance(beliefs.me, tile) === 0) continue;   // already here

    const utility = explorationUtility(tile, beliefs, now);
    if (utility > bestUtility || (utility === bestUtility && Math.random() < 0.5)) {
      best = tile;
      bestUtility = utility;
    }
  }

  if (best) console.debug('[DEBUG] explore →', best.x, best.y, 'U =', bestUtility.toFixed(3));
  return best;
}
