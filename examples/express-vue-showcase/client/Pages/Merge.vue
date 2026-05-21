<script setup lang="ts">
import { router } from "@inertiajs/vue3";
import Layout from "../Layout.vue";

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
  <div>
    <h1>Merge props</h1>

    <div class="card">
      <strong>deepMerge()</strong> — settings.display.density:
      <code>{{ settings.display.density }}</code>
    </div>

    <div class="card">
      <strong>merge() — paginated list</strong> (loaded up to page {{ page }})
      <ul>
        <li v-for="item in items" :key="item.id">{{ item.label }}</li>
      </ul>
    </div>

    <p>
      <button @click="loadMore">Load more (append via merge)</button>
      <button class="secondary" @click="reset">Reset (X-Inertia-Reset)</button>
    </p>
  </div>
</template>
