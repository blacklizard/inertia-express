<script setup lang="ts">
import { cn } from "../../../lib/utils";

const props = defineProps<{ class?: string }>();
</script>

<template>
  <div
    :class="
      cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
