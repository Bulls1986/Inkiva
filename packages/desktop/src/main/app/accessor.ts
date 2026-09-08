import WindowManager from '../app/windowManager'
import Preference from '../preferences'
import EditorBufferStore from '../editorBufferStore'
import DataCenter from '../dataCenter'
import Keybindings from '../keyboard/shortcutHandler'
import AppMenu from '../menu'
import { loadMenuCommands } from '../menu/actions'
import { CommandManager, loadDefaultCommands } from '../commands'
import type { AppEnvironment } from './env'
import type AppPaths from './paths'
import type { ShutdownCoordinator } from '../update/ShutdownCoordinator'

class Accessor {
  public env: AppEnvironment
  public paths: AppPaths
  public preferences: Preference
  public dataCenter: DataCenter
  public editorBufferStore: EditorBufferStore
  public commandManager: CommandManager
  public keybindings: Keybindings
  public menu: AppMenu
  public windowManager: WindowManager
  public shutdownCoordinator: ShutdownCoordinator | undefined

  /**
   * @param appEnvironment The application environment instance.
   */
  constructor(appEnvironment: AppEnvironment) {
    const userDataPath = appEnvironment.paths.userDataPath

    this.env = appEnvironment
    this.paths = appEnvironment.paths

    // Preferences affect BrowserWindow construction and must stay on the
    // critical path. DataCenter itself is now lightweight: construct it here so
    // its IPC handlers exist deterministically, while electron-store/disk work
    // remains deferred until persisted data is first requested.
    this.preferences = new Preference(this.paths)
    this.dataCenter = new DataCenter(this.paths)
    this.editorBufferStore = new EditorBufferStore(this.paths)

    this.commandManager = CommandManager
    this._loadCommands()

    this.keybindings = new Keybindings(
      this.commandManager,
      appEnvironment,
      this.preferences.getItem('shortcutStyle')
    )
    this.menu = new AppMenu(this.preferences, this.keybindings, userDataPath)
    this.windowManager = new WindowManager(this.menu, this.preferences, this.editorBufferStore)
  }

  private _loadCommands(): void {
    const { commandManager } = this
    loadDefaultCommands(commandManager)
    loadMenuCommands(commandManager)

    if (this.env.isDevMode) {
      commandManager.__verifyDefaultCommands()
    }
  }
}

export default Accessor
