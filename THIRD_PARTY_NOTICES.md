# Third-party notices

The exact dependency graph and license metadata are recorded by `package-lock.json` and the CycloneDX SBOM generated in CI. Production code directly depends only on React and React DOM. Build, test, lint, XML-test, and Cloudflare deployment tools are development dependencies and are not loaded by the deployed application.

## Jost

Jost font subsets in `public/fonts/` are derived from the Jost project and distributed under the SIL Open Font License 1.1. The complete license is retained at `public/fonts/OFL.txt`. Reports embed the same licensed subsets as data fonts so they remain readable offline.

## JavaScript packages

Direct packages include React, React DOM, Vite, the React Vite plugin, TypeScript, ESLint and TypeScript ESLint, React Hooks lint rules, Wrangler, Cloudflare Workers types, xmldom for Node parser tests, and fake-indexeddb for storage tests. Their authors and licenses remain available in each package manifest and in the generated SBOM.

No third-party JavaScript, stylesheet, font, image, analytics tag, or remote runtime asset is requested by the deployed page.
