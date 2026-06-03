import DialogProvider from "@/components/app/DialogProvider"
import SessionGate from "@/components/app/SessionGate"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DialogProvider>
        <SessionGate>{children}</SessionGate>
      </DialogProvider>
    </div>
  )
}
