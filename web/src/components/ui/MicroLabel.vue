<script setup lang="ts">
interface Props {
  tone?: "default" | "attn" | "sub" | "run" | "err";
}
const props = withDefaults(defineProps<Props>(), { tone: "default" });

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-fg-3",
  attn: "text-attn",
  sub: "text-sub",
  run: "text-run",
  err: "text-err",
};
</script>

<template>
  <span
    :class="[
      'font-mono uppercase tracking-[0.12em] text-[11px] leading-none',
      toneClass[props.tone],
    ]"
  >
    <slot />
  </span>
</template>
