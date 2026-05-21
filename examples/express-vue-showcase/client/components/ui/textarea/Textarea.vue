<script setup lang="ts">
import { cn } from "../../../lib/utils";

defineProps<{ class?: string }>();

const modelValue = defineModel<string | number>({ default: "" });
</script>

<template>
  <textarea
    v-model="modelValue"
    :class="
      cn(
        'border-input bg-transparent flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        $props.class,
      )
    "
  />
</template>
