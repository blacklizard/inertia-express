<script setup lang="ts">
import { Primitive } from "reka-ui";
import { cn } from "../../../lib/utils";
import { type ButtonVariants, buttonVariants } from "./index";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants["variant"];
    size?: ButtonVariants["size"];
    as?: string | object;
    asChild?: boolean;
    class?: string;
  }>(),
  { as: "button" },
);
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
