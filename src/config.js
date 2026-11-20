/* Tile types as sent by the server (strings, see IOTile in the SDK) */
export const TileType = {
  WALL: '0',
  SPAWN: '1',      // parcel spawner ("green" cell)
  DELIVERY: '2',   // delivery zone ("red" cell)
  WALKABLE: '3',
};

/* Exploration utility (formula 3, Poisson spawns):
 *   U(c) = (1 - e^{-λ_c τ_c}) · R̄_c · γ^{d(c)}
 */
export const GAMMA = 0.9;              // distance discount per step
export const LAMBDA_PRIOR = 0.1;       // prior spawn rate of a cell (parcels / s)
export const PRIOR_SPAWNS = 1;         // weight of the prior, in "virtual" spawns
export const UNREACHABLE_COOLDOWN_MS = 5000; // skip a spawn tile we failed to reach

/* Beliefs about parcels out of view */
export const PARCEL_MEMORY_MS = 10000; // forget unseen parcels after this time

/* Timing */
export const STEP_PAUSE_MS = 100;      // pause after every move
export const RETRY_PAUSE_MS = 200;     // pause after a failed move
export const IDLE_PAUSE_MS = 300;      // pause when there is nothing to do
export const MAX_MOVE_FAILS = 3;       // failures before giving up on a delivery tile
