/*import * as prob from './src/probability.js'

let p1 = prob.belief(0.3,3,3,true);*/
import * as prob from './src/probability.js'
import * as dist from './src/distance.js'

import { DjsConnect, DjsClientSocket } from "@unitn-asa/deliveroo-js-sdk/client";
import "dotenv/config"

let socket = DjsConnect();
const myPos = {}
let map = {}; 
let knownParcels = {};
let knownAgents = {};
let lambda = 0.3;
let control = false;

function length(dictIn){ 
  if(dictIn !== undefined){
    return Object.keys(dictIn).length;
  }
  return 0;
}

async function makeMove() {
  /*let dir = ['left','right','up','down'];
  let move = dir[Math.floor(Math.random()*4)];
  await socket.emitMove(move);
  console.debug(move);*/
}

socket.on('you',(id, name, x, y, score) => {
  myPos.id = id;
  myPos.name = name;
  myPos.x = x;
  myPos.y = y;
  myPos.score = score;
});

socket.on('map', async (width, height, tiles) => {
  map = tiles; 
  console.debug(map);
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

while(true) {
  if(control) continue;
  control = true;
  await makeMove();
  control = false;
}
