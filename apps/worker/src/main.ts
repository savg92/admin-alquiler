import { loadConfig } from "@admin-alquiler/config";

const config = loadConfig("worker");

console.log(`worker started (env=${config.nodeEnv})`);

// WS-12/Stage-A placeholder: outbox consumer + BullMQ attach here.
setInterval(() => {
  // heartbeat; replaced by real queue polling in WS-12.
}, 30_000);
