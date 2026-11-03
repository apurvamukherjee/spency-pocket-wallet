import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/env";

// RFC 9728 metadata for the /api/mcp resource: Supabase Auth is the authorization server Claude signs in with.
const metadata = protectedResourceHandler({ authServerUrls: [`${SUPABASE_URL}/auth/v1`] });

export function GET(req: Request) {
  return supabaseConfigured ? metadata(req) : new Response("Accounts aren't configured on this server", { status: 404 });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
