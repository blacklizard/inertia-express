<script setup lang="ts">
import { Link, usePage } from "@inertiajs/vue3";
import { CheckCircle2, Zap } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "./components/ui/badge";

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

const currentPath = computed(() => page.url.split("?")[0]);
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <header class="border-b border-border">
      <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-6 py-4">
        <div class="flex items-center gap-2 font-semibold">
          <Zap class="size-5 text-primary" />
          <span>Inertia v3 Showcase</span>
        </div>
        <nav class="flex flex-1 flex-wrap gap-1">
          <Link
            v-for="l in links"
            :key="l.href"
            :href="l.href"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="
              currentPath === l.href
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            "
          >
            {{ l.label }}
          </Link>
        </nav>
        <Badge v-if="userName" variant="secondary">{{ userName }}</Badge>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-6 py-8">
      <div
        v-if="flash?.success"
        class="mb-6 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm"
      >
        <CheckCircle2 class="size-4 shrink-0 text-primary" />
        <span>{{ flash.success }}</span>
      </div>

      <slot />
    </main>
  </div>
</template>
