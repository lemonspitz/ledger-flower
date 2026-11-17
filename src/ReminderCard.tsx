import { Card, Field, Icon, Seg } from './ui';
import { t } from './i18n';
import { DEFAULT_REMIND, askPermission, remindersSupported, seedBudgetAlerts, type ReminderPrefs } from './reminders';
import type { Model } from './calc';
import type { LocalPrefs } from './sync';

/** Settings card for the daily reminder, bill reminders and budget alerts. */
export function ReminderCard({ m, prefs, setPrefs }: { m: Model; prefs: LocalPrefs; setPrefs: (p: LocalPrefs) => void }) {
  const r = { ...DEFAULT_REMIND, ...prefs.remind };
  const set = async (patch: Partial<ReminderPrefs>) => {
    const turningOn = Object.entries(patch).some(([k, v]) => v === true && !r[k as keyof ReminderPrefs]);
    if (turningOn && !(await askPermission())) { alert(t('Notifications are turned off for Ledger Flower. Allow them in your phone’s settings, then try again.')); return; }
    if (patch.budget) seedBudgetAlerts(m);
    setPrefs({ ...prefs, remind: { ...r, ...patch } });
  };
  if (!remindersSupported()) {
    return <Card title={t('Reminders')}><p className="muted">{t('Reminders and budget alerts are available in the Android and iPhone apps.')}</p></Card>;
  }
  return (
    <Card title={t('Reminders')} sub={t('Notifications are scheduled on this device. Nothing is sent to a server.')}>
      <div className="form remind">
        <label className="check"><input type="checkbox" checked={r.daily} onChange={(e) => void set({ daily: e.target.checked })} /><Icon name="bell" size={16} />{t('Daily reminder to log spending')}</label>
        {r.daily && <Field label={t('Remind me at')}><input type="time" value={r.time} onChange={(e) => e.target.value && void set({ time: e.target.value })} /></Field>}
        <label className="check"><input type="checkbox" checked={r.bills} onChange={(e) => void set({ bills: e.target.checked })} /><Icon name="repeat" size={16} />{t('Remind me before recurring bills')}</label>
        {r.bills && (
          <Field label={t('When')}>
            <Seg value={String(r.billDays) as '0' | '1' | '3'} onChange={(v) => void set({ billDays: Number(v) as 0 | 1 | 3 })}
              options={[['0', t('On the day')], ['1', t('1 day before')], ['3', t('3 days before')]]} />
          </Field>
        )}
        <label className="check"><input type="checkbox" checked={r.budget} onChange={(e) => void set({ budget: e.target.checked })} /><Icon name="target" size={16} />{t('Alert me when a budget reaches 80% and 100%')}</label>
        {r.budget && !m.budgets.length && <p className="hint">{t('Set a monthly limit on the Budgets page to get alerts.')}</p>}
      </div>
    </Card>
  );
}
