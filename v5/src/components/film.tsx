import { cn } from 'cn'
import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

// The Network Information API is Chromium-only and missing from lib.dom, so this is the slice we read.
type Connection = { saveData?: boolean; effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' }

/**
 * Should a background film stream on this visit? When this returns false the visitor sees the
 * still poster (35-55 KB) and the play button lets them opt in to the film (0.3-1.4 MB).
 * `connection` is undefined in Safari and Firefox, which don't expose the API.
 */
export function shouldStreamFilm(connection?: Connection): boolean {
  // TODO(human): decide when Carevia should skip the film to save the visitor's data.
  return true
}

export function Film({ name, className }: { name: 'night' | 'morning'; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [allowed, setAllowed] = useState(
    () =>
      !matchMedia('(prefers-reduced-motion: reduce)').matches &&
      shouldStreamFilm((navigator as Navigator & { connection?: Connection }).connection),
  )

  // Play only while on screen. With preload="none" this also defers the download of the
  // morning film until the visitor scrolls near it.
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (!allowed) {
      video.pause()
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? video.play().catch(() => setAllowed(false)) : video.pause()),
      { rootMargin: '200px' },
    )
    io.observe(video)
    return () => io.disconnect()
  }, [allowed])

  const toggle = () => {
    setAllowed(!playing)
    // Called inside the click so browsers that block autoplay (e.g. iOS Low Power Mode) still play.
    if (!playing) ref.current?.play().catch(() => {})
  }

  return (
    <>
      <video
        ref={ref}
        className={cn('absolute inset-0 z-0 h-full w-full object-cover', className)}
        poster={`/film/${name}.webp`}
        loop
        muted
        playsInline
        preload="none"
        aria-hidden="true"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        <source src={`/film/${name}-720.mp4`} type="video/mp4" media="(max-width: 767px)" />
        <source src={`/film/${name}-1080.mp4`} type="video/mp4" />
      </video>
      <Button
        variant="glass"
        size="icon-lg"
        className="absolute right-6 bottom-6 z-10"
        aria-label={playing ? 'Pause film' : 'Play film'}
        onClick={toggle}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
    </>
  )
}
