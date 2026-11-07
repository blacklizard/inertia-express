import { describe, expect, it } from "vitest";
import { unpackDotProps } from "../../src/core/dot-props.js";
import { optional } from "../../src/core/props.js";

describe("unpackDotProps", () => {
  it("merges a dotted key into an existing nested object", async () => {
    expect(
      await unpackDotProps({ auth: { user: { name: "J" } }, "auth.user.can.createGroup": false }),
    ).toEqual({ auth: { user: { name: "J", can: { createGroup: false } } } });
  });

  it("calls a closure parent so the path is traversable", async () => {
    expect(await unpackDotProps({ auth: () => ({ user: "J" }), "auth.role": "admin" })).toEqual({
      auth: { user: "J", role: "admin" },
    });
  });

  it("awaits an async closure parent and an async dotted value", async () => {
    expect(
      await unpackDotProps({ auth: async () => ({ user: "J" }), "auth.role": async () => "admin" }),
    ).toEqual({ auth: { user: "J", role: "admin" } });
  });

  it("creates the nested path when no parent exists", async () => {
    expect(await unpackDotProps({ "a.b.c": 1 })).toEqual({ a: { b: { c: 1 } } });
  });

  it("overwrites a non-object segment like Arr::set", async () => {
    expect(await unpackDotProps({ a: 5, "a.b": 1 })).toEqual({ a: { b: 1 } });
  });

  it("leaves descriptors at dotted keys for the resolver", async () => {
    const d = optional(() => 1);
    const out = await unpackDotProps({ "a.b": d });
    expect(out.a).toEqual({ b: d });
  });

  it("only unpacks top-level keys and does not mutate the input", async () => {
    const input = { a: { "b.c": 1 }, "x.y": 2 };
    const out = await unpackDotProps(input);
    expect(out).toEqual({ a: { "b.c": 1 }, x: { y: 2 } });
    expect(input).toEqual({ a: { "b.c": 1 }, "x.y": 2 });
  });

  it("returns an equal object when nothing is dotted", async () => {
    expect(await unpackDotProps({ a: 1, b: [1] })).toEqual({ a: 1, b: [1] });
  });
});
