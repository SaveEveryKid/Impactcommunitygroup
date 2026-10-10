import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache for now (pages render on demand). To enable caching later,
// create an R2 bucket and use the r2IncrementalCache override (see docs/DEPLOYMENT.md).
export default defineCloudflareConfig({});
