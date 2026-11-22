// Receipt texts as the OCR returns them, with what the parser should find (amounts in hundredths).
export interface Expect { looseNames?: boolean; subtotal?: number; items: [string, number, number][]; total: number; discount?: number; service?: number; tax?: number; servicePct?: number; taxPct?: number }
export const CASES: { name: string; text: string; expect: Expect }[] = [
  {
    name: 'Indonesian café, item name then "qty x price  total" line, discount, service + PB1',
    text: `KOPI SENJA
Jl. Braga 21, Bandung
Telp: 022-4231 8890
No. Order : #A-1043
Meja : 12   Pax: 5
Kasir : Rina
17/11/2026      15:10:22
--------------------------------
Cafe Latte
  1 x 35.000              35.000
Es Teh Manis
  2 x 20.000              40.000
  - less sugar
French Fries
  1 x 45.000              45.000
  + Extra Cheese           5.000
Matcha Latte
  1 x 38.000              38.000
--------------------------------
Subtotal                 163.000
Diskon Member            -10.000
Service 5%                 7.650
PB1 10%                   16.065
TOTAL                    176.715
QRIS                     176.715
Poin didapat : 21
Terima kasih`,
    expect: { items: [['Cafe Latte', 1, 3500000], ['Es Teh Manis', 2, 2000000], ['French Fries', 1, 4500000], ['Extra Cheese', 1, 500000], ['Matcha Latte', 1, 3800000]], total: 17671500, discount: 1000000, service: 765000, tax: 1606500, servicePct: 5, taxPct: 10 },
  },
  {
    name: 'US diner with Qty / Item / Price / Total columns, order & table numbers, gratuity',
    text: `THE BURGER JOINT
Order #4471      Table 7
Server: Mike     Guests: 3
11/16/2026 7:42 PM
Qty Item            Price   Total
2   Cheeseburger    12.50   25.00
1   Fries            4.75    4.75
3   Soda             2.25    6.75
1   Milkshake        6.00    6.00
Subtotal                    42.50
Tax 8.875%                   3.77
Gratuity 18%                 7.65
Total                       53.92
VISA ****4821               53.92`,
    expect: { items: [['Cheeseburger', 2, 1250], ['Fries', 1, 475], ['Soda', 3, 225], ['Milkshake', 1, 600]], total: 5392, service: 765, tax: 377, servicePct: 18, taxPct: 8.875 },
  },
  {
    name: 'Warung with "2x Name  total" lines, receipt number and time on one line, cash and change',
    text: `WARUNG BU SRI
Jl. Kaliurang Km 5
No: 000231  14:02
2x Nasi Goreng        50.000
1x Ayam Bakar         28.000
3x Es Jeruk           24.000
Total                102.000
Tunai                110.000
Kembali                8.000`,
    expect: { items: [['Nasi Goreng', 2, 2500000], ['Ayam Bakar', 1, 2800000], ['Es Jeruk', 3, 800000]], total: 10200000 },
  },
  {
    name: 'Bakery: "Name  qty @ price  total", dates and a long transaction ID',
    text: `ROTI MAMA
Tanggal: 16-11-2026  Jam: 09:15
Trx ID 2026111600873412
Roti Sobek   2 @ 18.500   37.000
Croissant    3 @ 15.000   45.000
Kopi Susu    1@ 22.000    22.000
Total Item: 6
Total                  104.000
Debit BCA              104.000`,
    expect: { items: [['Roti Sobek', 2, 1850000], ['Croissant', 3, 1500000], ['Kopi Susu', 1, 2200000]], total: 10400000 },
  },
  {
    name: 'Simple grocery (regression)',
    text: `GREENWAY MARKET
128 Elm Street, Springfield
11/12/2026 17:42 Reg 03
ROMA TOMATOES          3.49 F
CHICKEN BREAST         9.75 F
WHOLE MILK 2L          3.29 F
SUBTOTAL              16.53
TAX                    0.83
TOTAL                 17.36
VISA                  17.36`,
    expect: { items: [['Roma Tomatoes', 1, 349], ['Chicken Breast', 1, 975], ['Whole Milk 2l', 1, 329]], total: 1736, tax: 83 },
  },
  {
    name: 'German bakery, euro sign after prices (regression)',
    text: `BACKEREI MULLER
Hauptstrasse 5, Koln
14.11.2026 08:15
Brotchen 6x            2,40 €
Croissant              1,60 €
Kaffee gross           3,20 €
SUMME                 7,20 €
BAR                   20,00 €
Ruckgeld              12,80 €`,
    expect: { items: [['Brotchen', 6, 40], ['Croissant', 1, 160], ['Kaffee gross', 1, 320]], total: 720 },
  },
  {
    name: 'Japanese convenience store, yen without decimals (regression)',
    text: `SAKURA MART
Shibuya, Tokyo
2026/11/14 19:05  No.0042
ONIGIRI SALMON   ¥160
GREEN TEA 500ML  ¥140
BENTO KARAAGE    ¥598
SUBTOTAL  ¥898
TAX 8%  ¥71
TOTAL  ¥969`,
    expect: { items: [['Onigiri Salmon', 1, 16000], ['Green Tea 500ml', 1, 14000], ['Bento Karaage', 1, 59800]], total: 96900, tax: 7100, taxPct: 8 },
  },
  {
    name: 'Names with numbers and food words that look like noise words; "x2" after the name; unit price only',
    text: `DAPUR KITA
Strawberry Jam Toast       25.000
Teh Botol 350ml             8.000
Pizza 12 inch              89.000
Es Kopi x2                 36.000
Cheeseburger 2 x 12.000
Total                     182.000`,
    expect: { items: [['Strawberry Jam Toast', 1, 2500000], ['Teh Botol 350ml', 1, 800000], ['Pizza 12 inch', 1, 8900000], ['Es Kopi', 2, 1800000], ['Cheeseburger', 2, 1200000]], total: 18200000 },
  },
  // ── A real receipt photographed by a user (Sedjuk Bakmi & Kopi), as read by the app's OCR ──
  {
    name: 'Real photo, cropped & cleaned: misread @ (€, 8), "1%" for 1x, one total misread (23.000 for 33.000), TAX word lost, no grand total',
    text: `§                 BAKMI & KOP!       £17             A
Sedjuk Bakmi & Kopi = Posbloc           Bobet
Date        . 14-10-2026 20:16                     ZA
Time In     + 14-10-2026 17:19                     go
Info        + guest 081200000000                    3
Table     : 15
Purpose + DINE IN              |         NA
Pax      +3                    :       | I-A
Cashier    . KASIR SATU                   '
Bakso Kuah                                 -
1X   @35.000                       35.000
Cincau Sedjuk
2X   €27.000                       54.000   h
Bakmi Ayam Oven Komplit                             \\
1%   @55.000                       55,000     My,
Kopi Sedjuk                                            NN
1x 829.000                       29,000      A
Nasi Putih
1x  @8.000                              8.000
Hot Lovely Ale
1x 833.000                            23.000
| 7 items
|                        _ Subtotal :      214.000
|                    Service Charge :       10.700
™       22.470
ON badll: mam #2`,
    expect: { items: [['Bakso Kuah', 1, 3500000], ['Cincau Sedjuk', 2, 2700000], ['Bakmi Ayam Oven Komplit', 1, 5500000], ['Kopi Sedjuk', 1, 2900000], ['Nasi Putih', 1, 800000], ['Hot Lovely Ale', 1, 3300000]], subtotal: 21400000, total: 24717000, service: 1070000, tax: 2247000 },
  },
  {
    name: 'Real photo, cropped & cleaned, column mode: some line totals missing, TAX without amount',
    text: `PACES BAKMI & dj       ux
Sedjuk Bakmi & Kopi ~ Poshloc
Date        1 14-10-2026 20:16
Time In     + 14-10-2026 17:19
Info        : guest 081200000000
: 15
Purpose    k DINE IN
{ Pax        :
§ Cashier     . KASIR SATU
Bakso Kuah
1x @35.000
Cincau Sedjuk
2x @27.000
Bakmi Ayam Oven Komplit
1x  @55.000
Kopi Sedjuk
29.000
1x 829.000
Nasi Putih
1x ~~ @8.000                              8.000
Hot Lovely Ale
1x 33.000                            33.000
7 items
Subtotal :      214.000
Service Charge :       10.700
TAX ¢       22.470
dtl: am #2`,
    expect: { items: [['Bakso Kuah', 1, 3500000], ['Cincau Sedjuk', 2, 2700000], ['Bakmi Ayam Oven Komplit', 1, 5500000], ['Kopi Sedjuk', 1, 2900000], ['Nasi Putih', 1, 800000], ['Hot Lovely Ale', 1, 3300000]], subtotal: 21400000, total: 24717000, service: 1070000, tax: 2247000 },
  },
  {
    name: 'Real photo, uncleaned: tablecloth junk at line ends, "@27.000" read as "627.000", lost letters in names',
    text: `@Sedjuk |
BAKMI & KOPI       £21               ¢
4          sedjuk Bakmi & Kopi - Posbloc
   Date      : 14-10-2026 20:16
SM Time In    + 14-10-2026 17:13
a Info    : guest 081200000000
BE Table    Lal
| Purpose    : DINE IN                          &
E Pax      4.3)                            & 4
BY Cashier  : KASIR SATU                 Fe
Bakso Kuah                                    a
1x ~~ @35.000                     35.000   FE -
| Cincau Sedjuk                                  =
2x 627.000                     54.000 W
Bakmi Ayam Oven Komplit                            gE
1x  @55.000                      55.000 TR
Kopi Sedjuk                              CN
29.000                                                        29,000 [.
i Putih                           4
68.000                       8.000     FE.
Lovely Ale                                   =
% 33.000                      93,000   Ae
|           Subtotal :    214.000 RO
5        Service Charge :      10.700    We
a              TAX ©     22.470     E
BE Grad Total: 47.1M`,
    expect: { looseNames: true, items: [['Bakso Kuah', 1, 3500000], ['Cincau Sedjuk', 2, 2700000], ['Bakmi Ayam Oven Komplit', 1, 5500000], ['Kopi Sedjuk', 1, 2900000], ['Nasi Putih', 1, 800000], ['Hot Lovely Ale', 1, 3300000]], subtotal: 21400000, total: 24717000, service: 1070000, tax: 2247000 },
  },
  {
    name: 'Real photo, final in-app reading: junk before a name, a quantity line garbled to "{x eo"',
    text: `- | &@Se djuk ¥
AN                      BAKMI & KOPI       vay             A
Sedjuk Bakmi & opi - Posbloc           gm
Date       : 14-10-2026 20:18                 =
    Time In    : 14-10-2026 17:19                  on     |
Info       : guest 081200000000                  |
“4 Table     1 15
{Purpose : DINE IN       NA
{Pax      +3                 :   A
Cashier    : KASIR SATU                        oo
NN! Bakso Kuah                                         Lo
'} 1x 635.000                  35.000 § =
Cincau Sedjuk                                 B
, {x eo                      54.000       -
Bakmi Ayam Oven Komplit                                  -
1X         @55,000                                                             55,000
Kopi Sedjuk
1x @29.000                                                              29.000
Nasi Putih
1x  @8.000                           8.000
. | Hot Lovely Ale                     :               '
«4d 1x 833.000                                                               33.000
)   7 items
                        _ Subtotal :      214.000
Service Charge :       10.700
™       22.470   |
|       rd: wm #2`,
    expect: { items: [['Bakso Kuah', 1, 3500000], ['Cincau Sedjuk', 1, 5400000], ['Bakmi Ayam Oven Komplit', 1, 5500000], ['Kopi Sedjuk', 1, 2900000], ['Nasi Putih', 1, 800000], ['Hot Lovely Ale', 1, 3300000]], subtotal: 21400000, total: 24717000, service: 1070000, tax: 2247000 },
  },
  // ── Layouts found in the CORD benchmark (1,000 Indonesian receipts; see bench/cord.ts) ──
  {
    name: 'CORD: "ITEMS: 2" count-and-sum line is the subtotal, not a dish; free add-on line',
    text: `Pepper Steak   1   122,727
Milo   1   0
- Cheese   1   5,454
ITEMS: 2   128,181
Tax 10.00%   12,818
Total   140,999
Cash   150,000
Change   9,001`,
    expect: { items: [['Pepper Steak', 1, 12272700], ['Cheese', 1, 545400]], subtotal: 12818100, total: 14099900, tax: 1281800 },
  },
  {
    name: 'CORD: totals per menu section (FOOD / BEVERAGES / OTHERS) are not dishes; "DUE" is the total',
    text: `1 UDANG REBUS (M)   162,000
1 HOT TEA   12,000
2 NASI PUTIH 10,000 20,000
FOOD   162,000
BEVERAGES   12,000
OTHERS   20,000
SUBTOTAL   194,000
SERVICE CHARGE   11,640
Tax 10%   20,564
DUE   226,204`,
    expect: { items: [['Udang Rebus (m)', 1, 16200000], ['Hot Tea', 1, 1200000], ['Nasi Putih', 2, 1000000]], subtotal: 19400000, total: 22620400, service: 1164000, tax: 2056400 },
  },
  {
    name: 'CORD: "SUB. TOTAL", restaurant tax, GRAND TOTAL with its amount on the payment line below',
    text: `KAKE UDON   1   30,909
COLD OCHA   1   10,909
SUB. TOTAL   41,818
RESTAURANT TAX   4,182
GRAND TOTAL
~ CASH [46,000]   46,000
Change: 0`,
    expect: { items: [['Kake Udon', 1, 3090900], ['Cold Ocha', 1, 1090900]], subtotal: 4181800, total: 4600000, tax: 418200 },
  },
  {
    name: 'CORD: TOTAL before tax is the subtotal when a GRAND TOTAL follows',
    text: `BIHUN CAMPUR   1 43,181   43,181
JERUK MURNI   1 20,000   20,000
TOTAL   63,181
TAX 10.00 %   6,318
GRAND TOTAL   69,499
TUNAI   100,000
KEMBALI   30,501`,
    expect: { items: [['Bihun Campur', 1, 4318100], ['Jeruk Murni', 1, 2000000]], subtotal: 6318100, total: 6949900, tax: 631800 },
  },
  {
    name: 'CORD: discount printed twice (under the dish and above the total) is taken off once',
    text: `1   Choco Cheese   13,636
Exclusive Member Card   -2,045
SubTotal:   13,636
Discount:   -2,045
PB1:   1,159
Total:   12,750
cash:   12,750`,
    expect: { items: [['Choco Cheese', 1, 1363600]], subtotal: 1363600, total: 1275000, discount: 204500, tax: 115900 },
  },
  {
    name: 'CORD: numbers first, dish name on the line below; "Services" and "P.Rest" labels',
    text: `1x 22.000   22.000
Ice Green Tea
2x 18.000   36.000
Kimchi Fried Rice
SUBTOTAL   58.000
Services   2.900
P.Rest 10 %   6.090
***TOTAL   66.990
CASH   Rp 70.000`,
    expect: { items: [['Ice Green Tea', 1, 2200000], ['Kimchi Fried Rice', 2, 1800000]], subtotal: 5800000, total: 6699000, service: 290000, tax: 609000 },
  },
  {
    name: 'CORD: a "TAKE AWAY" charge line after the dishes doesn\'t hide them; amounts with one decimal',
    text: `1 medium tub   49,000.0 49,000.0
1 TAKE AWAY CHARGE   1,000.0 1,000.0
Subtotal: 45,454.55
Tax 10.00%: 4,545.45
TOTAL:   50,000.00
Paid:   50,000.00
Change:   0.00`,
    expect: { items: [['medium tub', 1, 4900000], ['Take Away Charge', 1, 100000]], subtotal: 4545455, total: 5000000, tax: 454545 },
  },
];
