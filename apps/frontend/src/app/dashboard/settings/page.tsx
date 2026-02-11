export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>
        <p className="text-sm text-gray-600 mt-1">
          Perfil, integrações e preferências.
        </p>
      </div>

      <div className="card">
        <p className="text-gray-700 font-medium">Em breve</p>
        <p className="text-sm text-gray-500 mt-1">
          Aqui você poderá ajustar integrações e dados da conta.
        </p>
      </div>
    </div>
  )
}