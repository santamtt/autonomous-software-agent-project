import { TileType } from './config.js';
import { tileKey } from './utils.js';

const MOVES = [
  { dir: 'left',  dx: -1, dy: 0 },
  { dir: 'right', dx: 1,  dy: 0 },
  { dir: 'up',    dx: 0,  dy: 1 },
  { dir: 'down',  dx: 0,  dy: -1 },
];

/**
 * Breadth-first search on the known map: shortest list of moves from `from`
 * to `to`, or null if `to` cannot be reached.
 * Tiles currently occupied by other agents are treated as obstacles.
 */
export function findPath(beliefs, from, to) {
  const goalKey = tileKey(to.x, to.y);
  const occupied = new Set(
    [...beliefs.agents.values()].map((a) => tileKey(a.x, a.y))
  );
  const isFree = (key) => {
    const tile = beliefs.tiles.get(key);
    if (!tile || tile.type === TileType.WALL) return false;
    return key === goalKey || !occupied.has(key);
  };

  if (!isFree(goalKey)) return null;

  const start = { x: Math.round(from.x), y: Math.round(from.y), path: [] };
  const queue = [start];
  const visited = new Set([tileKey(start.x, start.y)]);

  // index-based queue: Array.shift() is O(n)
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (tileKey(cell.x, cell.y) === goalKey) return cell.path;

    for (const { dir, dx, dy } of MOVES) {
      const x = cell.x + dx, y = cell.y + dy;
      const key = tileKey(x, y);
      if (visited.has(key) || !isFree(key)) continue;
      visited.add(key);
      queue.push({ x, y, path: [...cell.path, dir] });
    }
  }
  return null;
}
