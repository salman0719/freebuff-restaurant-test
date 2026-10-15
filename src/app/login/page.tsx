/**
 * Login page (Phase 3.1, two-column layout in Phase B). Target of every
 * `proxy.ts` redirect: `?next=` carries the protected path the visitor
 * wanted, re-validated by `safeNext` in `./login-form` before any
 * redirect happens.
 *
 * `searchParams` is request data, so the page streams: the static shell
 * prerenders and only the form resolves per request. Exactly one live
 * form may exist — see the note in `_components/login-form.tsx`.
 */
import { Suspense } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Heading, Text } from "@/components/ui/typography";
import { safeNext } from "./login-form";
import { LoginForm, LoginFormSkeleton } from "./_components/login-form";

async function LoginSection({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<React.ReactElement> {
  const next = safeNext((await searchParams).next);
  return <LoginForm next={next} />;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): React.ReactElement {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-10 text-brand-50 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-brand-400/25 blur-3xl"
        />
        <p className="font-display relative text-2xl font-semibold">Restaurant App</p>
        <div className="relative flex flex-col gap-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand-200 uppercase">
            For restaurant owners
          </p>
          <p className="font-display text-4xl leading-tight font-semibold">
            Your restaurant, online — menus, hours, and a look that fits.
          </p>
          <ul className="flex flex-col gap-2 text-sm text-brand-100">
            <li>Publish a menu that stays current</li>
            <li>Keep hours and contact details accurate</li>
            <li>Choose a theme and preview changes before they go live</li>
          </ul>
        </div>
        <p className="relative text-sm text-brand-200/90">
          No passwords — sign in with a link sent to your email.
        </p>
      </aside>

      <main className="flex flex-col justify-center px-4 py-12 sm:px-8 lg:px-12">
        <div className="animate-rise mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <span className="font-display text-xl font-semibold lg:hidden">Restaurant App</span>
            <ThemeToggle className="ml-auto" />
          </div>
          <Heading level={1} className="mb-2">
            Sign in
          </Heading>
          <Text className="mb-6">
            Enter your email and we&apos;ll send you a sign-in link — no password to remember.
          </Text>
          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginSection searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
