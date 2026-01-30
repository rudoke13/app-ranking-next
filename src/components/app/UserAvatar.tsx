import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/user/initials"

export type UserAvatarProps = {
  name: string
  src?: string | null
  size?: number
  className?: string
}

export default function UserAvatar({
  name,
  src,
  size = 32,
  className,
}: UserAvatarProps) {
  const initials = getInitials(name)
  const normalizedSrc =
    src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:"))
      ? src
      : null

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className
      )}
      style={{ width: size, height: size }}
      aria-label={name}
      role="img"
    >
      {normalizedSrc ? (
        <img src={normalizedSrc} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}
