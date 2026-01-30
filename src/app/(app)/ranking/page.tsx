import SectionTitle from "@/components/app/SectionTitle"
import RankingList from "@/components/ranking/RankingList"
import { getSessionFromCookies } from "@/lib/auth/session"
import { hasAdminAccess } from "@/lib/domain/permissions"

export default async function RankingPage() {
  const session = await getSessionFromCookies()
  const isAdmin = hasAdminAccess(session)

  return (
    <div className="space-y-8">
      <SectionTitle
        title="Ranking"
        subtitle="Categorias ativas e situacao dos jogadores"
      />
      <RankingList isAdmin={isAdmin} />
    </div>
  )
}
