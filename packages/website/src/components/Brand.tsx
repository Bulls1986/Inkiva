import { SECTIONS, hash } from '@/lib/sections'

export default function Brand() {
  return (
    <a className="brand" href={hash(SECTIONS.top)}>
      <img className="mark" src="/assets/inkiva-logo.svg" alt="Inkiva logo" width={28} height={28} />
      <span>Inkiva</span>
      <small className="brand-cn">墨映</small>
    </a>
  )
}
