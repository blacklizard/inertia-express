import { describe, expect, it } from "vitest";
import { encodePageScript, renderDefaultHtml } from "../../src/core/html.js";
import type { InertiaPage } from "../../src/core/index.js";

const page: InertiaPage = {
  component: "Home",
  props: { greeting: "<hi>" },
  url: "/",
  version: null,
  clearHistory: false,
  encryptHistory: false,
};

describe("encodePageScript", () => {
  it("emits JSON with < escaped so it cannot break out of </script>", () => {
    const encoded = encodePageScript(page);
    expect(encoded).not.toContain("<");
    expect(encoded).toContain("\\u003Chi>");
    // Still valid JSON that round-trips.
    expect(JSON.parse(encoded).props.greeting).toBe("<hi>");
  });
});

describe("renderDefaultHtml", () => {
  it("emits an empty root div plus a v3 page script tag", () => {
    const html = renderDefaultHtml({ page });
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<script data-page="app" type="application/json">');
    expect(html).toContain("\\u003Chi>");
  });

  it("inlines ssrBody as the root div's inner HTML, page script alongside", () => {
    const html = renderDefaultHtml({ page, ssrBody: "<span>SSR</span>" });
    expect(html).toContain('<div id="app"><span>SSR</span></div>');
    expect(html).toContain('<script data-page="app" type="application/json">');
  });

  it("uses ssrFull verbatim when set, ignoring rootId/ssrBody/page script", () => {
    const html = renderDefaultHtml({
      page,
      ssrFull: '<div id="app">FULL</div><script data-page="app" type="application/json">{}</script>',
      rootId: "ignored",
      ssrBody: "<x>ignored</x>",
    });
    expect(html).toContain('<div id="app">FULL</div>');
    expect(html).not.toContain("ignored");
  });

  it("uses rootId for both the div id and the script's data-page attribute", () => {
    const html = renderDefaultHtml({ page, rootId: "root" });
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<script data-page="root" type="application/json">');
  });

  it("escapes scriptSrc, title, and rootId attributes", () => {
    const html = renderDefaultHtml({
      page,
      title: "T<x>",
      scriptSrc: '/a"b.js',
      rootId: "r<x>",
      head: "<meta name=raw />",
    });
    expect(html).toContain("<title>T&lt;x&gt;</title>");
    expect(html).toContain('src="/a&quot;b.js"');
    expect(html).toContain('id="r&lt;x&gt;"');
    expect(html).toContain('data-page="r&lt;x&gt;"');
    // raw head content is passed through (caller is trusted)
    expect(html).toContain("<meta name=raw />");
  });

  it("omits the client module script when scriptSrc is not given", () => {
    const html = renderDefaultHtml({ page });
    expect(html).not.toContain('type="module"');
  });
});
