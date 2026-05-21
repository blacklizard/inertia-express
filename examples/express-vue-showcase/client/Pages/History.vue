<script setup lang="ts">
import { Link, usePage } from "@inertiajs/vue3";
import { computed } from "vue";
import Layout from "../Layout.vue";

defineOptions({ layout: Layout });

defineProps<{ note: string }>();

// clearHistory / encryptHistory are page-object flags, siblings of `props`.
const page = usePage();
const clearHistory = computed(() => page.clearHistory);
const encryptHistory = computed(() => page.encryptHistory);
</script>

<template>
  <div>
    <h1>History flags</h1>
    <p>{{ note }}</p>

    <div class="card">
      Current page object:
      <ul>
        <li><code>clearHistory</code>: {{ clearHistory }}</li>
        <li><code>encryptHistory</code>: {{ encryptHistory }}</li>
      </ul>
    </div>

    <p>
      <Link href="/history" class="nav-link">Plain</Link> ·
      <Link href="/history?clear=1" class="nav-link">clearHistory</Link> ·
      <Link href="/history?encrypt=1" class="nav-link">encryptHistory</Link> ·
      <Link href="/history?clear=1&encrypt=1" class="nav-link">both</Link>
    </p>

    <p>
      <code>clearHistory</code> tells the client to wipe encrypted history
      state on this visit; <code>encryptHistory</code> encrypts the state
      stored for this page. Both are set per-response via
      <code>res.inertia(component, props, options)</code>.
    </p>
  </div>
</template>
