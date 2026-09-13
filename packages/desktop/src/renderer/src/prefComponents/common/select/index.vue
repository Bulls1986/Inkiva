<template>
  <section
    class="pref-select-item"
    :class="{ 'ag-underdevelop': disable }"
  >
    <div
      v-if="description"
      class="description"
      style="display: flex; align-items: center"
    >
      <span>{{ description }}:</span>
      <LinkIcon
        v-if="more"
        :size="14"
        class="link-icon"
        @click="handleMoreClick"
      />
    </div>
    <el-select
      v-model="selectValue"
      :disabled="disable"
      @change="select"
    >
      <el-option
        v-for="item in options"
        :key="item.value"
        :label="item.label"
        :value="item.value"
      />
    </el-select>
    <div
      v-if="notes"
      class="notes"
    >
      {{ notes }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import LinkIcon from '@/components/icons/LinkIcon.vue'
import type { PrefControlBaseProps, PrefSelectOption } from '../types'

type SelectValue = string | number | boolean

interface SelectProps extends PrefControlBaseProps {
  notes?: string
  value: SelectValue
  options: ReadonlyArray<PrefSelectOption<SelectValue>>
  onChange: (value: SelectValue) => void
}

const props = withDefaults(defineProps<SelectProps>(), {
  description: '',
  notes: '',
  more: '',
  disable: false
})

const selectValue = ref<SelectValue>(props.value)

watch(
  () => props.value,
  (value, oldValue) => {
    if (value !== oldValue) {
      selectValue.value = value
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

const select = (value: SelectValue) => {
  props.onChange(value)
}
</script>

<style>
.pref-select-item {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  & .el-select {
    width: 100%;
  }
  & div {
    background: transparent;
    color: var(--text-secondary);
    border-color: var(--border-default);
  }
  & input.el-input__inner {
    height: 30px;
    background: transparent;
    color: var(--text-primary);
    border-color: var(--border-default);
  }
  & .el-input__icon,
  & .el-input__inner {
    line-height: 30px;
  }
}
.pref-select-item .description {
  margin-bottom: 10px;
  & svg {
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.7;
    color: var(--icon-secondary);
  }
  & svg:hover {
    color: var(--color-accent);
  }
}
li.el-select-dropdown__item {
  color: var(--text-secondary);
  height: 30px;
}
li.el-select-dropdown__item.hover,
li.el-select-dropdown__item:hover {
  background: var(--surface-hover);
}
li.el-select-dropdown__item.selected,
li.el-select-dropdown__item.is-selected {
  color: var(--color-accent);
  background: var(--surface-selected);
}
div.el-select-dropdown {
  background: var(--surface-elevated);
  border-color: var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevation-floating);
  & .popper__arrow {
    display: none;
  }
}
.el-select__wrapper.is-focused {
  box-shadow: 0 0 0 1px var(--border-focus) inset;
}
</style>
