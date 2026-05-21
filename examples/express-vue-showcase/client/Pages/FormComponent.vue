<script setup lang="ts">
import { Form } from "@inertiajs/vue3";
import { Loader2 } from "@lucide/vue";
import Layout from "../Layout.vue";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

defineOptions({ layout: Layout });
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Form component</h1>
      <p class="text-sm text-muted-foreground">
        The v3 <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">&lt;Form&gt;</code>
        component submits a native form via Inertia — no
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">useForm</code>
        state object required. It exposes
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">errors</code>,
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">processing</code>
        and more as slot props. The validation flow mirrors the
        <code class="rounded bg-muted px-1.5 py-0.5 text-foreground">/form</code> page.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Contact</CardTitle>
      </CardHeader>
      <CardContent>
        <Form
          action="/form-component"
          method="post"
          class="space-y-4"
          v-slot="{ errors, processing }"
        >
          <div class="space-y-1.5">
            <Label for="name">Name</Label>
            <Input id="name" name="name" />
            <p v-if="errors.name" class="text-sm text-destructive">
              {{ errors.name }}
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="email">Email</Label>
            <Input id="email" name="email" />
            <p v-if="errors.email" class="text-sm text-destructive">
              {{ errors.email }}
            </p>
          </div>
          <div class="space-y-1.5">
            <Label for="message">Message</Label>
            <Textarea id="message" name="message" rows="3" />
            <p v-if="errors.message" class="text-sm text-destructive">
              {{ errors.message }}
            </p>
          </div>
          <Button type="submit" :disabled="processing">
            <Loader2 v-if="processing" class="size-4 animate-spin" />
            Send
          </Button>
        </Form>
      </CardContent>
    </Card>
  </div>
</template>
