import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { MESSAGES } from "../src/i18n";
import { scopeLabel, scopeNotice } from "../src/pages/ApprovalsPage";

// Per-piece rework (API 2.31.0): the manager sees exactly which pieces an approval moves. The business shape of Trendyol
// order 11709027615: one line, quantity 2, one defective curtain.
const root = path.resolve(import.meta.dirname, "..");
const partial = { orderLineCount: 1, orderQuantity: 2, affectedLineCount: 1, affectedQuantity: 1, movingQuantity: 1, unaffectedQuantity: 1, wholeOrderMoves: false, partial: true, piecesRecorded: true, carrier: "track" as const, trackId: "t" };

test("one defective curtain of two: only that piece moves, said in Romanian and Turkish", () => {
  const ro = MESSAGES.ro.exceptions.pieces;
  assert.deepEqual(scopeNotice(ro, { orderScope: partial }), { tone: "info", text: "La aprobare se întoarce la tăiere doar bucata selectată (1 buc.). Restul comenzii (1 buc.) rămâne la etapa ei, fără refacere." });
  assert.equal(scopeLabel(ro, { orderScope: partial }), "1 din 2 buc. · Doar bucata selectată");
  assert.match(scopeNotice(MESSAGES.tr.exceptions.pieces, { orderScope: partial })?.text ?? "", /yalnız seçilen parça \(1 adet\)/);
  assert.equal(ro.piece(1, 2), "Bucata 1/2");
});

test("whole-order returns are stated as such; an older API without a scope shows nothing new", () => {
  const ro = MESSAGES.ro.exceptions.pieces;
  const legacy = { orderLineCount: 3, orderQuantity: 5, affectedLineCount: 1, affectedQuantity: 2, wholeOrderMoves: true };
  assert.deepEqual(scopeNotice(ro, { orderScope: legacy }), { tone: "warning", text: "Raport făcut pe linii: la aprobare se întoarce la tăiere întreaga comandă (5 buc.), nu doar produsul afectat." });
  const all = { ...partial, affectedQuantity: 2, movingQuantity: 2, unaffectedQuantity: 0, wholeOrderMoves: true, partial: false, carrier: "order" as const, trackId: null };
  assert.equal(scopeNotice(ro, { orderScope: all }), null, "every piece named: nothing beyond them moves");
  assert.equal(scopeNotice(ro, {}), null);
  assert.equal(scopeLabel(ro, {}), null);
});

test("the approval list, detail and confirmation show the pieces", () => {
  const page = readFileSync(path.join(root, "src/pages/ApprovalsPage.tsx"), "utf8");
  assert.match(page, /data-testid="approval-scope"/);
  assert.match(page, /data-testid="affected-pieces"/);
  assert.match(page, /dialog === "approve" && notice && <p data-testid="approve-scope">/, "the confirmation repeats what moves");
});
