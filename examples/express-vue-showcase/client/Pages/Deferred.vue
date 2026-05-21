<script setup lang="ts">
import { Deferred } from "@inertiajs/vue3";
import { Loader2 } from "@lucide/vue";
import Layout from "../Layout.vue";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

defineProps<{
  summary: string;
  revenue?: { total: number; currency: string };
  visitors?: { unique: number };
  activity?: string[];
}>();
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold tracking-tight">Deferred props</h1>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="text-base">Immediate</CardTitle>
      </CardHeader>
      <CardContent class="text-sm text-muted-foreground">{{ summary }}</CardContent>
    </Card>

    <p class="text-sm text-muted-foreground">
      Deferred props are omitted from the initial response. The client receives
      the key list in
      <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">deferredProps</code>
      and fetches each group in one follow-up partial reload after mount.
    </p>

    <Deferred :data="['revenue', 'visitors']">
      <template #fallback>
        <Card class="gap-2 py-4">
          <CardContent class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" />
            Loading "metrics" group…
          </CardContent>
        </Card>
      </template>
      <Card class="gap-2 py-4">
        <CardHeader>
          <CardTitle class="text-base">metrics group</CardTitle>
        </CardHeader>
        <CardContent class="space-y-1 text-sm">
          <div>Revenue: <span class="font-mono">{{ revenue?.total }} {{ revenue?.currency }}</span></div>
          <div>Visitors: <span class="font-mono">{{ visitors?.unique }}</span></div>
        </CardContent>
      </Card>
    </Deferred>

    <Deferred data="activity">
      <template #fallback>
        <Card class="gap-2 py-4">
          <CardContent class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" />
            Loading "activity" group…
          </CardContent>
        </Card>
      </template>
      <Card class="gap-2 py-4">
        <CardHeader>
          <CardTitle class="text-base">activity group</CardTitle>
        </CardHeader>
        <CardContent>
          <ul class="space-y-1 text-sm">
            <li v-for="(line, i) in activity" :key="i" class="text-muted-foreground">
              {{ line }}
            </li>
          </ul>
        </CardContent>
      </Card>
    </Deferred>
  </div>
</template>
