# CAPABILITIES.md — GoCoolFarms Feature Specification

---

## Module 1: Authentication & Access Control

| Capability | Description | Role |
|---|---|---|
| Email/password login | Supabase Auth with JWT tokens | All |
| Role-based navigation | Manager sees manager app, driver sees driver app | System |
| Session persistence | Stay logged in across app restarts | All |
| Secure token storage | flutter_secure_storage, never plain storage | All |
| Sign out | Clear session, return to login | All |

**Business rules:**
- Only `manager` and `driver` roles exist in MVP
- Customer accounts are out of scope for MVP
- Roles stored in `public.users.role`, checked after auth

---

## Module 2: Manager — Dashboard

| Capability | Description |
|---|---|
| Pending orders count | Live count of orders with status = pending (excludes test) |
| Deliveries today count | Orders assigned for today's date (excludes cancelled, test) |
| Revenue today | Sum of total_amount where payment confirmed today (excludes test) |
| Unpaid orders count | Active orders with payment_status = unpaid (excludes cancelled, test) |
| Tap stat cards | Each card navigates to Orders list pre-filtered to relevant tab |
| Recent activity | Last 6 orders sorted by updated_at descending |
| Real-time updates | Supabase Realtime subscription — stats refresh on any order change |
| Pull to refresh | Manual refresh of all stats and recent orders |

---

## Module 3: Manager — Order Management

| Capability | Description |
|---|---|
| View all orders | Full list sorted by last updated |
| Filter tabs | All · Pending · Confirmed · Assigned · Delivered · Paid · Unpaid · Cancelled |
| Tab counts | Live count badge on each tab |
| Paid revenue total | Green revenue banner shown when Paid tab active |
| Real-time list | Supabase Realtime — new orders appear instantly |
| Tap to open detail | Full order detail screen |
| Cancel order | Sets status = cancelled with confirmation dialog |
| Undo cancel | Restores cancelled order to pending |
| Test order badge | Dimmed card with TEST label for is_test = true orders |

**Order Detail:**
| Capability | Description |
|---|---|
| Customer info | Name, phone, address |
| Order items | Product name, quantity, unit price, subtotal per item |
| Order total | Auto-calculated from items via DB trigger |
| Delivery date picker | Date selector — saves locally, syncs to delivery record |
| Order status buttons | Pending · Confirmed · Assigned · Out for Delivery · Delivered · Cancelled |
| Payment method | Cash · Zelle · Card |
| Payment status buttons | Full lifecycle: unpaid → pending → confirmed → paid |
| Assign driver | Driver cards — tap to assign, creates or updates delivery record |
| Internal notes | Free text editor, saved to order_notes with author + timestamp |
| Notes history | Full audit log of all notes, most recent first |
| Date change log | Automatic note created when delivery date changes |
| Delete test order | Red button visible only on is_test = true orders |
| Test order banner | Orange banner warning at top of test order details |

---

## Module 4: Manager — Product Management

| Capability | Description |
|---|---|
| View all products | Sorted by sort_order, colour-coded by category |
| Category colours | meat=red · pickles=amber · produce=green · dairy=blue · bakery=orange · beverages=purple · wellness=pink |
| Toggle app listing | Green = visible · Red = hidden (does not affect real stock) |
| Edit price | Modal with decimal keyboard |
| Edit stock quantity | Modal with number keyboard |
| Edit description | Modal with multiline text input |
| Pre-order badge | Purple badge on is_preorder = true products |
| Out of stock indicator | Orange warning when stock_qty = 0 |

**Current product catalogue:**
- Mutton Backleg 5 lbs ($55) · 10 lbs ($110) · 15 lbs ($165) — meat
- Chicken Pickle · Fish Pickle · Prawns Pickle ($15 each) — pickles, pre-order
- Tomato Pickle · Mixed Vegetable Pickle ($8 each) — pickles, pre-order
- Goat Milk Soap ($8) · Sunni Pindi Ubtan ($12) · Jute Body Scrub ($6) · Bamboo Soap Stand ($5) — wellness
- Farm Eggs ($5.50/dz) · Tomatoes ($3.50/lb) · Watermelon ($8) · Bread ($4) · Brownie ($3) · Lemon Tea ($2.50) — produce/dairy/bakery/beverages

---

## Module 5: Manager — Route Planner

| Capability | Description |
|---|---|
| Week date selector | Horizontal scroll, today highlighted, select any day |
| Orders for selected date | All non-cancelled orders with that delivery_date |
| Stop list | Customer name, address, phone, amount, payment method |
| Driver selector | Driver cards — tap to select, green check on active |
| Optimize & Assign | Sends stops to LLM route agent, renumbers stops, assigns driver |
| LLM route reasoning | Agent returns natural language explanation of route decisions |
| Route insights | "Stop 2 and 3 are 0.3 miles apart — deliver back to back" |
| Instant driver sync | Driver sees updated stops via Realtime immediately |
| Assignment confirmation | Alert confirms how many stops assigned to which driver |

---

## Module 6: Driver — Route Screen

| Capability | Description |
|---|---|
| Week date selector | Horizontal scroll to see any day's deliveries |
| Today highlighted | "Today" label on current date chip |
| Progress bar | Visual completion progress (done / total stops) |
| Done / remaining count | "✅ 2 done · 📍 4 remaining" |
| Stop cards | Customer name, address, amount, payment method, paid badge |
| NEXT STOP highlight | Orange border on current active stop |
| Completed stop style | Greyed out with green ✓ bubble |
| Quick map button | Opens Google Maps navigation directly |
| Quick call button | Dials customer phone directly |
| Tap to open stop | Full stop detail screen |
| Optimize button | Re-sorts remaining stops from current GPS location using LLM agent |
| Real-time sync | Supabase Realtime — manager changes sync instantly |
| Pull to refresh | Manual refresh |

---

## Module 7: Driver — Stop Detail

| Capability | Description |
|---|---|
| Stop number banner | Large orange header with stop number + customer name + address |
| Navigate button | Opens Google Maps with turn-by-turn directions to address |
| Call button | One tap to call customer |
| Order items list | Product name, quantity, unit price per item |
| Total due | Large font amount |
| Payment method selector | Cash · Zelle · Card — driver can change if needed |
| Cash flow | Confirm Cash Received button |
| Zelle flow | Shows Zelle number (919-225-6343) + QR code modal |
| Card flow | Shows card payment instructions |
| Payment confirmed state | Green "PAID via METHOD" banner + Undo button |
| Undo payment | Resets payment_status to unpaid with confirmation |
| Delivery status | Assigned · Navigating · Arrived buttons |
| Add delivery note | Free text saved to order_notes as delivery_note type |
| Mark Delivered | Full-width green button — confirms delivery, updates order status |
| Delivered state | Green "Delivered" banner replaces Mark Delivered button |

---

## Module 8: LLM Route Optimisation Agent

| Capability | Description |
|---|---|
| Accept stop data | List of addresses with coordinates, order values, payment methods, notes |
| Geocode addresses | Convert text addresses to lat/lng via geocoding API |
| Nearest-neighbour fallback | Pure JS/Dart calculation when LLM unavailable — works offline |
| LLM reasoning | Claude API analyses stops for optimal sequence |
| Geographic clustering | Groups nearby addresses to minimise backtracking |
| Order value weighting | Can prioritise high-value or time-sensitive orders |
| Cash management insight | Flags cash orders so driver prepares change |
| Special instruction awareness | Notes apartment buildings, gate codes, leave-at-door |
| Natural language output | Human-readable explanation of routing decisions |
| Sequence output | Ordered array of stop indices |
| Insights array | List of specific actionable notes per stop |

---

## Module 9: Google Form Sync

| Capability | Description |
|---|---|
| Form → Sheet auto-fill | Google Forms linked to Google Sheet — every submission is a row |
| Apps Script trigger | onFormSubmit fires on every new row |
| Field parsing | Name, phone, address, mutton selection, pickle checkboxes |
| Phone cleaning | Strip spaces, dashes, +1 prefix |
| Validation | Reject rows missing name, phone, or address |
| Duplicate detection | Phone number is unique key — update existing customer if found |
| Order creation | Creates order + order_items in Supabase |
| Total calculation | DB trigger auto-calculates total from items |
| Sync log | Row marked ✅ Synced with timestamp in sheet |
| Error handling | Failed rows logged with reason |
| Edge Function | Supabase Edge Function receives POST from Apps Script |
| Test endpoint | testSync() function in Apps Script for manual testing |

**Google Form fields mapped:**
| Form Field | DB Field |
|---|---|
| Name | customers.full_name |
| Phone Number | customers.phone |
| Address - For Free Delivery | customers.address |
| Mutton - 1inch cubes (dropdown) | order_items (Mutton Backleg X lbs) |
| Organic Pickles (checkboxes) | order_items (Chicken/Fish/Prawns/Tomato/Mixed pickle) |

---

## Module 10: Payment Handling

| Capability | Description |
|---|---|
| Zelle (primary) | Show recipient name + number, QR code modal in driver app |
| Cash | Driver enters amount received, change calculated |
| Card (Stripe) | Future — Stripe payment link via SMS |
| Payment status lifecycle | unpaid → pending → confirmed (per method) → paid |
| Manager confirmation | Manager can update payment status from order detail |
| Driver confirmation | Driver confirms at doorstep from stop detail |
| Undo payment | Both manager and driver can undo a confirmed payment |
| Auto-close order | Order.is_closed = true when payment confirmed |
| Revenue reporting | Only confirmed payments counted in revenue stats |

---

## Module 11: SMS Notifications (Twilio)

| Trigger | Message | Recipient |
|---|---|---|
| Order synced from form | "Hi [name], your GoCoolFarms order ($X) has been received. We'll confirm shortly." | Customer |
| Order assigned to driver | "Your order is confirmed for delivery on [date]. We'll send updates." | Customer |
| Driver 2 stops away | "Your GoCoolFarms delivery is 2 stops away — approximately 15 minutes." | Customer |
| Driver 1 stop away | "Your driver is almost there — next stop is you!" | Customer |
| Delivered | "Your GoCoolFarms order has been delivered. Thank you!" | Customer |

---

## Module 12: Reports (Manager)

| Capability | Description |
|---|---|
| Revenue by date range | Sum of confirmed payments for any date range |
| Orders by status | Count breakdown per status |
| Payment method breakdown | Cash vs Zelle vs Card totals |
| Top products | Most ordered products by quantity and revenue |
| Driver performance | Deliveries completed per driver |
| Export (future) | CSV export of orders |

**Business rule:** All reports exclude is_test = true orders.

---

## Module 13: CI/CD Pipeline

| Stage | Tool | Description |
|---|---|---|
| Source control | GitHub | Private repository |
| Trigger | Push to main or PR | Auto-build on code changes |
| Build environment | Ubuntu + Flutter 3.19 | GitHub Actions runner |
| Code generation | build_runner | Freezed + Riverpod generators |
| Tests | flutter test | Unit + widget tests |
| Debug APK | flutter build apk --debug | For internal testing |
| Release APK | flutter build apk --release | Signed APK for distribution |
| Artifact storage | GitHub Actions artifacts | 30-day retention |
| Distribution (now) | Direct APK download | Share link with team |
| Distribution (future) | Google Play Store internal track | Fastlane + Play API |

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Offline capability | Route cached at day start, works on weak signal |
| Real-time sync | <2 second delay on order/delivery updates |
| Driver tap targets | Minimum 48dp touch targets throughout |
| Date timezone | All dates in EST (America/New_York) |
| App size | Target <50MB APK |
| Auth session | Persistent across restarts via secure storage |
| Error handling | All Supabase calls wrapped in try/catch with user feedback |
| Test data isolation | is_test flag ensures test data never pollutes reports |
