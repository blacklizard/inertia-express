<script setup lang="ts">
import { Link } from "@inertiajs/vue3";
import Layout from "../Layout.vue";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

// Each link targets /prefetch/detail, a route with an artificial 600ms delay.
// `prefetch` makes the client fetch that response ahead of the click so the
// visit resolves from cache; `cacheFor` keeps the cached response reusable.
const variants = [
  {
    mode: "hover",
    title: 'prefetch="hover"',
    blurb: "Fetched when the pointer hovers the link (after a short delay).",
  },
  {
    mode: "mount",
    title: 'prefetch="mount"',
    blurb: "Fetched as soon as the link mounts — ready before any interaction.",
  },
] as const;
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Link prefetching</h1>
      <p class="text-sm text-muted-foreground">
        Prefetching fetches a page's response <em>before</em> the user visits it,
        then serves the visit from an in-memory cache. The detail route below is
        deliberately slowed by 600&nbsp;ms — without prefetch you feel that wait
        on click, with it the visit is instant.
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Card v-for="v in variants" :key="v.mode" class="gap-2 py-4">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-base">
            <Badge variant="outline">{{ v.title }}</Badge>
          </CardTitle>
          <CardDescription>{{ v.blurb }}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            :href="`/prefetch/detail?via=${v.mode}`"
            :prefetch="v.mode"
            class="text-sm font-medium text-primary hover:underline"
          >
            Open slow detail page →
          </Link>
        </CardContent>
      </Card>
    </div>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Badge variant="outline">:cache-for</Badge>
        </CardTitle>
        <CardDescription>
          Prefetch on hover, but keep the cached response reusable for 30&nbsp;s
          so repeat visits within that window skip the network entirely.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/prefetch/detail?via=cache-for"
          prefetch="hover"
          cache-for="30s"
          class="text-sm font-medium text-primary hover:underline"
        >
          Open slow detail page (cached 30s) →
        </Link>
      </CardContent>
    </Card>
  </div>
</template>
