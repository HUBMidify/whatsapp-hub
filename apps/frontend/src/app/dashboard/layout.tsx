'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart3,
  Link as LinkIcon,
  MessageSquare,
  QrCode,
  Settings,
  LayoutDashboard,
  KanbanSquare,
  Bell,
  Menu,
  X,
  LogOut,
  User,
} from 'lucide-react'


type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  exact?: boolean
  disabled?: boolean
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => {
    // NextAuth exposes the session at /api/auth/session
    fetch('/api/auth/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const email = data?.user?.email
        if (typeof email === 'string') setUserEmail(email)
      })
      .catch(() => {})
  }, [])

  // Fechar drawer ao navegar
  useEffect(() => {
  if (!mobileOpen && !userMenuOpen) return

  const id = window.setTimeout(() => {
    setMobileOpen(false)
    setUserMenuOpen(false)
  }, 0)

  return () => window.clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pathname])

  // Travar scroll quando drawer aberto
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const navItems: NavItem[] = useMemo(
    () => [
      { label: 'Visão geral', href: '/dashboard/overview', icon: LayoutDashboard, exact: true },
      { label: 'Leads', href: '/dashboard', icon: MessageSquare, exact: true },
      { label: 'Conectar WhatsApp', href: '/dashboard/whatsapp/connect', icon: QrCode },
      { label: 'Links rastreados', href: '/dashboard/links', icon: LinkIcon },
      { label: 'Funil', href: '/dashboard/pipeline', icon: KanbanSquare },
      { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
    ],
    []
  )

  const pageTitle = useMemo(() => {
    // título amigável no header
    const match =
      navItems.find((i) => i.exact && pathname === i.href) ||
      navItems.find((i) => !i.exact && pathname.startsWith(i.href))
    return match?.label ?? 'Dashboard'
  }, [navItems, pathname])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar (desktop) */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64 md:flex-col">
        <Sidebar
          pathname={pathname}
          navItems={navItems}
          onNavigate={() => {}}
        />
      </aside>

      {/* Sidebar (mobile drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white transition-transform duration-200 ease-out md:hidden
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar
          pathname={pathname}
          navItems={navItems}
          onNavigate={() => setMobileOpen(false)}
          mobileHeaderRight={
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-gray-100 text-gray-600"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          }
        />
      </aside>

      {/* Main wrapper */}
      <div className="md:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200">
          <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md hover:bg-gray-100 text-gray-700"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Logo */}
              <Link href="/dashboard" className="flex items-center gap-2">
                {/* <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                m
                </div> */}
                <span className="font-semibold text-gray-900">midify</span>
              </Link>

              {/* Page title */}
              <div className="hidden sm:flex items-center gap-2 text-gray-400">
                <span className="text-gray-300">/</span>
                <h1 className="text-sm font-medium text-gray-700">{pageTitle}</h1>
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              {/* Notifications (placeholder) */}
              <button
                type="button"
                className="inline-flex items-center justify-center w-10 h-10 rounded-md hover:bg-gray-100 text-gray-700"
                title="Notificações"
              >
                <Bell className="w-5 h-5" />
              </button>

              {/* Avatar dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full pl-2 pr-3 py-1.5 hover:bg-gray-100 transition-colors"
                  aria-label="Menu do usuário"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-sm">
                    {getInitials(userEmail || 'U')}
                  </div>
                  <span className="hidden sm:block text-sm text-gray-700">
                    {userEmail || 'Conta'}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs text-gray-500">Logado como</p>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {userEmail || '—'}
                      </p>
                    </div>

                    <div className="p-2">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                        onClick={() => alert('Perfil (placeholder)')}
                      >
                        <User className="w-4 h-4" />
                        Editar perfil
                      </button>

                      <a
                        href="/api/auth/signout"
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <LogOut className="w-4 h-4" />
                        Sair
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

function Sidebar({
  pathname,
  navItems,
  onNavigate,
  mobileHeaderRight,
}: {
  pathname: string
  navItems: NavItem[]
  onNavigate: () => void
  mobileHeaderRight?: React.ReactNode
}) {
  return (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Sidebar header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-semibold">
            m
          </div>
          <span className="font-semibold text-gray-900">midify</span>
        </Link>
        {mobileHeaderRight}
      </div>

      {/* Nav */}
      <nav className="p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)

          const Icon = item.icon

          const base =
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors'

          const active = 'bg-primary/10 text-primary border border-primary/20'

          const inactive = 'text-gray-700 hover:bg-muted'

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`${base} ${
                isActive
                  ? active +
                    ' relative before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-primary before:rounded-l'
                  : inactive
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="flex-1">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto p-4 border-t border-gray-100 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          <span>midify • WhatsApp Attribution</span>
        </div>
      </div>
    </div>
  )
}

function getInitials(email: string) {
  const base = (email || 'U').split('@')[0] || 'U'
  return base.slice(0, 2).toUpperCase()
}