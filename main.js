import * as agent from './src/agent.js'
import { socket } from './src/agent.js'
import * as dist from './src/distance.js'


// Start the loop once connected
agent.runAgentLoop().catch(console.error);
