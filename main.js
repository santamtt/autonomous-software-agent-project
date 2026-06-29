import * as agent from './src/agent.js'
import { myPos, map } from './src/agent.js'
import * as dist from './src/distance.js'

if(map.size > 0 && target === undefined){
  let min_dist = Number.MAX_VALUE; 
  for(let tile of deliver){
    let tile_dist = dist.manhattanDistance(myPos,tile[1]);
    if(tile_dist < min_dist){
      min_dist = tile_dist;
      target = tile[1];
    }
  }
}

while(target.x !== myPos.x && target.y !== myPos.y){
  if(target.x > myPos.x){
    await socket.emitMove("right");
  }else if(target.x < myPos.x){
    await socket.emitMove("left");
  }

  await new Promise(r => setTimeout(r,200));

  if(target.y > myPos.y){
    await socket.emitMove("up");
  }else if(target.y < myPos.y){
    await socket.emitMove("down");
  }

  await new Promise(r => setTimeout(r,200));
}

