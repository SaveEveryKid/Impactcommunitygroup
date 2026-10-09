import { authorizeCron } from "@/lib/cron";
import { getServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorizeCron(req)) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await getServiceClient().rpc("run_maintenance");
  if (error) {
    console.error("[cron:maintenance]", error);
    return new Response("Maintenance failed", { status: 500 });
  }
  return Response.json(data);
}
