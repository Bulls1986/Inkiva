import bus from '../bus'

export const executeWhenEditorReady = (execute: () => void): void => {
  bus.emit('editor-command-readiness', {
    resolve: (ready) => {
      if (ready) execute()
    }
  })
}
