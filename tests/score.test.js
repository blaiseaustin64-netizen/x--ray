import test from "node:test";
import assert from "node:assert/strict";
import { aggregateScores } from "../functions/lib/score.js";

const r = (id, scores) => ({ id, ok: true, findings: [{ id }], scores });

test("Design is never invented", () => {
  const out = aggregateScores([r("a", { seo: 80 }), r("b", { accessibility: 70 }), r("c", { security: 90 })]);
  const design = out.categories.find((c) => c.id === "design");
  assert.equal(design.notChecked, true);
  assert.equal(design.score, null);
});
test("too little evidence throws", () => {
  assert.throws(() => aggregateScores([r("a", { seo: 80 })]), /Not enough evidence/);
});
