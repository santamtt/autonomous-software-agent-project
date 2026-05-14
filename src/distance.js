export const distanceCoord = (coord1,coord2) => {
  return Math.abs(coord1-coord2);
}

export const manhattanDistance = (firstObjectPos,secondObjectPos) => {
  return distanceCoord(firstObjectPos.x,secondObjectPos.x) + 
    distanceCoord(firstObjectPos.y,secondObjectPos.y);
}
