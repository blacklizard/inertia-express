<script setup lang="ts">
import { Label, type LabelProps } from "reka-ui";
import { cn } from "../../../lib/utils";

const props = defineProps<LabelProps & { class?: string }>();
</script>

<template>
  <Label
    :for="props.for"
    :class="
      cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>
