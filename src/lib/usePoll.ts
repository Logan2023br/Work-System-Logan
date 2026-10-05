import { useEffect, useRef } from 'react'

/** Gọi `fn` mỗi `ms` khi tab đang hiển thị; gọi ngay khi người dùng quay lại tab. */
export function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let id: number | undefined
    const start = () => {
      stop()
      id = window.setInterval(() => ref.current(), ms)
    }
    const stop = () => {
      if (id !== undefined) window.clearInterval(id)
      id = undefined
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        ref.current()
        start()
      } else stop()
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ms])
}
