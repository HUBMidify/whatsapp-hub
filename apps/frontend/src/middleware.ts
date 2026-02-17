import { withAuth } from "next-auth/middleware";
import { NextRequest, NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/debug|api/links|track).*)",
  ],

};