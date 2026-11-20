import { TileType, LAMBDA_PRIOR, PRIOR_SPAWNS, PARCEL_MEMORY_MS } from './config.js';
import { tileKey, manhattanDistance } from './utils.js';

const CLOCK_EVENT_MS = { '1s': 1000, '2s': 2000, '5s': 5000, '10s': 10000 };

/* Statistics of a parcel spawner, used by the exploration utility */
export class SpawnTile {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.lastSeen = 0;         // ms timestamp of the last time it was in view (0 = never)
    this.firstSeen = null;     // ms timestamp of the first time it was in view
    this.spawnCount = 0;       // distinct parcels seen appearing here
    this.meanReward = 0;       // mean reward of those parcels
    this.unreachableUntil = 0; // ms timestamp, skip the tile until then
  }

  /* Gamma-Poisson posterior mean of the spawn rate λ (parcels / s).
   * With no data it equals LAMBDA_PRIOR; it never drops to 0, so a cell where
   * nothing spawned yet is still revisited, just less often. */
  spawnRate(now) {
    const observedSeconds = this.firstSeen === null ? 0 : (now - this.firstSeen) / 1000;
    return (this.spawnCount + PRIOR_SPAWNS) / (observedSeconds + PRIOR_SPAWNS / LAMBDA_PRIOR);
  }

  /* Mean reward, shrunk towards the game average while there is little data */
  expectedReward(rewardPrior) {
    return (this.meanReward * this.spawnCount + rewardPrior) / (this.spawnCount + 1);
  }

  recordSpawn(reward) {
    this.spawnCount++;
    this.meanReward += (reward - this.meanReward) / this.spawnCount;
  }
}

/* Everything the agent knows about the world */
export class Beliefs {
  constructor() {
    this.me = {};                     // id, name, x, y, score
    this.tiles = new Map();           // key -> { x, y, type }
    this.spawnTiles = new Map();      // key -> SpawnTile
    this.deliveryTiles = new Map();   // key -> { x, y }
    this.parcels = new Map();         // id -> free parcel + seenAt
    this.agents = new Map();          // id -> agent currently in view
    this.carried = new Set();         // ids of the parcels we carry
    this.everSeenParcels = new Set(); // to count each spawn only once

    // game parameters, overwritten by updateConfig
    this.decayMs = Infinity;          // a parcel loses 1 reward every decayMs
    this.stepMs = 600;                // duration of one of our moves
    this.observationDistance = 5;
    this.rewardPrior = 10;
  }

  /* reward lost by each parcel for every step we take */
  get stepCost() {
    return this.stepMs / this.decayMs;
  }

  hasPosition() {
    return this.me.x !== undefined && this.me.y !== undefined;
  }

  updateConfig(config, stepPauseMs) {
    const game = config?.GAME ?? config;   // IOConfig wraps the game options in GAME
    const parcels = game?.parcels ?? {};
    const player = game?.player ?? {};

    const decayEvent = parcels.decaying_event;
    this.decayMs = decayEvent === 'frame'
      ? (Number(config?.CLOCK) || 50)
      : CLOCK_EVENT_MS[decayEvent] ?? Infinity;
    this.stepMs = (player.movement_duration ?? 500) + stepPauseMs;
    this.observationDistance = player.observation_distance ?? this.observationDistance;
    this.rewardPrior = parcels.reward_avg ?? this.rewardPrior;

    console.log('[INFO] config: decayMs', this.decayMs, 'stepCost', this.stepCost.toFixed(3),
      'observationDistance', this.observationDistance, 'rewardPrior', this.rewardPrior);
  }

  setTile({ x, y, type }) {
    type = String(type);
    const key = tileKey(x, y);
    this.tiles.set(key, { x, y, type });

    if (type === TileType.SPAWN) {
      if (!this.spawnTiles.has(key)) this.spawnTiles.set(key, new SpawnTile(x, y)); // keep stats
    } else {
      this.spawnTiles.delete(key);
    }

    if (type === TileType.DELIVERY) this.deliveryTiles.set(key, { x, y });
    else this.deliveryTiles.delete(key);
  }

  updateMe(you) {
    this.me = { ...this.me, ...you };
  }

  /* reward a parcel has now, given it decays since we last saw it */
  estimatedReward(parcel, now = Date.now()) {
    return parcel.reward - (now - parcel.seenAt) / this.decayMs;
  }

  /* Keys of the tiles in view. Uses sensing.positions when the server sends
   * it, otherwise everything strictly within the observation distance. */
  visibleTileKeys(sensing) {
    if (sensing.positions?.length) {
      return new Set(sensing.positions.map((p) => tileKey(p.x, p.y)));
    }
    const visible = new Set();
    if (!this.hasPosition()) return visible;
    for (const [key, tile] of this.tiles) {
      if (manhattanDistance(tile, this.me) < this.observationDistance) visible.add(key);
    }
    return visible;
  }

  updateSensing(sensing, now = Date.now()) {
    const visible = this.visibleTileKeys(sensing);
    const sensedIds = new Set(sensing.parcels.map((p) => p.id));

    // 1. spawn tiles in view: reset their idleness τ
    for (const key of visible) {
      const tile = this.spawnTiles.get(key);
      if (!tile) continue;
      tile.lastSeen = now;
      tile.firstSeen ??= now;
    }

    // 2. parcels in view
    for (const parcel of sensing.parcels) {
      const firstSighting = !this.everSeenParcels.has(parcel.id);
      this.everSeenParcels.add(parcel.id);

      if (parcel.carriedBy) {          // ours or someone else's: not collectable
        this.parcels.delete(parcel.id);
        // sensing is the source of truth for what we carry
        if (parcel.carriedBy === this.me.id) this.carried.add(parcel.id);
        continue;
      }
      this.parcels.set(parcel.id, { ...parcel, seenAt: now });

      if (firstSighting) {
        this.spawnTiles.get(tileKey(parcel.x, parcel.y))?.recordSpawn(parcel.reward);
      }
    }

    // 3. forget parcels that are gone or no longer worth believing in
    for (const [id, parcel] of this.parcels) {
      const shouldBeVisible = visible.has(tileKey(parcel.x, parcel.y));
      if ((shouldBeVisible && !sensedIds.has(id))
          || this.estimatedReward(parcel, now) <= 0
          || now - parcel.seenAt > PARCEL_MEMORY_MS) {
        this.parcels.delete(id);
      }
    }

    // 4. carried parcels travel with us, so a missing one has expired;
    //    one sensed as free or carried by someone else is not ours
    const sensedById = new Map(sensing.parcels.map((p) => [p.id, p]));
    for (const id of this.carried) {
      const sensed = sensedById.get(id);
      if (!sensed) {
        console.log('[WARN] carried parcel', id, 'expired');
        this.carried.delete(id);
      } else if (sensed.carriedBy !== this.me.id) {
        this.carried.delete(id);
      }
    }

    // 5. other agents: only the ones in view matter for path planning
    this.agents = new Map(
      sensing.agents.filter((a) => a.id !== this.me.id).map((a) => [a.id, a])
    );
  }
}
