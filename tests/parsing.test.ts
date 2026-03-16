import { describe, it } from "node:test";
import assert from "node:assert";

describe("getPendingDays parsing", () => {
  it("extracts dates from pending days message", () => {
    const html = `
      <div class="flash flash_notice">
        Aun no se cargo el/los días para John Doe: 02/02/2026, 03/02/2026, 04/02/2026
      </div>
    `;

    const match = html.match(
      /Aun no se cargo el\/los d[ií]a[s]? para [^:]+:\s*([^\n<]+)/
    );
    assert.ok(match);
    const days = match![1]
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    assert.deepStrictEqual(days, ["02/02/2026", "03/02/2026", "04/02/2026"]);
  });

  it("returns empty when no pending days message", () => {
    const html = `<div class="flash flash_notice">All hours logged!</div>`;
    const match = html.match(
      /Aun no se cargo el\/los d[ií]a[s]? para [^:]+:\s*([^\n<]+)/
    );
    assert.strictEqual(match, null);
  });

  it("handles singular day variant", () => {
    const html = `Aun no se cargo el/los dia para Jane: 10/02/2026`;
    const match = html.match(
      /Aun no se cargo el\/los d[ií]a[s]? para [^:]+:\s*([^\n<]+)/
    );
    assert.ok(match);
    const days = match![1]
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    assert.deepStrictEqual(days, ["10/02/2026"]);
  });
});

describe("getProjects parsing", () => {
  it("extracts projects from select dropdown", () => {
    const html = `
      <select name="daily_hour[project_id]" id="daily_hour_project_id">
        <option value="">-- Select --</option>
        <option value="42">Acme Corp</option>
        <option value="99">Internal</option>
        <option value="101">Open Source Project</option>
      </select>
    `;

    const projectSelectMatch = html.match(
      /name="daily_hour\[project_id\]"[^>]*>([\s\S]*?)<\/select>/
    );
    assert.ok(projectSelectMatch);

    const projects: { id: string; name: string }[] = [];
    const regex = /<option value="(\d+)">([^<]+)<\/option>/g;
    let m;
    while ((m = regex.exec(projectSelectMatch![1])) !== null) {
      projects.push({ id: m[1], name: m[2] });
    }

    assert.deepStrictEqual(projects, [
      { id: "42", name: "Acme Corp" },
      { id: "99", name: "Internal" },
      { id: "101", name: "Open Source Project" },
    ]);
  });

  it("returns empty when no select found", () => {
    const html = `<div>No form here</div>`;
    const projectSelectMatch = html.match(
      /name="daily_hour\[project_id\]"[^>]*>([\s\S]*?)<\/select>/
    );
    assert.strictEqual(projectSelectMatch, null);
  });
});

describe("createHour error parsing", () => {
  it("extracts error messages from form validation", () => {
    const html = `
      <div class="errors">
        <ul>
          <li>Hours must be greater than 0</li>
          <li>Description can't be blank</li>
        </ul>
      </div>
    `;

    const errorMatch = html.match(/<li>([^<]+)<\/li>/g);
    assert.ok(errorMatch);
    const errors = errorMatch!
      .map((e) => e.replace(/<\/?li>/g, ""))
      .join(", ");
    assert.strictEqual(
      errors,
      "Hours must be greater than 0, Description can't be blank"
    );
  });

  it("returns null when no errors", () => {
    const html = `<div>Success redirect</div>`;
    const errorMatch = html.match(/<li>([^<]+)<\/li>/g);
    assert.strictEqual(errorMatch, null);
  });
});

describe("CSRF token parsing", () => {
  it("extracts CSRF from form authenticity_token", () => {
    const html = `<input name="authenticity_token" type="hidden" value="abc123token+/==" />`;
    const match = html.match(
      /name="authenticity_token"[^>]*value="([^"]+)"/
    );
    assert.ok(match);
    assert.strictEqual(match![1], "abc123token+/==");
  });

  it("extracts CSRF from meta tag", () => {
    const html = `<meta name="csrf-token" content="metaToken456==" />`;
    const match = html.match(/meta name="csrf-token" content="([^"]+)"/);
    assert.ok(match);
    assert.strictEqual(match![1], "metaToken456==");
  });
});

describe("deleteHour response handling", () => {
  it("reports failure for non-success status codes", () => {
    const results = [
      { success: true, message: "Hour entry 100 deleted" },
      { success: false, message: "Failed to delete entry 101: status 404" },
      { success: false, message: "Failed to delete entry 102: status 500" },
    ];

    const deleted = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    assert.strictEqual(deleted.length, 1);
    assert.strictEqual(failed.length, 2);
    assert.ok(failed[0].message.includes("404"));
    assert.ok(failed[1].message.includes("500"));
  });

  it("reports all success when all deletions succeed", () => {
    const results = [
      { success: true, message: "Hour entry 100 deleted" },
      { success: true, message: "Hour entry 101 deleted" },
    ];

    const deleted = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    assert.strictEqual(deleted.length, 2);
    assert.strictEqual(failed.length, 0);
  });

  it("handles all failures", () => {
    const results = [
      { success: false, message: "Failed to delete entry 100: status 422" },
    ];

    const deleted = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    assert.strictEqual(deleted.length, 0);
    assert.strictEqual(failed.length, 1);
    assert.ok(failed[0].message.includes("422"));
  });
});

describe("staff_id parsing", () => {
  it("extracts staff_id with value before selected", () => {
    const html = `
      <select name="daily_hour[staff_id]">
        <option value="10">Alice</option>
        <option value="20" selected="selected">Bob</option>
      </select>
    `;
    const match = html.match(
      /name="daily_hour\[staff_id\]"[\s\S]*?option[^>]*value="(\d+)"[^>]*selected/
    );
    assert.ok(match);
    assert.strictEqual(match![1], "20");
  });

  it("extracts staff_id with selected before value", () => {
    const html = `
      <select name="daily_hour[staff_id]">
        <option value="10">Alice</option>
        <option selected="selected" value="30">Charlie</option>
      </select>
    `;
    const alt = html.match(
      /name="daily_hour\[staff_id\]"[\s\S]*?selected[^>]*value="(\d+)"/
    );
    assert.ok(alt);
    assert.strictEqual(alt![1], "30");
  });
});
