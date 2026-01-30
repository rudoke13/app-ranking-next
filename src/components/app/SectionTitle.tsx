import { cn } from "@/lib/utils"

export type SectionTitleProps = {
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
}

export default function SectionTitle({
  title,
  subtitle,
  action,
  className,
}: SectionTitleProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
