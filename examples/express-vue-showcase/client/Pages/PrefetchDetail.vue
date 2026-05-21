<script setup lang="ts">
import { Link } from "@inertiajs/vue3";
import Layout from "../Layout.vue";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

defineProps<{
  fetchedAt: string;
  quote: string;
}>();
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold tracking-tight">Slow detail page</h1>
    <p class="text-sm text-muted-foreground">
      This route waits 600&nbsp;ms server-side before responding. If you reached
      it via a prefetched link the wait happened ahead of time, so the visit
      felt instant.
    </p>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="text-base">Server response</CardTitle>
      </CardHeader>
      <CardContent class="space-y-1 text-sm">
        <div>Fetched at: <span class="font-mono">{{ fetchedAt }}</span></div>
        <div class="italic">"{{ quote }}"</div>
      </CardContent>
    </Card>

    <Link href="/prefetch" class="text-sm font-medium text-primary hover:underline">
      ← Back to prefetch demo
    </Link>
  </div>
</template>
