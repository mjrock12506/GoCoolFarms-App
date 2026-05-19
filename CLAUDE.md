# CLAUDE.md — GoCoolFarms Delivery & Logistics App

> This file is the single source of truth for Claude Code to understand,
> generate, and maintain the GoCoolFarms mobile application.

---

## Project Overview

**GoCoolFarms** is a farm-to-door delivery and logistics mobile application
built for a small farm business based in Raleigh, NC (EST timezone).
The business sells farm produce, meat (mutton), organic pickles, and
wellness products. Customers order via a Google Form. The manager
plans deliveries and the driver executes them.

**Business model:**
- Customers submit orders via Google Form (no customer app in MVP)
- Orders sync automatically into the app
- Manager reviews, confirms, and plans delivery routes
- Driver receives optimised route, navigates, collects payment, marks delivered
- Payment is via Zelle (primary), cash, or card (Stripe)
- Minimum order: 5 lbs · Free delivery on orders 5 lbs and above
- Zelle: Goldston Group · 919-225-6343

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Mobile App | **Flutter (Dart)** | Cross-platform iOS + Android, single codebase |
| Backend / DB | **Supabase** | PostgreSQL + Auth + Realtime + Edge Functions |
| Routing Agent | **Claude API (Anthropic)** | LLM agent for intelligent logistics |
| SMS | **Twilio** | Order confirmations, delivery alerts |
| Email | **Resend** | Transactional email |
| Payments | **Stripe** | Card payments (optional MVP) |
| CI/CD | **GitHub Actions** | Automated Flutter APK builds |
| Deployment | **Expo EAS → Google Play** | Post-MVP Play Store release |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Flutter Mobile App                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   Manager   │  │    Driver    │  │  (Customer -   │ │
│  │     App     │  │     App      │  │   future MVP)  │ │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘ │
└─────────┼────────────────┼──────────────────┼──────────┘
          │                │                  │
          └────────────────┼──────────────────┘
                           │  Supabase Client (supabase-flutter)
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      SUPABASE                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────┐ │
│  │PostgreSQL│  │   Auth   │  │ Realtime  │  │Storage│ │
│  │    DB    │  │  (JWT)   │  │(WebSocket)│  │       │ │
│  └──────────┘  └──────────┘  └───────────┘  └───────┘ │
│  ┌─────────────────────────────────────────────────┐   │
│  │               Edge Functions (Deno)             │   │
│  │  sync-form-order │ llm-route-agent │ sms-notify │   │
│  └─────────────────────────────────────────────────┘   │
└────────────┬──────────────┬──────────────┬─────────────┘
             │              │              │
    ┌────────▼───┐  ┌───────▼──────┐  ┌───▼──────────┐
    │Google Form │  │ Claude API   │  │    Twilio    │
    │  + Sheets  │  │(Route Agent) │  │     SMS      │
    │(Apps Script│  │              │  │              │
    └────────────┘  └──────────────┘  └──────────────┘

CI/CD Pipeline:
GitHub Push → GitHub Actions → Flutter Build → APK Artifact
(Future: → Google Play Store via Fastlane)
```

---

## Database Schema

```sql
-- USERS (managers + drivers only — no customer accounts in MVP)
CREATE TABLE public.users (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('manager','driver')),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- CUSTOMERS (synced from Google Form — no login)
CREATE TABLE public.customers (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name               TEXT NOT NULL,
  phone                   TEXT UNIQUE NOT NULL,
  email                   TEXT,
  address                 TEXT NOT NULL,
  lat                     DECIMAL(10,7),
  lng                     DECIMAL(10,7),
  notes                   TEXT,
  special_instructions    TEXT,
  preferred_delivery_date DATE,
  source                  TEXT DEFAULT 'google_form',
  form_submission_id      TEXT UNIQUE,
  is_active               BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- PRODUCTS
CREATE TABLE public.products (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT DEFAULT 'other'
                  CHECK (category IN ('produce','dairy','meat','pickles',
                                      'bakery','beverages','wellness','other')),
  price         DECIMAL(10,2) NOT NULL,
  unit          TEXT DEFAULT 'item',
  stock_qty     INTEGER DEFAULT 0,
  image_url     TEXT,
  weight_grams  INTEGER,
  pack_size_lbs DECIMAL(5,2),
  is_preorder   BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ORDERS
CREATE TABLE public.orders (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id           UUID REFERENCES public.customers(id) NOT NULL,
  status                TEXT DEFAULT 'pending'
                          CHECK (status IN ('pending','confirmed','assigned',
                                            'out_for_delivery','delivered','cancelled')),
  delivery_date         DATE,
  preferred_date        DATE,
  date_adjusted_at      TIMESTAMPTZ,
  date_adjusted_by      UUID REFERENCES public.users(id),
  payment_method        TEXT DEFAULT 'zelle'
                          CHECK (payment_method IN ('cash','zelle','card')),
  payment_status        TEXT DEFAULT 'unpaid'
                          CHECK (payment_status IN (
                            'unpaid','cash_pending','cash_confirmed',
                            'zelle_pending','zelle_confirmed',
                            'card_pending','card_confirmed','paid')),
  total_amount          DECIMAL(10,2) DEFAULT 0,
  zelle_reference       TEXT,
  payment_notes         TEXT,
  payment_confirmed_by  UUID REFERENCES public.users(id),
  payment_confirmed_at  TIMESTAMPTZ,
  is_closed             BOOLEAN DEFAULT false,
  closed_at             TIMESTAMPTZ,
  closed_by             UUID REFERENCES public.users(id),
  notes                 TEXT,
  internal_notes        TEXT,
  is_test               BOOLEAN DEFAULT false,
  confirmed_by          UUID REFERENCES public.users(id),
  form_submission_id    TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id    UUID REFERENCES public.products(id),
  product_name  TEXT NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,
  quantity      DECIMAL(10,2) NOT NULL,
  subtotal      DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- DELIVERIES
CREATE TABLE public.deliveries (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id          UUID REFERENCES public.orders(id) NOT NULL,
  driver_id         UUID REFERENCES public.users(id),
  delivery_date     DATE NOT NULL,
  stop_number       INTEGER,
  status            TEXT DEFAULT 'assigned'
                      CHECK (status IN ('assigned','navigating','arrived','delivered')),
  route_data        JSONB,
  llm_route_notes   TEXT,
  estimated_arrival TIMESTAMPTZ,
  actual_arrival    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- PAYMENTS
CREATE TABLE public.payments (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id                  UUID REFERENCES public.orders(id) NOT NULL,
  amount_due                DECIMAL(10,2) NOT NULL,
  method                    TEXT NOT NULL CHECK (method IN ('cash','zelle','card')),
  amount_received           DECIMAL(10,2),
  change_given              DECIMAL(10,2),
  status                    TEXT DEFAULT 'pending'
                              CHECK (status IN ('pending','completed')),
  stripe_payment_intent_id  TEXT,
  collected_by              UUID REFERENCES public.users(id),
  collected_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ORDER NOTES (full audit log)
CREATE TABLE public.order_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id    UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  author_id   UUID REFERENCES public.users(id) NOT NULL,
  note        TEXT NOT NULL,
  note_type   TEXT DEFAULT 'internal'
                CHECK (note_type IN ('internal','payment_remark',
                                     'delivery_note','date_change')),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

---

## Flutter Project Structure

```
gocoolfarms/
├── android/
├── ios/
├── lib/
│   ├── main.dart
│   ├── app.dart                    # MaterialApp + routing
│   ├── core/
│   │   ├── supabase_client.dart    # Supabase init
│   │   ├── auth_service.dart       # Login/logout/session
│   │   ├── routing.dart            # GoRouter config
│   │   └── theme.dart              # App theme + colors
│   ├── models/
│   │   ├── user_model.dart
│   │   ├── customer_model.dart
│   │   ├── product_model.dart
│   │   ├── order_model.dart
│   │   ├── order_item_model.dart
│   │   ├── delivery_model.dart
│   │   └── payment_model.dart
│   ├── services/
│   │   ├── order_service.dart
│   │   ├── delivery_service.dart
│   │   ├── product_service.dart
│   │   ├── payment_service.dart
│   │   ├── route_agent_service.dart  # LLM routing
│   │   └── notification_service.dart
│   ├── features/
│   │   ├── auth/
│   │   │   └── login_screen.dart
│   │   ├── manager/
│   │   │   ├── dashboard/
│   │   │   │   └── dashboard_screen.dart
│   │   │   ├── orders/
│   │   │   │   ├── orders_screen.dart
│   │   │   │   └── order_detail_screen.dart
│   │   │   ├── products/
│   │   │   │   └── products_screen.dart
│   │   │   └── routes/
│   │   │       └── route_planner_screen.dart
│   │   └── driver/
│   │       ├── route/
│   │       │   └── route_screen.dart
│   │       ├── stop/
│   │       │   └── stop_detail_screen.dart
│   │       └── payment/
│   │           └── payment_screen.dart
│   └── shared/
│       ├── widgets/
│       │   ├── stat_card.dart
│       │   ├── order_card.dart
│       │   ├── status_badge.dart
│       │   └── loading_overlay.dart
│       └── utils/
│           ├── date_utils.dart
│           └── currency_utils.dart
├── supabase/
│   └── functions/
│       ├── sync-form-order/
│       │   └── index.ts
│       ├── llm-route-agent/
│       │   └── index.ts
│       └── sms-notify/
│           └── index.ts
├── .github/
│   └── workflows/
│       └── build_apk.yml
├── pubspec.yaml
└── CLAUDE.md
```

---

## Flutter Dependencies (pubspec.yaml)

```yaml
dependencies:
  flutter:
    sdk: flutter
  supabase_flutter: ^2.3.0      # Supabase client
  go_router: ^13.0.0            # Navigation
  flutter_riverpod: ^2.4.0      # State management
  riverpod_annotation: ^2.3.0
  freezed_annotation: ^2.4.0    # Immutable models
  json_annotation: ^4.8.0
  intl: ^0.19.0                 # Date formatting
  url_launcher: ^6.2.0          # Open Google Maps / phone
  geolocator: ^11.0.0           # Driver GPS location
  flutter_secure_storage: ^9.0.0 # Secure token storage
  http: ^1.2.0                  # HTTP calls
  cached_network_image: ^3.3.0  # Product images

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.0
  freezed: ^2.4.0
  json_serializable: ^6.7.0
  riverpod_generator: ^2.3.0
```

---

## Environment Variables

```bash
# .env (never commit this)
SUPABASE_URL=https://szdphrzabswqbzkvpfxr.supabase.co
SUPABASE_ANON_KEY=your_anon_key
ANTHROPIC_API_KEY=your_claude_api_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
ZELLE_NUMBER=919-225-6343
ZELLE_NAME=Goldston Group
```

---

## LLM Route Optimization Agent

The routing agent uses Claude API to intelligently sequence delivery stops.
It is NOT a simple distance calculator — it reasons about multiple factors.

### Agent Inputs
```json
{
  "driver_location": { "lat": 35.7796, "lng": -78.6382 },
  "stops": [
    {
      "order_id": "uuid",
      "customer_name": "John Doe",
      "address": "123 Oak St, Raleigh NC",
      "lat": 35.78,
      "lng": -78.64,
      "total_amount": 165.00,
      "payment_method": "zelle",
      "items": ["Mutton Backleg 15 lbs"],
      "notes": "Leave at front door"
    }
  ]
}
```

### Agent Reasoning
The LLM agent considers:
1. Geographic clustering of addresses
2. Order value (high-value deliveries can be prioritised)
3. Payment method (cash orders need change preparation)
4. Special instructions (apartment buildings take longer)
5. Traffic patterns (time of day reasoning)
6. Colocation opportunities (multiple customers in same area)

### Agent Output
```json
{
  "optimized_sequence": [2, 0, 3, 1, 4],
  "reasoning": "Grouped stops 2 and 3 — both in Cary within 0.3 miles. Stop 0 is highest value ($165) and is on the way. Cash orders (stops 1, 4) batched at end for change management.",
  "estimated_total_distance_km": 18.4,
  "estimated_duration_minutes": 52,
  "insights": [
    "Stops 2 and 3 are 0.3 miles apart — deliver back to back",
    "Stop 1 requires cash change — prepare $45 before leaving",
    "Stop 4 has gate code in notes — call ahead"
  ]
}
```

---

## GitHub Actions CI/CD

```yaml
# .github/workflows/build_apk.yml
name: Build Flutter APK

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Setup Flutter
        uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.19.0'
          channel: 'stable'
          cache: true

      - name: Create .env file
        run: |
          echo "SUPABASE_URL=${{ secrets.SUPABASE_URL }}" >> .env
          echo "SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}" >> .env

      - name: Get Flutter dependencies
        run: flutter pub get

      - name: Run code generation
        run: flutter pub run build_runner build --delete-conflicting-outputs

      - name: Run tests
        run: flutter test

      - name: Build APK (debug — for testing)
        run: flutter build apk --debug

      - name: Build APK (release)
        run: flutter build apk --release
        env:
          ANDROID_KEYSTORE: ${{ secrets.ANDROID_KEYSTORE }}

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: gocoolfarms-apk-${{ github.sha }}
          path: |
            build/app/outputs/flutter-apk/app-debug.apk
            build/app/outputs/flutter-apk/app-release.apk
          retention-days: 30

  # Future: deploy to Google Play Store
  # deploy:
  #   needs: build
  #   runs-on: ubuntu-latest
  #   if: github.ref == 'refs/heads/main'
  #   steps:
  #     - name: Deploy to Play Store (internal track)
  #       uses: r0adkll/upload-google-play@v1
```

---

## Supabase Edge Functions

### 1. sync-form-order
Receives Google Form submissions from Google Apps Script.
Validates data, upserts customer, creates order + items.

### 2. llm-route-agent
Calls Claude API with stop data. Returns optimised sequence
with reasoning and logistics insights.

### 3. sms-notify
Sends Twilio SMS at key events:
- Order received confirmation
- Delivery assigned (with ETA)
- Driver 2 stops away
- Driver 1 stop away
- Delivered confirmation

---

## Key Business Rules

1. Minimum order is 5 lbs of mutton
2. Free delivery on orders 5 lbs and above
3. Mutton packed in 5 lb bags only
4. Payment required BEFORE delivery to confirm order
5. Default payment method is Zelle
6. Zelle recipient: Goldston Group · 919-225-6343
7. All addresses are US-based, EST timezone
8. Test orders (is_test=true) excluded from all revenue reports
9. Cancelled orders can be undone (restored to pending)
10. Order total auto-calculated from order items via DB trigger

---

## Supabase Project Reference

- **Project ID:** szdphrzabswqbzkvpfxr
- **Region:** us-east-1
- **URL:** https://szdphrzabswqbzkvpfxr.supabase.co

---

## App Colour Palette

```dart
// core/theme.dart
const farmDark    = Color(0xFF1B4332);
const farmMid     = Color(0xFF2D6A4F);
const farmLight   = Color(0xFF52B788);
const farmPale    = Color(0xFFB7E4C7);
const amber       = Color(0xFFF4A261);
const amberDark   = Color(0xFFE76F51);
const managerPurple = Color(0xFF8B5CF6);
const driverOrange  = Color(0xFFF97316);
const customerBlue  = Color(0xFF0EA5E9);
const offWhite    = Color(0xFFF8FAFC);
const lightGray   = Color(0xFFF1F5F9);
```

---

## What Has Been Built (React Native — to be migrated to Flutter)

The following screens exist in React Native and need to be rebuilt in Flutter:

### Manager App
- Login screen with Supabase auth
- Dashboard: 4 KPI stat cards (pending, today deliveries, revenue, unpaid)
  with real-time Supabase subscriptions + tap to filtered list
- Orders list: filter tabs (All/Pending/Confirmed/Assigned/Delivered/Paid/Unpaid/Cancelled)
  with live counts, cancel/undo, real-time updates
- Order detail: status buttons, payment status, assign driver,
  date picker, internal notes with history, delete test orders
- Products screen: list with category colours, toggle active/hidden,
  edit price/stock/description modal
- Route Planner: week date selector, driver cards, stop list,
  Optimize & Assign button (nearest-neighbour algorithm)

### Driver App
- Route screen: week date selector, progress bar, optimise from GPS,
  stop cards with NEXT STOP highlight, quick map/call buttons
- Stop detail: navigate (Google Maps), call customer, order items list,
  payment method selector (cash/zelle/card), Zelle number + QR modal,
  delivery status buttons, notes, MARK DELIVERED full-width button

---

## What Remains To Be Built

1. **Google Form sync** — Apps Script + Edge Function
2. **LLM route agent** — Claude API integration
3. **SMS notifications** — Twilio Edge Function
4. **Reports screen** — Revenue by date range, payment breakdown
5. **Zelle QR code** — Real image embedded in driver app
6. **Customer app** — Future MVP phase
7. **Google Play Store pipeline** — Post-MVP

---

## Claude Code Instructions

When building this application:

1. Use **Flutter with Riverpod** for all state management
2. Use **GoRouter** for navigation with role-based routing
3. Use **Freezed** for all data models (immutable + copyWith)
4. Use **supabase_flutter** — never raw HTTP for DB calls
5. All date operations use local timezone (EST), never UTC directly
6. Exclude `is_test=true` orders from all revenue calculations
7. Realtime subscriptions on orders and deliveries tables
8. Driver screens optimised for one-handed roadside use — large tap targets
9. Manager screens prioritise information density — show counts and amounts inline
10. Payment confirmation requires explicit tap — no accidental triggers
