<script setup lang="ts">
defineProps<{
  team: string[];
  auth: { user: { name: string } };
}>();
</script>

<template>
  <main>
    <h1>About</h1>
    <p>Logged in as: {{ auth.user.name }}</p>
    <ul>
      <li v-for="member in team" :key="member">{{ member }}</li>
    </ul>
    <p><a href="/">Home</a></p>
  </main>
</template>
