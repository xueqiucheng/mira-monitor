import { NextResponse, type NextRequest } from "next/server";

// /api/health 必须放行，Railway 起 deploy 时拿它判断容器是否健康
const PUBLIC_PATHS = ["/api/health"];

// Edge runtime 用 Web Crypto 做常量时间比较，避免 timing attack
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const unauthorized = (): NextResponse =>
  new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="mira-monitor"' },
  });

export const middleware = (req: NextRequest): NextResponse => {
  if (PUBLIC_PATHS.includes(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const user = process.env.DASHBOARD_BASIC_AUTH_USER ?? "admin";
  const pass = process.env.DASHBOARD_BASIC_AUTH_PASS;

  // 没配密码 = 拒绝所有请求，避免误把无认证 dashboard 上线
  if (!pass) return unauthorized();

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return unauthorized();

  const inputUser = decoded.slice(0, sep);
  const inputPass = decoded.slice(sep + 1);

  if (!timingSafeEqual(inputUser, user) || !timingSafeEqual(inputPass, pass)) {
    return unauthorized();
  }

  return NextResponse.next();
};

export const config = {
  // 匹配所有页面 + API，跳过静态资源（_next/*, favicon 等）
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
