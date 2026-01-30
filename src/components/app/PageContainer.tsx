import { cn } from "@/lib/utils"

export type PageContainerProps = {
  children: React.ReactNode
  className?: string
}

export default function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8",
        className
      )}
    >
      {children}
    </main>
  )
}
