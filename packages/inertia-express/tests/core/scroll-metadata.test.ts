/**
 * Port of inertia-laravel tests/ScrollMetadataTest.php. Skipped:
 * - test_extract_metadata_from_simple_paginator, _length_aware_paginator, _cursor_paginator,
 *   test_throws_exception_if_not_a_paginator: paginator inference is Laravel-only; metadata is explicit here.
 * Kept: the wire shape of the metadata object, including cursor-style string pages.
 */
import { describe, expect, it } from "vitest";
import { resolveProps } from "../../src/core/props-resolver.js";
import { scroll } from "../../src/core/props.js";
import { makeRequest } from "./support/request.js";

describe("scroll metadata shape", () => {
  it("emits pageName, previousPage, nextPage, currentPage and reset in that shape", async () => {
    const r = await resolveProps({
      shared: {},
      props: {
        users: scroll(() => ({ data: [] }), {
          metadata: { pageName: "page", previousPage: 1, nextPage: 3, currentPage: 2 },
        }),
      },
      component: "C",
      request: makeRequest(),
    });
    expect(r.metadata.scrollProps).toEqual({
      users: { pageName: "page", previousPage: 1, nextPage: 3, currentPage: 2, reset: false },
    });
  });

  it("supports cursor-style string pages and nulls", async () => {
    const r = await resolveProps({
      shared: {},
      props: {
        users: scroll(() => ({ data: [] }), {
          metadata: { pageName: "cursor", previousPage: null, nextPage: "eyJpZCI6MTV9", currentPage: null },
        }),
      },
      component: "C",
      request: makeRequest(),
    });
    expect(r.metadata.scrollProps?.users).toEqual({
      pageName: "cursor",
      previousPage: null,
      nextPage: "eyJpZCI6MTV9",
      currentPage: null,
      reset: false,
    });
  });
});
