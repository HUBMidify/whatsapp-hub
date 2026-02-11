import React from 'react'

export function Card({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6 ${className}`}
      {...props}
    />
  )
}