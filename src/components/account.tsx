"use client";

import { useActionState } from "react";
import type { Shown } from "@/app/account/actions";
import { PendingButton } from "./opportunities/client";

function OneTimePassword({ shown }: { shown: Shown }) {
  if (!shown?.password) return shown?.error ? <div className="flash error">{shown.error}</div> : null;
  return (
    <div className="note" role="status" style={{ marginTop: ".6rem" }}>
      <strong>Temporary password for {shown.who}</strong>
      <div className="recovery-code" style={{ fontSize: "1.05rem", margin: ".3rem 0" }}>
        {shown.password}
      </div>
      <span className="small">Send it to them privately. It is shown only now; they should change it under Account after signing in.</span>
    </div>
  );
}

export function AddMemberForm({ action }: { action: (prev: Shown, f: FormData) => Promise<Shown> }) {
  const [shown, formAction] = useActionState(action, null);
  return (
    <>
      <form action={formAction} className="inline" key={shown?.password ?? "form"}>
        <label style={{ flex: "1 1 180px" }}>
          Name
          <input name="name" required maxLength={120} />
        </label>
        <label style={{ flex: "1 1 240px" }}>
          Email
          <input name="email" type="email" required />
        </label>
        <PendingButton className="primary" pending="Adding…">
          Add team member
        </PendingButton>
      </form>
      <OneTimePassword shown={shown} />
    </>
  );
}

export function ResetPasswordButton({ action }: { action: (prev: Shown) => Promise<Shown> }) {
  const [shown, formAction] = useActionState(action, null);
  return (
    <div>
      <form action={formAction}>
        <PendingButton className="small" pending="Resetting…" confirm="Give this person a new temporary password? Their current sessions end.">
          New temporary password
        </PendingButton>
      </form>
      <OneTimePassword shown={shown} />
    </div>
  );
}
