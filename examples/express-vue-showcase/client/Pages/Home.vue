<script setup lang="ts">
import { Link } from "@inertiajs/vue3";
import Layout from "../Layout.vue";

defineOptions({ layout: Layout });

const demos = [
  { href: "/props", title: "Props", blurb: "lazy(), optional(), always() and partial reloads." },
  { href: "/deferred", title: "Deferred", blurb: "defer() props loaded automatically after mount." },
  { href: "/merge", title: "Merge", blurb: "merge() pagination, deepMerge(), X-Inertia-Reset." },
  { href: "/history", title: "History", blurb: "clearHistory / encryptHistory page flags." },
  { href: "/form", title: "Form", blurb: "useForm POST, validation errors, 303 redirect, flash." },
];
</script>

<template>
  <div>
    <h1>Inertia.js v3 — Express adapter showcase</h1>
    <p>
      Each page exercises one feature of
      <code>@blacklizard/inertia-express</code>. The first paint is
      server-rendered in-process; navigation is a SPA.
    </p>
    <Link v-for="d in demos" :key="d.href" :href="d.href" class="card" style="display: block; text-decoration: none; color: inherit">
      <strong>{{ d.title }}</strong>
      <div>{{ d.blurb }}</div>
    </Link>
  </div>
</template>
