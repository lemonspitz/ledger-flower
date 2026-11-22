// Receipts in every app language, generated from how shops in each country print them: local words for
// subtotal, tax, service and total, the local money format (1,234.56 · 1.234,56 · 1 234,56 · ¥1,234 · 12.000₫),
// tax added on top (US, Malaysia, Indonesia…) or already in the prices (Europe, Japan, Thailand…), and several
// item layouts. There is no public set of real, annotated receipts for most of these languages, so these are
// made-up receipts that follow real conventions. They test the parser; bench/synth-ocr.cjs renders some as images
// and reads them with the app's OCR.
//   npx tsx bench/synth.ts [--n 500] [--lang ja] [--show 3] [--dump dir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseReceipt } from '../src/receipt';

interface Money { sym: string; pre: boolean; dec: 0 | 2; group: string; point: string; space?: boolean }
interface Lang {
  code: string; money: Money[]; round: number; // prices are multiples of `round` (major units)
  price: [number, number];
  sub: string[]; tax: string[]; svc?: string[]; total: string[]; cash: string[]; change: string[]; disc: string[];
  taxRate: number[]; taxAdded: number; // chance the tax is added on top of the prices (else it is included)
  incl?: string[]; // wording for included tax, e.g. "inkl. MwSt"
  svcRate?: number[]; svcChance?: number;
  items: string[]; shops: string[]; head: string[]; thanks: string[];
  digits?: string; // a native digit set printed some of the time (Arabic-Indic)
}

const L: Lang[] = [
  { code: 'en', money: [{ sym: '$', pre: true, dec: 2, group: ',', point: '.' }, { sym: '£', pre: true, dec: 2, group: ',', point: '.' }], round: 0.25, price: [2, 40],
    sub: ['Subtotal', 'SUBTOTAL', 'Sub Total'], tax: ['Tax', 'Sales Tax', 'VAT', 'GST'], svc: ['Service Charge', 'Gratuity'], total: ['TOTAL', 'Total', 'Amount Due', 'Balance Due'],
    cash: ['Cash', 'CASH'], change: ['Change', 'CHANGE'], disc: ['Discount', 'Coupon'], taxRate: [8.875, 7.25, 6, 20], taxAdded: 0.7, incl: ['incl. VAT'], svcRate: [18, 12.5], svcChance: 0.2,
    items: ['Cheeseburger', 'French Fries', 'Iced Coffee', 'Caesar Salad', 'Chicken Wings', 'Club Sandwich', 'Pancakes', 'Orange Juice', 'Fish & Chips', 'Milkshake', 'Bagel', 'Tomato Soup', 'Latte', 'Brownie'],
    shops: ['Corner Diner', 'Blue Door Cafe', 'Green Grocer'], head: ['Server: Amy', 'Table 12', 'Order #4471', 'Guests: 2'], thanks: ['Thank you!', 'Please come again'] },
  { code: 'ms', money: [{ sym: 'RM', pre: true, dec: 2, group: ',', point: '.' }], round: 0.1, price: [2, 45],
    sub: ['Jumlah Kecil', 'Subtotal', 'SUB TOTAL'], tax: ['SST', 'Cukai', 'Cukai Perkhidmatan'], svc: ['Caj Perkhidmatan', 'Service Charge'], total: ['JUMLAH', 'Jumlah Besar', 'TOTAL', 'Jumlah Perlu Dibayar'],
    cash: ['Tunai', 'CASH'], change: ['Baki', 'Wang Baki'], disc: ['Diskaun', 'Potongan'], taxRate: [6, 8], taxAdded: 0.85, svcRate: [10], svcChance: 0.5,
    items: ['Nasi Lemak', 'Teh Tarik', 'Roti Canai', 'Mee Goreng', 'Ayam Goreng', 'Kopi O', 'Milo Ais', 'Char Kuey Teow', 'Laksa', 'Nasi Kandar', 'Satay', 'Cendol'],
    shops: ['Restoran Selera Kita', 'Kedai Makan Ali'], head: ['Meja: 7', 'Juruwang: Siti', 'No. Resit: 10021'], thanks: ['Terima kasih', 'Sila datang lagi'] },
  { code: 'tl', money: [{ sym: '₱', pre: true, dec: 2, group: ',', point: '.' }, { sym: 'PHP', pre: true, dec: 2, group: ',', point: '.' }], round: 1, price: [35, 450],
    sub: ['Subtotal', 'SUB TOTAL', 'Kabuuang Halaga'], tax: ['VAT', 'VAT 12%'], svc: ['Service Charge', 'Bayad sa Serbisyo'], total: ['TOTAL', 'Kabuuan', 'Amount Due', 'Total Due'],
    cash: ['Cash', 'Bayad'], change: ['Change', 'Sukli'], disc: ['Discount', 'SC/PWD Discount', 'Diskwento'], taxRate: [12], taxAdded: 0.3, incl: ['VAT Inclusive', 'VATable Sales'], svcRate: [10], svcChance: 0.4,
    items: ['Adobong Manok', 'Sinigang na Baboy', 'Pancit Canton', 'Lechon Kawali', 'Kare-Kare', 'Halo-Halo', 'Sisig', 'Lumpia', 'Kanin', 'Buko Juice', 'Tapsilog', 'Bulalo'],
    shops: ['Kainan ni Aling Rosa', 'Lutong Bahay'], head: ['Table No: 5', 'Cashier: Ana', 'OR No: 004512'], thanks: ['Salamat po!', 'Maraming salamat'] },
  { code: 'th', money: [{ sym: '฿', pre: true, dec: 2, group: ',', point: '.' }, { sym: 'บาท', pre: false, dec: 2, group: ',', point: '.', space: true }], round: 5, price: [30, 450],
    sub: ['รวม', 'รวมเงิน', 'ยอดรวมย่อย'], tax: ['ภาษีมูลค่าเพิ่ม', 'VAT'], svc: ['ค่าบริการ', 'Service Charge'], total: ['รวมทั้งสิ้น', 'ยอดสุทธิ', 'ยอดรวมสุทธิ', 'TOTAL'],
    cash: ['เงินสด', 'CASH'], change: ['เงินทอน', 'ทอน'], disc: ['ส่วนลด'], taxRate: [7], taxAdded: 0.4, incl: ['ราคารวมภาษี'], svcRate: [10], svcChance: 0.5,
    items: ['ผัดไทย', 'ต้มยำกุ้ง', 'ข้าวผัด', 'ส้มตำ', 'แกงเขียวหวาน', 'ชาเย็น', 'ข้าวเหนียวมะม่วง', 'ผัดกะเพรา', 'น้ำเปล่า', 'กาแฟเย็น', 'ข้าวมันไก่', 'ไก่ทอด'],
    shops: ['ร้านอาหารบ้านสวน', 'ครัวคุณแม่'], head: ['โต๊ะ 4', 'พนักงาน: สมใจ', 'เลขที่ 00231'], thanks: ['ขอบคุณค่ะ', 'ขอบคุณที่ใช้บริการ'] },
  { code: 'vi', money: [{ sym: 'đ', pre: false, dec: 0, group: '.', point: ',' }, { sym: 'VND', pre: false, dec: 0, group: ',', point: '.', space: true }, { sym: '₫', pre: false, dec: 0, group: '.', point: ',' }], round: 1000, price: [15000, 250000],
    sub: ['Tạm tính', 'Cộng tiền hàng', 'Thành tiền'], tax: ['Thuế VAT', 'Thuế GTGT', 'VAT'], svc: ['Phí phục vụ', 'Phí dịch vụ'], total: ['Tổng cộng', 'TỔNG CỘNG', 'Thanh toán', 'Tổng tiền'],
    cash: ['Tiền mặt', 'Khách đưa'], change: ['Tiền thối', 'Tiền thừa', 'Trả lại'], disc: ['Giảm giá', 'Chiết khấu'], taxRate: [8, 10], taxAdded: 0.6, svcRate: [5], svcChance: 0.3,
    items: ['Phở bò', 'Bún chả', 'Cà phê sữa đá', 'Bánh mì', 'Cơm tấm', 'Gỏi cuốn', 'Trà đá', 'Bún bò Huế', 'Chè ba màu', 'Nước cam', 'Mì xào', 'Bánh xèo'],
    shops: ['Quán Phở Hà Nội', 'Nhà hàng Sen Vàng'], head: ['Bàn: 6', 'Thu ngân: Lan', 'Số HĐ: 000128'], thanks: ['Cảm ơn quý khách', 'Hẹn gặp lại'] },
  { code: 'ja', money: [{ sym: '¥', pre: true, dec: 0, group: ',', point: '.' }, { sym: '円', pre: false, dec: 0, group: ',', point: '.' }], round: 10, price: [100, 2400],
    sub: ['小計'], tax: ['消費税', '外税'], svc: ['サービス料'], total: ['合計', '合 計', 'お会計'],
    cash: ['お預り', '現金'], change: ['お釣り', 'おつり'], disc: ['値引', '割引'], taxRate: [10, 8], taxAdded: 0.25, incl: ['内消費税', '(内税'], svcRate: [10], svcChance: 0.15,
    items: ['おにぎり', '緑茶', 'カレーライス', '唐揚げ', 'ラーメン', '牛丼', 'サンドイッチ', 'コーヒー', '弁当', 'うどん', '味噌汁', 'ビール'],
    shops: ['ファミリーマート', '食堂さくら'], head: ['レジ 2', '担当: 田中', '伝票番号 0451'], thanks: ['ありがとうございました', 'またのご来店をお待ちしております'] },
  { code: 'ko', money: [{ sym: '원', pre: false, dec: 0, group: ',', point: '.' }, { sym: '₩', pre: true, dec: 0, group: ',', point: '.' }], round: 500, price: [1500, 35000],
    sub: ['소계', '공급가액'], tax: ['부가세', '부가가치세'], svc: ['봉사료'], total: ['합계', '총액', '받을금액', '결제금액'],
    cash: ['현금', '받은금액'], change: ['거스름돈', '잔돈'], disc: ['할인'], taxRate: [10], taxAdded: 0.3, incl: ['부가세 포함'], svcRate: [10], svcChance: 0.1,
    items: ['김치찌개', '된장찌개', '비빔밥', '불고기', '아메리카노', '떡볶이', '김밥', '냉면', '삼겹살', '공기밥', '라면', '콜라'],
    shops: ['한식당 소담', '카페 봄날'], head: ['테이블 3', '담당: 김민지', '주문번호 1182'], thanks: ['감사합니다', '또 오세요'] },
  { code: 'zh-Hans', money: [{ sym: '¥', pre: true, dec: 2, group: ',', point: '.' }, { sym: '元', pre: false, dec: 2, group: ',', point: '.' }], round: 0.5, price: [5, 128],
    sub: ['小计'], tax: ['税额', '增值税'], svc: ['服务费'], total: ['合计', '总计', '应付', '实收金额'],
    cash: ['现金', '实收'], change: ['找零'], disc: ['折扣', '优惠'], taxRate: [6], taxAdded: 0.2, incl: ['含税'], svcRate: [10], svcChance: 0.3,
    items: ['宫保鸡丁', '米饭', '红烧肉', '酸辣汤', '饺子', '炒青菜', '可乐', '奶茶', '小笼包', '牛肉面', '鱼香肉丝', '豆浆'],
    shops: ['老北京饭馆', '小杨生煎'], head: ['桌号: 8', '收银员: 王芳', '单号: 20261122'], thanks: ['谢谢惠顾', '欢迎再次光临'] },
  { code: 'zh-Hant', money: [{ sym: 'NT$', pre: true, dec: 0, group: ',', point: '.' }, { sym: 'HK$', pre: true, dec: 2, group: ',', point: '.' }, { sym: '元', pre: false, dec: 0, group: ',', point: '.' }], round: 5, price: [30, 480],
    sub: ['小計'], tax: ['稅額', '營業稅'], svc: ['服務費', '加一服務費'], total: ['合計', '總計', '應付金額'],
    cash: ['現金', '收款'], change: ['找零', '找贖'], disc: ['折扣', '優惠'], taxRate: [5], taxAdded: 0.15, incl: ['含稅'], svcRate: [10], svcChance: 0.5,
    items: ['牛肉麵', '珍珠奶茶', '滷肉飯', '小籠包', '蝦餃', '叉燒包', '雞排', '凍檸茶', '炒飯', '魚蛋', '蛋撻', '雲吞麵'],
    shops: ['阿明小館', '茶餐廳'], head: ['桌號: 3', '收銀員: 陳', '單號: 0098'], thanks: ['謝謝光臨', '歡迎再來'] },
  { code: 'ar', money: [{ sym: 'ر.س', pre: false, dec: 2, group: ',', point: '.', space: true }, { sym: 'SAR', pre: false, dec: 2, group: ',', point: '.', space: true }, { sym: 'د.إ', pre: false, dec: 2, group: ',', point: '.', space: true }], round: 0.5, price: [3, 95],
    sub: ['المجموع الفرعي', 'المجموع'], tax: ['ضريبة القيمة المضافة', 'الضريبة'], svc: ['رسوم الخدمة'], total: ['الإجمالي', 'المجموع الكلي', 'المبلغ المستحق', 'الإجمالي شامل الضريبة'],
    cash: ['نقدا', 'المدفوع'], change: ['الباقي'], disc: ['خصم'], taxRate: [15, 5], taxAdded: 0.6, incl: ['شامل الضريبة'], svcRate: [10], svcChance: 0.3,
    items: ['شاورما دجاج', 'فلافل', 'حمص', 'قهوة عربية', 'شاي', 'كبسة', 'عصير برتقال', 'فتوش', 'تبولة', 'منسف', 'كنافة', 'ماء'],
    shops: ['مطعم الريف', 'مقهى السلام'], head: ['طاولة 5', 'الكاشير: أحمد', 'رقم الفاتورة 3301'], thanks: ['شكرا لزيارتكم'], digits: '٠١٢٣٤٥٦٧٨٩' },
  { code: 'tr', money: [{ sym: '₺', pre: true, dec: 2, group: '.', point: ',' }, { sym: 'TL', pre: false, dec: 2, group: '.', point: ',', space: true }, { sym: '*', pre: true, dec: 2, group: '.', point: ',' }], round: 5, price: [25, 650],
    sub: ['Ara Toplam', 'ARA TOPLAM'], tax: ['KDV', 'TOPKDV'], svc: ['Servis Ücreti', 'Servis'], total: ['TOPLAM', 'Genel Toplam', 'GENEL TOPLAM', 'Ödenecek Tutar'],
    cash: ['Nakit', 'NAKİT'], change: ['Para Üstü', 'PARA ÜSTÜ'], disc: ['İndirim', 'İNDİRİM'], taxRate: [10, 20], taxAdded: 0.1, incl: ['KDV Dahil'], svcRate: [10], svcChance: 0.2,
    items: ['Mercimek Çorbası', 'Adana Kebap', 'Lahmacun', 'Ayran', 'Çay', 'Türk Kahvesi', 'Pide', 'Baklava', 'Köfte', 'Su', 'Mantı', 'Künefe'],
    shops: ['Lezzet Lokantası', 'Kebapçı Halil'], head: ['Masa: 9', 'Kasiyer: Ayşe', 'Fiş No: 0045'], thanks: ['Teşekkür ederiz', 'Yine bekleriz'] },
  { code: 'ru', money: [{ sym: '₽', pre: false, dec: 2, group: ' ', point: ',', space: true }, { sym: 'руб.', pre: false, dec: 2, group: ' ', point: ',', space: true }, { sym: '=', pre: true, dec: 2, group: '', point: '.' }], round: 10, price: [60, 1500],
    sub: ['Подытог', 'Промежуточный итог', 'Сумма'], tax: ['НДС'], svc: ['Обслуживание'], total: ['ИТОГ', 'ИТОГО', 'К оплате', 'Итого к оплате'],
    cash: ['Наличные', 'НАЛИЧНЫМИ'], change: ['Сдача', 'СДАЧА'], disc: ['Скидка', 'СКИДКА'], taxRate: [20, 10], taxAdded: 0.05, incl: ['в т.ч. НДС', 'НДС 20% включен'], svcRate: [10], svcChance: 0.2,
    items: ['Борщ', 'Пельмени', 'Блины', 'Чай черный', 'Салат Оливье', 'Хлеб', 'Кофе', 'Квас', 'Сырники', 'Котлета', 'Компот', 'Солянка'],
    shops: ['Кафе Уют', 'Столовая №1'], head: ['Стол 4', 'Кассир: Иванова', 'Чек № 1123'], thanks: ['Спасибо за покупку', 'Приходите еще'] },
  { code: 'fr', money: [{ sym: '€', pre: false, dec: 2, group: ' ', point: ',', space: true }, { sym: 'EUR', pre: false, dec: 2, group: ' ', point: ',', space: true }], round: 0.1, price: [1.5, 32],
    sub: ['Sous-total', 'SOUS-TOTAL'], tax: ['TVA'], svc: ['Service'], total: ['TOTAL', 'Total TTC', 'Net à payer', 'TOTAL TTC'],
    cash: ['Espèces', 'ESPECES'], change: ['Rendu', 'Monnaie rendue'], disc: ['Remise', 'Réduction'], taxRate: [10, 20, 5.5], taxAdded: 0.05, incl: ['dont TVA', 'TVA incluse'], svcRate: [15], svcChance: 0.05,
    items: ['Croissant', 'Café crème', 'Croque-monsieur', 'Quiche lorraine', 'Baguette', 'Salade niçoise', 'Crêpe', 'Jus d\'orange', 'Steak frites', 'Pain au chocolat', 'Eau minérale', 'Tarte aux pommes'],
    shops: ['Boulangerie du Coin', 'Café de la Gare'], head: ['Table 11', 'Serveur: Luc', 'Ticket n° 3321'], thanks: ['Merci de votre visite', 'À bientôt'] },
  { code: 'de', money: [{ sym: '€', pre: false, dec: 2, group: '.', point: ',', space: true }, { sym: 'EUR', pre: true, dec: 2, group: '.', point: ',', space: true }], round: 0.1, price: [1.2, 30],
    sub: ['Zwischensumme', 'Summe Artikel'], tax: ['MwSt', 'USt', 'Mehrwertsteuer'], svc: ['Bedienung'], total: ['SUMME', 'Summe', 'Gesamt', 'Zu zahlen', 'GESAMTBETRAG'],
    cash: ['Bar', 'BAR', 'Gegeben'], change: ['Rückgeld', 'Zurück'], disc: ['Rabatt', 'Nachlass'], taxRate: [19, 7], taxAdded: 0.03, incl: ['inkl. MwSt', 'enth. MwSt'], svcRate: [10], svcChance: 0.03,
    items: ['Brezel', 'Apfelschorle', 'Schnitzel', 'Kartoffelsalat', 'Bratwurst', 'Kaffee', 'Brötchen', 'Milch 1L', 'Käse', 'Bier', 'Apfelstrudel', 'Wasser'],
    shops: ['Bäckerei Müller', 'Gasthaus zur Linde'], head: ['Tisch 6', 'Bedienung: Anna', 'Bon-Nr. 4417'], thanks: ['Vielen Dank für Ihren Einkauf', 'Auf Wiedersehen'] },
  { code: 'es', money: [{ sym: '€', pre: false, dec: 2, group: '.', point: ',', space: true }, { sym: '$', pre: true, dec: 2, group: ',', point: '.' }], round: 0.1, price: [1.5, 28],
    sub: ['Subtotal', 'Base imponible', 'SUBTOTAL'], tax: ['IVA'], svc: ['Servicio', 'Propina'], total: ['TOTAL', 'Total a pagar', 'IMPORTE', 'Importe total'],
    cash: ['Efectivo', 'Entregado'], change: ['Cambio', 'Vuelto'], disc: ['Descuento', 'Dto.'], taxRate: [10, 21, 16], taxAdded: 0.3, incl: ['IVA incluido'], svcRate: [10], svcChance: 0.1,
    items: ['Tortilla española', 'Café con leche', 'Paella', 'Croquetas', 'Patatas bravas', 'Cerveza', 'Agua', 'Tostada', 'Churros', 'Gazpacho', 'Jamón ibérico', 'Tacos al pastor'],
    shops: ['Bar La Plaza', 'Restaurante El Sol'], head: ['Mesa 4', 'Camarero: Juan', 'Ticket nº 2210'], thanks: ['Gracias por su visita'] },
  { code: 'pt', money: [{ sym: 'R$', pre: true, dec: 2, group: '.', point: ',', space: true }, { sym: '€', pre: false, dec: 2, group: '.', point: ',', space: true }], round: 0.1, price: [3, 85],
    sub: ['Subtotal', 'SUBTOTAL'], tax: ['IVA', 'Impostos'], svc: ['Taxa de serviço', 'Serviço'], total: ['TOTAL', 'Total a pagar', 'Valor a pagar', 'VALOR TOTAL'],
    cash: ['Dinheiro', 'Valor pago'], change: ['Troco'], disc: ['Desconto'], taxRate: [23, 13], taxAdded: 0.1, incl: ['IVA incluído'], svcRate: [10], svcChance: 0.4,
    items: ['Pão de queijo', 'Feijoada', 'Café', 'Pastel de nata', 'Bacalhau', 'Guaraná', 'Coxinha', 'Caipirinha', 'Bife a cavalo', 'Água', 'Açaí', 'Sopa'],
    shops: ['Padaria Central', 'Restaurante Sabor'], head: ['Mesa 2', 'Atendente: Maria', 'Pedido nº 551'], thanks: ['Obrigado pela preferência', 'Volte sempre'] },
  { code: 'nb', money: [{ sym: 'kr', pre: false, dec: 2, group: ' ', point: ',', space: true }, { sym: 'NOK', pre: false, dec: 2, group: ' ', point: ',', space: true }], round: 1, price: [15, 320],
    sub: ['Delsum', 'Sum varer'], tax: ['MVA', 'mva'], svc: ['Service'], total: ['TOTALT', 'Totalt', 'Å betale', 'SUM'],
    cash: ['Kontant', 'Kontanter'], change: ['Veksel', 'Tilbake'], disc: ['Rabatt'], taxRate: [15, 25], taxAdded: 0.02, incl: ['herav MVA', 'inkl. mva'],
    items: ['Kaffe', 'Skolebolle', 'Brunost', 'Fiskesuppe', 'Vaffel', 'Melk', 'Rundstykke', 'Laks', 'Kanelbolle', 'Brus', 'Pølse', 'Kjøttkaker'],
    shops: ['Kafé Fjord', 'Bakeriet'], head: ['Bord 3', 'Kasserer: Kari', 'Kvittering 0091'], thanks: ['Takk for besøket', 'Velkommen igjen'] },
  { code: 'da', money: [{ sym: 'kr.', pre: false, dec: 2, group: '.', point: ',', space: true }, { sym: 'DKK', pre: false, dec: 2, group: '.', point: ',', space: true }], round: 1, price: [12, 280],
    sub: ['Subtotal', 'Mellemsum'], tax: ['Moms', 'MOMS'], svc: ['Service'], total: ['TOTAL', 'I alt', 'At betale', 'Total'],
    cash: ['Kontant', 'Modtaget'], change: ['Byttepenge', 'Retur'], disc: ['Rabat'], taxRate: [25], taxAdded: 0.02, incl: ['heraf moms', 'inkl. moms'],
    items: ['Smørrebrød', 'Kaffe', 'Wienerbrød', 'Rugbrød', 'Frikadeller', 'Øl', 'Hotdog', 'Kanelsnegl', 'Mælk', 'Leverpostej', 'Sodavand', 'Æblekage'],
    shops: ['Bageriet', 'Café Hygge'], head: ['Bord 7', 'Ekspedient: Mette', 'Bon nr. 2231'], thanks: ['Tak for besøget', 'På gensyn'] },
  { code: 'sv', money: [{ sym: 'kr', pre: false, dec: 2, group: ' ', point: ',', space: true }, { sym: 'SEK', pre: false, dec: 2, group: ' ', point: ',', space: true }], round: 1, price: [12, 290],
    sub: ['Delsumma', 'Summa varor'], tax: ['Moms', 'MOMS'], svc: ['Service'], total: ['TOTALT', 'Totalt', 'Att betala', 'SUMMA'],
    cash: ['Kontant', 'Erhållet'], change: ['Växel', 'Tillbaka'], disc: ['Rabatt'], taxRate: [12, 25], taxAdded: 0.02, incl: ['varav moms', 'inkl. moms'],
    items: ['Kanelbulle', 'Kaffe', 'Köttbullar', 'Räksmörgås', 'Mjölk', 'Smörgås', 'Lingonsylt', 'Prinsesstårta', 'Falukorv', 'Läsk', 'Pyttipanna', 'Te'],
    shops: ['Konditori Svea', 'Café Lilla'], head: ['Bord 2', 'Kassör: Erik', 'Kvitto nr 3412'], thanks: ['Tack för ditt köp', 'Välkommen åter'] },
  { code: 'fi', money: [{ sym: '€', pre: false, dec: 2, group: ' ', point: ',', space: true }, { sym: 'EUR', pre: false, dec: 2, group: ' ', point: ',', space: true }], round: 0.1, price: [1.5, 32],
    sub: ['Välisumma', 'Yhteensä tuotteet'], tax: ['ALV', 'Alv'], svc: ['Palvelumaksu'], total: ['YHTEENSÄ', 'Yhteensä', 'Maksettava', 'SUMMA'],
    cash: ['Käteinen', 'KÄTEINEN'], change: ['Vaihtoraha', 'Takaisin'], disc: ['Alennus'], taxRate: [14, 25.5], taxAdded: 0.02, incl: ['sis. ALV', 'joista ALV'],
    items: ['Karjalanpiirakka', 'Kahvi', 'Korvapuusti', 'Lohikeitto', 'Ruisleipä', 'Maito', 'Lihapullat', 'Mustikkapiirakka', 'Limsa', 'Makkara', 'Puuro', 'Tee'],
    shops: ['Kahvila Kulma', 'Ravintola Aalto'], head: ['Pöytä 5', 'Myyjä: Liisa', 'Kuitti nro 7781'], thanks: ['Kiitos käynnistä', 'Tervetuloa uudelleen'] },
  { code: 'sw', money: [{ sym: 'KSh', pre: true, dec: 2, group: ',', point: '.', space: true }, { sym: 'TSh', pre: true, dec: 0, group: ',', point: '.', space: true }, { sym: 'Ksh', pre: true, dec: 0, group: ',', point: '.', space: true }], round: 10, price: [50, 1800],
    sub: ['Jumla Ndogo', 'Subtotal', 'Jumla ndogo'], tax: ['VAT', 'Kodi', 'Kodi ya VAT'], svc: ['Huduma', 'Service Charge'], total: ['JUMLA', 'Jumla Kuu', 'Jumla', 'TOTAL'],
    cash: ['Taslimu', 'Pesa Taslimu', 'Cash'], change: ['Chenji', 'Baki'], disc: ['Punguzo'], taxRate: [16, 18], taxAdded: 0.3, incl: ['Bei ni pamoja na VAT'], svcRate: [10], svcChance: 0.2,
    items: ['Nyama Choma', 'Ugali', 'Chapati', 'Pilau', 'Chai ya Maziwa', 'Mandazi', 'Sukuma Wiki', 'Samaki', 'Soda', 'Maji', 'Wali na Maharage', 'Kuku'],
    shops: ['Mama Lishe Hoteli', 'Kibanda cha Juma'], head: ['Meza: 4', 'Mhudumu: Amina', 'Risiti Na. 1031'], thanks: ['Asante kwa kununua', 'Karibu tena'] },
];

// ── deterministic random numbers ──
let seed = 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;

function fmt(minor: number, m: Money, digits?: string) {
  const neg = minor < 0, v = Math.abs(minor);
  const whole = Math.floor(v / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, m.group);
  let s = whole + (m.dec ? m.point + String(v % 100).padStart(2, '0') : '');
  if (digits) s = s.replace(/\d/g, (d) => digits[+d]);
  return (neg ? '-' : '') + s;
}
const withSym = (s: string, m: Money) => (m.pre ? `${m.sym}${m.space ? ' ' : ''}${s}` : `${s}${m.space ? ' ' : ''}${m.sym}`);
const width = (s: string) => [...s].reduce((a, c) => a + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(c) ? 2 : 1), 0);
const row = (l: string, r: string, w = 40) => l + ' '.repeat(Math.max(3, w - width(l) - width(r))) + r;

export interface Synth { lang: string; text: string; items: { name: string; qty: number; unit: number; amount: number }[]; subtotal: number; discount: number; service: number; tax: number; taxAdded: boolean; total: number }

export function make(lang: Lang): Synth {
  const m = pick(lang.money);
  const native = lang.digits && chance(0.3) ? lang.digits : undefined;
  const cur = chance(0.5); // currency on every price, or only on the total
  const P = (v: number, force = false) => (cur || force ? withSym(fmt(v, m, native), m) : fmt(v, m, native));
  const step = Math.max(lang.round, m.dec ? 0.01 : 1);
  const price = () => Math.round((lang.price[0] + rnd() * (lang.price[1] - lang.price[0])) / step) * step;
  const n = 1 + Math.floor(rnd() * 7);
  const names = [...lang.items].sort(() => rnd() - 0.5).slice(0, n);
  const items = names.map((name) => { const qty = chance(0.7) ? 1 : 2 + Math.floor(rnd() * 3); const unit = Math.round(price() * 100); return { name, qty, unit, amount: unit * qty }; });
  const layout = Math.floor(rnd() * 4);
  const out: string[] = [pick(lang.shops), pick(lang.head), `2026-11-${String(1 + Math.floor(rnd() * 20)).padStart(2, '0')} 1${Math.floor(rnd() * 9)}:2${Math.floor(rnd() * 9)}`];
  if (chance(0.5)) out.push(pick(lang.head));
  out.push('-'.repeat(40));
  for (const it of items) {
    if (layout === 0) { out.push(it.name); out.push(row(`  ${it.qty} x ${fmt(it.unit, m, native)}`, P(it.amount))); }
    else if (layout === 1) out.push(row(`${it.qty} ${it.name}`, P(it.amount)));
    else if (layout === 2) out.push(row(`${it.name}  ${it.qty}`, `${fmt(it.unit, m, native)}   ${P(it.amount)}`));
    else out.push(it.qty > 1 ? row(`${it.name} ${it.qty}x`, P(it.amount)) : row(it.name, P(it.amount)));
  }
  out.push('-'.repeat(40));
  const sum = items.reduce((a, i) => a + i.amount, 0);
  const discount = chance(0.15) ? Math.round(sum * 0.1 / (m.dec ? 1 : 100)) * (m.dec ? 1 : 100) : 0;
  const base = sum - discount;
  const svcRate = lang.svc && lang.svcRate && chance(lang.svcChance ?? 0) ? pick(lang.svcRate) : 0;
  const service = Math.round((base * svcRate) / 100 / (m.dec ? 1 : 100)) * (m.dec ? 1 : 100);
  const rate = pick(lang.taxRate), added = chance(lang.taxAdded);
  const taxAmt = Math.round((added ? ((base + service) * rate) / 100 : ((base + service) * rate) / (100 + rate)) / (m.dec ? 1 : 100)) * (m.dec ? 1 : 100);
  const total = base + service + (added ? taxAmt : 0);
  const showSub = chance(0.8) || discount || service || added;
  if (showSub) out.push(row(pick(lang.sub), P(sum)));
  if (discount) out.push(row(pick(lang.disc), P(-discount)));
  if (service) out.push(row(`${pick(lang.svc!)} ${svcRate}%`, P(service)));
  if (added) out.push(row(`${pick(lang.tax)} ${rate}%`, P(taxAmt)));
  out.push(row(pick(lang.total), P(total, true)));
  if (!added && chance(0.8)) out.push(row(lang.incl && chance(0.6) ? `${pick(lang.incl)} ${rate}%` : `${pick(lang.tax)} ${rate}%`, fmt(taxAmt, m, native)));
  if (chance(0.6)) { const paid = Math.ceil(total / 100 / (m.dec ? 10 : 1000)) * (m.dec ? 10 : 1000) * 100; out.push(row(pick(lang.cash), P(paid))); out.push(row(pick(lang.change), P(paid - total))); }
  out.push(pick(lang.thanks));
  return { lang: lang.code, text: out.join('\n'), items, subtotal: sum, discount, service, tax: added ? taxAmt : 0, taxAdded: added, total };
}

/** How the app would fill the bill from a reading, against the printed receipt. */
export function judge(r: ReturnType<typeof parseReceipt>, s: Synth) {
  const pool = [...s.items]; let hit = 0;
  for (const it of r.items) { const k = pool.findIndex((x) => x.amount === it.amount); if (k >= 0) { pool.splice(k, 1); hit++; } }
  const c = r.charges ?? { service: 0, tax: 0, discount: 0 };
  const sum = r.items.reduce((a, i) => a + i.amount, 0);
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  return {
    want: s.items.length, got: r.items.length, hit, perfect: hit === s.items.length && r.items.length === s.items.length,
    total: near(r.total, s.total),
    // The bill the app builds: items − discount + service + tax. It must equal what was paid.
    bill: near(sum - c.discount + c.service + c.tax, s.total),
    taxOk: near(c.tax, s.tax),
  };
}

if (/synth\.ts$/.test(process.argv[1] ?? '')) {
  const a = process.argv.slice(2), opt = (k: string, d: string) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const ocrFile = opt('--ocr', ''), ocr: Record<string, string> | null = ocrFile ? JSON.parse(readFileSync(ocrFile, 'utf8')) : null;
  const N = Number(opt('--n', '500')), only = opt('--lang', ''), show = Number(opt('--show', '0')), dump = opt('--dump', '');
  const rows: string[] = [];
  const all = { n: 0, perfect: 0, want: 0, got: 0, hit: 0, total: 0, bill: 0 };
  for (const lang of L.filter((x) => !only || x.code === only)) {
    seed = 7 + lang.code.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 0) % 100000;
    const agg = { n: 0, perfect: 0, want: 0, got: 0, hit: 0, total: 0, bill: 0 }, fails: string[] = [], saved: Synth[] = [];
    for (let i = 0; i < N; i++) {
      const s = make(lang); saved.push(s);
      const text = ocr ? ocr[`${lang.code}/${i}`] : s.text;
      if (text == null) continue;
      const r = parseReceipt(text, []), j = judge(r, s);
      agg.n++; agg.want += j.want; agg.got += j.got; agg.hit += j.hit; if (j.perfect) agg.perfect++; if (j.total) agg.total++; if (j.bill) agg.bill++;
      if ((!j.perfect || !j.bill) && fails.length < show) fails.push(`${s.text}\n  → want total ${s.total / 100} (tax ${s.taxAdded ? 'added' : 'included'}) · got total ${r.total / 100}, items ${r.items.map((x) => `${x.name}=${x.amount / 100}`).join(' | ')}, charges ${JSON.stringify(r.charges)}`);
    }
    for (const k of Object.keys(all) as (keyof typeof all)[]) all[k] += agg[k];
    const p = (x: number, y: number) => `${((x / y) * 100).toFixed(1)}%`.padStart(6);
    if (!agg.n) continue;
    rows.push(`${lang.code.padEnd(8)} every item ${p(agg.perfect, agg.n)}  items found ${p(agg.hit, agg.want)}  correct ${p(agg.hit, agg.got || 1)}  total ${p(agg.total, agg.n)}  bill adds up ${p(agg.bill, agg.n)}`);
    if (fails.length) rows.push(fails.map((f) => '    ' + f.replace(/\n/g, '\n    ')).join('\n\n'));
    if (dump) { mkdirSync(dump, { recursive: true }); writeFileSync(`${dump}/${lang.code}.json`, JSON.stringify(saved)); }
  }
  console.log(`Generated receipts · ${ocr ? 'printed and read by the app\'s OCR' : `${N} per language, text as printed`}\n` + rows.join('\n'));
  const p = (x: number, y: number) => `${((x / y) * 100).toFixed(1)}%`;
  console.log(`ALL      every item ${p(all.perfect, all.n)}  items found ${p(all.hit, all.want)}  correct ${p(all.hit, all.got)}  total ${p(all.total, all.n)}  bill adds up ${p(all.bill, all.n)}`);
}
