<template>
  <section
    class="pref-switch-item"
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
      <el-tooltip
        v-else-if="detailedDescription"
        :content="detailedDescription"
        class="item"
        effect="dark"
        placement="top-start"
      >
        <InfoFilled
          width="16"
          height="16"
        />
      </el-tooltip>
      <span
        v-if="notes"
        class="notes"
      >
        {{ notes }}
      </span>
    </div>
    <el-switch
      v-model="status"
      @change="handleSwitchChange"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import LinkIcon from '@/components/icons/LinkIcon.vue'
import type { PrefControlBaseProps } from '../types'

interface BoolProps extends PrefControlBaseProps {
  notes?: string
  bool: boolean
  onChange: (value: boolean) => void
  detailedDescription?: string
}

const props = withDefaults(defineProps<BoolProps>(), {
  description: '',
  notes: '',
  more: '',
  detailedDescription: '',
  disable: false
})

const status = ref(props.bool)

watch(
  () => props.bool,
  (value, oldValue) => {
    if (value !== oldValue) {
      status.value = value
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

const handleSwitchChange = (value: boolean | string | number) => {
  props.onChange(Boolean(value))
}
</script>

<style>
.pref-switch-item {
  font-size: 14px;
  user-select: none;
  margin: 0;
  min-height: 32px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;

  & .description {
    & svg {
      margin-left: 4px;
      cursor: pointer;
      opacity: 0.7;
      color: var(--icon-secondary);
    }
    & svg:hover {
      color: var(--color-accent);
    }
    & > .notes {
      display: inline;
      margin: 0 0 0 8px;
    }
  }
}

span.el-switch__core::after {
  top: 3px;
  left: 7px;
  width: 10px;
  height: 10px;
}

.el-switch .el-switch__core {
  border: 2px solid var(--icon-secondary);
  background: transparent;
  box-sizing: border-box;
  transition: border-color var(--motion-normal), background-color var(--motion-normal);
}

span.el-switch__label {
  color: var(--text-tertiary);
}

.el-switch:not(.is-checked) .el-switch__core::after {
  background: var(--icon-secondary);
}

.el-switch.is-checked .el-switch__core {
  border-color: var(--color-accent);
  background-color: var(--color-accent);
}
</style>
