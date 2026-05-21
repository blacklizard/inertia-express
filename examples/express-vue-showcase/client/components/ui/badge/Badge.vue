<script setup lang="ts">
import { Primitive } from "reka-ui";
import { cn } from "../../../lib/utils";
import { type BadgeVariants, badgeVariants } from "./index";

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariants["variant"];
    as?: string | object;
    asChild?: boolean;
    class?: string;
  }>(),
  { as: "span" },
);
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(badgeVariants({ variant }), props.class)"
  >
    <slot />
  </Primitive>
</template>
