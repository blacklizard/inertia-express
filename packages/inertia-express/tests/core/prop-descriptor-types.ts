/**
 * Compile-time probe for the narrowed constructor types. Each `@ts-expect-error`
 * line must fail to compile; the rest must compile. Checked by `pnpm typecheck`
 * through tsconfig.tests.json, never executed.
 */
import { always, defer, merge, once, optional, scroll } from "../../src/core/props.js";

const meta = { pageName: "page", previousPage: null, nextPage: 2, currentPage: 1 };

optional(() => 1).once().as("k").until(60).fresh();
// @ts-expect-error optional props never merge
optional(() => 1).merge();
// @ts-expect-error narrowing survives the first chain call
optional(() => 1).once().merge();

defer(() => 1).merge().append("d").matchOn("id").once().rescue();
// @ts-expect-error defer props have no scroll wrapper
defer(() => 1).defer();
// @ts-expect-error narrowing survives the first chain call
defer(() => 1).append("d").defer();

merge([1]).deepMerge().prepend("d", "id").once().as("k");
// @ts-expect-error merge props never defer
merge([1]).defer();
// @ts-expect-error narrowing survives the first chain call
merge([1]).append("d").rescue();

once(() => 1).as("k").until(new Date()).fresh(false);
// @ts-expect-error once props never merge
once(() => 1).merge();
// @ts-expect-error narrowing survives the first chain call
once(() => 1).as("x").merge();

scroll(() => ({ data: [] }), { metadata: meta }).defer("g").matchOn("id");
// @ts-expect-error scroll merge direction comes from the request, never the user
scroll(() => ({ data: [] }), { metadata: meta }).prepend();
// @ts-expect-error narrowing survives the first chain call
scroll(() => ({ data: [] }), { metadata: meta }).defer().append("d");

// @ts-expect-error always props have no chain in this plan
always(1).merge();

// Depth-two rejections per kind: every method a kind must not expose, reached
// through each of its own chain methods.
// @ts-expect-error
optional(() => 1).as("k").deepMerge();
// @ts-expect-error
optional(() => 1).until(1).append("d");
// @ts-expect-error
optional(() => 1).fresh().prepend("d");
// @ts-expect-error
optional(() => 1).once().matchOn("id");
// @ts-expect-error
optional(() => 1).as("k").defer();
// @ts-expect-error
optional(() => 1).until(1).rescue();

// @ts-expect-error
merge([1]).deepMerge().merge();
// @ts-expect-error
merge([1]).matchOn("id").defer();
// @ts-expect-error
merge([1]).prepend("d").rescue();
// @ts-expect-error
merge([1]).once().defer();
// @ts-expect-error
merge([1]).as("k").merge();
// @ts-expect-error
merge([1]).until(1).rescue();
// @ts-expect-error
merge([1]).fresh().defer();

// @ts-expect-error
once(() => 1).until(1).once();
// @ts-expect-error
once(() => 1).fresh().deepMerge();
// @ts-expect-error
once(() => 1).as("k").append("d");
// @ts-expect-error
once(() => 1).until(1).prepend("d");
// @ts-expect-error
once(() => 1).fresh().matchOn("id");
// @ts-expect-error
once(() => 1).as("k").defer();
// @ts-expect-error
once(() => 1).until(1).rescue();

// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).matchOn("id").merge();
// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).defer().deepMerge();
// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).matchOn("id").prepend();
// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).defer().once();
// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).matchOn("id").as("k");
// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).defer().until(1);
// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).matchOn("id").fresh();
// @ts-expect-error
scroll(() => ({ data: [] }), { metadata: meta }).defer().rescue();

// @ts-expect-error
defer(() => 1).rescue().defer();
// @ts-expect-error
defer(() => 1).once().defer();

export {};
