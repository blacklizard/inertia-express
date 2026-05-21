<script setup lang="ts">
import { WhenVisible } from "@inertiajs/vue3";
import { Loader2 } from "@lucide/vue";
import Layout from "../Layout.vue";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

defineProps<{
  intro: string;
  details?: {
    loadedAt: string;
    rows: { id: number; label: string }[];
  };
}>();
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">WhenVisible</h1>
      <p class="text-sm text-muted-foreground">{{ intro }}</p>
      <p class="text-sm text-muted-foreground">
        The <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">details</code>
        prop is declared with the adapter's
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">optional()</code>
        helper, so it is absent on the initial visit. The
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">&lt;WhenVisible&gt;</code>
        component fires a partial reload for it the moment it scrolls into view.
      </p>
    </div>

    <!-- Tall spacer so the WhenVisible block starts below the fold. -->
    <div
      class="flex h-[80vh] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
    >
      ↓ Keep scrolling ↓
    </div>

    <WhenVisible :data="['details']">
      <template #fallback>
        <Card class="gap-2 py-4">
          <CardContent class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" />
            Loading "details" — triggered by scrolling into view…
          </CardContent>
        </Card>
      </template>
      <Card class="gap-2 py-4">
        <CardHeader>
          <CardTitle class="text-base">Lazily-loaded panel</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2 text-sm">
          <div class="text-muted-foreground">
            Loaded at <span class="font-mono">{{ details?.loadedAt }}</span>
          </div>
          <ul class="space-y-1">
            <li v-for="row in details?.rows" :key="row.id" class="font-mono">
              {{ row.label }}
            </li>
          </ul>
        </CardContent>
      </Card>
    </WhenVisible>
  </div>
</template>
