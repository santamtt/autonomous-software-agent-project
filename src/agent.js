import * as dist from './distance.js'
import { DjsConnect, DjsClientSocket } from "@unitn-asa/deliveroo-js-sdk/client";
import "dotenv/config"

let CellTypes = {
  WALL: 0,
  NORMAL: 3,
  GREEN: 1,
  RED: 2
}

export class Agent{

  constructor(){
    this.socket = DjsConnect();
    this.selectedParcel = undefined;
    this.target = undefined;

    this.map = new Map();
    this.goal = new Map();
    this.deliver = new Map();

    this.knownParcels = new Map();
    this.knownAgents = new Map();
    this.control = false;
    this.myPos = {};    

    this.socket.onTile( ({x, y, type}) => {
      const key = `${x}_${y}`;
      this.map.set(key, {x, y, type});
      if(type === CellTypes.RED)
        this.deliver.set(key, {x, y, type});
      else if(type === CellTypes.GREEN)
        this.goal.set(key, {x, y, type});
    });

    this.socket.onMap((width, height, tiles) => {

      tiles.forEach((tile) => {
        let x = tile.x;
        let y = tile.y;
        let key = `${tile.x}_${tile.y}`;
        let type = Number(tile.type);

        this.map.set(key, {x, y, type});
        if(type === CellTypes.RED)
          this.deliver.set(key, {x, y, type});
        else if(type === CellTypes.GREEN)
          this.goal.set(key, {x, y, type});
      })
    });


    this.socket.onYou(async (initInfo) => {
     this.myPos = initInfo;
     //console.log("[INFO] initialized agent with info: ", this.myPos);
    });

    this.socket.onSensing(async (sensing) => {
      if (this.control) return;
      this.control = true;

      try {
        for (let p of sensing.parcels) {
          if (!this.knownParcels.has(p.id)) {
            this.knownParcels.set(p.id, p);
          } else {
            let selectedParcel = this.knownParcels.get(p.id);
            if (!(selectedParcel.x === p.x && selectedParcel.y === p.y)) {
              this.knownParcels.set(p.id, p);
            }
          }
        }

        for (let a of sensing.agents) {
          if (!this.knownAgents.has(a.id)) {
            this.knownAgents.set(a.id, a);
          } else {
            let selectedAgent = this.knownAgents.get(a.id);
            if (!(selectedAgent.x === a.x && selectedAgent.y === a.y)) {
              this.knownAgents.set(a.id, a);
            }
          }
        }
      } finally {
        // Ensures control is always released even if an error is thrown
        this.control = false; 
      }
    });
  }

  /* A* algorithm to find the best path to reach the destination */

  findPath(targetX, targetY) {
    const walkable = (key) => {
      const t = this.map.get(key);
      return t !== undefined && t.type !== CellTypes.WALL;
    };

    // also refuse to plan into a wall target
    if (!walkable(`${targetX}_${targetY}`)) return null;

    let queue = [{ x: this.myPos.x, y: this.myPos.y, path: [] }];
    let visited = new Set();

    while (queue.length > 0) {
      let cell = queue.shift();
      let cellKey = `${cell.x}_${cell.y}`;

      if (cell.x === targetX && cell.y === targetY) return cell.path;
      if (visited.has(cellKey)) continue;
      visited.add(cellKey);

      const upKey    = `${cell.x}_${cell.y + 1}`;
      const downKey  = `${cell.x}_${cell.y - 1}`;
      const leftKey  = `${cell.x - 1}_${cell.y}`;
      const rightKey = `${cell.x + 1}_${cell.y}`;

      if (walkable(leftKey)  && !visited.has(leftKey))  queue.push({ x: cell.x - 1, y: cell.y,     path: cell.path.concat('left')  });
      if (walkable(rightKey) && !visited.has(rightKey)) queue.push({ x: cell.x + 1, y: cell.y,     path: cell.path.concat('right') });
      if (walkable(upKey)    && !visited.has(upKey))    queue.push({ x: cell.x,     y: cell.y + 1, path: cell.path.concat('up')    });
      if (walkable(downKey)  && !visited.has(downKey))  queue.push({ x: cell.x,     y: cell.y - 1, path: cell.path.concat('down')  });
    }
    return null;
  }

  /**
   * Executes a single step movement safely awaiting server confirmation.
   */

  async stepTowards(targetX, targetY) {
    if (this.myPos.x === undefined || this.myPos.y === undefined) return false;

    const path = this.findPath(targetX, targetY);
    if (!path) {
      console.warn('[WARN] no path to', targetX, targetY);
      return false;                       // ← caller must react, not spin
    }

    for (const movement of path) {
      const newPos = await this.socket.emitMove(movement);
      if (!newPos || newPos.x === undefined) {
        console.warn('[WARN] move failed, aborting path');
        return false;                     // wall/agent in the way → re-plan
      }
      this.myPos.x = newPos.x;
      this.myPos.y = newPos.y;
      await new Promise(r => setTimeout(r, 500));
    }
    return true;
  }

  async runAgentLoop() {
    let carrying = null;

    while (true) {
      if (this.myPos.x === undefined || this.myPos.y === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      // 1. If carrying a parcel, navigate to the nearest deliver tile
      if (carrying) {
        let deliveryTiles = Array.from(this.deliver.values());

        if (deliveryTiles.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        let nearestDelivery = deliveryTiles.reduce((closest, tile) => {
          let d = Math.abs(tile.x - this.myPos.x) + Math.abs(tile.y - this.myPos.y);
          return d < closest.dist ? { tile, dist: d } : closest;
        }, { tile: deliveryTiles[0], dist: Infinity }).tile;

        if (this.myPos.x === nearestDelivery.x && this.myPos.y === nearestDelivery.y) {
          await this.socket.emitPutdown();
          this.knownParcels.delete(carrying);
          carrying = null;
        } else {
          console.debug("[INFO] carrying parcel");
          let ok = await this.stepTowards(nearestDelivery.x, nearestDelivery.y);
          if(!ok){
            console.log("got stuck while trying to go to the delivery tile")
          }
        }
      } 
      // 2. Otherwise, navigate to the nearest goal tile to pick up a parcel
      else {
        let goalTiles = Array.from(this.goal.values());

        if (goalTiles.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        let nearestGoal = goalTiles.reduce((closest, tile) => {
          let d = dist.manhattanDistance(tile, this.myPos);
          return d < closest.dist ? { tile, dist: d } : closest;
        }, { tile: goalTiles[0], dist: Infinity }).tile;

        if (this.myPos.x === nearestGoal.x && this.myPos.y === nearestGoal.y) {
          let iterParcels = Array.from(this.knownParcels.values())
          let parcel = iterParcels.reduce((closest, parcel) => {
            let d = dist.manhattanDistance(parcel, this.myPos);
            return d < closest.dist ? { parcel, dist: d} : closest;
          },{ parcel: iterParcels[0], dist: Infinity}).parcel;

          if(parcel !== undefined){
            await this.stepTowards(parcel.x, parcel.y);
            console.debug("[DEBUG] parcel: ", parcel)
            if(parcel){
              await this.socket.emitPickup();
              carrying = parcel.id;
            }
          }
        } else {
          console.debug("[INFO] navigating goal tile");

          //console.debug("[DEBUG] nearestGoal: ", nearestGoal, " myPos: ", this.myPos);
          let ok = await this.stepTowards(nearestGoal.x, nearestGoal.y);
          if(!ok){
            console.log("got stuck while trying to go to the goal tile")
          }
        }
      }
    }
  }


  explore(){
   
  }

  deliver(){

  }

  pickUpParcel(){
      
  }
}