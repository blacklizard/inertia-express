<script setup lang="ts">
import { Head } from "@inertiajs/vue3";
import Layout from "../Layout.vue";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });
</script>

<template>
  <Head title="Head demo — Inertia v3 Showcase">
    <meta name="description" content="Per-page document head management with the Inertia <Head> component." />
    <meta property="og:title" content="Inertia v3 Showcase — Head" />
  </Head>

  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Head management</h1>
      <p class="text-sm text-muted-foreground">
        The <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">&lt;Head&gt;</code>
        component sets the document title and meta tags for this page. Check the
        browser tab — its title is now
        <em>"Head demo — Inertia v3 Showcase"</em> instead of the default.
      </p>
    </div>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="text-base">Tags managed on this page</CardTitle>
      </CardHeader>
      <CardContent class="space-y-1 font-mono text-sm">
        <div>&lt;title&gt;Head demo — Inertia v3 Showcase&lt;/title&gt;</div>
        <div>&lt;meta name="description" …&gt;</div>
        <div>&lt;meta property="og:title" …&gt;</div>
      </CardContent>
    </Card>

    <p class="text-sm text-muted-foreground">
      Because the showcase server renders pages with SSR, this head markup is
      present in the very first HTML response — view source to confirm. On
      client-side navigation away from this page the tags are removed again.
    </p>
  </div>
</template>
