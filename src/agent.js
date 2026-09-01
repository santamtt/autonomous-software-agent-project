import * as dist from './distance.js'
import { DjsConnect, DjsClientSocket } from "@unitn-asa/deliveroo-js-sdk/client";
import "dotenv/config"

export let socket = DjsConnect();
let selectedParcel = undefined;
let target = undefined;

export var map = new Map();
let goal = new Map();
let deliver = new Map();
let CellTypes = {
  NORMAL: 3,
  GREEN: 1,
  RED: 2
}
let knownParcels = new Map();
let knownAgents = new Map();
let control = false;
export var myPos = {};

socket.onYou(async (incomingInfo) => {
  myPos = incomingInfo;
});

socket.onTile( ({x, y, type}) => {
  const key = `${x}_${y}`;
  map.set(key, {x, y, type});
  if(type === `${CellTypes.RED}`)
    deliver.set(key, {x, y, type});
  else if(type === `${CellTypes.GREEN}`)
    goal.set(key, {x, y, type});
});


socket.onSensing(async (sensing) => {
  if (control) return;
    control = true;

  for(let p of sensing.parcels){
    if(!(p.id in knownParcels)){
      knownParcels.set(p.id,p);
    }else{
      let selectedParcel = knownParcels.get(p.id);

      let x = selectedParcel.x;
      let y = selectedParcel.y;

      if(!(x === p.x && y === p.y)) {
        knownParcels.set(p.id, p);
      }
    }
  }

  for(let a of sensing.agents){
  if(!(a.id in knownAgents)){
    knownAgents.set(a.id, a);
  }else{
    let selectedAgent = knownAgents.get(a.id);

    let x = selectedAgent.x;
    let y = selectedAgent.y;

    if(!(x === a.x && y === a.y)) 
      knownAgents.set(a.id, a);
    }
  }

  control = false;
});

/**
 * Executes a single step movement safely awaiting server confirmation.
 */

async function stepTowards(targetX, targetY) {
  if (myPos.x === undefined || myPos.y === undefined) return false;
  
  let dy = targetY - myPos.y;
  let nextY = myPos.y;

  let dx = targetX - myPos.x;
  let nextX = myPos.x;
  let direction = null;

  if (dx > 0 ){ direction = 'right'; nextX++; }
  else if (dx < 0){ direction = 'left'; nextX--; }

  if(direction && map.has(`${nextX}_${myPos.y}`)){
    await socket.emitMove(direction);
  }

  if (dy > 0 ){ direction = 'up'; nextY++; }
  else if (dy < 0){ direction = 'down'; nextY--; }

  if(direction && map.has(`${myPos.x}_${nextY}`)){
    await socket.emitMove(direction);
  }

  return 0;
}

/**
 * Main agent loop: navigates between goal (parcels/pickup tiles) and deliver maps.
 */
export async function runAgentLoop() {
  let carrying = null;

  while (true) {
    if (myPos.x === undefined || myPos.y === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }

    // 1. If carrying a parcel, navigate to the nearest deliver tile
    if (carrying) {
      let deliveryTiles = Array.from(deliver.values());

      if (deliveryTiles.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }

      let nearestDelivery = deliveryTiles.reduce((closest, tile) => {
        let d = Math.abs(tile.x - myPos.x) + Math.abs(tile.y - myPos.y);
        return d < closest.dist ? { tile, dist: d } : closest;
      }, { tile: deliveryTiles[0], dist: Infinity }).tile;

      if (myPos.x === nearestDelivery.x && myPos.y === nearestDelivery.y) {
        await socket.emitPutdown();
        knownParcels.delete(carrying);
        carrying = null;
      } else {
        await stepTowards(nearestDelivery.x, nearestDelivery.y);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } 
    // 2. Otherwise, navigate to the nearest goal tile to pick up a parcel
    else {
      let goalTiles = Array.from(goal.values());

      if (goalTiles.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }

      let nearestGoal = goalTiles.reduce((closest, tile) => {
        let d = Math.abs(tile.x - myPos.x) + Math.abs(tile.y - myPos.y);
        return d < closest.dist ? { tile, dist: d } : closest;
      }, { tile: goalTiles[0], dist: Infinity }).tile;

      if (myPos.x === nearestGoal.x && myPos.y === nearestGoal.y) {
        let parcel = Array.from(knownParcels.values()).reduce((id, parcel) => {
          return parcel.x == myPos.x && parcel.y == myPos.y;
        },0);
       
        if(parcel){
          console.log(parcel)
          await socket.emitPickup();
          carrying = parcel.id;
        }
      } else {
        await stepTowards(nearestGoal.x, nearestGoal.y);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }
}