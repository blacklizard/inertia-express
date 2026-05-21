<script setup lang="ts">
import { useForm } from "@inertiajs/vue3";
import Layout from "../Layout.vue";

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
  <div>
    <h1>Form — validation & redirect</h1>
    <p>
      Submitting posts to <code>/form</code>. Invalid input is rejected with
      stashed errors and a redirect back here; a valid submit redirects to
      Home with a session flash message.
    </p>

    <form class="card" @submit.prevent="submit">
      <div class="field">
        <label for="name">Name</label>
        <input id="name" v-model="form.name" />
        <span v-if="form.errors.name" class="error">{{ form.errors.name }}</span>
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="form.email" />
        <span v-if="form.errors.email" class="error">{{ form.errors.email }}</span>
      </div>
      <div class="field">
        <label for="message">Message</label>
        <textarea id="message" v-model="form.message" rows="3"></textarea>
        <span v-if="form.errors.message" class="error">{{ form.errors.message }}</span>
      </div>
      <button type="submit" :disabled="form.processing">Send</button>
    </form>
  </div>
</template>
