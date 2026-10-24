# Implementation prompt: verified post-wave-E defect repairs for Mijhar

Paste this whole document into a fresh Claude Code implementation session opened on the Mijhar repository.

---

## 0. Role, language, and hard limits

You are the implementation engineer for a bounded repair task in the Mijhar browser extension.

**Language.**
- Every message, question, progress update, and final report addressed to the owner must be in Arabic.
- Keep technical terms, file names, paths, commands, and code identifiers in their original form.
- Code, comments, and test names follow the existing project style. Mijhar source comments are in Arabic.

**Hard limits.**
- Stop at a local handoff on your own branch.
- Do not merge into `main`, push, open pull requests, publish, start GitHub Actions, delete or modify any existing worktree, create tags, or begin any MJ stage or wave.
- Do not run `/mj` or `/mj-merge`.
- Do not expand extension permissions or manifest host permissions.
- Do not weaken validation, allowlists, or permission checks as a shortcut.
- Do not use cloud services, real GitHub accounts, paid APIs, or live writes to GitHub.
- Use synthetic fixtures and temporary browser profiles only.
- Work in this session. Do not spawn additional agents.

## 1. Project context you must load first

- **Project root:** `/Volumes/iSltanXx/Projects/Brave/Mijhar`.
- **Governing documents, read before editing:**
  - `CLAUDE.md`.
  - `Docs/MJ/README.md`, especially the ownership rules and the wave-E log entry.
  - `DECISIONS.md` (generated).
  - `EXECUTION_PLAN.md`.
  - The stage records `Docs/MJ/stages/MJ7.md`, `MJ9.md`, `MJ10.md`, `MJ11.md`, `MJ12.md`, and `MJ13.md`–`MJ15.md`.
- **Environment.** If `node` fails with `_load_nvm`, run `unfunction node npm npx corepack 2>/dev/null; hash -r` first. Node `v24.18.1` was used in verification. Firefox 158.0.1 is installed.
- **Generated files you must never hand-edit:** `STATUS.md`, `ROADMAP.md`, `phases/`, `DECISIONS.md`, `TRACEABILITY.md`, `NAMING.md`, `dashboard/data.js`. Inside a worktree, the only regeneration command allowed is `node tools/build.mjs --sync`.
- **Verified baseline.** Branch `main` at `6e333faa7a063042e0d541caca810dd48fef748e`, with waves A–E merged and wave F open on tag `mj-F/base`. `MJ13`, `MJ14`, and `MJ15` had not started. The only untracked items were `Docs/Audit/` and `Docs/Mijhar-Audits/`, which hold the audit inputs, plus `Docs/Mijhar-Audit-Review/`, which holds this prompt and the unified review. Do not modify them, and do not commit them unless the owner asks.
- **Evidence for this task:**
  - Unified review: `Docs/Mijhar-Audit-Review/fable-executive-review-20261023-2246.md`. It is in Arabic. Appendix 1 contains the exact source of the diagnostic tests `F-001`…`F-011b`.
  - Codex reproduction tests `R1`–`R9`: `Docs/Mijhar-Audits/codex-independent-audit-20261023-2218-evidence/independent-reproductions.test.tsx`.
  - Codex real-Chrome fixture runner and logs: `Docs/Mijhar-Audits/codex-independent-audit-20261023-2218-evidence/independent-browser.mjs` and `.../logs/`.

## 2. Step 1: recheck the baseline before any edit

1. Record the outputs of `git -C /Volumes/iSltanXx/Projects/Brave/Mijhar branch --show-current`, `rev-parse HEAD`, `status --porcelain`, and `worktree list`.
2. If `main` is no longer at `6e333fa…`, list the new commits with `git log --oneline 6e333fa..main`.
3. For each defect below, check whether the new commits touched the listed files. Re-run that defect's reproduction before deciding it is still present.
4. Implement only defects whose reproduction still fails. Report any that already pass as «أُصلح سابقًا», with the commit that fixed it.
5. Create a new worktree and branch from `main` for this work, for example `fix/audit-remediation-e`. Do not edit the main checkout, do not switch its branch, and do not touch other worktrees.
6. Follow the project's worktree conventions in `Docs/MJ/README.md` where they apply. This is a post-wave-E repair, not an MJ stage, so do not create a stage file. Run `npm ci` in the new worktree if `package-lock.json` exists.

## 3. Test-first rule

For every defect:
1. Add a regression test under the matching `tests/` path.
2. Run it and confirm it fails on the unmodified code.
3. Implement the fix.
4. Confirm the test passes and the neighbouring suite still passes.

You may adapt `R1`–`R9` and `F-…` into proper project tests. Do not keep files named after the audits.

Update existing tests only when they encode the defect, and explain each such change. The known case is `tests/modules/g/anchor/page.test.tsx:231-248`, which expects an anchor to survive deletion until a page reopens.

## 4. Confirmed defects to fix

Severity uses High, Medium, and Low. Each item lists the original audit IDs, which you must cite in commits and evidence.

### Group 1: notes and anchors data integrity (implement first)

**VR-01: cross-context lost update and resurrection of deleted notes.** High. Aliases: `CODEX-MJ-001`, and the multiple-Store part of `MJ-AUDIT-010`.

*Root cause.*
- `Store.update` and `Store.remove` in `src/core/storage/store.ts:221-238` read-modify-write whole records inside a per-instance queue only.
- Each context (content script, side panel, options) opens its own `Store`. Content scripts use `locks: null`, which `src/core/ui-host/settings-runtime.ts:3-5` documents as unavoidable.
- `AnchorController.run` in `src/modules/g/anchor/controller.ts:145-149` writes `anchorStatus` automatically. `NotesRepository.update` and `remove` live in `src/modules/g/notes/repository.ts:109-132`.
- Reproduced by `R1`, where the text edit was lost, and `R2`, where the note survived its deletion.

*Required remedy.*
- Make the background the single writer for `notes.*` and `anchors.*`. Every create, update, and remove of a note, and every anchor save and remove, goes through a runtime message to a background broker, including from extension pages. The broker executes the operations in one queue on the background `Store`.
- Send field patches, not whole records. The broker re-reads the current record and re-validates with the existing logic: `checkNoteText`, `sameLineHome`, `isNote`, and `isLineAnchor`.
- Reject an anchor save whose note record no longer exists.
- Validate message shapes in the background and never trust sender-computed records.
- If the background is unreachable, fail the operation visibly in the UI. Never fall back to a local write.
- Keep the direct path for the background itself and for unit tests.

*Rejected alternatives.* Do not implement any of these:
- Sharing one `Store` per context. It does not cover writes across contexts.
- `navigator.locks` in content scripts. The lock belongs to the github.com origin.
- Revision compare-then-write over `chrome.storage`. It still races, because there is no atomic conditional write.

*Acceptance.*
- Two simulated contexts write through the broker to a storage area whose `get` and `set` yield, which forces interleaving. Concurrent text and `anchorStatus` patches both persist.
- A remove that overlaps an earlier-started update leaves the note deleted, including after reopening storage.
- An anchor save after the remove is rejected.
- `tests/modules/g` and `tests/core/storage` remain green.

**VR-04: note deletion leaves `anchors.<id>` and its code snippet.** Medium. Aliases: `CODEX-MJ-005`, part 3 of `MJ-AUDIT-009`.

*Root cause.* `NotesRepository.remove` deletes only `notes.<id>`. `pruneOrphans` in `src/modules/g/anchor/store.ts:65-68` runs only from the page `AnchorController`. Reproduced by `R7`.

*Remedy.*
- The broker's note-remove deletes `notes.<id>` and `anchors.<id>` in a single storage call. Add a minimal `Store.removeMany(names)` that calls `area.remove([...keys])`.
- Keep `pruneOrphans` as recovery, and also run it once in the background after storage opens.

*Acceptance.*
- Delete from a panel context with no controller running. After reopening storage, neither record exists.
- If you split the steps, simulate interruption between them and show that recovery on background start removes the orphan.

**VR-05: anchor comparison cache ignores equal-length interior changes.** Medium. Alias: `CODEX-MJ-004`.

*Root cause.* The `comparableFor` key in `controller.ts:203-211` uses mode, salt prefix, max line, line count, total length, and the first and last lines only. Reproduced by `R4`, which returned `matched` while a fresh controller returned `changed`.

*Remedy.* Include a cheap content hash of all lines in order in the key, for example FNV-1a. Alternatively, drop the cache for `text` mode and keep it for `hash` mode with a content-derived key.

*Acceptance.* The `R4` scenario on the same controller yields `changed`, matching a fresh controller.

**VR-10: native side panel persists a wrong ref and path split for branches containing `/`.** Medium. Alias: part (a) of `MJ-AUDIT-001`. Note that the claim that such notes become invisible was disproved, because `relationTo` still returns `exact`.

*Root cause.* `tabsPageSource` in `src/shared/page/page-source.ts:51-73` uses `pageInfoFromUrl` only, which `src/shared/page/page-info.ts:113-118` implements as a naive split. Example: `/blob/chore/v2-pnpm-monorepo/README.md` becomes `ref: "chore"`, `path: "v2-pnpm-monorepo/README.md"`, `refKind: "unknown"`. Used by `NotesView` (`src/modules/g/notes/view.tsx:17`) and `LaterView` (`src/modules/g/bookmarks/view.tsx:37`).

*Remedy.*
- Add a page-info bridge. The panel calls `tabs.sendMessage(activeTabId, {type: …})`, and a content-script responder returns `documentPageSource(document).read()`. No new permission is required.
- Register the responder in the content script, either in `src/content/main.tsx` or a small module it imports.
- If the bridge fails on a `blob` page, return file-level and line-level targets as `null`, with an Arabic reason such as «أنشئها من بطاقة الصفحة نفسها». This mirrors the existing `lineReason` handling for diff pages. Never save a target derived only from URL splitting.

*Acceptance.*
- With the bridge succeeding, a panel-created file or line note stores `ref: "chore/v2-pnpm-monorepo"`, `path: "README.md"`, and `refKind: "ref"`.
- With the bridge failing, no file or line target is offered, and the repo level still works.
- The same holds for QuickSave in `LaterView`.

### Group 2: composer insertion ownership

**VR-02: «التراجع عن آخر إدراج» deletes a pre-existing identical block.** High. Alias: `CODEX-MJ-002`.

*Root cause.* `closest` and `undoInsertion` in `src/modules/f/composer/insert.ts:89-115` search the whole field for any occurrence of `inserted`. Reproduced by `R3` and in real Chrome on a fixture: the result was `IntroTail…It changed.` with status `removed` and the success message.

*Remedy.* Remove the global search. Accept a removal position only with proof of ownership:
- Accept `start` if `value.slice(0, start) === valueAfter.slice(0, start)`.
- Or accept `start + (value.length - valueAfter.length)` if the text after the block is unchanged.
- In both cases `value.slice(pos, pos + inserted.length) === inserted` must also hold.
- Otherwise return `modified` without touching the field. The existing «نسخ المسودة السابقة» path stays.
- Tracking the inserted range via `input` events is an acceptable equivalent. Text similarity alone is never proof.

*Acceptance.*
- The `R3` scenario returns `modified` and leaves the draft byte-identical.
- Edits before or after the block still remove only the block.
- Immediate undo restores the draft.
- `tests/modules/f` stays green.
- If the environment can launch Chrome, run `tests/modules/f/composer/browser/run.mjs`; otherwise record it as «لم يُجرَ» with the reason.

### Group 3: PR status correctness and request discipline

**VR-03: API checks from another head commit are merged into the visible PR.** High. Aliases: `CODEX-MJ-003`, `MJ-AUDIT-004`.

*Root cause.*
- `mergeApi` and `mergeItems` in `src/modules/d/blockers/merge.ts:11-46` never compare heads.
- `PrStatusController.draw` in `src/modules/d/pr-status/module.tsx:249-255` passes stored `apiData` to `mergeApi`, `explainBlockers`, and `collapsedInfo` on every draw.
- Reproduced by `R5`: `failure` became `success` while the visible head was `bbbb…` and the API head was `aaaa…`.

*Remedy.*
- Merge checks and pass `pull` facts into blockers only when `api.pull.value.headSha` matches `summary.headSha`, using the same at-least-7-character prefix rule as `sameSha`.
- On mismatch or an unknown DOM head, keep the API data out of the summary and blockers. Show it separately with an Arabic notice that it belongs to another commit and should be re-read.
- Evaluate this on every draw, which covers late responses. A return to a previous head (A to B to A) is a valid identity match.

*Acceptance.*
- `R5`.
- API read for head A, then the DOM updates to head B with the same check name failing, then the late A response arrives. B's failure stays visible in both the summary and the blockers, and A's success appears nowhere.
- A response matching B merges normally.

**VR-06: commit statuses pagination incompleteness is dropped.** Medium. Alias: `CODEX-MJ-006`.

*Root cause.* `src/modules/d/blockers/api-read.ts:160-166` sets `partial: runs.data.partial` only, and statuses are fetched with one page. `collapsedInfo` in `src/modules/d/blockers/freshness.ts:32-38` then suppresses the partial alert. Reproduced by `R6`.

*Remedy.* Set `partial = runs.partial || statuses.partial`, and compute read and expected counts from both sources without mixing them. Raising the page cap is optional; the alert must stay correct either way.

*Acceptance.* Complete check runs with partial statuses give `partial: true` and the collapsed alert renders in the card.

**VR-07: `Retry-After` does not govern subsequent requests.** Medium. Alias: `CODEX-MJ-008`.

*Root cause.* `PublicApiClient.get` in `src/core/api/client.ts:97-98` and `120-124` returns `retryAt` but records nothing. `RateLimitTracker.blockedUntil` in `src/core/api/rate-limit.ts:50-55` blocks only when `remaining === 0`. Reproduced by `R9`, which made two network calls inside the window.

*Remedy.* Add a per-resource cooldown in the tracker. `blockedUntil` returns the later of the cooldown and the exhausted reset. `get` refuses locally with `rate-limit` and the `retryAt` without calling `fetch`, and `getAll` inherits this. Keep the `/rate_limit` exemption.

*Acceptance.*
- A second request before the deadline makes zero fetch calls and carries `retryAt`.
- A request after the deadline goes out.
- A second consumer of the same background client is also refused.

**VR-19: commit-status evidence cites the check-runs request.** Low. Alias: part (b) of `MJ-AUDIT-011`.

*Root cause.* `whereOf` in `src/modules/d/blockers/explain.ts:95-98` always returns `requests[1]`. Reproduced by `F-011b`.

*Remedy.* Use `requests[2]` (the `/status` path) when `item.id === null`.

*Acceptance.* `F-011b`.

### Group 4: page lifecycle and surface recovery

**VR-08: `PageDetector` announces a navigation before late React DOM arrives.** Medium, cross-module. Alias: parts 1–4 of `MJ-AUDIT-003`.

*Root cause.*
- `DEFAULT_SETTLE_MS = 100` in `src/core/detector/detector.ts:36`, together with `settle` at `154-165` and `signature` at `194-203`.
- The live measurement in `evidence/T-1.2/live-selector-check.md`, cited in the header of `detector.ts` itself, shows the URL changing at about 13ms and the DOM arriving at about 240ms.
- Reproduced by `F-003`. The announcement fired at 112ms on the old DOM, and the 240ms DOM change was never announced because the signature was unchanged. A 60ms control announced once with the new DOM.
- Live frequency on same-type GitHub navigations was not measured.

*Remedy.*
- Track the time of the last foreign mutation, meaning one whose added or removed nodes are not only `mijhar-host` or `[data-mijhar-injected]`.
- When the URL part of the signature changes:
  - If a foreign mutation happened within `settleMaxMs` before the change, announce after settling as today. This is the DOM-first PR-tab case.
  - Otherwise wait for the first foreign mutation after the URL change, then settle, capped at `settleMaxMs`.
- Keep exactly one announcement per navigation. The extension's own insertions must neither delay nor re-trigger announcements.

*Rejected remedy.* Do not add the confirm-element identity to the signature. It would remount all modules on any in-place re-render of the header.

*Acceptance.*
- DOM arriving 240ms after the URL gives one announcement, made after the new DOM.
- DOM arriving before the URL gives one announcement.
- A hash-only change gives no announcement.
- Module host insertions after an announcement cause no new announcement and no loop.
- A URL change with no DOM change is announced at the cap.
- `tests/core` stays green.

**VR-09: module (ح) surface is lost after a subtree re-render.** Medium. Aliases: `CODEX-MJ-007`, and the module-h part of item 5 in `MJ-AUDIT-003`.

*Root cause.* `PageRuntime.scan` in `src/modules/h/module.tsx:84-100` re-places only when `surface` is `null`, and returns early on an unchanged data signature. Reproduced in real Chrome on a fixture: hosts went from 1 to 0 while `main` stayed connected.

*Remedy.*
- If `surface` exists and `!surface.host.isConnected`, re-insert the same host via `ctx.mutations.insert` at a freshly resolved valid anchor, reset `last` so the next pass re-renders, and add no new observers.
- If no valid anchor exists, wait for the next mutation.
- The change applies to `ProfileRuntime` through the base class.

*Acceptance.*
- Replacing the README container's children three times, with root and URL unchanged, leaves exactly one working host and no extra observers.
- Disabling the module removes it and restores the page byte-identical.

**VR-17: the reading-mode button never appears for Markdown containers rendered after mount.** Low. Alias: part (a) of `MJ-AUDIT-007`.

*Root cause.* `src/modules/a/reading/feature.ts:69-84` scans once and registers no observer. The button is the only path to `READING_OPEN_MESSAGE`.

*Remedy.* Observe `body` until the button is placed once, then disconnect. Never place a duplicate.

*Acceptance.* A page without a container, after a container is added, shows exactly one button, and teardown removes it.

**VR-11: the `docs/` scan result in the side panel survives a repository switch, and late results leak.** Medium. Alias: part 1 of `MJ-AUDIT-009`.

*Root cause.* `<DocsScanControl>` in `src/modules/h/readme-detector/ReadmePanelView.tsx:41` has no key, and its state lives in `ReadmeBanner.tsx:36-44`. Reproduced by `F-009`: `octo/one` results showed under `octo/two`, including a late response.

*Remedy.* Key the control by `owner/repo` in the panel. A request token is an optional extra guard.

*Acceptance.*
- Switching from A to B shows no A results.
- A scan on A that resolves after the switch to B shows nothing.
- A to B to A with a late response from the first A shows nothing in the new A instance.

**VR-18: README match links in the side panel lack new-tab semantics.** Low. Alias: part 2 of `MJ-AUDIT-009`.

*Root cause.* `MatchLinks` in `ReadmeBanner.tsx:17-27` sets no `target`.

*Remedy.* Add a prop so that panel usage renders `target="_blank" rel="noopener noreferrer"`. In-page banner behaviour stays unchanged.

*Acceptance.* Panel links carry both attributes, and banner links do not.

### Group 5: masking correctness (must land before any translation engine in MJ14)

**VR-12: `tokenNodes` binds an explicit link to an earlier detected plain-text token with the same value.** Medium, latent until engines exist. Alias: part (a) of `MJ-AUDIT-005`.

*Root cause.* `src/modules/c/ui/blocks.ts:180-192` matches records by type and text. Reproduced by `F-005a`: `<p>See #7 and <a href=…>#7</a>…</p>` bound the link to `⟦REF_0⟧`, the plain text, and left `⟦REF_1⟧` unbound.

*Remedy.* Have `maskSegments` report the tokens produced by explicit segments in order, for example `explicitTokens` or a per-record origin flag. `tokenNodes` then zips `block.nodes` with them positionally.

*Acceptance.* `F-005a`, plus the existing two-links «here» test.

**VR-13: `splitMarkdownCode` treats a line that starts with same-line triple-backtick inline code as a fence opener, swallowing the rest of the document.** Medium, latent. Alias: part (b) of `MJ-AUDIT-005`.

*Root cause.* `FENCE_OPEN` and `splitMarkdownCode` in `src/modules/c/masking/mask.ts:66-97`. The function is used by `fail-safe.ts:59`. Reproduced by `F-005b`.

*Remedy.* Per CommonMark §4.5, a backtick fence whose info string contains a backtick is not a fence opener; treat such a line as plain text. Genuinely unclosed fences still extend to the end of the document.

*Acceptance.* `F-005b`, plus the existing masking tests.

**VR-21: selection translation ignores the registered content selectors.** Low, latent. Alias: part (c) item 1 of `MJ-AUDIT-011`.

*Root cause.* `src/modules/c/ui/selection.tsx:177` calls `selectionTarget(doc)` with the default `.markdown-body` only. The registered selectors are in `src/modules/c/ui/module.tsx:25-31`.

*Remedy.* Pass the `c.ui.body` candidates to `selectionTarget`.

*Acceptance.* A selection inside `.comment-body` without `.markdown-body` shows the button.

### Group 6: accessibility, copy fidelity, and wording

**VR-14: copying from the reader with diacritics hidden drops leading marks and marks-only text nodes.** Medium. Alias: part (d) of `MJ-AUDIT-007`.

*Root cause.* `originalSlice` in `src/modules/a/reading/reader/view.ts:43-47` uses `offsets[0]` when `start === 0`. `clipboard` at `181-196` skips nodes whose stripped length is 0. Reproduced by `F-007d`: `ِسمِ` became `سمِ`. This violates `AC-A5` item 1.

*Remedy.* Use `from = start === 0 ? 0 : offsets[start]`. Include the full original of registered entries whose shown text is empty and lies inside the range.

*Acceptance.* Copying a paragraph containing `<strong>ب</strong>ِسمِ` and a marks-only node yields `plain` and `html` with every mark.

**VR-15: an outside click while an explain card is open steals focus back to the badge.** Medium. Alias: part (a) of `MJ-AUDIT-008`.

*Root cause.* The `useEffect([openIndex])` in `src/modules/b/card/overlay.tsx:138-147` refocuses the badge on any close, including the outside-pointerdown close in `src/modules/b/card/module.tsx:98-104`. Reproduced by `F-008a`: focus ended on the badge instead of the page input.

*Remedy.* Carry a close reason: `keyboard`, `button`, `outside`, or `rescan`. Refocus the badge only for `keyboard` and `button`.

*Acceptance.* `F-008a`, plus the existing Escape and close-button focus tests in `tests/modules/b/access/keyboard.test.tsx`.

**VR-16: the in-overlay «إيقاف» button does not restore the pre-activation focus.** Low. Alias: part (b) item 2 of `MJ-AUDIT-008`.

*Root cause.* `onStop` in `module.tsx:227` calls only `mode.set(false)`.

*Remedy.* Route stop through the same restore path as `Alt+H`, capturing the shadow reference before `release()`.

*Acceptance.* `F-008b`: focus returns to `#star-btn`.

**VR-20: the drawer glossary notice claims `Alt+K` opens the native panel.** Low. Alias: part (c) of `MJ-AUDIT-008`.

*Root cause.* The notice in `src/modules/b/search/view.tsx:307-309`. When the surface is `drawer`, `openPanel` in `src/core/ui-host/commands.ts:60-82` falls back to the drawer, because `applySurface` disables `sidePanel` in Chromium.

*Remedy.* Correct the Arabic copy: search lives in the native side panel, and if the panel location is «الدرج» it can be changed in settings.

*Acceptance.* The notice text makes no false claim.

## 5. Do NOT implement (verified as not defects, unverified, or owner-scope)

Mention these in your report only if your work touches them.

- **Rejected after verification.** Do not "fix" these:
  - Notes on slash branches becoming invisible.
  - Panel QuickSave lacking scroll position; this is documented design.
  - Module (ح) API being unavailable in page and drawer; this is documented design and `AC-H1` holds. Do not add `/search/issues` to `isPublicPath`.
  - Isolation and digits lifecycle corruption; tests show the final DOM is correct and the guard reports are intended.
  - The reader's `disabled` message; the `unreachable` text already covers it.
  - `Alt+H` focus restore; the existing test passes.
  - A stale overwrite in `PrStatusController.load`; results are keyed by URL.
  - A stale checks-region observer; the code observes `contentRoot`.
  - The skipped-tests explanation; they are gated by `GHSIM_SOURCE` and `MIJHAR_HISTORIES`.
  - The `execCommand` native-undo concern; it is covered by `evidence/T-7.1`.
- **Unverified hypotheses.** Do not implement without new failing evidence:
  - The mutation-registry restore over externally modified wrappers (Codex `U-01`, test `R8`).
  - Request abort propagation (Codex `U-02`).
  - Live selectors.
  - Shortcuts across the four browsers.
  - Notes, bookmarks, and log-parser cards lost on in-place re-render without navigation.
  - The 15-second capture window for panel-created line notes.
- **Deferred or owner-scope.** Leave these alone:
  - The current-page override UI; recorded out of scope in `Docs/MJ/stages/MJ7.md:199`.
  - Waking the service worker in `openSettings`; latent while `CURRENT_SCHEMA_VERSION = 1`.
  - Duplicate drawer notices.
  - The up-to-15-second lag when `PP-01` changes.
  - The stale reader article under an error banner.
  - Document-level Escape for the selection card.

## 6. Commits, file ownership, and order

- Implement in group order 1 → 2 → 3 → 4 → 5 → 6, with at least one commit per group.
- Each commit message cites the `VR-…` IDs and every original alias, for example `CODEX-MJ-001` and `MJ-AUDIT-010`.
- End each commit message with the attribution line required by your session.
- **Shared files:**
  - Only Group 1 touches `src/background/main.ts` and `src/content/main.tsx`.
  - No production file belongs to two groups.
  - If you find one does, stop and report it rather than interleaving edits.
- Keep each fix minimal. No broad refactors, no renames, no dependency or lockfile changes, no manifest permission changes.

## 7. Verification

**Per group.** Run the group's new tests and its neighbouring suites:
- Group 1: `npx vitest run tests/modules/g tests/core/storage`.
- Group 2: `tests/modules/f`.
- Group 3: `tests/modules/d tests/core/api`.
- Group 4: `tests/core tests/modules/h tests/modules/a`.
- Group 5: `tests/modules/c`.
- Group 6: `tests/modules/a/reading tests/modules/b`.

**Final integration, in order:**
1. `npm run typecheck`.
2. `npm test`. Expect the prior 1661 passing tests plus the new ones, with exactly the two env-gated skips.
3. `npm run build`, then `npm run lint:firefox`. The lint must run on freshly built artifacts.
4. `node scripts/load-check.mjs chrome edge brave firefox --dist dist`, if the environment allows launching browsers. Otherwise record «لم يُجرَ» with the reason.
5. Re-run `R1`–`R7`, `R9`, and the `F-…` diagnostics in a temporary copy outside the repository. All must pass. `R8` is expected to keep failing, because `U-01` is not in scope.
6. `node tools/build.mjs --sync` in the worktree.

## 8. Tracking through the existing source of truth

Do not create a new tracker, stage file, or status file.

- Write the evidence report at `evidence/wave-E/audit-remediation/report.md`, following the precedent of `evidence/wave-E/ui-host-firefox/` for post-closure fixes. Include:
  - For each `VR-…`: its aliases, root cause, the failing-before and passing-after test names, and the commit.
  - The command outputs of section 7.
  - What was not run, and why.
- Do not edit `Docs/MJ/README.md`, `waves.json`, `data/status.json`, generated files, or any stage file. Those belong to the merge coordinator.
- Instead, put a ready-to-paste Arabic wave-E log addendum in your final report, for the owner or merge coordinator to apply at merge time.
- Only touch `data/plan.json` if a delegated decision becomes necessary under `AD-14`. None is expected.

## 9. Final report to the owner, in Arabic

Include:
- The branch and worktree path.
- Each commit's hash and subject.
- For every `VR-…`: its status (fixed, already fixed with commit, or not fixed with reason), the evidence paths, and the test names.
- The integration results, with real numbers.
- Remaining limitations: no live GitHub, any browsers that were not run, and real-world race frequency not measured.
- Merge readiness, and any conflict risk with `MJ13`, `MJ14`, or `MJ15`, which will own `modules/g/notes`, `modules/f/composer`, `modules/c`, and `core/api`.
- The draft log addendum.

Then stop. Do not merge, push, publish, or start Actions or the next wave unless the owner asks separately.
