<script setup lang="ts">
defineProps<{
  greeting: string;
  auth: { user: { name: string } };
}>();
</script>

<template>
  <main>
    <h1>{{ greeting }}</h1>
    <p>User: {{ auth.user.name }}</p>
    <p><a href="/about">About</a></p>
  </main>
</template>
