import RankingList from "@/components/ranking/RankingList"
import SectionTitle from "@/components/app/SectionTitle"

export default function RankingPage() {
  return (
    <div className="space-y-8">
      <SectionTitle
        title="Ranking"
        subtitle="Categorias ativas e situacao dos jogadores"
      />
      <RankingList />
    </div>
  )
}
