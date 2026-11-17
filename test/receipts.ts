// Receipt texts as the OCR returns them, with what the parser should find (amounts in hundredths).
export interface Expect { items: [string, number, number][]; total: number; discount?: number; service?: number; tax?: number; servicePct?: number; taxPct?: number }
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
];
