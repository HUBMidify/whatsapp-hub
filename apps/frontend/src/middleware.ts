import { withAuth } from "next-auth/middleware";
import { NextRequest, NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Dev-only: allow testing WhatsApp status endpoint via curl using x-user-id header
        if (
          process.env.NODE_ENV !== "production" &&
          req.nextUrl.pathname === "/api/whatsapp/status" &&
          req.headers.get("x-user-id")
        ) {
          return true
        }

        return !!token
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/debug|api/links|api/whatsapp/status|track).*)",
  ],

};