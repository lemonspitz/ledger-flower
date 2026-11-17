// Android home-screen widget: the app sends it a small, already translated summary whenever the numbers change.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { curMonth, monthName, type Model } from './calc';
import { t } from './i18n';
import { today } from './store';

const WidgetBridge = registerPlugin<{ update(o: { data: string }): Promise<void> }>('WidgetBridge');
const enabled = () => Capacitor.getPlatform() === 'android';

export function widgetSummary(m: Model) {
  const mo = curMonth(), cur = m.month(mo), day = today();
  const budget = m.budgets.reduce((a, b) => a + b.limit, 0);
  const spentToday = cur.txs.filter((x) => x.date === day && x.type === 'expense').reduce((a, x) => a + x.amount, 0);
  return {
    date: day, month: mo,
    title: t('Spent in {month}', { month: monthName(mo) }),
    value: m.fmt0(cur.exp),
    sub: budget ? (cur.exp > budget ? t('{a} over your {b} budget', { a: m.fmt0(cur.exp - budget), b: m.fmt0(budget) }) : t('{a} left of {b} budget', { a: m.fmt0(budget - cur.exp), b: m.fmt0(budget) })) : t('No monthly budget set'),
    progress: budget ? Math.round((cur.exp / budget) * 100) : -1,
    over: budget > 0 && cur.exp > budget,
    today: t('Today: {a}', { a: m.fmt0(spentToday) }),
    stale: t('Open the app to update'),
  };
}

let last = '';
export function pushWidget(m: Model) {
  if (!enabled()) return;
  const data = JSON.stringify(widgetSummary(m));
  if (data === last) return;
  last = data;
  void WidgetBridge.update({ data }).catch((e) => console.warn('widget', e));
}

/** The widget's + button opens ledgerflower://add. */
export function onAddLink(open: () => void) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const isAdd = (url?: string) => !!url && /^ledgerflower:\/\/add/.test(url);
  void CapApp.getLaunchUrl().then((r) => { if (isAdd(r?.url)) open(); }).catch(() => {});
  let h: { remove: () => void } | undefined;
  void CapApp.addListener('appUrlOpen', (e) => { if (isAdd(e.url)) open(); }).then((x) => { h = x; });
  return () => h?.remove();
}
