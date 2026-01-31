import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/user/initials"

export type UserAvatarProps = {
  name: string
  src?: string | null
  fallbackLabel?: string
  size?: number | string
  className?: string
}

export default function UserAvatar({
  name,
  src,
  fallbackLabel,
  size = 32,
  className,
}: UserAvatarProps) {
  const initials = getInitials(name)
  const label = fallbackLabel?.trim() ? fallbackLabel : initials
  const normalizedSrc =
    src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:"))
      ? src
      : null

  const sizeValue = typeof size === "number" ? `${size}px` : size

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className
      )}
      style={{ width: sizeValue, height: sizeValue }}
      aria-label={name}
      role="img"
    >
      {normalizedSrc ? (
        <img src={normalizedSrc} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span>{label}</span>
      )}
    </div>
  )
}
