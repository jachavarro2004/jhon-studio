/**
 * The script (src/script.ts): script.json in the video folder, the shot model (id, kind, en, es,
 * kind's fields, marks for proofs) and a `say` map for pronunciations. Validation names every
 * problem with its shot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KINDS, lines, spoken, validateScript } from "../src/script.ts";
import { SAMPLE, SAMPLE_VIDEO } from "./helpers.ts";

const sample = () => JSON.parse(readFileSync(join(SAMPLE, ".jhon", "studio", SAMPLE_VIDEO, "script.json"), "utf8"));
const both = { languages: ["en", "es"] };

test("the sample project's script is valid: about eight shots, opening on the intro and ending on the close", () => {
  const s = sample();
  assert.deepEqual(validateScript(s, both), []);
  assert.ok(s.shots.length >= 7 && s.shots.length <= 10, `${s.shots.length} shots`);
  assert.equal(s.shots[0].kind, "intro");
  assert.equal(s.shots.at(-1).kind, "close");
  assert.equal(s.approved, false, "the sample's script waits for its owner's approval");
  assert.deepEqual(new Set(s.shots.map((x: { kind: string }) => x.kind)), new Set(KINDS), "the sample uses every kind");
});

test("the kinds are intro, head, card, list, numbers, proof and close", () => {
  assert.deepEqual(KINDS, ["intro", "head", "card", "list", "numbers", "proof", "close"]);
  const s = sample();
  s.shots[2].kind = "slide";
  assert.deepEqual(validateScript(s, both), [`${s.shots[2].id}: kind "slide" is not one of intro, head, card, list, numbers, proof, close`]);
});

test("a proof's marks land in order: each phrase is in its line and after the one before; a number only first", () => {
  const s = sample();
  const proof = s.shots.find((x: { kind: string }) => x.kind === "proof");
  const [a, b] = proof.marks;
  proof.marks = [b, a];
  assert.deepEqual(validateScript(s, both), [`${proof.id}: mark 1 ("${a.at}") comes before mark 0 ("${b.at}") in its line`]);
  proof.marks = [a, { at: "not in the line", r: [0, 0, 10, 10] }];
  assert.deepEqual(validateScript(s, both), [`${proof.id}: mark 1: "not in the line" is not in its line`]);
  proof.marks = [a, { at: 1.5, r: [0, 0, 10, 10] }];
  assert.deepEqual(validateScript(s, both), [`${proof.id}: mark 1: a time in seconds may only be the first mark`]);
  proof.marks = [{ at: "the list", r: [0, 0, 10] }];
  assert.match(validateScript(s, both).join("\n"), /mark 0: r is \[x, y, width, height\]/);
  proof.marks = [];
  assert.match(validateScript(s, both).join("\n"), /marks: at least one/);
});

test("every shot has its Spanish subtitle, in the tú form, two rows at most, not the English again", () => {
  const s = sample();
  delete s.shots[1].es;
  assert.deepEqual(validateScript(s, both), [`${s.shots[1].id}: no es subtitle`]);
  assert.deepEqual(validateScript(s, { languages: ["en"] }), [], "a script for English alone needs no Spanish");
  const t = sample();
  t.shots[1].es = "Si querés, mirá la lista.";
  assert.deepEqual(validateScript(t, both), [`${t.shots[1].id}: voseo in the es subtitle ("querés", "mirá"): use the tú form`]);
  t.shots[1].es = t.shots[1].en;
  assert.deepEqual(validateScript(t, both), [`${t.shots[1].id}: the es subtitle repeats the English`]);
  t.shots[1].es = "x".repeat(169);
  assert.deepEqual(validateScript(t, both), [`${t.shots[1].id}: the es subtitle has 169 characters; two rows hold 168`]);
});

test("the script's frame: shot ids unique and plain, the intro first and the close last, each kind's fields", () => {
  const s = sample();
  s.shots[2].id = s.shots[1].id;
  assert.match(validateScript(s, both).join("\n"), new RegExp(`${s.shots[1].id}: the id is used twice`));
  const u = sample();
  u.shots[1].id = "Bad Id";
  assert.match(validateScript(u, both).join("\n"), /"Bad Id": an id is lowercase letters, digits and dashes/);
  const v = sample();
  v.shots.push(v.shots.shift());
  assert.match(validateScript(v, both).join("\n"), /the first shot is the intro/);
  const w = sample();
  const card = w.shots.find((x: { kind: string }) => x.kind === "card");
  delete card.title;
  assert.match(validateScript(w, both).join("\n"), new RegExp(`${card.id}: title: a list of lines`));
  const x = sample();
  const card2 = x.shots.find((y: { kind: string }) => y.kind === "card");
  card2.body = [["A line", "a phrase not said"]];
  assert.match(validateScript(x, both).join("\n"), new RegExp(`${card2.id}: body 0: "a phrase not said" is not in its line`));
  assert.match(validateScript({ shots: [] }, both).join("\n"), /no shots/);
  assert.match(validateScript({ approved: "yes", shots: sample().shots }, both).join("\n"), /approved: true or false/);
});

test("`say` spells names as they are heard; backticks are dropped; whole words only", () => {
  const say = { "30%": "thirty percent", CLI: "C L I", pi: "pie" };
  assert.equal(spoken("Run the `CLI`: 30% less, with pi and a pipe.", say), "Run the C L I: thirty percent less, with pie and a pipe.");
  assert.equal(spoken("plain", undefined), "plain");
});

test("lines(): the distinct spoken lines, by the first shot that says each (the close may repeat the intro)", () => {
  const s = sample();
  const ls = lines(s);
  const said = new Set(s.shots.map((x: { en: string }) => spoken(x.en, s.say)));
  assert.equal(ls.length, said.size);
  assert.equal(ls[0].id, s.shots[0].id);
});
