# AlphaPOS V1 dependency security triage — 2 November 2026

Scope: the independently installed `apps/web` npm lockfile, Node 22, Next.js 16. No database or business-logic changes.

## Package classification and changes

| Package | Original locked version | Selected version | Relationship / usage |
| --- | --- | --- | --- |
| next | 16.2.9 | 16.4.1 | Direct production framework; first release covering all reported Next advisories |
| eslint-config-next | 16.2.9 | 16.4.1 | Direct development tooling; kept aligned with Next |
| postcss | 8.4.31 under Next; 8.5.15 elsewhere | 8.5.23 | Transitive production-classified and development/build dependency; same-major override covers Tailwind's pinned copy too |
| sharp | 0.34.5 | 0.35.5 | Transitive optional production dependency selected by patched Next; native packages/libvips updated together |
| zod | 4.4.3 direct; 3.25.76 under shadcn | 4.6.6 | Direct production validation; old nested Zod removed |
| shadcn | 4.12.0 | 4.22.0 | Direct production-classified package, used only through its CSS import in AlphaPOS; first stable 4.x release depending on Zod 4 |
| minimatch | 3.1.5 and 10.2.6 | Unchanged | Transitive ESLint development dependencies and production-classified shadcn/ts-morph tooling |
| deepmerge | 4.3.1 | Unchanged | Transitive production-classified shadcn registry/code-generation tooling |

No React, Supabase, Tailwind or application major-version upgrades. Related Next/SWC/native image dependencies move with their parent. No forced audit fix. The override is restricted to PostCSS 8.5.23; review it when upstream pins catch up.

## Advisory inventory

Ranges and severities below are from `npm audit --package-lock-only --json` against the original lockfile. Fixed version means the version selected for this release, not necessarily the first historic patch for that individual advisory. Package classification and original installed versions are in the preceding table.

| Package | Advisory | Severity | Affected range | Fixed version / disposition |
| --- | --- | --- | --- | --- |
| next | [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24) | High | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) | High | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) | High | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-68g3-v927-f742](https://github.com/advisories/GHSA-68g3-v927-f742) | Moderate | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-4633-3j49-mh5q](https://github.com/advisories/GHSA-4633-3j49-mh5q) | Moderate | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-4c39-4ccg-62r3](https://github.com/advisories/GHSA-4c39-4ccg-62r3) | Moderate | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) | High | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-q8wf-6r8g-63ch](https://github.com/advisories/GHSA-q8wf-6r8g-63ch) | Moderate | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp) | Moderate | >=16.0.0 <16.2.11 | 16.4.1 |
| next | [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) | Critical | >=16.0.0 <16.3.3 | 16.4.1 |
| next | [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | Critical | >=16.0.0 <16.3.3 | 16.4.1 |
| next | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | Critical | >=16.2.0 <16.3.6 | 16.4.1 |
| next | [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | Moderate | >=16.0.0 <16.3.8 | 16.4.1 |
| next | [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) | Low | >=16.0.0 <16.3.8 | 16.4.1; development-server issue |
| next | [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) | Moderate | >=16.0.0 <16.3.8 | 16.4.1 |
| next | [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | Moderate | >=16.0.0 <16.3.8 | 16.4.1 |
| next | [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) | High | >=16.0.0 <16.3.8 | 16.4.1 |
| next | [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | Critical | >=16.0.0 <=16.4.0 | 16.4.1 |
| next | [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) | High | >=16.0.0 <=16.4.0 | 16.4.1 |
| next | [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) | Critical | >=16.0.0 <=16.4.0 | 16.4.1 |
| postcss | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | Moderate | <8.5.10 | 8.5.23 |
| postcss | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | High | <=8.5.11 | 8.5.23 |
| postcss | [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | Moderate | <=8.5.22 | 8.5.23 |
| postcss | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | High | <=8.5.17 | 8.5.23 |
| sharp | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | High | <0.35.0 | 0.35.5 |
| sharp | [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | High | <0.35.4 | 0.35.5 |
| sharp | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | High | <0.35.5 | 0.35.5 |
| zod | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | High | <4.6.6 | 4.6.6 |
| minimatch | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | Moderate | <11.0.1 | 11.0.1 requires a major transitive update; deferred |
| deepmerge | [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | Low | >=4.2.0 <=4.3.1 | No published patched version; deferred |

The other audit entries are inherited dependency-chain findings, not separate GHSAs: ESLint and its utilities/plugins/configuration, TypeScript-ESLint, ts-morph and @ts-morph/common, shadcn and @shadcn/registry. The original @tailwindcss/postcss finding came from PostCSS. Counts refer to affected package entries, not unique advisories.

## Production applicability

- AlphaPOS uses Next App Router and server API routes. Framework fixes are warranted without claiming every reported framework exploit was demonstrated here.
- No application `use server`, `use cache`, `next/image`, `next/og`/ImageResponse, custom server, rewrites, locale middleware, or dynamic metadata-image implementation was found. These feature-specific advisory prerequisites were not established. An unused image component alone does not prove the framework optimizer endpoint is inaccessible, so image/native dependencies were patched too.
- Vercel production is not the Windows-hosted server case. Windows local development and the development MCP advisory still justify updating the framework; local UAT should be restarted on patched dependencies when convenient.
- Zod is used in both Staff API routes and form schemas. The inspected APIs use scalar object fields, not the advisory's oversized array schema; no matching exploit path was demonstrated. Both direct and nested vulnerable versions were nevertheless removed.
- PostCSS processes checked-in styles during builds. AlphaPOS does not accept customer CSS for compilation. Its fixes protect the build dependency chain without changing styles or business logic.
- AlphaPOS imports only `shadcn/tailwind.css`; it does not import or execute the shadcn CLI/registry or ts-morph in request handlers. Deepmerge/minimatch remain relevant when developers process untrusted registries/configuration/globs. ESLint's copies are development dependencies. Keep those inputs trusted and do not expose generator/MCP tooling as a production service.
- Do not force minimatch 11 into consumers expecting 3 or 10, or downgrade shadcn/ESLint as suggested by npm's automatic fix graph. Those changes need a separate compatibility review; deepmerge has no patched release to select.

## Audit results

Original: all dependencies 24 affected entries (1 critical, 4 high, 18 moderate, 1 low); production-classified dependencies 9 (1 critical, 4 high, 3 moderate, 1 low).

Patched: all dependencies 21 affected entries (0 critical, 0 high, 19 moderate, 2 low); production-classified dependencies 6 (0 critical, 0 high, 4 moderate, 2 low). Remaining entries reduce to the two tooling advisories above. They have not been hidden by reclassifying packages as development-only.

## Validation

Clean installation and validation use an isolated copy of the current application and migrations, with Node 22.23.4 and local-placeholder build environment variables. No hosted database or existing local database is accessed. The live UAT process and its installed dependencies are deliberately not replaced during testing.

- `npm ci --no-audit --no-fund`: passed.
- Full regression command: 192 passed, 0 failed, 7 opt-in database suites skipped to preserve the no-database-changes requirement.
- Production build: passed with Next.js 16.4.1 on Node 22.23.4, including TypeScript and all 34 static pages.
- Inspected 44 production `.nft.json` output traces: no deepmerge, minimatch, shadcn, @shadcn or ts-morph package paths. Together with the source import review, this supports classifying the remaining findings as tooling exposure rather than a demonstrated production request path. Trace inspection is not a general proof of non-exploitability.
- `git diff --check`: passed.

Recommendation: GO for dependency security for the current production architecture, with the two tooling advisories documented and tracked. This is not a zero-advisory result. Reassess before using untrusted generator input or shipping these tools in a runtime endpoint. Do not apply incompatible major overrides to suppress the findings.

This assessment concerns dependency security only, not approval to deploy or a replacement for the separate hosted migration/backup release gates. Advisory data is time-sensitive; rerun audit at release.
