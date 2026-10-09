"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/validation";

const requestSchema = z.object({
  resource_id: z.string().uuid(),
  org_id: z.string().uuid({ message: "Choose which organization is requesting" }),
  quantity: z.coerce.number().positive("Enter a quantity greater than zero"),
  message: z.string().trim().max(2000).optional(),
  intended_use: z.string().trim().max(1000).optional(),
});

export async function requestResource(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to request resources." };
  const parsed = requestSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return { ok: false, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const d = parsed.data;
  const supabase = (await getSupabase())!;
  const { error } = await supabase.rpc("request_resource", {
    p_resource: d.resource_id,
    p_org: d.org_id,
    p_quantity: d.quantity,
    p_message: d.message || null,
    p_intended_use: d.intended_use || null,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err === "That already exists." ? "Your organization already has a pending request for this listing." : err };
  revalidatePath(`/resources/${d.resource_id}`);
  return { ok: true, message: "Request sent. The listing organization will review it, and you'll be notified of their decision." };
}
