import test from "node:test";
import assert from "node:assert/strict";
import { detectNoContent } from "../functions/api/scan.js";

test("empty page is rejected with an honest message", () => {
  assert.match(detectNoContent({ title: "", h1: [], links: [], images: [] }), /no readable content/);
});
test("parked domain page is rejected", () => {
  assert.match(
    detectNoContent({ title: "example.com - Domain is for sale", h1: [], links: [{}], images: [] }),
    /parked/
  );
});
test("real page with a title passes", () => {
  assert.equal(detectNoContent({ title: "Acme Studio", h1: ["Hi"], links: [{}, {}], images: [] }), null);
});
test("JS app shell with a title still scans", () => {
  assert.equal(detectNoContent({ title: "My App", h1: [], links: [], images: [] }), null);
});
