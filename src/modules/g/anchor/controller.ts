// متحكم المرساة في صفحة الملف: يحفظ مرساة ملاحظة السطر عند إنشائها، ويعيد تثبيت ملاحظات الأسطر الخاصة بالصفحة المفتوحة عند فتحها
// وعند تغيّرها، ويكتب حالة المرساة في الملاحظة (حقلها المستقل عن النص). كل ذلك من DOM الصفحة دون أي طلب شبكي (AC-G3)، ولا يُنقل
// موضع ملاحظة إلا بنقر المستخدم (relocate). ملاحظة لا مرساة لها (قبل T-8.3) تبقى كما كانت «موضع غير متحقق منه».
import type { SelectorsRegistry } from '../../../core/detector';
import type { PageInfo } from '../../../shared/page';
import type { NotesRepository } from '../notes/repository';
import { relationTo } from '../notes/targets';
import type { AnchorStatus, BlobLineTarget, Note } from '../notes/types';
import { comparableLines, makeFingerprint, saltIdOf } from './fingerprint';
import type { PageLines } from './fingerprint';
import { currentCommit, readPageView, visibilityOf } from './page-view';
import type { PageView } from './page-view';
import { reanchor } from './reanchor';
import type { AnchorStore } from './store';
import { ANCHOR_SCHEMA_VERSION, branchUrl, permalinkUrl } from './types';
import type { LineAnchor, NoFingerprintReason } from './types';

export type UnanchoredReason = NoFingerprintReason | 'partial' | 'salt-mismatch';

/** نتيجة إعادة التثبيت كما تعرضها الواجهة. */
export type AnchorView =
  | { readonly kind: 'matched'; readonly anchor: LineAnchor; readonly line: number }
  | { readonly kind: 'shifted'; readonly anchor: LineAnchor; readonly candidate: number }
  | { readonly kind: 'ambiguous'; readonly anchor: LineAnchor; readonly candidates: readonly number[] }
  | { readonly kind: 'changed'; readonly anchor: LineAnchor; readonly textOnly: number | null }
  | { readonly kind: 'resource-unavailable'; readonly anchor: LineAnchor }
  | { readonly kind: 'access-lost'; readonly anchor: LineAnchor }
  | { readonly kind: 'unanchored'; readonly anchor: LineAnchor; readonly reason: UnanchoredReason };

export const STATUS_OF: Readonly<Record<AnchorView['kind'], AnchorStatus>> = {
  matched: 'matched',
  shifted: 'shifted',
  ambiguous: 'ambiguous',
  changed: 'changed',
  'resource-unavailable': 'resource-unavailable',
  'access-lost': 'access-lost',
  unanchored: 'unanchored',
};

/** الملاحظة التي أُنشئت قبل أقل من هذا من صفحة أخرى (اللوحة الأصلية) تُرسى من الصفحة المفتوحة على هدفها نفسه. */
export const RECENT_MS = 15_000;

export interface AnchorControllerDeps {
  readonly doc: Document;
  readonly selectors: SelectorsRegistry;
  readonly notes: NotesRepository;
  readonly anchors: AnchorStore;
  readonly page: () => PageInfo;
  readonly onChange: () => void;
  readonly now?: () => Date;
  readonly onError?: (error: unknown) => void;
}

const isBlobLine = (note: Note): note is Note & { target: BlobLineTarget } => note.target.level === 'line' && note.target.view === 'blob';

export const anchorLinks = (anchor: LineAnchor): { readonly branch: string; readonly permalink: string | null } => ({ branch: branchUrl(anchor), permalink: permalinkUrl(anchor) });

export class AnchorController {
  private readonly views = new Map<string, AnchorView>();
  private signature = '';
  private running: Promise<void> | null = null;
  private again = false;
  private disposed = false;
  private comparable: { key: string; lines: PageLines } | null = null;
  private readonly now: () => Date;

  constructor(private readonly deps: AnchorControllerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  view(noteId: string): AnchorView | undefined {
    return this.views.get(noteId);
  }

  /** هل تُعلَّم الملاحظة بجوار سطرها: ملاحظة سطر ملف لها مرساة لا تُعلَّم إلا مطابقة (لا تُلصق بسطر غير مثبت). */
  markable(note: Note): boolean {
    if (!isBlobLine(note) || !this.deps.anchors.get(note.id)) return true;
    return this.views.get(note.id)?.kind === 'matched';
  }

  dispose(): void {
    this.disposed = true;
  }

  /** يحفظ مرساة ملاحظة أُنشئت للتو على الصفحة المفتوحة، ثم يعيد التثبيت. */
  async capture(note: Note): Promise<void> {
    if (!isBlobLine(note) || relationTo(note, this.deps.page()) !== 'exact') return;
    await this.captureAt(note, note.target.start, note.target.end);
    await this.refresh();
  }

  /** ينقل الملاحظة إلى موضع جديد بنقر المستخدم (B أو مرشح من C أو مرشح النص وحده في D)، ويحفظ مرساتها من موضعها الجديد. */
  async relocate(noteId: string, start: number): Promise<void> {
    const note = this.deps.notes.get(noteId);
    if (!note || !isBlobLine(note)) return;
    const end = start + (note.target.end - note.target.start);
    const target: BlobLineTarget = { ...note.target, start, end };
    await this.deps.notes.update(noteId, { target, anchorStatus: 'matched' });
    const updated = this.deps.notes.get(noteId);
    if (updated && isBlobLine(updated)) await this.captureAt(updated, start, end);
    await this.refresh();
  }

  /** يعيد التثبيت؛ استدعاءات متداخلة تُدمج في جولة لاحقة واحدة. */
  refresh(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again && !this.disposed) {
        this.again = false;
        void this.refresh();
      }
    });
    return this.running;
  }

  private async run(): Promise<void> {
    if (this.disposed) return;
    const page = this.deps.page();
    if (page.type !== 'blob') return this.publish(new Map());
    const notes = this.deps.notes.list().filter((n) => isBlobLine(n) && relationTo(n, page) === 'exact');
    const view = readPageView(this.deps.doc, this.deps.selectors);
    for (const note of notes) {
      if (isBlobLine(note) && !this.deps.anchors.get(note.id) && this.now().getTime() - Date.parse(note.createdAt) < RECENT_MS && view.state === 'code') {
        await this.captureAt(note, note.target.start, note.target.end);
      }
    }
    const next = new Map<string, AnchorView>();
    for (const note of notes) {
      const anchor = this.deps.anchors.get(note.id);
      if (!anchor) continue;
      const result = await this.evaluate(anchor, view);
      if (result) next.set(note.id, result);
    }
    if (this.disposed) return;
    for (const [id, result] of next) {
      const note = this.deps.notes.get(id);
      const status = STATUS_OF[result.kind];
      if (note && note.anchorStatus !== status) await this.deps.notes.update(id, { anchorStatus: status });
    }
    this.publish(next);
  }

  private publish(next: Map<string, AnchorView>): void {
    const signature = JSON.stringify([...next].map(([id, v]) => [id, v.kind, 'line' in v ? v.line : 'candidate' in v ? v.candidate : 'candidates' in v ? v.candidates : 'textOnly' in v ? v.textOnly : 'reason' in v ? v.reason : null]));
    this.views.clear();
    for (const [id, v] of next) this.views.set(id, v);
    if (signature === this.signature) return;
    this.signature = signature;
    this.deps.onChange();
  }

  private async evaluate(anchor: LineAnchor, view: PageView): Promise<AnchorView | null> {
    switch (view.state) {
      case 'unknown':
        return null;
      case 'login':
        return { kind: 'access-lost', anchor };
      case 'missing':
        return { kind: 'resource-unavailable', anchor };
      case 'not-found':
        // صفحة «غير موجود» لمستودع خاص قد تكون فقد وصول (GitHub يجيب 404 لمن لا صلاحية له)، فلا يُجزم بالحذف.
        return anchor.visibility === 'public' ? { kind: 'resource-unavailable', anchor } : { kind: 'access-lost', anchor };
      case 'rendered':
        return { kind: 'unanchored', anchor, reason: 'rendered' };
      case 'code':
        break;
    }
    const fingerprint = anchor.fingerprint;
    if (!fingerprint) return { kind: 'unanchored', anchor, reason: anchor.missing ?? 'lines-missing' };
    let salt: string | undefined;
    if (fingerprint.mode === 'hash') {
      const current = await this.deps.anchors.salt();
      if (!current || (await saltIdOf(current)) !== fingerprint.saltId) return { kind: 'unanchored', anchor, reason: 'salt-mismatch' };
      salt = current;
    }
    const lines = await this.comparableFor(view.lines, fingerprint.mode, salt);
    const result = reanchor(lines, fingerprint, anchor.start);
    switch (result.status) {
      case 'matched':
        return { kind: 'matched', anchor, line: result.start };
      case 'shifted':
        return { kind: 'shifted', anchor, candidate: result.candidate };
      case 'ambiguous':
        return { kind: 'ambiguous', anchor, candidates: result.candidates };
      case 'changed':
        return { kind: 'changed', anchor, textOnly: result.textOnly };
      case 'partial':
        return { kind: 'unanchored', anchor, reason: 'partial' };
    }
  }

  // أسطر الصفحة بصيغة المقارنة، مذاكَرة ما دامت الأسطر نفسها: التجزئة للخاص تجري مرة لكل حالة صفحة.
  private async comparableFor(page: PageLines, mode: 'text' | 'hash', salt?: string): Promise<PageLines> {
    let size = 0;
    for (const text of page.lines.values()) size += text.length;
    const key = `${mode}:${salt ? salt.slice(0, 8) : ''}:${page.max}:${page.lines.size}:${size}:${page.lines.get(1) ?? ''}:${page.lines.get(page.max) ?? ''}`;
    if (this.comparable?.key === key) return this.comparable.lines;
    const lines = await comparableLines(page, mode, salt);
    this.comparable = { key, lines };
    return lines;
  }

  private async captureAt(note: Note & { target: BlobLineTarget }, start: number, end: number): Promise<void> {
    const { doc, selectors, anchors } = this.deps;
    const view = readPageView(doc, selectors);
    if (view.state !== 'code' && view.state !== 'rendered') return;
    const visibility = visibilityOf(doc);
    const base = {
      noteId: note.id,
      version: ANCHOR_SCHEMA_VERSION,
      owner: note.target.owner,
      repo: note.target.repo,
      path: note.target.path,
      ref: note.target.ref,
      refKind: note.target.refKind,
      commit: currentCommit(doc),
      start,
      end,
      visibility,
      capturedAt: this.now().toISOString(),
    } as const;
    try {
      if (view.state === 'rendered') {
        await anchors.save({ ...base, fingerprint: null, missing: 'rendered' });
        return;
      }
      const salt = visibility === 'private' ? await anchors.ensureSalt(this.now) : undefined;
      const outcome = await makeFingerprint(view.lines, start, end, visibility, salt);
      await anchors.save(outcome.ok ? { ...base, fingerprint: outcome.fingerprint, missing: null } : { ...base, fingerprint: null, missing: outcome.reason });
    } catch (error) {
      (this.deps.onError ?? ((e: unknown) => console.error('[mijhar] مرساة السطر', e)))(error);
    }
  }
}
