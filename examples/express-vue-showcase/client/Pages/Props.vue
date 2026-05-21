<script setup lang="ts">
import { router } from "@inertiajs/vue3";
import Layout from "../Layout.vue";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

defineProps<{
  serverTime: string;
  quote: string;
  liveTick: number;
  heavyStats?: { rows: number; computedAt: string };
}>();

// Partial reload — refetch only the named props. `quote` (lazy) and
// `liveTick` (always) change; `heavyStats` is left untouched.
function reloadQuote() {
  router.reload({ only: ["quote"] });
}

// Optional props are omitted until a partial reload explicitly requests them.
function loadStats() {
  router.reload({ only: ["heavyStats"] });
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold tracking-tight">Props</h1>

    <div class="grid gap-3 sm:grid-cols-2">
      <Card class="gap-3 py-4">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Badge variant="outline">Plain</Badge>
            <code class="text-sm font-normal text-muted-foreground">serverTime</code>
          </CardTitle>
          <CardDescription>Evaluated at render time, always sent.</CardDescription>
        </CardHeader>
        <CardContent class="font-mono text-sm">{{ serverTime }}</CardContent>
      </Card>

      <Card class="gap-3 py-4">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Badge variant="outline">lazy()</Badge>
            <code class="text-sm font-normal text-muted-foreground">quote</code>
          </CardTitle>
          <CardDescription>Evaluated every visit (full or partial) when included.</CardDescription>
        </CardHeader>
        <CardContent class="text-sm italic">"{{ quote }}"</CardContent>
      </Card>

      <Card class="gap-3 py-4">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Badge variant="outline">always()</Badge>
            <code class="text-sm font-normal text-muted-foreground">liveTick</code>
          </CardTitle>
          <CardDescription>Always sent, even on a partial reload that does not name it.</CardDescription>
        </CardHeader>
        <CardContent class="font-mono text-sm">{{ liveTick }}</CardContent>
      </Card>

      <Card class="gap-3 py-4">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Badge variant="outline">optional()</Badge>
            <code class="text-sm font-normal text-muted-foreground">heavyStats</code>
          </CardTitle>
          <CardDescription>Omitted on the initial visit; fetched only when requested.</CardDescription>
        </CardHeader>
        <CardContent class="text-sm">
          <span v-if="heavyStats" class="font-mono">
            {{ heavyStats.rows }} rows @ {{ heavyStats.computedAt }}
          </span>
          <span v-else class="text-muted-foreground italic">not loaded</span>
        </CardContent>
      </Card>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button @click="reloadQuote">Partial reload: only "quote"</Button>
      <Button variant="outline" @click="loadStats">Load optional "heavyStats"</Button>
    </div>
  </div>
</template>
