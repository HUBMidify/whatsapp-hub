export default function DashboardPage() {
  return (
    <div style={{ padding: '50px' }}>
      <h1>Dashboard</h1>
      <p>✅ Você está autenticado!</p>
      <a href="/api/auth/signout">Sair</a>
    </div>
  );
}