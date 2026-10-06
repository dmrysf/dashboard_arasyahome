import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi } from "../src/api/client";
import { parseRoute } from "../src/app/router";
import { NAVIGATION } from "../src/components/Shell";
import { API, fakeFetch, me, sessionPayload } from "./support";

test("transfer and display routes are strict; TV navigation is Root only",()=>{
  assert.deepEqual(parseRoute("/aprobari/transfer/11111111-1111-4111-8111-111111111111"),{name:"transfer",id:"11111111-1111-4111-8111-111111111111"});
  assert.deepEqual(parseRoute("/aprobari/transfer/not-an-id"),{name:"not-found"});
  for(const isRoot of [false,true]) { const actor=me({isRoot}); const visible=NAVIGATION.filter(n=>n.visible(actor,p=>isRoot||actor.permissions.includes(p))).map(n=>n.path);assert.equal(visible.includes("/dispozitive-afisare"),isRoot); }
});
test("device and transfer commands use the central cookie/CSRF client and stable retry keys",async()=>{
  const {fetchImpl,calls}=fakeFetch(c=>({body:c.url.pathname==="/auth/session"?sessionPayload():{id:"device"}}));
  const api=createApi(API,fetchImpl);await api.getSession();
  await api.createDisplay("Zona de tăiere perdele","root-pair-key");
  await api.repairDisplay("device","root-repair-key");await api.revokeDisplay("device","root-revoke-key");
  await api.displayThresholds(1,[15,30,60],"root-threshold-key");
  await api.decideTransfer("transfer",{expectedVersion:1,decision:"approve"},"manager-decision-key");
  await api.cancelTransfer("transfer",2,"Recuperare tehnică","root-recovery-key");
  assert.deepEqual(calls.slice(1).map(c=>c.url.pathname),["/management/cutting/devices","/management/cutting/devices/device/re-pair","/management/cutting/devices/device/revoke","/management/cutting/thresholds","/management/cutting/transfers/transfer/decision","/management/cutting/transfers/transfer/cancel"]);
  for(const c of calls.slice(1)) {assert.equal(c.credentials,"include");assert.equal(c.headers["X-CSRF-Token"],"csrf-token-1");assert.ok(c.headers["Idempotency-Key"]);}
});
