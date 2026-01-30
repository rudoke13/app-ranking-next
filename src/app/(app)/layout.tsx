import SessionGate from "@/components/app/SessionGate"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SessionGate>{children}</SessionGate>
    </div>
  )
}
