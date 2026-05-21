<script setup lang="ts">
import { router } from "@inertiajs/vue3";
import { Plus, RotateCcw } from "@lucide/vue";
import Layout from "../Layout.vue";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

const props = defineProps<{
  page: number;
  items: Array<{ id: number; label: string }>;
  settings: { display: { density: string } };
}>();

// merge() props are appended on partial reloads. Fetch the next page and the
// client concatenates the new rows onto the existing `items`.
function loadMore() {
  router.get("/merge", { page: props.page + 1 }, { only: ["items", "page"], preserveScroll: true });
}

// `reset` sends X-Inertia-Reset — the server drops `items` from mergeProps so
// the client replaces the list instead of appending.
function reset() {
  router.get("/merge", { page: 1 }, { reset: ["items"], preserveScroll: true });
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold tracking-tight">Merge props</h1>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Badge variant="outline">deepMerge()</Badge>
          <code class="text-sm font-normal text-muted-foreground">settings.display.density</code>
        </CardTitle>
        <CardDescription>Recursively merged into the existing prop.</CardDescription>
      </CardHeader>
      <CardContent class="font-mono text-sm">{{ settings.display.density }}</CardContent>
    </Card>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Badge variant="outline">merge()</Badge>
          paginated list
        </CardTitle>
        <CardDescription>Loaded up to page {{ page }}.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="space-y-1 text-sm">
          <li
            v-for="item in items"
            :key="item.id"
            class="rounded-md bg-muted/50 px-3 py-1.5 font-mono"
          >
            {{ item.label }}
          </li>
        </ul>
      </CardContent>
    </Card>

    <div class="flex flex-wrap gap-2">
      <Button @click="loadMore">
        <Plus class="size-4" />
        Load more (append via merge)
      </Button>
      <Button variant="outline" @click="reset">
        <RotateCcw class="size-4" />
        Reset (X-Inertia-Reset)
      </Button>
    </div>
  </div>
</template>
