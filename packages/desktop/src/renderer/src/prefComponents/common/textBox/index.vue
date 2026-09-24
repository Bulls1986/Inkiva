<template>
  <section
    class="pref-text-box-item"
    :class="{ 'ag-underdevelop': disable }"
  >
    <div
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
    <el-input
      v-model="inputText"
      class="input"
      :class="{ error: invalidInput }"
      :placeholder="defaultValue"
      size="small"
      clearable
      @input="handleInput"
      @blur="handleBlur"
    />
    <div
      v-if="notes"
      class="notes"
    >
      {{ notes }}
    </div>
    <preference-status
      v-if="!disable"
      :timing="effectTiming"
      :error="mutationError"
      :pending="mutationSaved"
      :on-retry="retry"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import LinkIcon from '@/components/icons/LinkIcon.vue'
import PreferenceStatus from '../preferenceStatus.vue'
import { usePreferenceMutation } from '../usePreferenceMutation'
import type { PrefControlBaseProps, PreferenceChangeHandler } from '../types'

interface TextBoxProps extends PrefControlBaseProps {
  notes?: string
  input: string
  onChange: PreferenceChangeHandler<string>
  defaultValue?: string
  emitTime?: number
  regexValidator?: RegExp
}

const props = withDefaults(defineProps<TextBoxProps>(), {
  description: '',
  notes: '',
  more: '',
  disable: false,
  defaultValue: '',
  emitTime: 800,
  regexValidator: () => /(.*?)/,
  effectTiming: 'immediate'
})

let inputTimer: ReturnType<typeof setTimeout> | null = null
const inputText = ref(props.input)
const invalidInput = ref(false)
const { error: mutationError, saved: mutationSaved, commit, retry } = usePreferenceMutation<string>(() => props.onChange)

watch(
  () => props.input,
  (value, oldValue) => {
    if (value !== oldValue) {
      inputText.value = value
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

const handleInput = (value: string) => {
  const result = props.regexValidator.test(value)
  invalidInput.value = !result

  if (result) {
    if (inputTimer) {
      clearTimeout(inputTimer)
    }

    if (props.emitTime === 0) {
      void commit(value)
      return
    }

    inputTimer = setTimeout(() => {
      inputTimer = null
      void commit(value)
    }, props.emitTime)
  }
}
const handleBlur = (): void => {
  if (invalidInput.value) {
    inputText.value = props.input
    invalidInput.value = false
  }
}

</script>

<style>
.pref-text-box-item {
  font-size: var(--font-size-ui);
  user-select: none;
  margin: 0;
  color: var(--text-secondary);
  width: 100%;
  & div {
    background: transparent;
    color: var(--text-secondary);
    border-color: var(--border-default);
  }
  & input.el-input__inner {
    height: var(--control-height-md);
    background: transparent;
    border: none;
    padding-right: 15px;
    &::placeholder {
      color: var(--text-tertiary);
    }
  }
  & .input {
    width: 100%;
  }
  & .el-input.is-active .el-input__inner,
  & .el-input__inner:focus {
    border-color: var(--border-focus);
  }
  & .el-input__icon,
  & .el-input__inner {
    line-height: var(--control-height-md);
  }
  & .description {
    margin-bottom: 10px;
  }
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
.pref-text-box-item .el-input.error input {
  color: #f56c6c;
}
</style>
