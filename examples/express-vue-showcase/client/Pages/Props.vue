<script setup lang="ts">
import { router } from "@inertiajs/vue3";
import Layout from "../Layout.vue";

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
  <div>
    <h1>Props</h1>

    <div class="card">
      <strong>Plain</strong> — <code>serverTime</code>: {{ serverTime }}
      <p>Evaluated at render time, always sent.</p>
    </div>

    <div class="card">
      <strong>lazy()</strong> — <code>quote</code>: "{{ quote }}"
      <p>Evaluated every visit (full or partial) when included.</p>
    </div>

    <div class="card">
      <strong>always()</strong> — <code>liveTick</code>: {{ liveTick }}
      <p>Always sent, even on a partial reload that does not name it.</p>
    </div>

    <div class="card">
      <strong>optional()</strong> — <code>heavyStats</code>:
      <span v-if="heavyStats">{{ heavyStats.rows }} rows @ {{ heavyStats.computedAt }}</span>
      <em v-else>not loaded</em>
      <p>Omitted on the initial visit; fetched only when requested.</p>
    </div>

    <p>
      <button @click="reloadQuote">Partial reload: only "quote"</button>
      <button class="secondary" @click="loadStats">Load optional "heavyStats"</button>
    </p>
  </div>
</template>
