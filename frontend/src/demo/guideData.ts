import type { Restaurant } from '@dinder/shared/types';
import { demoPhotoUrl } from './demoImages';

export type GuideRestaurant = Restaurant & {
  suburb: string;
  badges: string[];
  bestFor: string[];
  take: string;
  whatToOrder: string[];
  goodToKnow: string[];
};

export type GuideList = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badge?: string;
  restaurantIds: string[];
};

// NOTE: Dummy data only. Place IDs are fake.
export const GUIDE_RESTAURANTS: GuideRestaurant[] = [
  {
    placeId: 'demo-minamishima',
    name: 'Minamishima',
    suburb: 'Richmond',
    rating: 4.7,
    priceLevel: 4,
    cuisineType: 'Japanese',
    address: 'Lord St, Richmond',
    photoUrl: demoPhotoUrl('Minamishima', 'Minamishima'),
    badges: ['Editor’s Pick', 'Special Occasion'],
    bestFor: ['Date night', 'Celebration', 'Impressing clients'],
    take: 'A hushed, high-precision omakase that feels like a ceremony.',
    whatToOrder: ['Chef’s omakase', 'Add a sake pairing'],
    goodToKnow: ['Book ahead', 'Quiet room', 'Not ideal for big groups'],
  },
  {
    placeId: 'demo-anchovy',
    name: 'Anchovy',
    suburb: 'Richmond',
    rating: 4.5,
    priceLevel: 3,
    cuisineType: 'Italian',
    address: 'Bridge Rd, Richmond',
    photoUrl: demoPhotoUrl('Anchovy', 'Anchovy'),
    badges: ['After-work'],
    bestFor: ['After work', 'Groups (4–6)', 'Pasta cravings'],
    take: 'Loud, fun, reliably delicious — the kind of place that fixes a bad day.',
    whatToOrder: ['Pasta of the day', 'Charred broccoli', 'Tiramisu'],
    goodToKnow: ['Buzzy room', 'Share-friendly'],
  },
  {
    placeId: 'demo-lume',
    name: 'Lûmé',
    suburb: 'Richmond',
    rating: 4.6,
    priceLevel: 4,
    cuisineType: 'Modern Australian',
    address: 'Swan St, Richmond',
    photoUrl: demoPhotoUrl('Lûmé', 'Lûmé'),
    badges: ['Hatted-ish energy'],
    bestFor: ['Special occasion', 'Food nerds'],
    take: 'Tasting-menu theatre with serious technique and a playful streak.',
    whatToOrder: ['Tasting menu'],
    goodToKnow: ['Long dinner', 'Pricey'],
  },
  {
    placeId: 'demo-future-future',
    name: 'Future Future',
    suburb: 'Richmond',
    rating: 4.4,
    priceLevel: 3,
    cuisineType: 'Modern Asian',
    address: 'Swan St, Richmond',
    photoUrl: demoPhotoUrl('Future Future', 'Future Future'),
    badges: ['Trendy'],
    bestFor: ['After work', 'Small groups'],
    take: 'Creative Asian-leaning plates in a sleek room — always a good call.',
    whatToOrder: ['Chef’s picks', 'Something spicy'],
    goodToKnow: ['Great cocktails'],
  },
  {
    placeId: 'demo-carn-ation-canteen',
    name: 'Carnation Canteen',
    suburb: 'Fitzroy',
    rating: 4.6,
    priceLevel: 3,
    cuisineType: 'Modern Australian',
    address: 'Fitzroy',
    photoUrl: demoPhotoUrl('Carnation Canteen', 'Carnation Canteen'),
    badges: ['Editor’s Pick'],
    bestFor: ['Date night', 'Wine'],
    take: 'A warm, wine-first canteen with exactly the right level of polish.',
    whatToOrder: ['Snacky starters', 'Whatever’s seasonal'],
    goodToKnow: ['Great by the glass'],
  },
  {
    placeId: 'demo-bar-liberty',
    name: 'Bar Liberty',
    suburb: 'Fitzroy',
    rating: 4.7,
    priceLevel: 3,
    cuisineType: 'Wine Bar',
    address: 'Fitzroy',
    photoUrl: demoPhotoUrl('Bar Liberty', 'Bar Liberty'),
    badges: ['After-work', 'Wine'],
    bestFor: ['After work', 'Catch-ups', 'Snacks + wine'],
    take: 'A Melbourne staple: natural-leaning wine and snacky plates done right.',
    whatToOrder: ['Let them pick the wine', 'Daily plates'],
    goodToKnow: ['Walk-in friendly (sometimes)'],
  },
  {
    placeId: 'demo-ides',
    name: 'Ides',
    suburb: 'Collingwood',
    rating: 4.6,
    priceLevel: 4,
    cuisineType: 'Modern Australian',
    address: 'Collingwood',
    photoUrl: demoPhotoUrl('Ides', 'Ides'),
    badges: ['Special Occasion'],
    bestFor: ['Celebration', 'Food nerds'],
    take: 'A refined set-menu room where everything feels deliberate.',
    whatToOrder: ['Set menu'],
    goodToKnow: ['Book ahead'],
  },
  {
    placeId: 'demo-estelle',
    name: 'Estelle',
    suburb: 'Northcote',
    rating: 4.5,
    priceLevel: 3,
    cuisineType: 'Modern Australian',
    address: 'High St, Northcote',
    photoUrl: demoPhotoUrl('Estelle', 'Estelle'),
    badges: ['Neighborhood essential'],
    bestFor: ['After work', 'Date night'],
    take: 'A Northcote anchor with a confident menu and an easy vibe.',
    whatToOrder: ['Share plates', 'Steak for the table'],
    goodToKnow: ['Reliable'],
  },
  {
    placeId: 'demo-etta',
    name: 'Etta',
    suburb: 'Brunswick East',
    rating: 4.6,
    priceLevel: 3,
    cuisineType: 'Modern Australian',
    address: 'Brunswick East',
    photoUrl: demoPhotoUrl('Etta', 'Etta'),
    badges: ['Editor’s Pick'],
    bestFor: ['Groups (4–6)', 'Date night'],
    take: 'Comfort-forward plates with just enough edge to keep it interesting.',
    whatToOrder: ['Seasonal mains', 'Dessert'],
    goodToKnow: ['Buzzy'],
  },
  {
    placeId: 'demo-mister-bianco',
    name: 'Mister Bianco',
    suburb: 'Kew',
    rating: 4.4,
    priceLevel: 3,
    cuisineType: 'Italian',
    address: 'Cotham Rd, Kew',
    photoUrl: demoPhotoUrl('Mister Bianco', 'Mister Bianco'),
    badges: ['Inner east'],
    bestFor: ['After work', 'Family dinner'],
    take: 'A Kew favourite for wood-fired comfort and a polished room.',
    whatToOrder: ['Wood-fired pizza', 'Pasta'],
    goodToKnow: ['Good for groups'],
  },
  {
    placeId: 'demo-enoteca-boccaccio',
    name: 'Enoteca Boccaccio',
    suburb: 'Balwyn',
    rating: 4.6,
    priceLevel: 3,
    cuisineType: 'Italian',
    address: 'Burke Rd, Balwyn',
    photoUrl: demoPhotoUrl('Enoteca Boccaccio', 'Enoteca Boccaccio'),
    badges: ['Worth the drive'],
    bestFor: ['Wine nights', 'Celebration'],
    take: 'A serious wine bar above an iconic bottle shop — quietly excellent.',
    whatToOrder: ['Salumi + formaggi', 'Weekly specials'],
    goodToKnow: ['Great wine list'],
  },
  {
    placeId: 'demo-ember-dining',
    name: 'Ember Dining',
    suburb: 'Warrandyte',
    rating: 4.5,
    priceLevel: 3,
    cuisineType: 'Modern Australian',
    address: 'Yarra St, Warrandyte',
    photoUrl: demoPhotoUrl('Ember Dining', 'Ember Dining'),
    badges: ['Warrandyte'],
    bestFor: ['Weekends', 'Scenic dinner'],
    take: 'A polished local favourite that feels special without being stiff.',
    whatToOrder: ['Chef’s specials'],
    goodToKnow: ['Great for a drive-out dinner'],
  },
];

export const GUIDE_LISTS: GuideList[] = [
  {
    id: 'tonight',
    title: 'Tonight’s Shortlist',
    subtitle: 'High-confidence picks for a quick decision',
    description: 'A tight set of options that work for most groups, most nights.',
    badge: 'Fast pick',
    restaurantIds: [
      'demo-anchovy',
      'demo-future-future',
      'demo-bar-liberty',
      'demo-estelle',
      'demo-etta',
    ],
  },
  {
    id: 'after-work',
    title: 'After-Work Winners',
    subtitle: 'Walkable, buzzy, group-friendly',
    description: 'The best places to go when it’s 5:30pm and nobody wants to think.',
    badge: 'Weeknights',
    restaurantIds: [
      'demo-anchovy',
      'demo-future-future',
      'demo-bar-liberty',
      'demo-mister-bianco',
      'demo-estelle',
    ],
  },
  {
    id: 'special',
    title: 'Special Occasion',
    subtitle: 'When you want it to feel like a moment',
    description: 'Polished rooms, big flavours, high impact.',
    badge: 'Celebration',
    restaurantIds: ['demo-minamishima', 'demo-lume', 'demo-ides', 'demo-enoteca-boccaccio'],
  },
  {
    id: 'east-to-warrandyte',
    title: 'East Side to Warrandyte',
    subtitle: 'Worth the drive, still within the boundary',
    description: 'Inner east favourites and a few destination dinners up to Warrandyte.',
    badge: 'East',
    restaurantIds: ['demo-mister-bianco', 'demo-enoteca-boccaccio', 'demo-ember-dining'],
  },
];

export function getGuideRestaurant(placeId: string): GuideRestaurant | undefined {
  return GUIDE_RESTAURANTS.find((r) => r.placeId === placeId);
}

export function getGuideList(listId: string): GuideList | undefined {
  return GUIDE_LISTS.find((l) => l.id === listId);
}

export function getRestaurantsForList(listId: string): GuideRestaurant[] {
  const list = getGuideList(listId);
  if (!list) return [];
  return list.restaurantIds
    .map((id) => getGuideRestaurant(id))
    .filter(Boolean) as GuideRestaurant[];
}
