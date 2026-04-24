<script setup lang="ts">
interface Props {
  tone?: "run" | "sub" | "attn" | "err" | "ok" | "fg-3";
  breathing?: boolean;
  size?: number;
}
const props = withDefaults(defineProps<Props>(), {
  tone: "run",
  breathing: true,
  size: 6,
});

const bg: Record<NonNullable<Props["tone"]>, string> = {
  run: "bg-run",
  sub: "bg-sub",
  attn: "bg-attn",
  err: "bg-err",
  ok: "bg-ok",
  "fg-3": "bg-fg-3",
};
</script>

<template>
  <span
    :class="[
      'inline-block rounded-full align-middle',
      bg[props.tone],
      props.breathing ? 'animate-breathe' : '',
    ]"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    aria-hidden="true"
  />
</template>
