import { DjsConnect, DjsClientSocket } from "@unitn-asa/deliveroo-js-sdk/client";
import "dotenv/config"

import * as prob from './probability.js'

export class Agent { 

  constructor() {
    this.socket = DjsConnect();
    this.selectedParcel = undefined; 
    this.socket.on('you',(id, name, x, y) => {
      this.myPos = {x,y};
    });
    this.lambda = 0.3;
  }

  distanceCoord(coord1,coord2) {
    return Math.abs(coord1-coord2);
  }

  manhattanDistance(firstObjectPos,secondObjectPos) {
    return this.distanceCoord(firstObjectPos.x,secondObjectPos.x) + 
      this.distanceCoord(firstObjectPos.y,secondObjectPos.y);
  }

  act() {
    /*this.socket.on('map', async (width,height,tiles) => {
      let parcels = tiles.filter((pos) => { return pos.type === '3'; });

    })*/
     }

}
