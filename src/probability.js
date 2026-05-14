const expDecay = (lambda,distance) => {
  return Math.exp(-1.0*distance*lambda);
}

const belief = (lambda,myDist,A2Dist) => {
  let decay = expDecay(lambda,myDist);
  let risk = expDecay(lambda,A2Dist);

  return decay*(1.0 - risk);
}

const expectedVal = (beliefVal,reward) => {
  return beliefVal*reward;
}

const probAgToPkg = (expectedValPkg,totExpectedVal) => {
  if(totExpectedVal === 0){ return -1; }
  return expectedValPkg / totExpectedVal;
}

export {
  expectedVal,
  probAgToPkg,
  expDecay,
  belief
}
