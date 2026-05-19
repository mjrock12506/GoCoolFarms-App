# USE_CASES.md — GoCoolFarms UML-Style Use Cases

---

## Actors

| Actor | Description |
|---|---|
| **Store Manager** | Farm business owner or manager. Manages products, orders, routes, payments. |
| **Delivery Driver** | Employee who executes deliveries. Uses driver app on the road. |
| **Customer** | Farm produce buyer. Submits orders via Google Form (no app in MVP). |
| **Google Form** | External system. Captures customer orders as form submissions. |
| **LLM Agent** | Claude API. Intelligently optimises delivery routes with reasoning. |
| **Supabase** | Backend system. Handles data persistence, auth, real-time events. |
| **Twilio** | External SMS service. Sends notifications to customers. |

---

## Use Case Index

| ID | Use Case | Primary Actor |
|---|---|---|
| UC-001 | Login to Application | Manager / Driver |
| UC-002 | View Manager Dashboard | Manager |
| UC-003 | View Order List | Manager |
| UC-004 | View Order Detail | Manager |
| UC-005 | Confirm Order | Manager |
| UC-006 | Cancel Order | Manager |
| UC-007 | Undo Order Cancellation | Manager |
| UC-008 | Set Delivery Date | Manager |
| UC-009 | Assign Driver to Order | Manager |
| UC-010 | Update Payment Status | Manager / Driver |
| UC-011 | Add Internal Note | Manager / Driver |
| UC-012 | Manage Product Catalogue | Manager |
| UC-013 | Plan Delivery Route | Manager |
| UC-014 | Optimise Route with LLM Agent | Manager / Driver |
| UC-015 | View Driver Route | Driver |
| UC-016 | Navigate to Stop | Driver |
| UC-017 | Call Customer | Driver |
| UC-018 | Update Delivery Status | Driver |
| UC-019 | Collect Payment | Driver |
| UC-020 | Mark Order Delivered | Driver |
| UC-021 | Sync Order from Google Form | System / Google Form |
| UC-022 | Send SMS Notification | System / Twilio |
| UC-023 | View Revenue Reports | Manager |

---

## Detailed Use Cases

---

### UC-001: Login to Application

**Description:**
A manager or driver authenticates into the application using their
email address and password. The system validates credentials via
Supabase Auth and routes the user to their role-specific home screen.

**Actors:** Store Manager, Delivery Driver

**Pre-conditions:**
- User account exists in Supabase Auth
- User record exists in public.users with correct role
- Device has internet connectivity

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. User opens the GoCoolFarms application
2. System displays login screen with email
   and password fields
3. User enters their email address
4. User enters their password
5. User taps Sign In button
6. System sends credentials to Supabase Auth
7. Supabase validates credentials and returns JWT
8. System queries public.users for role
9. IF role = 'manager' → navigate to Manager Dashboard
   IF role = 'driver'  → navigate to Driver Route Screen
10. System stores session securely via flutter_secure_storage

ALTERNATIVE FLOW A — Invalid credentials
──────────────────────────────────────────
6a. Supabase returns authentication error
7a. System displays "Login Failed" alert with error message
8a. User corrects credentials and retries (return to step 3)

ALTERNATIVE FLOW B — No internet
──────────────────────────────────
6b. Network request fails
7b. System displays connection error message
8b. User checks connection and retries
```

**Post-conditions:**
- User is authenticated with valid session token
- User is on their role-appropriate home screen
- Session persists across app restarts

---

### UC-002: View Manager Dashboard

**Description:**
The manager views a real-time overview of the business including
KPI cards for pending orders, today's deliveries, revenue, and
unpaid orders. Recent activity is shown below sorted by last update.

**Actors:** Store Manager, Supabase (real-time)

**Pre-conditions:**
- Manager is authenticated and on the Dashboard screen

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. System loads dashboard on navigation
2. System queries four KPI counts in parallel:
   a. Pending orders (status=pending, is_test=false)
   b. Today's deliveries (delivery_date=today, is_test=false)
   c. Revenue today (sum of confirmed payments today)
   d. Unpaid orders (payment_status=unpaid, not cancelled)
3. System displays four stat cards with live counts
4. System queries last 6 orders by updated_at descending
5. System displays recent activity list
6. System subscribes to Supabase Realtime on orders table
7. Any order change triggers automatic stat refresh

ALTERNATIVE FLOW A — No orders exist
──────────────────────────────────────
4a. No orders returned from query
5a. System displays "No orders yet" empty state

ALTERNATIVE FLOW B — Tap stat card
──────────────────────────────────────
3b. Manager taps a stat card
4b. System navigates to Orders list pre-filtered:
    Pending card    → Pending tab
    Deliveries card → Assigned tab
    Revenue card    → Paid tab
    Unpaid card     → Unpaid tab
```

**Post-conditions:**
- Manager has current business snapshot
- Real-time subscription active for live updates
- Navigation to filtered order list possible from any card

---

### UC-003: View Order List

**Description:**
The manager views all orders organised by filter tabs with
live counts. Orders can be filtered by status or payment state.
Real-time updates ensure the list is always current.

**Actors:** Store Manager, Supabase (real-time)

**Pre-conditions:**
- Manager is authenticated
- Manager navigates to Orders tab

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. System loads all orders sorted by updated_at descending
2. System displays tab bar:
   All · Pending · Confirmed · Assigned ·
   Delivered · Paid · Unpaid · Cancelled
3. System shows live count badge on each tab
4. Default tab is "All" (or pre-selected tab if navigated from dashboard)
5. Manager taps a filter tab
6. System filters order list to matching orders
7. Paid tab additionally shows green total revenue banner
8. Manager scrolls list to find order
9. Manager taps order card to open detail

ALTERNATIVE FLOW A — Cancel from list
──────────────────────────────────────
8a. Manager taps "Cancel Order" on a non-delivered order card
9a. System shows confirmation dialog
10a. Manager confirms
11a. System sets order.status = cancelled
12a. Order moves to Cancelled tab, list updates in real-time

ALTERNATIVE FLOW B — Undo cancellation
──────────────────────────────────────
8b. Manager taps "Undo Cancel" on a cancelled order card
9b. System sets order.status = pending immediately
10b. Order moves back to Pending tab
```

**Post-conditions:**
- Manager has found target order or confirmed action
- Order list reflects current database state

---

### UC-004: View Order Detail

**Description:**
The manager opens a specific order to see complete information
including customer details, order items with totals, delivery date,
status, payment status, assigned driver, and full notes history.

**Actors:** Store Manager

**Pre-conditions:**
- Manager is on Orders list or Dashboard
- An order exists in the system

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager taps an order card
2. System loads:
   a. Order data with customer details
   b. Order items with subtotals
   c. Assigned driver (if any)
   d. Full notes history from order_notes
3. System displays:
   a. Customer name, phone, address
   b. Itemised product list with quantities and prices
   c. Auto-calculated total
   d. Current delivery date (editable)
   e. Order status selector
   f. Payment status selector
   g. Driver assignment section
   h. Notes editor and history
4. Manager reviews information

IF order.is_test = true:
   System displays orange TEST banner at top
   System displays red Delete Test Order button at bottom
```

**Post-conditions:**
- Manager has full order context
- All editable fields are accessible from single screen

---

### UC-005: Confirm Order

**Description:**
Manager reviews a pending order and confirms it is valid —
payment intent verified and order ready to be assigned for delivery.

**Actors:** Store Manager

**Pre-conditions:**
- Order exists with status = pending
- Manager has reviewed customer and payment details

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager opens order detail (UC-004)
2. Manager reviews customer info and items
3. Manager verifies payment method (Zelle/cash/card)
4. Manager taps "confirmed" in order status section
5. System updates order.status = confirmed
6. System records confirmed_by = current user
7. Order appears in Confirmed tab of orders list
8. System can trigger SMS confirmation to customer (UC-022)
```

**Post-conditions:**
- Order.status = confirmed
- Order visible in Confirmed filter tab
- Customer notified via SMS (if enabled)

---

### UC-006: Cancel Order

**Description:**
Manager cancels an order that will not be fulfilled —
out of stock, customer request, or payment not received.

**Actors:** Store Manager

**Pre-conditions:**
- Order exists with status NOT = delivered

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager opens order or views order in list
2. Manager taps "Cancel Order" button
3. System shows confirmation dialog:
   "Cancel Order? This will cancel the order. You can undo this."
4. Manager taps "Cancel Order" (destructive)
5. System updates order.status = cancelled
6. Order moves to Cancelled tab
7. Order name shows strikethrough styling
8. Red CANCELLED badge appears on order card

ALTERNATIVE FLOW A — Manager changes mind
──────────────────────────────────────────
4a. Manager taps "Keep" in confirmation dialog
5a. No changes made, dialog dismissed
```

**Post-conditions:**
- Order.status = cancelled
- Order visible in Cancelled filter tab
- Order excluded from active delivery planning

---

### UC-007: Undo Order Cancellation

**Description:**
Manager restores a mistakenly cancelled order back to pending status.

**Actors:** Store Manager

**Pre-conditions:**
- Order exists with status = cancelled

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager opens Cancelled tab in Orders list
2. Manager finds the incorrectly cancelled order
3. Manager taps "↩ Undo Cancel" button on order card
4. System immediately sets order.status = pending
5. Order moves to Pending tab
6. Undo Cancel button disappears, Cancel Order button appears
```

**Post-conditions:**
- Order.status = pending
- Order re-enters normal workflow
- No data lost from original order

---

### UC-008: Set Delivery Date

**Description:**
Manager sets or adjusts the delivery date for an order.
Change automatically syncs to the driver's delivery record
and is logged in order notes.

**Actors:** Store Manager, Supabase (trigger)

**Pre-conditions:**
- Order exists in system
- Order detail screen is open

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager opens order detail (UC-004)
2. Manager taps the delivery date field (shows "Tap to set date")
3. System displays native date picker
4. Manager selects desired delivery date
5. System saves date using local timezone (EST) — YYYY-MM-DD format
6. System updates order.delivery_date
7. System DB trigger fires:
   a. Updates deliveries.delivery_date for linked delivery record
   b. Sets date_adjusted_by = current user
   c. Sets date_adjusted_at = NOW()
   d. Inserts note in order_notes: "Delivery date changed from X → Y"
8. Driver sees updated date on their route screen in real-time

IMPORTANT: Date saved as local EST date, never UTC conversion
```

**Post-conditions:**
- order.delivery_date updated
- deliveries.delivery_date synced via trigger
- Date change audited in order_notes
- Driver route screen reflects new date

---

### UC-009: Assign Driver to Order

**Description:**
Manager assigns a specific driver to an order directly from the
order detail screen. Creates or updates a delivery record.

**Actors:** Store Manager

**Pre-conditions:**
- Order exists in system
- At least one driver user exists with is_active = true
- Delivery date is set on the order

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager opens order detail (UC-004)
2. Manager scrolls to "Assign Driver" section
3. System displays list of active drivers with names and phones
4. Manager taps "Assign" next to desired driver
5. System checks if delivery record exists for this order:
   IF exists → UPDATE deliveries SET driver_id = selected driver
   IF not    → INSERT new delivery record
6. System updates order.status = assigned
7. Driver sees order appear on their route screen (real-time)
8. System triggers SMS notification to customer (UC-022)
9. Alert confirms: "Driver assigned to this order"

ALTERNATIVE FLOW A — No delivery date set
──────────────────────────────────────────
4a. No delivery_date on order
5a. System uses today's date as delivery_date for the delivery record
6a. Continues with assignment
```

**Post-conditions:**
- delivery record exists with correct driver_id and delivery_date
- order.status = assigned
- Driver can see order on their route screen
- Customer notified via SMS

---

### UC-010: Update Payment Status

**Description:**
Manager or driver updates the payment status of an order
through its complete lifecycle from unpaid to confirmed.

**Actors:** Store Manager, Delivery Driver

**Pre-conditions:**
- Order exists and is not cancelled
- Actor is authenticated with correct role

**Flow of Events:**

```
MAIN FLOW — Manager updates from Order Detail
──────────────────────────────────────────────
1. Manager opens order detail (UC-004)
2. Manager reviews current payment method (cash/zelle/card)
3. Manager taps appropriate payment status button
4. System updates order.payment_status
5. System records payment_confirmed_by = manager
6. System records payment_confirmed_at = NOW()
7. IF status is cash_confirmed/zelle_confirmed/card_confirmed:
   a. System trigger sets order.is_closed = true
   b. System trigger sets order.closed_at = NOW()

MAIN FLOW — Driver collects at doorstep
──────────────────────────────────────────────
1. Driver opens Stop Detail (UC-019)
2. Driver selects payment method (cash/zelle/card)
3a. CASH: Driver taps "Confirm Cash Received"
3b. ZELLE: Driver shows QR code or number, customer pays,
          driver taps "Confirm Zelle Received"
3c. CARD: Driver confirms card payment completed
4. System updates order.payment_status = [method]_confirmed
5. System records who confirmed and when

ALTERNATIVE FLOW — Undo payment
──────────────────────────────────────────────
1a. Actor realises payment was confirmed by mistake
2a. Actor taps "↩ Undo Payment"
3a. System shows confirmation dialog
4a. Actor confirms
5a. System resets payment_status = unpaid
6a. System clears payment_confirmed_by and payment_confirmed_at
7a. System sets is_closed = false
```

**Post-conditions:**
- order.payment_status reflects confirmed state
- order.is_closed = true when payment confirmed
- Revenue reports updated immediately

---

### UC-013: Plan Delivery Route

**Description:**
Manager selects a delivery date, selects a driver, views all
orders for that day, and assigns an optimised route to the driver.

**Actors:** Store Manager, LLM Agent

**Pre-conditions:**
- At least one order exists with a delivery date
- At least one active driver exists
- Manager is on Route Planner screen

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager opens Route Planner tab
2. System displays horizontal week date selector (7 days)
3. Manager taps a date
4. System loads all non-cancelled orders for that date
5. System displays stop list with customer details,
   amounts, and payment methods
6. Manager selects a driver by tapping their card
7. Manager taps "⚡ Optimize & Assign Route"
8. System sends stops to LLM Route Agent (UC-014)
9. Agent returns optimised sequence + reasoning
10. System renumbers stop_number on all delivery records
11. System inserts or updates delivery records for each stop
12. System updates all assigned orders to status = assigned
13. System shows success alert:
    "X stops sorted by shortest route and assigned to [Driver]"
14. Driver's route screen updates in real-time

ALTERNATIVE FLOW A — No orders for selected date
──────────────────────────────────────────────
4a. No orders found
5a. System displays: "No orders for this date"
6a. Manager selects different date or adds delivery dates to orders

ALTERNATIVE FLOW B — LLM agent unavailable
──────────────────────────────────────────────
9b. LLM API call fails
10b. System falls back to nearest-neighbour distance sort
11b. Continues with assignment
12b. Success alert notes fallback was used
```

**Post-conditions:**
- All stops have sequential stop_number values
- All delivery records have driver_id assigned
- All order statuses = assigned
- Driver sees route on their screen immediately

---

### UC-014: Optimise Route with LLM Agent

**Description:**
The LLM agent (Claude API) receives delivery stop data and
returns an intelligently optimised sequence with natural
language reasoning and specific insights per stop.

**Actors:** LLM Agent, Supabase Edge Function

**Pre-conditions:**
- Stop list with addresses and order details available
- Driver current GPS location available (driver-initiated only)
- Claude API key configured in Edge Function

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. System compiles stop data:
   - Customer addresses + lat/lng (geocoded if missing)
   - Order amounts
   - Payment methods (flag cash orders)
   - Special delivery instructions/notes
   - Start location (manager: default Raleigh centre;
                     driver: current GPS location)

2. System calls Supabase Edge Function: llm-route-agent

3. Edge Function constructs prompt for Claude API:
   "You are a delivery route optimizer for a farm delivery
    business in Raleigh NC. Analyze these stops and return
    the optimal delivery sequence considering:
    - Shortest total driving distance
    - Geographic clustering of nearby addresses
    - Order values and priorities
    - Payment method logistics (cash = prepare change)
    - Special instructions
    Return JSON: {sequence, reasoning, insights[]}"

4. Claude API processes stop data and returns:
   a. optimized_sequence: array of stop indices
   b. reasoning: paragraph explaining decisions
   c. insights: array of specific notes per stop
   d. estimated_total_distance_km
   e. estimated_duration_minutes

5. Edge Function returns result to app
6. App applies sequence to renumber stops
7. App displays reasoning to manager/driver

ALTERNATIVE FLOW — Offline / API failure
──────────────────────────────────────────
4a. API call fails or times out
5a. System uses Haversine nearest-neighbour algorithm
6a. Sorts stops by shortest distance from start location
7a. No reasoning text — proceeds silently
```

**Post-conditions:**
- Stops have optimal sequence numbers
- Manager/driver has natural language context for route
- Insights surface actionable information (cash change, gate codes, clusters)

---

### UC-015: View Driver Route

**Description:**
Driver opens the app and sees their assigned stops for the
selected day, clearly showing which stop is next, progress
made, and remaining stops.

**Actors:** Delivery Driver, Supabase (real-time)

**Pre-conditions:**
- Driver is authenticated
- At least one delivery is assigned to driver for selected date
- Delivery records exist in deliveries table

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Driver opens app → lands on Route screen
2. System displays week date selector (today highlighted)
3. System queries deliveries WHERE driver_id = current user
   AND delivery_date = selected date
   ORDER BY stop_number ASC
4. System displays progress bar: done / total
5. System displays stop cards ordered by stop_number:
   - Completed stops: greyed out with ✓ bubble
   - Next active stop: orange border "▶ NEXT STOP" label
   - Future stops: normal white card
6. System subscribes to Realtime on deliveries table
7. Manager route changes sync to driver instantly

ALTERNATIVE FLOW A — No deliveries today
──────────────────────────────────────────
3a. No deliveries found for selected date
4a. System displays: "No deliveries" with date shown
5a. Driver can tap other dates to check future assignments

ALTERNATIVE FLOW B — Check future date
──────────────────────────────────────────
2b. Driver taps a future date on date selector
3b. System loads deliveries for that date
4b. Driver previews upcoming work
```

**Post-conditions:**
- Driver has clear view of today's workload
- Next stop is clearly highlighted
- Real-time sync active for manager updates

---

### UC-016: Navigate to Stop

**Description:**
Driver opens Google Maps from within the app with turn-by-turn
directions pre-loaded to the customer's delivery address.

**Actors:** Delivery Driver

**Pre-conditions:**
- Driver is on Route screen or Stop Detail screen
- Stop has a valid customer address
- Google Maps installed on device (or web fallback)

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Driver taps map icon (🗺) on stop card
   OR taps "Navigate" button on Stop Detail screen
2. System constructs navigation URL:
   Android: google.navigation:q=[address]&mode=d
   iOS:     maps://maps.apple.com/?daddr=[address]&dirflg=d
   Fallback: maps.google.com/dir/?destination=[address]
3. System checks if Google Maps is installed:
   IF installed → open Google Maps with navigation active
   IF not       → open browser with Google Maps web
4. Google Maps opens with route to address
5. Turn-by-turn navigation begins
6. Driver follows route to customer
```

**Post-conditions:**
- Google Maps (or Maps web) open with directions
- Driver navigating to stop address

---

### UC-020: Mark Order Delivered

**Description:**
Driver confirms that an order has been successfully delivered
to the customer. Updates order and delivery status, triggers
customer SMS notification.

**Actors:** Delivery Driver, Supabase, Twilio

**Pre-conditions:**
- Driver is on Stop Detail screen
- Order is not already marked delivered
- Driver has physically delivered the order

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Driver taps "✓ MARK DELIVERED" button (full-width green)
2. System displays confirmation dialog:
   "Mark as Delivered? This will mark the order as delivered."
3. Driver taps "Yes, Delivered"
4. System updates:
   a. deliveries.status = delivered
   b. deliveries.actual_arrival = NOW()
   c. orders.status = delivered
5. Stop card on Route screen goes grey with ✓
6. Next stop becomes the active NEXT STOP
7. Progress bar updates
8. System triggers SMS to customer: "Your order has been delivered!"
9. IF all stops for the day are delivered:
   System shows completion message on Route screen

ALTERNATIVE FLOW A — Driver taps Cancel in dialog
──────────────────────────────────────────────
3a. Driver taps "Cancel"
4a. No changes made
5a. MARK DELIVERED button still active
```

**Post-conditions:**
- order.status = delivered
- delivery.status = delivered
- delivery.actual_arrival = timestamp
- Customer receives SMS confirmation
- Stop shown as completed on driver route screen

---

### UC-021: Sync Order from Google Form

**Description:**
A customer submits the GoCoolFarms Google Form. The response
is automatically parsed, validated, and created as a new
order in Supabase without any manual manager intervention.

**Actors:** Customer, Google Form, Google Apps Script, Supabase Edge Function

**Pre-conditions:**
- Google Form linked to Google Sheet
- onFormSubmit trigger active in Apps Script
- Supabase Edge Function deployed

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Customer submits Google Form with:
   - Name (required)
   - Phone Number (required)
   - Address for Free Delivery (required)
   - Mutton selection (dropdown — optional)
   - Pickle selections (checkboxes — optional)

2. Google Sheet receives new row automatically

3. Apps Script onFormSubmit trigger fires

4. Apps Script parses row:
   a. Extracts name, phone, address
   b. Cleans phone: removes spaces, dashes, +1 prefix
   c. Parses mutton selection → product name + price
   d. Parses pickle checkboxes (comma-separated) → items

5. Apps Script validates:
   - Name present?
   - Phone present and ≥ 10 digits?
   - Address present?
   - At least one item selected?
   IF any fail → log error, mark row as ❌ Invalid, stop

6. Apps Script sends POST to Supabase Edge Function:
   sync-form-order with customer + order + items JSON

7. Edge Function validates again (server-side):
   - All required fields present
   - Phone format valid

8. Edge Function checks if phone exists in customers table:
   IF exists → UPDATE customer (name, address)
   IF new    → INSERT new customer

9. Edge Function creates order:
   - status = pending
   - payment_method = zelle (default)
   - payment_status = unpaid
   - is_test = false

10. Edge Function creates order_items:
    - Matches product_name to products table
    - Uses DB price (not form price)

11. DB trigger auto-calculates order.total_amount from items

12. Edge Function returns success response

13. Apps Script marks row: ✅ Synced [timestamp]

14. Manager sees new PENDING order on dashboard in real-time

15. System sends SMS to customer: "Order received" (UC-022)

ALTERNATIVE FLOW A — Duplicate phone (returning customer)
──────────────────────────────────────────────────────────
8a. Phone found in customers table
9a. Edge Function updates customer's name and address
10a. Creates new order linked to existing customer
11a. Customer's order history preserved

ALTERNATIVE FLOW B — Missing required field
──────────────────────────────────────────────
5a. Name, phone, or address is empty
6a. Apps Script logs: "Row [N] rejected: missing [field]"
7a. Row marked ❌ Invalid in sheet
8a. No data written to Supabase
9a. Manager does NOT see the incomplete submission

ALTERNATIVE FLOW C — No items selected
──────────────────────────────────────────────
5c. Neither mutton nor pickles selected
6c. Apps Script logs: "Row [N] rejected: no items"
7c. Row marked ❌ No items in sheet
```

**Post-conditions:**
- New customer record created or updated
- New order record with status = pending
- Order items created with correct prices
- Order total auto-calculated
- Manager sees order on dashboard
- Customer receives SMS confirmation
- Sheet row marked as synced

---

### UC-022: Send SMS Notification

**Description:**
System sends automated SMS messages to customers at key
points in the order and delivery lifecycle.

**Actors:** Supabase Edge Function, Twilio

**Pre-conditions:**
- Customer phone number valid in customers table
- Twilio credentials configured in Edge Function secrets
- Triggering event has occurred

**Flow of Events:**

```
TRIGGER POINTS AND MESSAGES

T1 — Order synced from Google Form:
"Hi [Name], your GoCoolFarms order ($X) has been received.
 Payment via Zelle to Goldston Group at 919-225-6343
 to confirm your order."

T2 — Order assigned to driver + date set:
"Your GoCoolFarms order is confirmed for delivery on [Date].
 We will send you updates as your driver gets closer."

T3 — Driver 2 stops away:
"Your GoCoolFarms delivery is 2 stops away —
 approximately 15–20 minutes. Please be available."

T4 — Driver 1 stop away:
"Your GoCoolFarms driver is almost there —
 you are the next stop!"

T5 — Order delivered:
"Your GoCoolFarms order has been delivered.
 Thank you for your order! 🌿"

FLOW
──────────────────────────────────────────────
1. Triggering event occurs (order created, driver status change)
2. App or Edge Function calls sms-notify Edge Function
3. Edge Function constructs personalised message
4. Edge Function calls Twilio API:
   POST /Accounts/{SID}/Messages
   From: Twilio number
   To:   +1[customer phone]
   Body: [message text]
5. Twilio delivers SMS to customer
6. Edge Function logs delivery status
```

**Post-conditions:**
- Customer receives timely SMS at each stage
- Order lifecycle communicated proactively
- No manual notification effort required from manager or driver

---

### UC-023: View Revenue Reports

**Description:**
Manager views financial reports showing revenue collected,
orders by status, and payment method breakdown.
All test orders are excluded from all calculations.

**Actors:** Store Manager

**Pre-conditions:**
- Manager is authenticated
- At least one paid order exists (is_test = false)

**Flow of Events:**

```
MAIN FLOW
──────────────────────────────────────────────
1. Manager opens Reports screen
2. Manager selects date range (today / this week / this month / custom)
3. System queries orders WHERE:
   - is_test = false
   - payment_status IN (paid, cash_confirmed, zelle_confirmed, card_confirmed)
   - delivery_date within selected range
4. System displays:
   a. Total revenue for period
   b. Number of orders delivered
   c. Payment method breakdown (Cash / Zelle / Card amounts)
   d. Top 5 products by quantity ordered
   e. Revenue by day (bar chart)
5. Manager reviews financial performance

ALTERNATIVE FLOW A — No data for range
──────────────────────────────────────────
3a. No qualifying orders found
4a. System displays: "No revenue data for this period"
```

**Post-conditions:**
- Manager has clear financial picture
- Test data never appears in any calculation
- All amounts correctly summed from confirmed payments only
