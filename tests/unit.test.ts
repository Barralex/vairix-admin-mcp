import { describe, it } from "node:test";
import assert from "node:assert";
import { categoryName, categoryId } from "../src/api.js";

describe("categoryName", () => {
  it("maps all known categories", () => {
    assert.strictEqual(categoryName(1), "Desarrollador");
    assert.strictEqual(categoryName(2), "Gerente de proyecto");
    assert.strictEqual(categoryName(3), "Testing");
    assert.strictEqual(categoryName(4), "Arquitecto");
    assert.strictEqual(categoryName(5), "Otro");
  });

  it("returns Unknown for unmapped numbers", () => {
    assert.strictEqual(categoryName(0), "Unknown(0)");
    assert.strictEqual(categoryName(99), "Unknown(99)");
  });
});

describe("categoryId", () => {
  it("maps developer aliases to 1", () => {
    assert.strictEqual(categoryId("desarrollador"), "1");
    assert.strictEqual(categoryId("dev"), "1");
    assert.strictEqual(categoryId("developer"), "1");
    assert.strictEqual(categoryId("Developer"), "1");
  });

  it("maps PM aliases to 2", () => {
    assert.strictEqual(categoryId("pm"), "2");
    assert.strictEqual(categoryId("PM"), "2");
    assert.strictEqual(categoryId("gerente de proyecto"), "2");
  });

  it("maps testing aliases to 3", () => {
    assert.strictEqual(categoryId("testing"), "3");
    assert.strictEqual(categoryId("qa"), "3");
    assert.strictEqual(categoryId("QA"), "3");
  });

  it("maps architect aliases to 4", () => {
    assert.strictEqual(categoryId("arquitecto"), "4");
    assert.strictEqual(categoryId("architect"), "4");
  });

  it("maps other aliases to 5", () => {
    assert.strictEqual(categoryId("otro"), "5");
    assert.strictEqual(categoryId("other"), "5");
  });

  it("defaults unknown names to 1", () => {
    assert.strictEqual(categoryId("unknown"), "1");
    assert.strictEqual(categoryId("xyz"), "1");
  });
});
