<script setup lang="ts">
import { Link } from "@inertiajs/vue3";
import { ArrowRight } from "@lucide/vue";
import Layout from "../Layout.vue";
import { Card, CardContent, CardDescription, CardTitle } from "../components/ui/card";

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
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">
        Inertia.js v3 — Express adapter showcase
      </h1>
      <p class="text-muted-foreground">
        Each page exercises one feature of
        <code class="rounded bg-muted px-1.5 py-0.5 text-sm">@blacklizard/inertia-express</code>.
        The first paint is server-rendered in-process; navigation is a SPA.
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Link v-for="d in demos" :key="d.href" :href="d.href" class="group block">
        <Card class="h-full gap-2 py-4 transition-colors hover:border-primary/50">
          <CardContent class="space-y-1">
            <CardTitle class="flex items-center justify-between">
              {{ d.title }}
              <ArrowRight
                class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </CardTitle>
            <CardDescription>{{ d.blurb }}</CardDescription>
          </CardContent>
        </Card>
      </Link>
    </div>
  </div>
</template>
