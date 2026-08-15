import { strict as assert } from "node:assert";
import { alertTransition } from "./alertLogic.ts";

// ok state: no-op when never alerted, clear when previously alerting
assert.equal(alertTransition(undefined, "ok"), "noop");
assert.equal(alertTransition("red", "ok"), "clear");

// alert state: send once, skip while sustained, re-send after recovery
assert.equal(alertTransition(undefined, "red"), "send");
assert.equal(alertTransition("red", "red"), "skip");
assert.equal(alertTransition("red", "yellow"), "send"); // severity change re-alerts
assert.equal(alertTransition("ok", "red"), "send");

console.log("alertTransition checks passed");
