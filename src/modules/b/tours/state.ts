// حالة الجولة الجارية: تعيش في سكربت المحتوى فتبقى بعد تنقل Turbo (الوحدة تُعاد تركيبها بسياق جديد وتقرأ الحالة من هنا)، على نمط حالة وضع الشرح.
// اللوحة الأصلية صفحة إضافة لا تبلغ هذا السياق مباشرة، فتراسل التبويب النشط برسالة TOUR_MESSAGE. الحالة في الذاكرة وحدها: لا شيء يُكتب في
// تخزين الصفحة ولا الإضافة، وتحميل صفحة كاملة جديدة ينهي الجولة.
import { TOUR_MESSAGE } from './ids';
import { TOURS, getTour } from './data';
import type { Tour } from './data';

export type TourAction = 'start' | 'stop' | 'next' | 'prev' | 'status';

export interface TourMessage {
  readonly type: typeof TOUR_MESSAGE;
  readonly action: TourAction;
  readonly id?: string;
}

export interface TourStatus {
  readonly active: string | null;
  readonly step: number;
}

export const isTourMessage = (message: unknown): message is TourMessage => {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as TourMessage;
  return m.type === TOUR_MESSAGE && ['start', 'stop', 'next', 'prev', 'status'].includes(m.action) && (m.id === undefined || typeof m.id === 'string');
};

export class TourState {
  private tourId: string | null = null;
  private index = 0;
  private readonly listeners = new Set<() => void>();

  get tour(): Tour | null {
    return this.tourId ? (getTour(this.tourId) ?? null) : null;
  }

  get step(): number {
    return this.index;
  }

  get status(): TourStatus {
    return { active: this.tourId, step: this.index };
  }

  start(id: string): boolean {
    if (!TOURS.some((tour) => tour.id === id)) return false;
    this.tourId = id;
    this.index = 0;
    this.emit();
    return true;
  }

  stop(): void {
    if (this.tourId === null) return;
    this.tourId = null;
    this.index = 0;
    this.emit();
  }

  next(): void {
    const tour = this.tour;
    if (!tour) return;
    if (this.index >= tour.steps.length - 1) this.stop();
    else {
      this.index += 1;
      this.emit();
    }
  }

  prev(): void {
    if (!this.tour || this.index === 0) return;
    this.index -= 1;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** يطبّق رسالة لوحة أو درج ويعيد الحالة بعدها. */
  apply(message: TourMessage): TourStatus {
    if (message.action === 'start' && message.id) this.start(message.id);
    else if (message.action === 'stop') this.stop();
    else if (message.action === 'next') this.next();
    else if (message.action === 'prev') this.prev();
    return this.status;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** الحالة المشتركة داخل سكربت المحتوى للوحدة المسجَّلة. */
export const TOUR_STATE = new TourState();
