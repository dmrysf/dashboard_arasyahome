import assert from "node:assert/strict";
import test from "node:test";
import { isAmbiguous, mapManufacturingPlan, physicalError, planDecimal, materialDecimal } from "../src/api/physical";
test("material values stay unknown or exact; no equal split is computed", () => {
  assert.equal(planDecimal(""), null);
  assert.equal(planDecimal("5"), "5.000");
  assert.equal(planDecimal("3,001"), "3.001");
  assert.throws(() => planDecimal("2.5001"));
  assert.throws(() => planDecimal("-2"));
  assert.equal(materialDecimal("-1,200", true), "-1.200");
  assert.throws(() => materialDecimal("-1.200", false));
});
test("omitted plan capabilities deny confirmation and activation; malformed plan facts are rejected", () => {
  const unknown = mapManufacturingPlan({ orderId: "source:synthetic", lines: [] });
  assert.equal(unknown.canConfirm, false);
  assert.equal(unknown.partialRework, false);
  assert.throws(() => mapManufacturingPlan({ orderId: "source:synthetic", lines: [{ itemId: "x", name: "x", sourcePlanHash: "changed" }] }));
});
test("ambiguous network result allows only committed recovery; terminal packing rejection is understandable", () => {
  assert.equal(isAmbiguous({ code: "NETWORK_UNAVAILABLE" }), true);
  assert.equal(isAmbiguous({ code: "ORDER_CHANGED" }), false);
  assert.match(physicalError({ code: "ORDER_ROUTE_INCOMPLETE" }), /toate bucățile/);
});
