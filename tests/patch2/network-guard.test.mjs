import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const preload = fileURLToPath(new URL("../../scripts/patch2/block-remote-network.cjs", import.meta.url));
for (const [name, code] of [
  ["TCP", 'require("node:net").connect({host:"production.invalid", port:443})'],
  ["TCP positional", 'require("node:net").connect(443,"production.invalid")'],
  ["TLS", 'require("node:tls").connect({host:"production.invalid", port:443})'],
  ["HTTP", 'require("node:http").get("http://production.invalid")'],
  ["HTTPS", 'require("node:https").get("https://production.invalid")'],
  ["fetch", 'fetch("https://production.invalid")'],
]) {
  test(`${name} refuses external connections before network access`, () => {
    const result = spawnSync(process.execPath, ["--require", preload, "-e", code], {
      env: {}, encoding: "utf8", timeout: 5000, windowsHide: true,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Local verification blocked a non-loopback/);
  });
}
test("loopback connections are permitted", () => {
  const code = 'const net=require("node:net");const server=net.createServer(s=>s.end()).listen(0,"127.0.0.1",()=>{net.connect(server.address().port,"127.0.0.1").on("close",()=>server.close())})';
  const result = spawnSync(process.execPath, ["--require", preload, "-e", code], {
    env: {}, encoding: "utf8", timeout: 5000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
});
