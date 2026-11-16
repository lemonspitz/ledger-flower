// Sample data so a new user can see every screen populated before entering their own.
import { addMonths, curMonth, daysIn } from './calc';
import { getData, today, txId, type Data, type PayMethod, type Settings, type Tx } from './store';

export function demoData(): Partial<Data> {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));
  const tx: Record<string, Tx> = {};
  const t = today();
  let n = 0;
  const add = (date: string, type: Tx['type'], amount: number, acc: string, cat: string | undefined, note: string, toAcc?: string) => {
    if (date > t) return;
    const id = txId(date, 'demo' + n++);
    // How it was paid: cash from the cash account, the credit card from the card account, otherwise debit card or a QR app.
    const pay: Pick<Tx, 'pm' | 'pmid'> = type !== 'expense' ? {} : acc === 'acc_cash' ? { pm: 'cash' } : acc === 'acc_card' ? { pm: 'card', pmid: 'pm_demo_credit' }
      : cat === 'cat_housing' ? {} : (cat === 'cat_dining' || cat === 'cat_fun' || cat === 'cat_transport') && rnd() < 0.6 ? { pm: 'qr', pmid: rnd() < 0.6 ? 'pm_demo_gpay' : 'pm_demo_paypal' } : { pm: 'card', pmid: 'pm_demo_debit' };
    tx[id] = { id, u: 0, date, type, amount, acc, cat, note, toAcc, ...pay };
  };
  const spots: [string, string[], number, number, number][] = [
    // category, merchants, visits per month, min, max (cents)
    ['cat_groceries', ['Greenway Market', 'Corner Grocer', 'Farm Stand'], 9, 1800, 9500],
    ['cat_dining', ['Noodle Bar', 'Café Lumen', 'Taco Truck', 'Pizza Night'], 8, 900, 5200],
    ['cat_transport', ['Metro pass', 'Fuel', 'Ride share'], 6, 600, 4800],
    ['cat_fun', ['Cinema', 'Concert tickets', 'Bowling'], 3, 1200, 6500],
    ['cat_shopping', ['Clothing', 'Hardware store', 'Bookshop'], 3, 1500, 12000],
    ['cat_health', ['Pharmacy', 'Dentist'], 1, 1200, 9000],
    ['cat_other', ['Gift', 'Haircut', 'Post office'], 2, 800, 4500],
  ];
  for (let k = -11; k <= 0; k++) {
    const m = addMonths(curMonth(), k);
    const d = (day: number) => `${m}-${String(Math.min(day, daysIn(m))).padStart(2, '0')}`;
    const drift = 1 + (k + 11) * 0.012; // prices creep up a little
    add(d(1), 'income', 420000 + (k > -5 ? 18000 : 0), 'acc_main', 'cat_salary', 'Paycheck');
    if (rnd() < 0.45) add(d(between(8, 24)), 'income', between(12000, 52000), 'acc_main', 'cat_side', 'Freelance project');
    add(d(2), 'expense', 145000, 'acc_main', 'cat_housing', 'Rent');
    add(d(5), 'expense', between(9000, 15500), 'acc_main', 'cat_utilities', 'Electricity & water');
    add(d(12), 'expense', 5999, 'acc_card', 'cat_utilities', 'Internet');
    add(d(7), 'expense', 1599, 'acc_card', 'cat_subs', 'Streamly');
    add(d(15), 'expense', 1099, 'acc_card', 'cat_subs', 'Music Plus');
    add(d(20), 'expense', 3900, 'acc_card', 'cat_subs', 'Gym membership');
    for (const [cat, names, visits, lo, hi] of spots) {
      const count = Math.max(1, visits + between(-2, 2));
      for (let i = 0; i < count; i++) add(d(between(1, 28)), 'expense', Math.round(between(lo, hi) * drift), rnd() < 0.55 ? 'acc_card' : rnd() < 0.85 ? 'acc_main' : 'acc_cash', cat, names[between(0, names.length - 1)]);
    }
    if (k === -4) { add(d(14), 'expense', 68000, 'acc_card', 'cat_travel', 'Flights'); add(d(18), 'expense', 41000, 'acc_card', 'cat_travel', 'Hotel'); }
    if (k === -9) add(d(21), 'expense', 52000, 'acc_card', 'cat_shopping', 'New phone');
    add(d(3), 'transfer', 50000, 'acc_main', undefined, 'Monthly saving', 'acc_savings');
    add(d(25), 'transfer', between(90000, 150000), 'acc_main', undefined, 'Card payment', 'acc_card');
    add(d(10), 'transfer', 8000, 'acc_main', undefined, 'Cash withdrawal', 'acc_cash');
  }
  const next = addMonths(curMonth(), 1);
  const yr = Number(curMonth().slice(0, 4));
  return {
    tx,
    accounts: {
      acc_main: { id: 'acc_main', u: 0, name: 'Checking', type: 'bank', opening: 180000 },
      acc_savings: { id: 'acc_savings', u: 0, name: 'Savings', type: 'savings', opening: 650000 },
      acc_card: { id: 'acc_card', u: 0, name: 'Credit card', type: 'card', opening: -42000 },
      acc_cash: { id: 'acc_cash', u: 0, name: 'Cash', type: 'cash', opening: 6000 },
    },
    settings: {
      settings: { id: 'settings', u: 0, currency: (getData().settings.settings as Settings | undefined)?.currency ?? 'USD' },
      ...Object.fromEntries(([
        { id: 'pm_demo_debit', u: 0, type: 'method', kind: 'card', name: 'Everyday Debit', last4: '4821', network: 'Visa', acc: 'acc_main' },
        { id: 'pm_demo_credit', u: 0, type: 'method', kind: 'card', name: 'Rewards Credit', last4: '9034', network: 'Mastercard', acc: 'acc_card' },
        { id: 'pm_demo_gpay', u: 0, type: 'method', kind: 'qr', name: 'Google Pay', acc: 'acc_main' },
        { id: 'pm_demo_paypal', u: 0, type: 'method', kind: 'qr', name: 'PayPal', acc: 'acc_main' },
      ] as PayMethod[]).map((x) => [x.id, x])),
    },
    budgets: Object.fromEntries(([['cat_groceries', 55000], ['cat_dining', 26000], ['cat_transport', 18000], ['cat_fun', 12000], ['cat_shopping', 20000], ['cat_utilities', 22000], ['cat_subs', 7000], ['cat_housing', 145000]] as const).map(([id, limit]) => [id, { id, u: 0, limit }])),
    goals: {
      g1: { id: 'g1', u: 0, name: 'Emergency fund', icon: '🛟', target: 1500000, saved: 920000 },
      g2: { id: 'g2', u: 0, name: 'Summer trip', icon: '🏝️', target: 320000, saved: 115000, due: `${yr + 1}-06-15` },
      g3: { id: 'g3', u: 0, name: 'New laptop', icon: '💻', target: 180000, saved: 151000, due: `${next}-28` },
    },
    recurring: {
      r1: { id: 'r1', u: 0, name: 'Rent', amount: 145000, type: 'expense', acc: 'acc_main', cat: 'cat_housing', freq: 'monthly', next: `${next}-02` },
      r2: { id: 'r2', u: 0, name: 'Paycheck', amount: 438000, type: 'income', acc: 'acc_main', cat: 'cat_salary', freq: 'monthly', next: `${next}-01` },
      r3: { id: 'r3', u: 0, name: 'Streamly', amount: 1599, type: 'expense', acc: 'acc_card', cat: 'cat_subs', freq: 'monthly', next: `${next}-07` },
      r4: { id: 'r4', u: 0, name: 'Gym membership', amount: 3900, type: 'expense', acc: 'acc_card', cat: 'cat_subs', freq: 'monthly', next: `${next}-20` },
    },
  };
}
