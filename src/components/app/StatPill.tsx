import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatPillTone = "info" | "success" | "warning" | "danger" | "neutral"

export type StatPillProps = {
  label: string
  tone?: StatPillTone
  className?: string
}

const toneStyles: Record<StatPillTone, string> = {
  info: "border-primary/20 bg-primary/10 text-primary",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/15 text-warning",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
}

export default function StatPill({
  label,
  tone = "neutral",
  className,
}: StatPillProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "min-w-0 max-w-full rounded-full px-2.5 py-1 text-xs",
        toneStyles[tone],
        className
      )}
    >
      <span className="truncate">{label}</span>
    </Badge>
  )
}
