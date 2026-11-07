/**
 * Compile-time probe for the narrowed constructor types. Each `@ts-expect-error`
 * line must fail to compile; the rest must compile. Checked by `pnpm typecheck`
 * (tests are in the package tsconfig), never executed.
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

export {};
