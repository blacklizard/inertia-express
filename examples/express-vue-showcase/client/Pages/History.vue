<script setup lang="ts">
import { Link, usePage } from "@inertiajs/vue3";
import { Check, X } from "@lucide/vue";
import { computed } from "vue";
import Layout from "../Layout.vue";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

defineProps<{ note: string }>();

// clearHistory / encryptHistory are page-object flags, siblings of `props`.
const page = usePage();
const clearHistory = computed(() => page.clearHistory);
const encryptHistory = computed(() => page.encryptHistory);

const variants = [
  { href: "/history", label: "Plain" },
  { href: "/history?clear=1", label: "clearHistory" },
  { href: "/history?encrypt=1", label: "encryptHistory" },
  { href: "/history?clear=1&encrypt=1", label: "both" },
];
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold tracking-tight">History flags</h1>
    <p class="text-sm text-muted-foreground">{{ note }}</p>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="text-base">Current page object</CardTitle>
      </CardHeader>
      <CardContent class="space-y-2 text-sm">
        <div class="flex items-center gap-2">
          <Check v-if="clearHistory" class="size-4 text-primary" />
          <X v-else class="size-4 text-muted-foreground" />
          <code class="text-muted-foreground">clearHistory</code>
          <span class="font-mono">{{ clearHistory }}</span>
        </div>
        <div class="flex items-center gap-2">
          <Check v-if="encryptHistory" class="size-4 text-primary" />
          <X v-else class="size-4 text-muted-foreground" />
          <code class="text-muted-foreground">encryptHistory</code>
          <span class="font-mono">{{ encryptHistory }}</span>
        </div>
      </CardContent>
    </Card>

    <div class="flex flex-wrap gap-2">
      <Button
        v-for="v in variants"
        :key="v.href"
        as-child
        variant="outline"
        size="sm"
      >
        <Link :href="v.href">{{ v.label }}</Link>
      </Button>
    </div>

    <p class="text-sm text-muted-foreground">
      <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">clearHistory</code>
      tells the client to wipe encrypted history state on this visit;
      <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">encryptHistory</code>
      encrypts the state stored for this page. Both are set per-response via
      <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">res.inertia(component, props, options)</code>.
    </p>
  </div>
</template>
