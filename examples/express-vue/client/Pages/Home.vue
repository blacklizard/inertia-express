<script setup lang="ts">
defineProps<{
  greeting: string;
  timestamp?: string;
  expensive?: { computed: boolean };
  auth: { user: { name: string } };
}>();
</script>

<template>
  <main>
    <h1>{{ greeting }}</h1>
    <p>User: {{ auth.user.name }}</p>
    <p>Time: {{ timestamp }}</p>
    <p v-if="expensive">Deferred computed: {{ expensive.computed }}</p>
    <p v-else>Loading deferred prop...</p>
  </main>
</template>
