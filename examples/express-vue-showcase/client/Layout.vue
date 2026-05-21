<script setup lang="ts">
import { Link, usePage } from "@inertiajs/vue3";
import { computed } from "vue";

const page = usePage();
const flash = computed(() => page.props.flash as { success?: string } | null);
const userName = computed(
  () => (page.props.auth as { user?: { name?: string } } | undefined)?.user?.name,
);

const links = [
  { href: "/", label: "Home" },
  { href: "/props", label: "Props" },
  { href: "/deferred", label: "Deferred" },
  { href: "/merge", label: "Merge" },
  { href: "/history", label: "History" },
  { href: "/form", label: "Form" },
];
</script>

<template>
  <div class="page">
    <header>
      <strong>Inertia v3 Showcase</strong>
      <nav>
        <Link v-for="l in links" :key="l.href" :href="l.href" class="nav-link">
          {{ l.label }}
        </Link>
      </nav>
      <span v-if="userName" class="user">{{ userName }}</span>
    </header>

    <p v-if="flash?.success" class="flash">{{ flash.success }}</p>

    <main>
      <slot />
    </main>
  </div>
</template>

<style>
body {
  font-family: ui-sans-serif, system-ui, sans-serif;
  margin: 0;
  background: #f6f7f9;
  color: #1a1a2e;
}
.page {
  max-width: 760px;
  margin: 0 auto;
  padding: 1.5rem;
}
header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e4e8;
}
nav {
  display: flex;
  gap: 0.75rem;
  flex: 1;
}
.nav-link {
  color: #3b5bdb;
  text-decoration: none;
}
.nav-link:hover {
  text-decoration: underline;
}
.user {
  font-size: 0.85rem;
  color: #6b7280;
}
.flash {
  background: #d3f9d8;
  border: 1px solid #8ce99a;
  border-radius: 6px;
  padding: 0.6rem 0.9rem;
  margin: 1rem 0;
}
main {
  margin-top: 1rem;
}
button {
  font: inherit;
  padding: 0.4rem 0.8rem;
  border: 1px solid #3b5bdb;
  background: #3b5bdb;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
}
button.secondary {
  background: #fff;
  color: #3b5bdb;
}
.card {
  background: #fff;
  border: 1px solid #e2e4e8;
  border-radius: 8px;
  padding: 1rem;
  margin: 0.75rem 0;
}
code {
  background: #eef0f3;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}
.field input,
.field textarea {
  font: inherit;
  padding: 0.4rem;
  border: 1px solid #c3c7cf;
  border-radius: 6px;
}
.error {
  color: #e03131;
  font-size: 0.85rem;
}
</style>
