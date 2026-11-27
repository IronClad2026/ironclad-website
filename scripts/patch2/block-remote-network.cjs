/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS is required for this early Node preload. */
// Local verification preload. Never imported by the application.
const net = require("node:net");
const tls = require("node:tls");
const { syncBuiltinESMExports } = require("node:module");

function assertLoopback(host) {
  if (host === undefined) return;
  const normalized = String(host).toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(normalized)) {
    throw new Error("Local verification blocked a non-loopback network connection.");
  }
}
function checkConnect(args) {
  const options = args[0];
  if (options && typeof options === "object") {
    if (!options.path) assertLoopback(options.host ?? options.hostname);
  } else if (typeof options === "number" || /^\d+$/.test(String(options))) {
    if (typeof args[1] === "string") assertLoopback(args[1]);
  }
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node also passes a normalized [options, callback] array internally.
  checkConnect(Array.isArray(args[0]) ? args[0] : args);
  return Reflect.apply(connect, this, args);
};
const tlsConnect = tls.connect;
tls.connect = function (...args) {
  checkConnect(args);
  return Reflect.apply(tlsConnect, this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assertLoopback(url.hostname);
  return originalFetch(input, init);
};
syncBuiltinESMExports();
