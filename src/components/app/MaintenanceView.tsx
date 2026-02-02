import LogoutButton from "@/components/app/LogoutButton"
import UserAvatar from "@/components/app/UserAvatar"

type MaintenanceViewProps = {
  appName: string
  logoUrl?: string | null
  message?: string | null
}

export default function MaintenanceView({
  appName,
  logoUrl,
  message,
}: MaintenanceViewProps) {
  const description =
    message?.trim() ||
    "Estamos em manutencao para melhorar o aplicativo. Volte em alguns minutos."

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <UserAvatar
          name={appName}
          src={logoUrl ?? null}
          size={72}
          fallbackLabel="TCC"
          className="text-xl"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {appName}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <LogoutButton />
      </div>
    </div>
  )
}
