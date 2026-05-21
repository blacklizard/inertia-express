<script setup lang="ts">
import { usePoll } from "@inertiajs/vue3";
import { Pause, Play } from "@lucide/vue";
import { ref } from "vue";
import Layout from "../Layout.vue";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

defineOptions({ layout: Layout });

defineProps<{
  serverTime: string;
  tick: number;
}>();

// usePoll issues a partial reload every 2s. It returns start/stop handles so
// the polling can be paused without unmounting the page.
const { start, stop } = usePoll(2000);
const polling = ref(true);

function togglePoll() {
  if (polling.value) {
    stop();
  } else {
    start();
  }
  polling.value = !polling.value;
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Polling</h1>
      <p class="text-sm text-muted-foreground">
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">usePoll(2000)</code>
        re-fetches this page every 2&nbsp;seconds as a partial reload. The values
        below update on each tick without a full navigation.
      </p>
    </div>

    <Card class="gap-2 py-4">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          Live server value
          <Badge :variant="polling ? 'default' : 'secondary'">
            {{ polling ? "polling" : "paused" }}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-1 text-sm">
        <div>Server time: <span class="font-mono">{{ serverTime }}</span></div>
        <div>Tick: <span class="font-mono">{{ tick }}</span></div>
      </CardContent>
    </Card>

    <Button variant="outline" @click="togglePoll">
      <component :is="polling ? Pause : Play" class="size-4" />
      {{ polling ? "Stop polling" : "Start polling" }}
    </Button>
  </div>
</template>
