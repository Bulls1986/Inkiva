<template>
  <div class="command-palette">
    <el-dialog
      v-model="showCommandPalette"
      :show-close="false"
      :modal="true"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      custom-class="command-palette-dialog"
      :aria-label="t('commandPalette.placeholder')"
      width="min(640px, calc(100vw - 48px))"
      top="12vh"
      @close="handleDialogClose"
    >
      <div
        class="search-wrapper"
        role="search"
      >
        <div class="input-wrapper">
          <span
            class="search-icon"
            aria-hidden="true"
          >
            <Search />
          </span>
          <input
            ref="searchInput"
            v-model="query"
            type="text"
            class="search"
            role="combobox"
            :placeholder="placeholderText"
            :aria-expanded="showCommandPalette"
            aria-controls="command-palette-results"
            :aria-activedescendant="activeOptionId"
            autocomplete="off"
            spellcheck="false"
            @keydown="handleBeforeInput"
            @input="handleTextInput"
            @keyup="handleKeyup"
          >
        </div>

        <loading
          v-if="isBusy"
          :label="loadingText"
        />
        <p
          v-if="isBusy && showLoadingMessage"
          class="launcher-status"
          role="status"
          aria-live="polite"
        >
          {{ loadingText }}
        </p>

        <div
          v-if="!isBusy && availableCommands.length"
          id="command-palette-results"
          class="results"
          role="listbox"
          :aria-label="resultsLabel"
        >
          <section
            v-for="section in commandSections"
            :key="section.id"
            class="command-section"
            data-testid="command-palette-section"
            :aria-label="section.label"
          >
            <div class="section-label">
              {{ section.label }}
            </div>
            <ul class="commands">
              <li
                v-for="item in section.items"
                :id="optionId(item)"
                :key="item.id"
                :ref="
                  (element) => {
                    if (element) commandItems[commandIndex(item)] = element as HTMLElement
                  }
                "
                class="command-option"
                role="option"
                :aria-selected="isSelected(item)"
                :tabindex="isSelected(item) ? 0 : -1"
                data-testid="command-palette-option"
                @mousemove="selectCommand(item)"
                @click="search(item.id)"
              >
                <span class="command-copy">
                  <span
                    class="title"
                    :title="item.title || item.description || item.id"
                  >{{ displayLabel(item) }}</span>
                  <span
                    v-if="secondaryLabel(item)"
                    class="description"
                  >{{ secondaryLabel(item) }}</span>
                </span>
                <span
                  v-if="shortcutTokens(item).length"
                  class="shortcut"
                  aria-label="Shortcut"
                >
                  <kbd
                    v-for="accelerator in shortcutTokens(item)"
                    :key="accelerator"
                  >{{ accelerator }}</kbd>
                </span>
              </li>
            </ul>
          </section>
        </div>

        <p
          v-if="!isBusy"
          class="empty-state"
          role="status"
          aria-live="polite"
          data-testid="command-palette-empty"
        >
          {{ emptyText }}
        </p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  ref,
  watch
} from 'vue'
import { useCommandCenterStore } from '@/store/commandCenter'
import { Search } from '@element-plus/icons-vue'
import log from 'electron-log'
import bus from '../../bus'
import loading from '../loading/index.vue'
import { useI18n } from 'vue-i18n'

interface CommandItem {
  id: string
  description?: string
  title?: string
  shortcut?: string[] | string | null
  execute?: () => void | Promise<void>
  run?: () => void | Promise<void>
  search?: (query: string) => Promise<CommandItem[]>
  unload?: () => void | Promise<void>
  subcommands?: CommandItem[]
  subcommandSelectedIndex?: number
  executeSubcommand?: (commandId: string, value?: unknown) => void | Promise<void>
  placeholder?: string
  value?: unknown
  [key: string]: unknown
}

interface CommandSection {
  id: string
  label: string
  items: CommandItem[]
}

const searchInput = ref<HTMLInputElement | null>(null)
let commandItems: HTMLElement[] = []

const { t } = useI18n()
const commandCenterStore = useCommandCenterStore()
const currentCommand = ref<CommandItem | null>(null)
const showCommandPalette = ref(false)
const commandInitializing = ref(false)
const placeholderText = ref('')
const query = ref('')
const selectedCommandIndex = ref(-1)
const availableCommands = ref<CommandItem[]>([])
const searcherBusy = ref(false)
const showLoadingMessage = ref(false)
let searchRequestId = 0
let commandOpenRequestId = 0
let loadingMessageTimer: ReturnType<typeof setTimeout> | null = null

const defaultPlaceholderText = computed(() => t('commandPalette.placeholder'))
const isBusy = computed(() => commandInitializing.value || searcherBusy.value)
const loadingText = computed(() =>
  commandInitializing.value ? t('commandPalette.loading') : t('commandPalette.searching'))
const emptyText = computed(() =>
  query.value.trim() ? t('commandPalette.noResults') : t('commandPalette.empty'))
const isQuickOpen = computed(() => currentCommand.value?.id === 'file.quick-open')
const isRootCommand = computed(() => currentCommand.value?.id === '#')
const resultsLabel = computed(() =>
  isQuickOpen.value ? t('commandPalette.sections.files') : t('commandPalette.sections.commands'))

watch(isBusy, (busy) => {
  if (loadingMessageTimer) {
    clearTimeout(loadingMessageTimer)
    loadingMessageTimer = null
  }
  showLoadingMessage.value = false
  if (busy) {
    loadingMessageTimer = setTimeout(() => {
      if (isBusy.value) showLoadingMessage.value = true
      loadingMessageTimer = null
    }, 500)
  }
})

const commandSections = computed<CommandSection[]>(() => {
  const items = availableCommands.value
  if (!items.length) return []

  if (!isRootCommand.value || isQuickOpen.value) {
    return [{
      id: isQuickOpen.value ? 'files' : 'commands',
      label: resultsLabel.value,
      items
    }]
  }

  const fileCommands = items.filter((item) => item.id.startsWith('file.'))
  const otherCommands = items.filter((item) => !item.id.startsWith('file.'))
  const sections: CommandSection[] = []
  if (fileCommands.length) {
    sections.push({ id: 'files', label: t('commandPalette.sections.files'), items: fileCommands })
  }
  if (otherCommands.length) {
    sections.push({
      id: 'commands',
      label: t('commandPalette.sections.commands'),
      items: otherCommands
    })
  }
  return sections
})

const renderedCommands = computed<CommandItem[]>(() =>
  commandSections.value.flatMap((section) => section.items))

const activeOptionId = computed(() => {
  const item = renderedCommands.value[selectedCommandIndex.value]
  return item ? optionId(item) : undefined
})

const optionId = (item: CommandItem): string => {
  const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '-')
  return 'command-palette-option-' + safeId
}

const displayLabel = (item: CommandItem): string => item.description || item.title || item.id

const secondaryLabel = (item: CommandItem): string | undefined => {
  if (!item.title || item.title === displayLabel(item)) return undefined
  return item.title
}

const shortcutTokens = (item: CommandItem): string[] => {
  if (Array.isArray(item.shortcut)) return item.shortcut
  return item.shortcut ? [item.shortcut] : []
}

const commandIndex = (item: CommandItem): number => renderedCommands.value.indexOf(item)

const isSelected = (item: CommandItem): boolean => commandIndex(item) === selectedCommandIndex.value

const selectCommand = (item: CommandItem): void => {
  const index = commandIndex(item)
  if (index >= 0) selectedCommandIndex.value = index
}

const setAvailableCommands = (commands: CommandItem[], preferredIndex = 0): void => {
  availableCommands.value = commands
  selectedCommandIndex.value = commands.length
    ? Math.min(Math.max(preferredIndex, 0), commands.length - 1)
    : -1
}

const focusSearchInput = (): void => {
  nextTick(() => {
    searchInput.value?.focus()
    const selected = commandItems[selectedCommandIndex.value]
    selected?.scrollIntoView({ block: 'nearest' })
  })
}

const handleShow = (command?: unknown): void => {
  const nextCommand = ((command as CommandItem | undefined) ??
    (commandCenterStore.rootCommand as unknown as CommandItem)) as CommandItem
  const requestId = ++commandOpenRequestId
  searchRequestId++
  searcherBusy.value = false
  commandInitializing.value = true

  if (currentCommand.value && currentCommand.value !== nextCommand) {
    currentCommand.value.unload?.()
  }
  currentCommand.value = nextCommand
  query.value = ''
  placeholderText.value = nextCommand.placeholder || defaultPlaceholderText.value
  setAvailableCommands([])
  showCommandPalette.value = true
  bus.emit('editor-blur')
  focusSearchInput()

  Promise.resolve(nextCommand.run?.())
    .then(() => {
      if (requestId !== commandOpenRequestId) return
      const activeCommand = currentCommand.value
      if (!activeCommand) return
      commandInitializing.value = false
      placeholderText.value = activeCommand.placeholder || defaultPlaceholderText.value
      setAvailableCommands(
        activeCommand.subcommands ?? [],
        activeCommand.subcommandSelectedIndex ?? 0
      )
      focusSearchInput()
    })
    .catch((error: unknown) => {
      if (requestId !== commandOpenRequestId) return
      commandInitializing.value = false
      const err = error as { message?: string; name?: string } | null | undefined
      // Quick Open uses an empty error to indicate that there is no valid
      // workspace to search. Keep that legacy behavior without logging noise.
      if (!err || !err.message) {
        showCommandPalette.value = false
        setAvailableCommands([])
        return
      }
      log.error('Unable to initialize command:', err)
      setAvailableCommands([])
    })
}

const handleDialogClose = (): void => {
  commandOpenRequestId++
  searchRequestId++
  commandInitializing.value = false
  searcherBusy.value = false
  selectedCommandIndex.value = -1
  query.value = ''
  availableCommands.value = []
  currentCommand.value?.unload?.()
  currentCommand.value = null
}

const handleBeforeInput = (event: KeyboardEvent): void => {
  if (!availableCommands.value.length) return

  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowDown': {
      event.preventDefault()
      event.stopPropagation()
      const direction = event.key === 'ArrowUp' ? -1 : 1
      const nextIndex = selectedCommandIndex.value + direction
      selectedCommandIndex.value = nextIndex < 0
        ? availableCommands.value.length - 1
        : nextIndex >= availableCommands.value.length ? 0 : nextIndex
      const selected = commandItems[selectedCommandIndex.value]
      selected?.scrollIntoView({ block: 'nearest' })
      break
    }
    default:
      break
  }
}

const handleTextInput = (event: Event): void => {
  if ((event as InputEvent).isComposing) return
  updateCommands()
}

const handleKeyup = (event: KeyboardEvent): void => {
  if (event.isComposing) return
  if (event.key === 'Enter') search()
}

const search = (commandId: string | null = null): void => {
  if (commandId) {
    executeCommand(commandId)
    return
  }

  const selected = renderedCommands.value[selectedCommandIndex.value]
  if (selected) {
    executeCommand(selected.id)
    return
  }

  updateCommands()
}

const updateCommands = (): void => {
  const queryString = query.value.trim()
  const command = currentCommand.value
  if (!command) return
  const requestId = ++searchRequestId

  if (command.search) {
    searcherBusy.value = true
    command.search(queryString)
      .then((result) => {
        if (requestId !== searchRequestId) return
        searcherBusy.value = false
        setAvailableCommands(result || [])
      })
      .catch((error: unknown) => {
        if (requestId !== searchRequestId) return
        const err = error as { message?: string; name?: string } | null | undefined
        searcherBusy.value = false
        if (!err || !err.message || err.name === 'AbortError') return
        setAvailableCommands([])
        log.error(err)
      })
    return
  }

  const normalizedQuery = queryString.toLowerCase()
  const commands = command.subcommands ?? []
  const result = normalizedQuery
    ? commands.filter((item) =>
      [item.description, item.title, item.id]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(normalizedQuery)))
    : commands
  setAvailableCommands(result)
}

const executeCommand = (commandId: string): void => {
  const command = availableCommands.value.find((item) => item.id === commandId)
  if (!command) {
    log.error('Command not found: ' + commandId)
    return
  }

  const activeCommand = currentCommand.value
  if (!activeCommand) return
  if (activeCommand.executeSubcommand) {
    showCommandPalette.value = false
    activeCommand.executeSubcommand(commandId, command.value)
    return
  }

  const { execute, subcommands, run } = command
  if (execute === undefined && run === undefined && subcommands) {
    currentCommand.value = command
    query.value = ''
    setAvailableCommands(subcommands)
    focusSearchInput()
    return
  }

  showCommandPalette.value = false
  execute?.()
}

const handleLanguageChanged = (): void => {
  if (!showCommandPalette.value || !currentCommand.value) return
  const command = currentCommand.value
  const requestId = ++commandOpenRequestId
  commandInitializing.value = true
  Promise.resolve(command.run?.())
    .then(() => {
      if (requestId !== commandOpenRequestId || currentCommand.value !== command) return
      commandInitializing.value = false
      placeholderText.value = command.placeholder || defaultPlaceholderText.value
      updateCommands()
    })
    .catch((error: unknown) => {
      if (requestId !== commandOpenRequestId) return
      commandInitializing.value = false
      log.error('Unable to refresh command descriptions:', error)
    })
}

onBeforeUpdate(() => {
  commandItems = []
})

onMounted(() => {
  bus.on('show-command-palette', handleShow)
  bus.on('language-changed', handleLanguageChanged)
})

onBeforeUnmount(() => {
  if (loadingMessageTimer) {
    clearTimeout(loadingMessageTimer)
    loadingMessageTimer = null
  }
  bus.off('show-command-palette', handleShow)
  bus.off('language-changed', handleLanguageChanged)
})
</script>

<style scoped>
::-webkit-scrollbar {
  display: none;
}

.search-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  color: var(--text-primary);
}

.input-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 42px;
  box-sizing: border-box;
  padding: 0 var(--space-3, 12px);
  background: var(--surface-editor);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color var(--motion-fast), background-color var(--motion-fast);
}

.input-wrapper:focus-within {
  border-color: var(--border-focus);
}

.search-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-right: var(--space-2, 8px);
  color: var(--icon-secondary);
  font-size: 16px;
  line-height: 1;
}

input.search {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0;
  font-size: 15px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
}

input.search:focus-visible {
  box-shadow: var(--focus-ring);
}

.launcher-status {
  padding: 0 4px;
  margin: 10px 0 2px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.results {
  max-height: min(420px, calc(100vh - 260px));
  margin-top: 10px;
  overflow-y: auto;
}

.command-section + .command-section {
  margin-top: 12px;
}

.section-label {
  padding: 0 10px 5px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 16px;
  text-transform: uppercase;
}

ul.commands {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  margin: 0;
  list-style: none;
}

li.command-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  box-sizing: border-box;
  padding: 5px 10px;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), background-color var(--motion-fast);
}

li.command-option:hover,
li.command-option[aria-selected='true'] {
  color: var(--text-primary);
  background: var(--surface-selected);
}

li.command-option:focus-visible {
  box-shadow: var(--focus-ring);
  outline: none;
}

.command-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

li.command-option .title,
li.command-option .description {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

li.command-option .title {
  font-size: 14px;
  line-height: 20px;
}

li.command-option .description {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 16px;
}

.shortcut {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
  margin-left: 12px;
}

kbd {
  min-width: 18px;
  box-sizing: border-box;
  padding: 1px 5px;
  color: var(--text-tertiary);
  font-family: inherit;
  font-size: 11px;
  line-height: 17px;
  text-align: center;
  background: var(--surface-chrome);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.empty-state {
  padding: 18px 10px 8px;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}
</style>

<style>
.command-palette-dialog {
  overflow: hidden;
  padding: 0 !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: var(--radius-lg) !important;
  background: var(--surface-elevated) !important;
  box-shadow: var(--elevation-floating);
}

.command-palette-dialog .el-dialog__header {
  display: none;
}

.command-palette-dialog .el-dialog__body {
  display: block;
  padding: 12px !important;
}

@media (max-width: 600px) {
  .command-palette-dialog .el-dialog__body {
    padding: 10px !important;
  }
}
</style>
