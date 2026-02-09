import * as React from "react"

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900 ${className}`}
      {...props}
    />
  )
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="mb-4" {...props} />
}

export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />
}

export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className="text-lg font-semibold" {...props} />
}

export function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className="text-sm text-gray-500" {...props} />
}