import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../functions/lib/validate.js";

const blocked = [
  "http://127.0.0.1", "http://localhost", "http://169.254.169.254",
  "http://10.0.0.1", "http://192.168.1.1", "http://2130706433", "http://0x7f.1",
  "http://[::1]/", "http://[::]/", "http://[fd00::1]/", "http://[fe80::1]/",
  "http://[::ffff:127.0.0.1]/", "http://[::ffff:10.0.0.1]/", "http://[64:ff9b::7f00:1]/",
  "http://metadata.google.internal", "ftp://example.com", "javascript:alert(1)",
];
const allowed = ["example.com", "https://example.com/path?q=1", "http://8.8.8.8", "http://[2606:4700:4700::1111]/"];

for (const u of blocked) test(`blocks ${u}`, () => assert.throws(() => normalizeUrl(u)));
for (const u of allowed) test(`allows ${u}`, () => assert.doesNotThrow(() => normalizeUrl(u)));
