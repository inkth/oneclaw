"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckoutModal } from "@/components/CheckoutModal";

type Plan = "PRO" | "TEAM";

export function PricingCTA({
  plan,
  label,
  className,
}: {
  plan: Plan | "FREE";
  label: string;
  className: string;
}) {
  const router = useRouter();
  const { status } = useSession();
  const [open, setOpen] = useState(false);

  if (plan === "FREE") {
    return (
      <a href="/login" className={className}>
        {label}
      </a>
    );
  }

  function onClick() {
    if (status !== "authenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent("/pricing")}`);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button onClick={onClick} className={className}>
        {label}
      </button>
      {open && (
        <CheckoutModal plan={plan as Plan} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
