// The 20 flower themes: colours plus a short field guide for each flower.
// Chart colour pairs come from palettes checked for colour-blind readability (see README).

export type FlowerId =
  | 'iris' | 'rose' | 'sunflower' | 'cherry' | 'lavender' | 'lotus' | 'tulip' | 'orchid' | 'jasmine' | 'hibiscus'
  | 'lily' | 'daisy' | 'poppy' | 'peony' | 'magnolia' | 'frangipani' | 'strelitzia' | 'camellia' | 'bluebell' | 'marigold';

type Pair = { light: [string, string]; dark: [string, string] };
const GV: Pair = { light: ['#008300', '#6250d6'], dark: ['#0ca30c', '#9085e9'] }; // green · violet
const AO: Pair = { light: ['#1baf7a', '#eb6834'], dark: ['#199e70', '#d95926'] }; // aqua · orange
const BO: Pair = { light: ['#2a78d6', '#eb6834'], dark: ['#3987e5', '#d95926'] }; // blue · orange
const OB: Pair = { light: ['#eb6834', '#2a78d6'], dark: ['#d95926', '#3987e5'] }; // orange · blue
const MG: Pair = { light: ['#e87ba4', '#008300'], dark: ['#d55181', '#0ca30c'] }; // magenta · green
const VR: Pair = { light: ['#6250d6', '#e34948'], dark: ['#9085e9', '#e66767'] }; // violet · red

export interface Flower {
  id: FlowerId; name: string; latin: string; family: string; blurb: string;
  origin: string; where: string; season: string; meaning: string; facts: string[];
  /** light accent, light text-safe ink, dark accent, dark ink */
  accent: [string, string, string, string];
  petals: [string, string]; heart: string; stem: string; pair: Pair;
}

export const FLOWERS: Flower[] = [
  {
    id: 'iris', name: 'Iris', latin: 'Iris germanica', family: 'Iridaceae (iris family)', blurb: 'Rainbow violet',
    origin: 'The Mediterranean region, where it is thought to have arisen as an ancient natural hybrid.',
    where: 'Gardens across the temperate world; naturalised on dry, sunny slopes in southern Europe and North Africa.',
    season: 'Late spring to early summer', meaning: 'Wisdom, hope and valued friendship',
    facts: [
      'It is named after Iris, the Greek goddess of the rainbow, for the many colours it comes in.',
      'The fleur-de-lis on the old French royal arms is thought to be a stylised iris.',
      'Its dried root, called orris, smells of violets and is used in perfume and some gins.',
      'The fuzzy “beard” on each drooping petal works like a landing strip, guiding bees to the nectar.',
    ],
    accent: ['#5b3fc4', '#4a2fa8', '#9a86f2', '#bfb2f8'], petals: ['#6a4fd6', '#a596f2'], heart: '#f2c230', stem: '#4f8a5a', pair: VR,
  },
  {
    id: 'rose', name: 'Rose', latin: 'Rosa spp.', family: 'Rosaceae (rose family)', blurb: 'Deep crimson',
    origin: 'Mostly Asia; smaller numbers of wild species are native to Europe, North America and northwest Africa.',
    where: 'Gardens everywhere; wild roses grow in hedgerows, woodland edges and prairies across the Northern Hemisphere.',
    season: 'Late spring to autumn', meaning: 'Love and passion (red), friendship (yellow)',
    facts: [
      'Fossils show roses have existed for around 35 million years.',
      'There are roughly 300 wild species and tens of thousands of garden varieties.',
      'Rose hips, the fruit, are rich in vitamin C and are made into tea, syrup and jam.',
      'Botanically, a rose has no thorns: its spikes are prickles, outgrowths of the stem’s skin.',
    ],
    accent: ['#c8203f', '#a3163a', '#f0607f', '#f793a8'], petals: ['#dc2f55', '#f27d97'], heart: '#8e0f33', stem: '#3c8a4a', pair: MG,
  },
  {
    id: 'sunflower', name: 'Sunflower', latin: 'Helianthus annuus', family: 'Asteraceae (daisy family)', blurb: 'Warm summer gold',
    origin: 'North America, where Indigenous peoples domesticated it some 4,000–5,000 years ago.',
    where: 'Huge farm fields in Ukraine, Russia, Argentina and the US plains; wild along North American roadsides and prairies.',
    season: 'Summer to early autumn', meaning: 'Adoration, loyalty and warmth',
    facts: [
      'Young plants follow the sun from east to west; once in bloom the heads settle facing east, which warms them and attracts more bees.',
      'Each “flower” is really a head of up to 2,000 tiny florets packed in Fibonacci spirals.',
      'Ukraine and Russia together grow around half of the world’s sunflower seed.',
      'Its scientific name comes from the Greek helios (sun) and anthos (flower).',
    ],
    accent: ['#a87300', '#7a5400', '#e0a91a', '#f3cb5e'], petals: ['#f6b81c', '#fbd35a'], heart: '#5a3510', stem: '#5f9a32', pair: BO,
  },
  {
    id: 'cherry', name: 'Cherry Blossom', latin: 'Prunus serrulata', family: 'Rosaceae (rose family)', blurb: 'Soft spring pink',
    origin: 'Japan, Korea and China.',
    where: 'Parks, riverbanks and temples across Japan; Washington, D.C.’s Tidal Basin; Seoul, Jinhae and Vancouver.',
    season: 'Early spring (March–April), each tree blooming for only a week or two', meaning: 'Beauty, renewal and the fleeting nature of life',
    facts: [
      'In 1912 Tokyo gave Washington, D.C. about 3,000 cherry trees as a gift of friendship.',
      'Hanami, picnicking beneath the blossoms, has been a Japanese custom for more than a thousand years.',
      'Japan follows the “cherry blossom front” as flowering moves north up the country each spring.',
      'Most ornamental cherries are grown for flowers and bear little or no fruit.',
    ],
    accent: ['#cf2f78', '#a1205c', '#ec6aa4', '#f59cc4'], petals: ['#f6a9c8', '#fcd3e3'], heart: '#d3477f', stem: '#6b4a3a', pair: MG,
  },
  {
    id: 'lavender', name: 'Lavender', latin: 'Lavandula angustifolia', family: 'Lamiaceae (mint family)', blurb: 'Calm purple fields',
    origin: 'The western Mediterranean: the mountains of Spain, southern France and Italy.',
    where: 'Purple fields in Provence (France), Bulgaria, Furano in Hokkaido (Japan) and Norfolk (England).',
    season: 'Early to mid summer', meaning: 'Calm, devotion and serenity',
    facts: [
      'The name is often traced to the Latin lavare, “to wash”: Romans scented their baths with it.',
      'Bulgaria has become one of the world’s biggest producers of lavender oil.',
      'It belongs to the mint family, alongside rosemary, sage, thyme and basil.',
      'It is one of the best garden plants for bees and butterflies.',
    ],
    accent: ['#7343d9', '#5a2fb8', '#a083f0', '#c2b0f7'], petals: ['#8f6ee0', '#b9a1ee'], heart: '#6a4cc4', stem: '#7f9f78', pair: VR,
  },
  {
    id: 'lotus', name: 'Sacred Lotus', latin: 'Nelumbo nucifera', family: 'Nelumbonaceae (lotus family)', blurb: 'Pink on still water',
    origin: 'Tropical and temperate Asia, reaching south to northern Australia.',
    where: 'Ponds, lakes and temple pools in India, Vietnam, Thailand, China and Indonesia.',
    season: 'Summer', meaning: 'Purity rising out of the mud; sacred in Hinduism and Buddhism',
    facts: [
      'Its leaves clean themselves: microscopic bumps make water bead up and roll away with the dirt, the “lotus effect”.',
      'A lotus seed about 1,300 years old was successfully sprouted by scientists in China.',
      'The flower can keep itself at around 30–35 °C even on cool nights, keeping pollinating beetles warm.',
      'It is the national flower of India and Vietnam, and is closer kin to plane trees than to water lilies.',
    ],
    accent: ['#b8467a', '#94335f', '#ea79ab', '#f4a8c9'], petals: ['#ef8bb3', '#fbd5e4'], heart: '#f2c94c', stem: '#2f8a72', pair: AO,
  },
  {
    id: 'tulip', name: 'Tulip', latin: 'Tulipa gesneriana', family: 'Liliaceae (lily family)', blurb: 'Bold spring red',
    origin: 'The mountains of Central Asia, such as the Tian Shan and Pamir, later bred in the Ottoman Empire.',
    where: 'Dutch bulb fields and Keukenhof gardens, Istanbul’s tulip festival, and wild species on the steppes of Kazakhstan.',
    season: 'Spring', meaning: 'Perfect, declared love',
    facts: [
      'During “tulip mania” in 1630s Holland, a single rare bulb could sell for more than a house.',
      'The Ottoman years 1718–1730 are known as the Tulip Era for the court’s love of the flower.',
      'Cut tulips keep growing in the vase, often by several centimetres.',
      'The Netherlands grows most of the world’s tulip bulbs.',
    ],
    accent: ['#c01f55', '#9c1744', '#ef5f8b', '#f597b4'], petals: ['#e2335f', '#f27b98'], heart: '#3a1a22', stem: '#4f9a52', pair: OB,
  },
  {
    id: 'orchid', name: 'Moon Orchid', latin: 'Phalaenopsis amabilis', family: 'Orchidaceae (orchid family)', blurb: 'Orchid magenta',
    origin: 'Southeast Asia to northern Australia: Indonesia, the Philippines, Malaysia, New Guinea and Queensland.',
    where: 'Humid lowland forests, clinging to tree branches; and windowsills worldwide as one of the most popular houseplants.',
    season: 'Often winter to spring; a spray can last two or three months', meaning: 'Indonesia’s “puspa pesona”, the charming flower',
    facts: [
      'Called anggrek bulan, it is one of Indonesia’s three national flowers.',
      'Orchids are among the largest plant families, with about 28,000 species.',
      'Their dust-fine seeds carry no food, so they need a partner fungus to sprout.',
      'It is an epiphyte: it grows on trees and drinks moisture from the air with silvery roots.',
    ],
    accent: ['#b5309e', '#8f2380', '#dc6cc9', '#eba0df'], petals: ['#f6e1f1', '#e7a3dc'], heart: '#c2307f', stem: '#4a8a5a', pair: MG,
  },
  {
    id: 'jasmine', name: 'Jasmine', latin: 'Jasminum sambac', family: 'Oleaceae (olive family)', blurb: 'White on fresh green',
    origin: 'South and Southeast Asia, probably the eastern Himalayas.',
    where: 'Gardens and hedges in Indonesia, the Philippines, India and Thailand; strung into garlands at weddings.',
    season: 'Most of the year in the tropics', meaning: 'Purity, sincerity and grace',
    facts: [
      'As melati putih it is Indonesia’s “puspa bangsa”, the nation’s flower; in the Philippines it is the sampaguita.',
      'Its flowers open in the evening and smell strongest at night.',
      'Jasmine tea is made by layering fresh blossoms with tea leaves overnight.',
      'It belongs to the olive family.',
    ],
    accent: ['#2f8a4c', '#1f6b38', '#4cc074', '#82d9a0'], petals: ['#fffdf6', '#eef3e3'], heart: '#e0be3a', stem: '#2f7a3e', pair: GV,
  },
  {
    id: 'hibiscus', name: 'Hibiscus', latin: 'Hibiscus rosa-sinensis', family: 'Malvaceae (mallow family)', blurb: 'Tropical scarlet',
    origin: 'Unknown in the wild; probably tropical Asia or the Pacific, and known today only in cultivation.',
    where: 'Gardens and hedges across Southeast Asia, the Pacific islands and the Caribbean.',
    season: 'All year in the tropics', meaning: 'Malaysia’s national flower, the bunga raya',
    facts: [
      'Each flower usually lasts only a single day.',
      'It is the national flower of Malaysia, where it is called bunga raya.',
      'Its relatives include cotton, okra and cacao.',
      'In India its petals were once used to shine shoes, earning it the name “shoeblackplant”.',
    ],
    accent: ['#c72a2a', '#a11f1f', '#f06262', '#f69393'], petals: ['#e8333a', '#f37a6c'], heart: '#7a0f1d', stem: '#2f7d44', pair: BO,
  },
  {
    id: 'lily', name: 'Madonna Lily', latin: 'Lilium candidum', family: 'Liliaceae (lily family)', blurb: 'White and amber',
    origin: 'The Balkans and the eastern Mediterranean.',
    where: 'Rocky hillsides in Greece, Lebanon and Israel, and old cottage gardens across Europe.',
    season: 'Early summer', meaning: 'Purity and renewal',
    facts: [
      'One of the oldest cultivated flowers: it appears on Minoan frescoes on Crete over 3,500 years old.',
      'All true lilies are highly toxic to cats, even the pollen and the water in the vase.',
      'Unusually for a lily, it grows a rosette of leaves in autumn and keeps them through winter.',
      'Its scent is strong enough to fill a room from a single stem.',
    ],
    accent: ['#b0601a', '#8a4a12', '#e39a4f', '#f0bd86'], petals: ['#fffaf0', '#f2e6cc'], heart: '#d99a1e', stem: '#4b8b55', pair: OB,
  },
  {
    id: 'daisy', name: 'Daisy', latin: 'Bellis perennis', family: 'Asteraceae (daisy family)', blurb: 'Meadow teal and white',
    origin: 'Europe and western Asia.',
    where: 'Lawns, meadows and roadsides; naturalised in North America, Australia and New Zealand.',
    season: 'Spring to autumn, almost all year in mild places', meaning: 'Innocence and new beginnings',
    facts: [
      '“Daisy” comes from the Old English dæges ēage, “day’s eye”: it closes at night and opens at dawn.',
      'Each daisy is two kinds of flower in one: white ray florets around a button of yellow disc florets.',
      'The young leaves are edible and were once eaten in salads.',
      'Bellis comes from the Latin bellus, “pretty”.',
    ],
    accent: ['#0e8080', '#0a6464', '#2fc0c0', '#7ddada'], petals: ['#ffffff', '#efedf5'], heart: '#f2b200', stem: '#4c9a3e', pair: AO,
  },
  {
    id: 'poppy', name: 'Poppy', latin: 'Papaver rhoeas', family: 'Papaveraceae (poppy family)', blurb: 'Field orange-red',
    origin: 'Europe, North Africa and temperate Asia, as a companion of farming since ancient times.',
    where: 'Wheat fields, verges and freshly dug ground; famously the fields of Flanders in Belgium and France.',
    season: 'Late spring to summer', meaning: 'Remembrance',
    facts: [
      'It became the symbol of remembrance after the 1915 poem “In Flanders Fields”.',
      'Its seeds can wait in the soil for decades and sprout when the ground is disturbed, as on First World War battlefields.',
      'A single plant can make tens of thousands of seeds.',
      'It is not the opium poppy, which is Papaver somniferum.',
    ],
    accent: ['#c8460c', '#a03607', '#f2763c', '#f7a27a'], petals: ['#ea4a1c', '#f47a46'], heart: '#1d1414', stem: '#5c8f3a', pair: BO,
  },
  {
    id: 'peony', name: 'Peony', latin: 'Paeonia lactiflora', family: 'Paeoniaceae (peony family)', blurb: 'Lush coral pink',
    origin: 'Central and eastern Asia: China, Mongolia and Siberia.',
    where: 'Classical Chinese gardens (Luoyang and Heze are famous for them) and cottage gardens worldwide.',
    season: 'Late spring to early summer', meaning: 'Prosperity, honour and romance',
    facts: [
      'In China peonies are called the “king of flowers” and stand for wealth and honour.',
      'A healthy plant can keep flowering in the same spot for more than 100 years.',
      'Ants on the buds come for the nectar; the flowers open perfectly well without them.',
      'The name honours Paeon, physician to the Greek gods.',
    ],
    accent: ['#c2445c', '#9e3349', '#ee7a8f', '#f5a6b4'], petals: ['#f08e9e', '#fac6ce'], heart: '#f2c35a', stem: '#4a8a4f', pair: MG,
  },
  {
    id: 'magnolia', name: 'Magnolia', latin: 'Magnolia grandiflora', family: 'Magnoliaceae (magnolia family)', blurb: 'Ivory on glossy green',
    origin: 'The southeastern United States.',
    where: 'Coastal plains and woods from Texas to North Carolina; parks and avenues in Europe and Asia.',
    season: 'Late spring to summer', meaning: 'Dignity and perseverance; a symbol of the American South',
    facts: [
      'Magnolias evolved before bees: beetles pollinate them, which is why the petals are so tough.',
      'Magnolia-like flowers appear in fossils around 100 million years old.',
      'It is the state flower of Mississippi and Louisiana.',
      'A single bloom can be 30 cm across.',
    ],
    accent: ['#1f7a6d', '#155e54', '#3fb3a0', '#7fd3c4'], petals: ['#fffdf7', '#ece3cf'], heart: '#c9a24a', stem: '#1f5e3a', pair: AO,
  },
  {
    id: 'frangipani', name: 'Frangipani', latin: 'Plumeria rubra', family: 'Apocynaceae (dogbane family)', blurb: 'Island white and gold',
    origin: 'Mexico, Central America, Colombia and Venezuela.',
    where: 'Temple courtyards in Bali (where it is called jepun), Hawaiian leis, and tropical gardens worldwide.',
    season: 'The warm months, often through the dry season', meaning: 'Devotion; a constant in Balinese offerings',
    facts: [
      'It smells strongest at night to lure sphinx moths, yet has no nectar, so the moths leave unrewarded.',
      'In Bali the flowers fill canang sari, the small daily offerings.',
      'Plumeria honours the botanist Charles Plumier; “frangipani” comes from an Italian noble family famed for a scented perfume.',
      'It is the national flower of Laos, where it is called dok champa.',
    ],
    accent: ['#b8600a', '#924b07', '#f0a040', '#f6c27e'], petals: ['#fffaf0', '#fde3a7'], heart: '#f6b72a', stem: '#5f8f3f', pair: OB,
  },
  {
    id: 'strelitzia', name: 'Bird of Paradise', latin: 'Strelitzia reginae', family: 'Strelitziaceae (bird-of-paradise family)', blurb: 'Sunset orange and blue',
    origin: 'South Africa: the Eastern Cape and KwaZulu-Natal.',
    where: 'Coastal bush in South Africa; gardens in California, Florida, the Canary Islands and Bali.',
    season: 'Mostly winter and spring, but it can flower all year', meaning: 'Joy, freedom and paradise',
    facts: [
      'It is named after Queen Charlotte, born Duchess of Mecklenburg-Strelitz, wife of King George III.',
      'Sunbirds perch on its blue “tongue”, which opens and dusts their feet with pollen.',
      'It is the official flower of the city of Los Angeles.',
      'It is a close relative of the banana.',
    ],
    accent: ['#d0500f', '#a63e0a', '#f5853c', '#f9ae7c'], petals: ['#f7871e', '#fbb04a'], heart: '#3f4fc8', stem: '#3f7a5a', pair: OB,
  },
  {
    id: 'camellia', name: 'Camellia', latin: 'Camellia japonica', family: 'Theaceae (tea family)', blurb: 'Winter rose pink',
    origin: 'China, Japan, Korea and Taiwan.',
    where: 'Woodland in Japan and Korea; old gardens in the American South, Portugal and Galicia in Spain.',
    season: 'Winter to early spring', meaning: 'Admiration and lasting love',
    facts: [
      'It is a close relative of the tea plant, Camellia sinensis.',
      'It flowers in the depths of winter, when little else is in bloom.',
      'Its blooms fall whole rather than shedding petal by petal.',
      'Tsubaki oil, pressed from its seeds, has been used for hair care in Japan for centuries.',
    ],
    accent: ['#bf3b6e', '#992d57', '#ec74a2', '#f4a3c2'], petals: ['#e75a8a', '#f4a3c0'], heart: '#f2c94c', stem: '#2e6b3f', pair: GV,
  },
  {
    id: 'bluebell', name: 'Bluebell', latin: 'Hyacinthoides non-scripta', family: 'Asparagaceae (asparagus family)', blurb: 'Woodland blue',
    origin: 'Atlantic Europe: Britain, Ireland, France, Spain and the Low Countries.',
    where: 'Ancient broadleaf woodland, above all in Britain, which holds about half of the world’s bluebells.',
    season: 'April to May', meaning: 'Humility, gratitude and constancy',
    facts: [
      'Around half of all the world’s bluebells grow in the UK.',
      'In the UK it is illegal to dig up wild bluebell bulbs or trade them.',
      'A carpet of bluebells is a classic sign of ancient woodland.',
      'Its sticky sap was once used to glue book bindings and fletch arrows.',
    ],
    accent: ['#3b56d6', '#2e44b4', '#7090f5', '#a4b8f8'], petals: ['#5a6ee8', '#8b9cf2'], heart: '#3a46b0', stem: '#4f8a4a', pair: BO,
  },
  {
    id: 'marigold', name: 'Marigold', latin: 'Tagetes erecta', family: 'Asteraceae (daisy family)', blurb: 'Festival amber',
    origin: 'Mexico and Central America.',
    where: 'Día de Muertos altars in Mexico, temple and wedding garlands in India, and summer gardens worldwide.',
    season: 'Summer until the first frost', meaning: 'Remembrance; in Mexico, the flower that guides spirits home',
    facts: [
      'In Mexico, trails of cempasúchil petals guide the spirits home on the Day of the Dead.',
      'India uses vast amounts of marigolds for garlands at weddings, festivals and temples.',
      'Lutein from its petals is added to chicken feed to make egg yolks a deeper gold.',
      'Its Nahuatl name, cempōhualxōchitl, means “twenty flower”, for its many petals.',
    ],
    accent: ['#b86a00', '#8f5200', '#f0a13a', '#f6c47e'], petals: ['#f59a0c', '#fbbf3c'], heart: '#c25e00', stem: '#4f8a3a', pair: GV,
  },
];

export const FLOWER_IDS = FLOWERS.map((f) => f.id);
export const DEFAULT_FLOWER: FlowerId = 'iris';
// Plant themes from earlier versions map to the closest flower.
const LEGACY: Record<string, FlowerId> = { sakura: 'cherry', sunflower: 'sunflower', lavender: 'lavender', lotus: 'lotus', maple: 'marigold', bamboo: 'jasmine', monstera: 'magnolia', fern: 'bluebell', eucalyptus: 'daisy', olive: 'magnolia' };
export const resolveFlower = (id?: string): FlowerId => (FLOWER_IDS.includes(id as FlowerId) ? (id as FlowerId) : LEGACY[id || ''] ?? DEFAULT_FLOWER);
export const flowerById = (id: string) => FLOWERS.find((f) => f.id === resolveFlower(id))!;
