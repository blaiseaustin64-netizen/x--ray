import test from "node:test";
import assert from "node:assert/strict";
import { parseRobots } from "../functions/lib/scanners/robots.js";

test("Disallow: / for another bot does not block *", () => {
  const r = parseRobots("User-agent: *\nDisallow: /admin\n\nUser-agent: BadBot\nDisallow: /\n");
  assert.equal(r.blocksAll, false);
});
test("Disallow: / for * blocks all", () => {
  assert.equal(parseRobots("User-agent: *\nDisallow: /\n").blocksAll, true);
});
test("Disallow: / with a specific Allow is not a full block", () => {
  assert.equal(parseRobots("User-agent: *\nDisallow: /\nAllow: /public\n").blocksAll, false);
});
test("stacked user-agents share rules", () => {
  assert.equal(parseRobots("User-agent: Googlebot\nUser-agent: *\nDisallow: /\n").blocksAll, true);
});
test("finds Sitemap directives", () => {
  assert.deepEqual(parseRobots("Sitemap: https://a.com/s.xml").sitemaps, ["https://a.com/s.xml"]);
});
