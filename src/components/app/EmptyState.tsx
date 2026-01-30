import { Card, CardContent } from "@/components/ui/card"

export type EmptyStateProps = {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        {icon ? (
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {icon}
          </div>
        ) : null}
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="pt-2">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
