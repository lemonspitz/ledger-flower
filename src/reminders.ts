// Reminders on Android and iPhone: a daily nudge to log spending, a heads-up before recurring bills,
// and an alert when a budget reaches 80% and 100%. All scheduled on the device; nothing goes to a server.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { addMonths, curMonth, type Model } from './calc';
import { catLabel, getLocale, t } from './i18n';
import { today } from './store';

export interface ReminderPrefs { daily: boolean; time: string; bills: boolean; billDays: 0 | 1 | 3; budget: boolean }
export const DEFAULT_REMIND: ReminderPrefs = { daily: false, time: '20:00', bills: false, billDays: 1, budget: false };
export const remindersSupported = () => Capacitor.isNativePlatform();

const DAILY_ID = 1000, BILL_BASE = 2000, BUDGET_BASE = 3000;
const ours = (id: number) => id >= DAILY_ID && id < 100000;

export async function askPermission(): Promise<boolean> {
  if (!remindersSupported()) return false;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  } catch { return false; }
}

const atNine = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 9, 0, 0); };
const shiftDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/** Replaces this app's scheduled reminders with the current set. Safe to call often. */
export async function scheduleReminders(m: Model, r: ReminderPrefs | undefined) {
  if (!remindersSupported()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const old = pending.notifications.filter((n) => ours(n.id) && n.id < BUDGET_BASE);
    if (old.length) await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) });
    if (!r) return;
    const list: LocalNotificationSchema[] = [];
    if (r.daily) {
      const [hour, minute] = r.time.split(':').map(Number);
      list.push({ id: DAILY_ID, title: t('Time to log today’s spending'), body: t('Add what you spent today so your budget stays accurate. It only takes a moment.'),
        schedule: { on: { hour, minute }, allowWhileIdle: true }, extra: { action: 'add' }, smallIcon: 'ic_stat_flower' });
    }
    if (r.bills) {
      const horizon = shiftDays(today(), 60);
      m.recurring.filter((x) => x.type === 'expense' && x.next <= horizon).slice(0, 40).forEach((x, i) => {
        const at = atNine(shiftDays(x.next, -r.billDays));
        if (at.getTime() <= Date.now()) return;
        const when = r.billDays === 0 ? t('today') : r.billDays === 1 ? t('tomorrow') : new Date(x.next + 'T00:00').toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
        list.push({ id: BILL_BASE + i, title: t('{name} is due {when}', { name: x.name, when }), body: t('{a} from {acc}. It will be recorded automatically.', { a: m.fmt(x.amount), acc: m.acc(x.acc)?.name ?? '' }),
          schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_flower' });
      });
    }
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch (e) { console.warn('reminders', e); }
}

const sentKey = (month: string, cat: string, level: number) => `ll.alert.${month}.${cat}.${level}`;
const levels = (spent: number, limit: number) => [80, 100].filter((l) => spent * 100 >= limit * l);

/** When budget alerts are turned on, count budgets already past a level as notified, so turning it on doesn't send a burst. */
export function seedBudgetAlerts(m: Model) {
  const mo = curMonth(), cur = m.month(mo);
  for (const b of m.budgets) for (const l of levels(cur.cats.get(b.id) ?? 0, b.limit)) try { localStorage.setItem(sentKey(mo, b.id, l), '1'); } catch { /* ignore */ }
}

/** Sends an alert the first time this month a budget passes 80% or 100%. Called whenever data changes. */
export async function checkBudgetAlerts(m: Model, r: ReminderPrefs | undefined) {
  if (!remindersSupported() || !r?.budget) return;
  const mo = curMonth(), cur = m.month(mo);
  const list: LocalNotificationSchema[] = [];
  m.budgets.forEach((b, i) => {
    const spent = cur.cats.get(b.id) ?? 0;
    for (const l of levels(spent, b.limit)) {
      const k = sentKey(mo, b.id, l);
      try { if (localStorage.getItem(k)) continue; localStorage.setItem(k, '1'); } catch { continue; }
      const name = catLabel(m.cat(b.id));
      list.push({ id: BUDGET_BASE + i * 2 + (l === 100 ? 1 : 0), smallIcon: 'ic_stat_flower', schedule: { at: new Date(Date.now() + 1500) },
        title: l === 100 ? t('{cat} budget is used up', { cat: name }) : t('{cat} budget is {p}% used', { cat: name, p: l }),
        body: l === 100 ? t('You’ve spent {a} of {b} this month.', { a: m.fmt0(spent), b: m.fmt0(b.limit) }) : t('{a} left of {b} for this month.', { a: m.fmt0(Math.max(0, b.limit - spent)), b: m.fmt0(b.limit) }) });
    }
  });
  // Forget flags from older months.
  try { const old = `ll.alert.${addMonths(mo, -2)}`; Object.keys(localStorage).filter((k) => k.startsWith(old)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  if (list.length) try { await LocalNotifications.schedule({ notifications: list }); } catch (e) { console.warn('budget alert', e); }
}

/** Tapping the daily reminder opens "Add transaction". */
export function onReminderTap(open: () => void) {
  if (!remindersSupported()) return () => {};
  let h: { remove: () => void } | undefined;
  void LocalNotifications.addListener('localNotificationActionPerformed', (e) => { if (e.notification.extra?.action === 'add') open(); }).then((x) => { h = x; });
  return () => h?.remove();
}
