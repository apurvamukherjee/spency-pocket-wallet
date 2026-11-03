import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { INSTRUCTIONS, registerTools } from "@/lib/mcp/tools";
import { verifyAccessToken } from "@/lib/supabase/token";

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "spency", version: "0.2.0" },
  instructions: INSTRUCTIONS,
});

// Every call needs a Supabase access token; without one the client gets a 401 pointing at the metadata below.
const authed = withMcpAuth(handler, verifyAccessToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authed as DELETE, authed as GET, authed as POST };
