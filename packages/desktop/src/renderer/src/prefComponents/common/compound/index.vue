<template>
  <section class="pref-compound-item">
    <div class="pref-compound-head">
      <slot name="head" />
    </div>
    <div class="pref-compound-body">
      <slot name="children" />
    </div>
    <div
      v-if="notes"
      class="notes"
    >
      {{ notes }}
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  notes?: string
}>()
</script>

<style>
.pref-compound-item {
  font-size: 14px;
  user-select: none;
  margin: 0;
  margin-bottom: var(--space-8);
  color: var(--text-primary);

  & .pref-compound-head h6.title {
    padding-bottom: 8px;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.4;
  }

  & .pref-compound-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: 0;
    margin-top: 0;
  }

  & .description {
    margin-bottom: 0;
    color: var(--text-secondary);
    & i {
      cursor: pointer;
      opacity: 0.7;
      color: var(--icon-secondary);
    }
    & i:hover {
      color: var(--color-accent);
    }
  }
}
</style>
