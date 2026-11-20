import { DjsConnect } from '@unitn-asa/deliveroo-js-sdk/client';
import { Beliefs } from './beliefs.js';
import { findPath } from './pathfinding.js';
import { chooseTileToExplore } from './exploration.js';
import { closest, manhattanDistance, sleep } from './utils.js';
import {
  STEP_PAUSE_MS, RETRY_PAUSE_MS, IDLE_PAUSE_MS,
  MAX_MOVE_FAILS, UNREACHABLE_COOLDOWN_MS,
} from './config.js';

export class Agent {
  constructor() {
    this.socket = DjsConnect();
    this.beliefs = new Beliefs();

    this.socket.onConfig((config) => this.beliefs.updateConfig(config, STEP_PAUSE_MS));
    this.socket.onMap((width, height, tiles) => tiles.forEach((t) => this.beliefs.setTile(t)));
    this.socket.onTile((tile) => this.beliefs.setTile(tile));
    this.socket.onYou((you) => this.beliefs.updateMe(you));
    this.socket.onSensing((sensing) => this.beliefs.updateSensing(sensing));
  }

  async run() {
    while (true) {
      if (!this.beliefs.hasPosition()) {
        await sleep(IDLE_PAUSE_MS);
        continue;
      }

      if (this.beliefs.carried.size > 0) {
        await this.deliver();
        continue;
      }

      const parcel = this.bestParcelToCollect();
      if (parcel) await this.collect(parcel);
      else await this.explore();
    }
  }

  isAt(target) {
    const { me } = this.beliefs;
    return Math.round(me.x) === target.x && Math.round(me.y) === target.y;
  }

  /* Walk to `target`; stops early (returning false) if shouldAbort() becomes
   * true, if there is no path or if a move fails. */
  async moveTo(target, shouldAbort = () => false) {
    const path = findPath(this.beliefs, this.beliefs.me, target);
    if (!path) {
      console.warn('[WARN] no path to', target.x, target.y);
      return false;
    }

    for (const direction of path) {
      if (shouldAbort()) return false;
      let position;
      try {
        position = await this.socket.emitMove(direction);
      } catch {
        position = false;   // ack timeout
      }
      if (!position) {
        console.warn('[WARN] move', direction, 'failed');
        return false;
      }
      this.beliefs.me.x = position.x;
      this.beliefs.me.y = position.y;
      await sleep(STEP_PAUSE_MS);
    }
    return true;
  }

  /* Free parcel whose reward is still positive once picked up and delivered:
   *   value = R - stepCost · (d(me, parcel) + d(parcel, nearest delivery)) */
  bestParcelToCollect() {
    const { beliefs } = this;
    const deliveryTiles = [...beliefs.deliveryTiles.values()];
    if (deliveryTiles.length === 0) return undefined;

    const now = Date.now();
    let best, bestValue = 0;
    for (const parcel of beliefs.parcels.values()) {
      const delivery = closest(parcel, deliveryTiles);
      const steps = manhattanDistance(beliefs.me, parcel) + manhattanDistance(parcel, delivery);
      const value = beliefs.estimatedReward(parcel, now) - beliefs.stepCost * steps;
      if (value > bestValue) { best = parcel; bestValue = value; }
    }
    return best;
  }

  async collect(parcel) {
    const target = { x: Math.round(parcel.x), y: Math.round(parcel.y) };
    console.debug('[INFO] collecting parcel', parcel.id, 'at', target.x, target.y);

    const parcelGone = () => !this.beliefs.parcels.has(parcel.id);
    if (!this.isAt(target)) {
      const arrived = await this.moveTo(target, parcelGone);
      if (!arrived) {
        if (!parcelGone()) await sleep(RETRY_PAUSE_MS);
        return;
      }
    }

    let picked = [];
    try {
      picked = (await this.socket.emitPickup()) ?? [];
    } catch { /* ack timeout: treat as nothing picked */ }

    if (picked.length === 0) {
      console.log('[WARN] nothing picked up at', target.x, target.y);
      this.beliefs.parcels.delete(parcel.id);
      return;
    }
    // The pickup ack carries no parcel ids (only xy/reward/carriedBy), so record
    // the parcels we believed were on this tile; sensing confirms them later.
    const pickedIds = [parcel.id];
    for (const [id, p] of this.beliefs.parcels) {
      if (Math.round(p.x) === target.x && Math.round(p.y) === target.y) pickedIds.push(id);
    }
    for (const id of pickedIds) {
      this.beliefs.carried.add(id);
      this.beliefs.parcels.delete(id);
    }
  }

  async deliver() {
    const { beliefs } = this;
    const unreachable = new Set();
    const nothingCarried = () => beliefs.carried.size === 0;
    let target, fails = 0;

    while (!nothingCarried()) {
      if (!target) {
        const candidates = [...beliefs.deliveryTiles.values()]
          .filter((t) => !unreachable.has(t));
        target = closest(beliefs.me, candidates);
        fails = 0;
        if (!target) {
          console.log('[WARN] no reachable delivery tile, retrying later');
          await sleep(IDLE_PAUSE_MS);
          return;
        }
        console.debug('[INFO] delivering to', target.x, target.y);
      }

      if (this.isAt(target)) {
        let dropped = [];
        try {
          dropped = (await this.socket.emitPutdown()) ?? [];
        } catch { /* ack timeout */ }
        if (dropped.length === 0) console.log('[WARN] putdown dropped nothing (parcels expired?)');
        beliefs.carried.clear();
        return;
      }

      const arrived = await this.moveTo(target, nothingCarried);
      if (!arrived && !nothingCarried()) {
        await sleep(RETRY_PAUSE_MS);
        if (++fails >= MAX_MOVE_FAILS) {
          unreachable.add(target);
          target = undefined;
        }
      }
    }
    console.log('[INFO] carried parcels vanished before delivery');
  }

  async explore() {
    const tile = chooseTileToExplore(this.beliefs);
    if (!tile) {
      await sleep(IDLE_PAUSE_MS);
      return;
    }

    // stop as soon as a parcel worth collecting is sensed, and decide again
    const parcelFound = () => this.bestParcelToCollect() !== undefined;
    const arrived = await this.moveTo(tile, parcelFound);
    if (!arrived && !parcelFound()) {
      tile.unreachableUntil = Date.now() + UNREACHABLE_COOLDOWN_MS;
      await sleep(RETRY_PAUSE_MS);
    }
  }
}
