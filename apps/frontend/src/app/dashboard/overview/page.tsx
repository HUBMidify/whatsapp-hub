import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/PageHeader'

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description="Métricas e gráficos sobre captação e conversões."
      />

      <Card>
        <p className="font-medium">Em breve</p>
        <p className="text-sm text-muted-foreground mt-1">
          Esta área será o dashboard com indicadores e gráficos.
        </p>
      </Card>
    </div>
  )
}