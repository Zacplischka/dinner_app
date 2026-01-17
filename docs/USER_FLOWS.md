# Dinder User Flows & Navigation

Documentation for the frontend navigation patterns and user journeys.

## Overview

Dinder supports two primary user journeys:
1. **Discovery Flow** - Browse and explore restaurants before deciding
2. **Session Flow** - Create/join a group decision session

---

## Navigation Architecture

### Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | HomePage | Landing with quick actions |
| `/home-v2` | HomePageRedesign | Food Network-inspired discovery home |
| `/explore` | ExplorePage | Filter-driven restaurant discovery |
| `/guides/:listId` | CuratedListPage | Editorial "Best of" lists |
| `/restaurant/:id` | RestaurantDetailPageV2 | Full restaurant profile |
| `/create` | CreateSessionPage | Start a new group session |
| `/join` | JoinSessionPage | Join existing session with code |
| `/lobby/:code` | SessionLobbyPage | Waiting room before swiping |
| `/select/:code` | SelectionPage | Swipe through restaurants |
| `/results/:code` | ResultsPage | View group matches |
| `/friends` | FriendsPage | Manage friends (authenticated) |

---

## Discovery Flow

The discovery flow lets users browse restaurants before starting a session.

### Home → Cuisine → Explore

```
HomePageRedesign
    │
    ├── Tap Cuisine Card (e.g., "Italian")
    │   └── navigate('/explore', { state: { cuisine: 'italian' } })
    │       └── ExplorePage opens with Italian filter pre-selected
    │           └── Shows filtered Italian restaurants
    │
    ├── Tap "Start a Session" button
    │   └── navigate('/create')
    │
    └── Tap "Join with Code" button
        └── navigate('/join')
```

### Explore Page Filtering

The ExplorePage accepts navigation state to pre-filter results:

```typescript
// ExplorePage.tsx
const location = useLocation();
const initialCuisine = (location.state as { cuisine?: string })?.cuisine;

// Pre-selects cuisine filter and switches to search view
const [selectedCuisines, setSelectedCuisines] = useState<string[]>(
  initialCuisine ? [initialCuisine] : []
);
const [viewMode, setViewMode] = useState<'discover' | 'search'>(
  initialCuisine ? 'search' : 'discover'
);
```

### Collection → Curated List

```
ExplorePage
    │
    └── Tap Collection Card (e.g., "Date Night")
        └── navigate('/guides/date-night')
            └── CuratedListPage shows curated restaurant list
```

### Restaurant Detail

```
Any Page with Restaurant Cards
    │
    └── Tap Restaurant Card
        └── navigate('/restaurant/:id')
            └── RestaurantDetailPageV2
                │
                ├── "Decide with Friends" button
                │   └── navigate('/create', { state: { restaurantId, restaurantName } })
                │
                └── Back button
                    └── navigate(-1)
```

---

## Session Flow

The core group decision-making flow.

### Create Session

```
CreateSessionPage
    │
    ├── User enters name
    ├── Sets location/preferences
    └── Creates session
        └── navigate('/lobby/:code')
            └── SessionLobbyPage
                │
                ├── Wait for participants
                └── Host starts session
                    └── navigate('/select/:code')
```

### Join Session

```
JoinSessionPage
    │
    ├── User enters session code
    ├── User enters display name
    └── Joins session
        └── navigate('/lobby/:code')
```

### Selection & Results

```
SelectionPage
    │
    ├── Swipe right = Like
    ├── Swipe left = Pass
    └── Submit selections
        └── (waits for all participants)
            └── navigate('/results/:code')
                └── ResultsPage
                    │
                    ├── View matched restaurants
                    └── Host can restart
                        └── navigate('/select/:code')
```

---

## Navigation State Patterns

### Passing Context Between Pages

We use React Router's `location.state` for ephemeral navigation context:

```typescript
// Passing data
navigate('/explore', { state: { cuisine: 'italian' } });

// Receiving data
const location = useLocation();
const { cuisine } = (location.state as { cuisine?: string }) || {};
```

**When to use state vs URL params:**
- **State**: Ephemeral filters, pre-selections (cleared on refresh)
- **URL params**: Shareable deep links, bookmarkable pages

### Example State Objects

```typescript
// Cuisine filter
{ cuisine: 'italian' | 'mexican' | 'asian' | ... }

// Restaurant context for session
{ restaurantId: string, restaurantName: string }

// List context for group decision
{ listId: string, restaurants: Restaurant[] }
```

---

## Mobile Navigation

### FloatingNav Component

Bottom navigation bar for mobile (hidden on desktop):

```
┌─────────────────────────────────────┐
│  [Home]  [Explore]  [+Start]        │
└─────────────────────────────────────┘
```

- **Home**: Goes to `/home-v2`
- **Explore**: Goes to `/explore`
- **Start (+)**: Expands to show "Create Session" and "Join Session" options

### Scroll Behavior

- FloatingNav hides on scroll down, shows on scroll up
- BackToTop button appears after 500px scroll
- ScrollProgress indicator shows page position

---

## Authentication-Gated Routes

Some features require authentication:

| Route | Requires Auth | Notes |
|-------|---------------|-------|
| `/friends` | Yes | Friend management |
| Session invites | Yes | Sending invites to friends |
| All other routes | No | Honor system for sessions |

---

## Design Philosophy

Navigation follows the "Kinetic Warmth" design philosophy:

1. **Browse First**: Let users discover before committing to a session
2. **Contextual Actions**: "Decide Together" appears contextually on restaurant pages
3. **Minimal Friction**: No auth required for core session flow
4. **Progressive Disclosure**: Explore → Filter → Detail → Session

---

## Adding New Routes

1. Add route to `App.tsx`
2. Create page component in `src/pages/`
3. Update this documentation
4. If discoverable, add to FloatingNav or relevant entry points
