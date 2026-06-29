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
  DELIVER: 2
}
let knownParcels = {};
let knownAgents = {};
let control = false;
export var myPos = {};

socket.onYou(async (id, name, x, y, score) => {
  myPos.id = id;
  myPos.name = name;
  myPos.x = x;
  myPos.y = y;
  myPos.score = score;
});

socket.onTile( ({x, y, type}) => {
  const key = `${x}_${y}`;
  map.set(key, {x, y, type});
  if(type === `${CellTypes.GREEN}`)
    deliver.set(key, {x, y, type});
  else if(type === `${CellTypes.DELIVER}`)
    goal.set(key, {x, y, type});
});


socket.onSensing(async (sensing) => {
  if (control) return;
    control = true;

  for(let p of sensing.parcels){
    if(!(p.id in knownParcels)){
      knownParcels[p.id] = p;
    }else{
      let selectedParcel = knownParcels[p.id];

      let x = selectedParcel.x;
      let y = selectedParcel.y;

      if(!(x === p.x && y === p.y)) {
        knownParcels[p.id] = p;
      }
    }
  }

  for(let a of sensing.agents){
  if(!(a.id in knownAgents)){
    knownAgents[a.id] = a;
  }else{
    let selectedAgent = knownAgents[a.id];

    let x = selectedAgent.x;
    let y = selectedAgent.y;

    if(!(x === a.x && y === a.y)) 
      knownAgents[a.id] = a;
    }
  }

  control = false;
});
