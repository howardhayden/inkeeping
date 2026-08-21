import { SECURITY_HEADERS } from "../security-headers";

interface SitesEnvironment {
  ASSETS: Fetcher;
}

const adapter = {
  async fetch(request, environment) {
    const response = await environment.ASSETS.fetch(request);
    const secured = new Response(response.body, response);
    for (const [name, value] of SECURITY_HEADERS) secured.headers.set(name, value);
    return secured;
  },
} satisfies ExportedHandler<SitesEnvironment>;

export default adapter;
