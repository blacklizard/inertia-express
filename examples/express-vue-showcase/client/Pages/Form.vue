<script setup lang="ts">
import { useForm } from "@inertiajs/vue3";
import { Loader2 } from "@lucide/vue";
import Layout from "../Layout.vue";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

defineOptions({ layout: Layout });

const form = useForm({
  name: "",
  email: "",
  message: "",
});

// On validation failure the server stashes errors + redirects (303); the
// re-rendered page carries `errors`, which useForm maps onto `form.errors`.
function submit() {
  form.post("/form");
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Form — validation &amp; redirect</h1>
      <p class="text-sm text-muted-foreground">
        Submitting posts to
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">/form</code>.
        Invalid input is rejected with stashed errors and a redirect back here; a
        valid submit redirects to Home with a session flash message.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Contact</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="name">Name</Label>
            <Input id="name" v-model="form.name" />
            <p v-if="form.errors.name" class="text-sm text-destructive">
              {{ form.errors.name }}
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="email">Email</Label>
            <Input id="email" v-model="form.email" />
            <p v-if="form.errors.email" class="text-sm text-destructive">
              {{ form.errors.email }}
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="message">Message</Label>
            <Textarea id="message" v-model="form.message" rows="3" />
            <p v-if="form.errors.message" class="text-sm text-destructive">
              {{ form.errors.message }}
            </p>
          </div>
          <Button type="submit" :disabled="form.processing">
            <Loader2 v-if="form.processing" class="size-4 animate-spin" />
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
