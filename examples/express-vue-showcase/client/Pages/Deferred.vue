<script setup lang="ts">
import { Deferred } from "@inertiajs/vue3";
import Layout from "../Layout.vue";

defineOptions({ layout: Layout });

defineProps<{
  summary: string;
  revenue?: { total: number; currency: string };
  visitors?: { unique: number };
  activity?: string[];
}>();
</script>

<template>
  <div>
    <h1>Deferred props</h1>
    <div class="card">
      <strong>Immediate</strong> — {{ summary }}
    </div>

    <p>
      Deferred props are omitted from the initial response. The client receives
      the key list in <code>deferredProps</code> and fetches each group in one
      follow-up partial reload after mount.
    </p>

    <Deferred :data="['revenue', 'visitors']">
      <template #fallback>
        <div class="card"><em>Loading "metrics" group…</em></div>
      </template>
      <div class="card">
        <strong>metrics group</strong>
        <div>Revenue: {{ revenue?.total }} {{ revenue?.currency }}</div>
        <div>Visitors: {{ visitors?.unique }}</div>
      </div>
    </Deferred>

    <Deferred data="activity">
      <template #fallback>
        <div class="card"><em>Loading "activity" group…</em></div>
      </template>
      <div class="card">
        <strong>activity group</strong>
        <ul>
          <li v-for="(line, i) in activity" :key="i">{{ line }}</li>
        </ul>
      </div>
    </Deferred>
  </div>
</template>
