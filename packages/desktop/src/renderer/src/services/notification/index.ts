import template from './index.html?raw'
import { getUniqueId } from '../../util'
import { sanitize, EXPORT_DOMPURIFY_CONFIG } from '../../util/dompurify'
import './index.css'

export type NotificationType = 'primary' | 'error' | 'warning' | 'info'

const INON_HASH: Record<NotificationType, string> = {
  primary: 'icon-message',
  error: 'icon-error',
  warning: 'icon-warn',
  info: 'icon-info'
}
const TYPE_HASH: Record<NotificationType, string> = {
  primary: 'mt-primary',
  error: 'mt-error',
  warning: 'mt-warn',
  info: 'mt-info'
}

const fillTemplate = (type: NotificationType, title: string, message: string): string => {
  return template
    .replace(/\{\{icon\}\}/, INON_HASH[type])
    .replace(/\{\{title\}\}/, sanitize(title, EXPORT_DOMPURIFY_CONFIG))
    .replace(/\{\{message\}\}/, sanitize(message, EXPORT_DOMPURIFY_CONFIG))
}

export interface NotifyOptions {
  time?: number
  title?: string
  message?: string
  type?: NotificationType
  showConfirm?: boolean
}

interface NoticeCacheEntry {
  remove: () => void
}

interface NotificationService {
  name: string
  noticeCache: Record<string, NoticeCacheEntry>
  clear(): void
  notify(opts: NotifyOptions): Promise<void>
}

const notification: NotificationService = {
  name: 'notify',
  noticeCache: {} as Record<string, NoticeCacheEntry>,
  clear() {
    Object.keys(this.noticeCache).forEach((key) => {
      this.noticeCache[key].remove()
    })
  },
  notify({
    time = 10000,
    title = '',
    message = '',
    type = 'primary', // primary, error, warning or info
    showConfirm = false
  }: NotifyOptions): Promise<void> {
    let rs: (() => void) | undefined
    let rj: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | null = null
    const id = getUniqueId()

    const fragment = document.createElement('div')
    fragment.innerHTML = fillTemplate(type, title, message)

    const noticeContainer = fragment.querySelector('.mt-notification') as HTMLElement
    const contentContainer = noticeContainer.querySelector('.content') as HTMLElement
    const close = noticeContainer.querySelector('.close') as HTMLElement
    let target: HTMLElement = noticeContainer

    if (showConfirm) {
      noticeContainer.classList.add('mt-confirm')
      target = noticeContainer.querySelector('.confirm') as HTMLElement
    }

    noticeContainer.classList.add(TYPE_HASH[type])
    contentContainer.classList.add(TYPE_HASH[type])

    const setCloseTimer = (): void => {
      if (typeof time === 'number' && time > 0) {
        timer = setTimeout(() => {
          remove()
        }, time)
      }
    }

    const mousemoveHandler = (): void => {
      if (timer) clearTimeout(timer)
    }

    const mouseleaveHandler = (): void => {
      if (timer) clearTimeout(timer)
      setCloseTimer()
    }

    const clickHandler = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      remove()
      if (rs) rs()
    }

    const closeHandler = (event: MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      remove()
      if (rj) rj()
    }

    const rePositionNotices = (): void => {
      const notices = document.querySelectorAll('.mt-notification')
      let i
      let hx = 0
      const len = notices.length
      for (i = 0; i < len; i++) {
        const el = notices[i] as HTMLElement
        el.style.transform = `translate(0, -${hx}px)`
        el.style.zIndex = String(10000 - i)
        hx += el.offsetHeight + 10
      }
    }

    const remove = (): void => {
      noticeContainer.style.opacity = '0'
      noticeContainer.style.transform = 'translateX(120%)'

      setTimeout(() => {
        noticeContainer.removeEventListener('mousemove', mousemoveHandler)
        noticeContainer.removeEventListener('mouseleave', mouseleaveHandler)
        target.removeEventListener('click', clickHandler)
        close.removeEventListener('click', closeHandler)
        noticeContainer.remove()
        rePositionNotices()
        if (notification.noticeCache[id]) {
          delete notification.noticeCache[id]
        }
      }, 180)
    }

    notification.noticeCache[id] = { remove }

    noticeContainer.addEventListener('mousemove', mousemoveHandler)
    noticeContainer.addEventListener('mouseleave', mouseleaveHandler)
    target.addEventListener('click', clickHandler)
    close.addEventListener('click', closeHandler)

    setCloseTimer()

    document.body.prepend(noticeContainer, document.body.firstChild as Node)
    setTimeout(rePositionNotices, 0)

    return new Promise<void>((resolve, reject) => {
      rs = resolve
      rj = reject
    })
  }
}

export default notification
