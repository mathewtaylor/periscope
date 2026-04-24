<script setup lang="ts" generic="T extends string">
interface Props {
  modelValue: T;
  options: readonly { label: string; value: T }[];
  mono?: boolean;
}
const props = withDefaults(defineProps<Props>(), { mono: false });
const emit = defineEmits<{ "update:modelValue": [value: T] }>();
</script>

<template>
  <div
    :class="[
      'flex rounded-chip border border-line overflow-hidden text-[12px]',
      props.mono ? 'font-mono' : '',
    ]"
  >
    <button
      v-for="opt in props.options"
      :key="opt.value"
      type="button"
      :class="[
        'px-2.5 py-1 transition-colors duration-150',
        opt.value === props.modelValue
          ? 'bg-bg-2 text-fg'
          : 'text-fg-2 hover:text-fg-1',
      ]"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
