import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const readJson = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))

test('@muyajs/core owns the desktop type boundary', () => {
  const muyaPackage = readJson('packages/muya/package.json')
  const desktopTsconfig = readJson('packages/desktop/tsconfig.base.json')
  const muyaTsconfig = readFileSync(new URL('../packages/muya/tsconfig.json', import.meta.url), 'utf8')
  const desktopPackage = readJson('packages/desktop/package.json')
  const electronViteConfig = readFileSync(new URL('../packages/desktop/electron.vite.config.ts', import.meta.url), 'utf8')
  const vitestConfig = readFileSync(new URL('../packages/desktop/vitest.config.ts', import.meta.url), 'utf8')
  const muyaBuildWorkflow = readFileSync(new URL('../.github/workflows/muya-build.yml', import.meta.url), 'utf8')
  const ipcContract = readFileSync(new URL('../packages/desktop/src/shared/types/ipc.ts', import.meta.url), 'utf8')
  const editorStore = readFileSync(new URL('../packages/desktop/src/renderer/src/store/editor.ts', import.meta.url), 'utf8')
  const rootPackage = readJson('package.json')

  assert.deepEqual(muyaPackage.exports['.'], {
    types: './lib/types/index.d.ts',
    import: './src/index.ts',
    default: './src/index.ts'
  })
  assert.equal(
    muyaPackage.scripts['build:types'],
    'tsc --declaration --emitDeclarationOnly --noEmit false --outDir lib/types'
  )
  assert.equal(desktopTsconfig.compilerOptions.paths['@muyajs/core'], undefined)
  assert.equal(desktopTsconfig.compilerOptions.paths['muya/*'], undefined)
  assert.equal(desktopPackage.dependencies['@marktext/muyajs'], undefined)
  assert.match(muyaTsconfig, /"target":\s*"ES2022"/)
  assert.match(muyaTsconfig, /"lib":\s*\["ES2022",\s*"DOM",\s*"DOM.Iterable"\]/)
  assert.equal(
    existsSync(new URL('../packages/desktop/src/types/muya-core.d.ts', import.meta.url)),
    false,
    'desktop must not shadow @muyajs/core with a permissive declaration shim'
  )
  assert.equal(
    existsSync(new URL('../packages/desktop/src/types/muya.d.ts', import.meta.url)),
    false,
    'desktop must not retain the legacy permissive muya declaration bridge'
  )
  assert.doesNotMatch(electronViteConfig, /\.\.\/muyajs/)
  assert.doesNotMatch(vitestConfig, /\.\.\/muyajs/)
  assert.match(muyaBuildWorkflow, /Typecheck desktop against built Muya declarations/)
  assert.match(ipcContract, /'mt::ask-for-image-path': \{ args: \[\]; ret: string \}/)
  assert.match(editorStore, /ASK_FOR_IMAGE_PATH\(\): Promise<string>/)
  assert.match(
    rootPackage.scripts.typecheck,
    /@muyajs\/core.*build:types.*inkiva.*typecheck/,
    'root typecheck must build the Muya declarations before checking desktop consumers'
  )
})
