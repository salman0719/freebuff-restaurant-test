/**
 * Login page (Phase 3.1). Target of every `proxy.ts` redirect: `?next=`
 * carries the protected path the visitor wanted, re-validated by
 * `safeNext` in `./login-form` before any redirect happens.
 *
 * `searchParams` is request data, so the page streams: the static
 * shell prerenders and only the form resolves per request.
 */
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
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
    <Container className="flex min-h-[70vh] max-w-md flex-col justify-center py-12">
      <div className="mb-4 flex justify-end">
        <ThemeToggle />
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
    </Container>
  );
}
