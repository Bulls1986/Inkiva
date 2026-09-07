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

class Accessor {
  public env: AppEnvironment
  public paths: AppPaths
  public preferences: Preference
  private _dataCenter: DataCenter | null
  public editorBufferStore: EditorBufferStore
  public commandManager: CommandManager
  public keybindings: Keybindings
  public menu: AppMenu
  public windowManager: WindowManager

  /**
   * @param appEnvironment The application environment instance.
   */
  constructor(appEnvironment: AppEnvironment) {
    const userDataPath = appEnvironment.paths.userDataPath

    this.env = appEnvironment
    this.paths = appEnvironment.paths

    // Preferences affect BrowserWindow construction and must stay on the
    // critical path. DataCenter is only needed by image/screenshot/upload
    // features, so defer its electron-store/native path work until first use.
    this.preferences = new Preference(this.paths)
    this._dataCenter = null
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

  get dataCenter(): DataCenter {
    if (!this._dataCenter) {
      this._dataCenter = new DataCenter(this.paths)
    }
    return this._dataCenter
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
