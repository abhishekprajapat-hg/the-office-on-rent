/*
 * 13 Nov 2026: write limits were counted per IP address, so everyone behind
 * one office connection shared 80 writes a minute and one bulk delete blocked
 * a colleague's bulk upload. Signed-in requests are now counted per user.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.WRITE_RATE_LIMIT_MAX = "3";
delete require.cache[require.resolve("../src/middleware/rateLimit.middleware")];
const { writeLimiter, userOrIpKey } = require("../src/middleware/rateLimit.middleware");

const startServer = () => new Promise((resolve) => {
  const app = express();
  app.post("/write", writeLimiter, (req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
});

const post = (server, token) => fetch(`http://127.0.0.1:${server.address().port}/write`, {
  method: "POST",
  headers: token ? { Authorization: `Bearer ${token}` } : {},
}).then((res) => res.status);

test("two signed-in users on one IP each get their own write budget", async () => {
  const server = await startServer();
  try {
    const alice = jwt.sign({ id: "aaaaaaaaaaaaaaaaaaaaaaaa" }, process.env.JWT_SECRET);
    const bob = jwt.sign({ id: "bbbbbbbbbbbbbbbbbbbbbbbb" }, process.env.JWT_SECRET);
    const aliceCodes = [];
    for (let i = 0; i < 4; i += 1) aliceCodes.push(await post(server, alice));
    assert.deepEqual(aliceCodes, [200, 200, 200, 429], "the fourth write in the window is limited");
    assert.equal(await post(server, bob), 200, "a colleague on the same IP is not blocked");
  } finally {
    server.close();
  }
});

test("a token that does not verify is counted per IP, so forged tokens cannot dodge the limit", async () => {
  const forged = jwt.sign({ id: "cccccccccccccccccccccccc" }, "wrong-secret");
  assert.equal(userOrIpKey({ headers: { authorization: `Bearer ${forged}` }, ip: "10.0.0.9" }), "ip:10.0.0.9");
  assert.equal(userOrIpKey({ headers: {}, ip: "10.0.0.9" }), "ip:10.0.0.9");
  const real = jwt.sign({ id: "dddddddddddddddddddddddd" }, process.env.JWT_SECRET);
  assert.equal(userOrIpKey({ headers: { authorization: `Bearer ${real}` }, ip: "10.0.0.9" }), "user:dddddddddddddddddddddddd");
});
