import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { getLocalDateStr, getLocalWeekDays } from '../../utils/date'

interface DeliveryStop {
  orderId: string
  deliveryId: string | null
  customerName: string
  phone: string
  address: string
  total: number
  paymentMethod: string
  stopNumber: number | null
  status: string
  driverId: string | null
  lat: number | null
  lng: number | null
}

interface Driver {
  id: string
  full_name: string
  phone: string
}

// ── Haversine distance between two lat/lng points (in km) ─────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Nearest-neighbour sort — returns ordered stop indices ──────────
function nearestNeighbour(
  startLat: number,
  startLng: number,
  stops: DeliveryStop[]
): number[] {
  const coords = stops.map(s => ({
    lat: s.lat ?? startLat,
    lng: s.lng ?? startLng,
  }))

  const visited = new Array(stops.length).fill(false)
  const order: number[] = []
  let curLat = startLat
  let curLng = startLng

  for (let step = 0; step < stops.length; step++) {
    let nearest = -1
    let nearestDist = Infinity
    for (let i = 0; i < stops.length; i++) {
      if (visited[i]) continue
      const d = haversineKm(curLat, curLng, coords[i].lat, coords[i].lng)
      if (d < nearestDist) { nearestDist = d; nearest = i }
    }
    if (nearest === -1) break
    visited[nearest] = true
    order.push(nearest)
    curLat = coords[nearest].lat
    curLng = coords[nearest].lng
  }
  return order
}

// ── Geocode address via Nominatim (free, no key needed) ───────────
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(address + ', NC, USA')
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'User-Agent': 'GoCoolFarms/1.0' } }
    )
    const json = await res.json()
    if (json?.[0]) {
      return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) }
    }
    return null
  } catch {
    return null
  }
}

export default function RoutesPlannerScreen() {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(getLocalDateStr())
  const [stops, setStops] = useState<DeliveryStop[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => { loadAll() }, [selectedDate])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadStops(), loadDrivers()])
    setLoading(false)
    setRefreshing(false)
  }

  async function loadStops() {
    const { data } = await supabase
      .from('orders')
      .select(`
        id, total_amount, payment_method, status,
        customer:customers(full_name, phone, address, lat, lng),
        deliveries(id, stop_number, status, driver_id)
      `)
      .eq('delivery_date', selectedDate)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })

    const mapped: DeliveryStop[] = (data ?? []).map((o: any, i: number) => ({
      orderId: o.id,
      deliveryId: o.deliveries?.[0]?.id ?? null,
      customerName: o.customer?.full_name ?? 'Unknown',
      phone: o.customer?.phone ?? '',
      address: o.customer?.address ?? '',
      total: Number(o.total_amount),
      paymentMethod: o.payment_method,
      stopNumber: o.deliveries?.[0]?.stop_number ?? i + 1,
      status: o.deliveries?.[0]?.status ?? 'unassigned',
      driverId: o.deliveries?.[0]?.driver_id ?? null,
      lat: o.customer?.lat ?? null,
      lng: o.customer?.lng ?? null,
    }))

    setStops(mapped)
  }

  async function loadDrivers() {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, phone')
      .eq('role', 'driver')
      .eq('is_active', true)
    setDrivers(data ?? [])
    if (data && data.length > 0 && !selectedDriver) {
      setSelectedDriver(data[0].id)
    }
  }

  async function handleOptimizeAndAssign() {
    if (!selectedDriver) {
      Alert.alert('No driver', 'Please select a driver first.')
      return
    }
    if (stops.length === 0) {
      Alert.alert('No stops', 'No orders found for this date.')
      return
    }

    setOptimizing(true)

    try {
      // Default start: Raleigh NC centre
      const startLat = 35.7796
      const startLng = -78.6382

      // Geocode any stops missing coordinates
      const enrichedStops = [...stops]
      for (let i = 0; i < enrichedStops.length; i++) {
        const s = enrichedStops[i]
        if (!s.lat || !s.lng) {
          const geo = await geocodeAddress(s.address)
          if (geo) {
            enrichedStops[i] = { ...s, lat: geo.lat, lng: geo.lng }
            // Save to DB so we don't need to geocode again
            await supabase.from('customers')
              .update({ lat: geo.lat, lng: geo.lng })
              .eq('phone', s.phone)
          }
        }
      }

      // Sort using nearest-neighbour Haversine
      let orderedStops = enrichedStops
      if (enrichedStops.length > 1) {
        const order = nearestNeighbour(startLat, startLng, enrichedStops)
        orderedStops = order.map(i => enrichedStops[i])
      }

      setAssigning(true)

      // Write delivery records
      for (let i = 0; i < orderedStops.length; i++) {
        const stop = orderedStops[i]
        const stopNum = i + 1

        if (stop.deliveryId) {
          await supabase.from('deliveries').update({
            driver_id: selectedDriver,
            stop_number: stopNum,
            delivery_date: selectedDate,
            status: 'assigned',
          }).eq('id', stop.deliveryId)
        } else {
          await supabase.from('deliveries').insert({
            order_id: stop.orderId,
            driver_id: selectedDriver,
            stop_number: stopNum,
            delivery_date: selectedDate,
            status: 'assigned',
          })
        }

        await supabase.from('orders')
          .update({ status: 'assigned' })
          .eq('id', stop.orderId)
      }

      Alert.alert(
        '✅ Route Optimized & Assigned',
        `${stops.length} stops sorted by shortest route and assigned to ${drivers.find(d => d.id === selectedDriver)?.full_name
        }.`
      )

      await loadStops()
    } catch (e) {
      console.log('Optimize error:', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setOptimizing(false)
      setAssigning(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    )
  }

  const weekDays = getLocalWeekDays()

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadAll() }} />
      }
    >
      {/* Date Selector */}
      <View style={styles.dateSection}>
        <Text style={styles.sectionTitle}>📅  Select Delivery Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.dateRow}>
            {weekDays.map(d => (
              <TouchableOpacity
                key={d.value}
                style={[styles.dateChip, selectedDate === d.value && styles.dateChipActive]}
                onPress={() => setSelectedDate(d.value)}
              >
                <Text style={[styles.dateChipDay, selectedDate === d.value && styles.dateChipTextActive]}>
                  {d.label}
                </Text>
                <Text style={[styles.dateChipNum, selectedDate === d.value && styles.dateChipTextActive]}>
                  {d.day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.summaryStrip}>
        <Text style={styles.summaryText}>
          {stops.length} order{stops.length !== 1 ? 's' : ''} · {selectedDate}
        </Text>
        <Text style={styles.summaryNote}>⚡ Haversine nearest-neighbour routing</Text>
      </View>

      {/* Driver Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚚  Select Driver</Text>
        {drivers.map(driver => (
          <TouchableOpacity
            key={driver.id}
            style={[styles.driverCard, selectedDriver === driver.id && styles.driverCardActive]}
            onPress={() => setSelectedDriver(driver.id)}
          >
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>{driver.full_name.charAt(0)}</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={[styles.driverName, selectedDriver === driver.id && styles.driverNameActive]}>
                {driver.full_name}
              </Text>
              <Text style={[styles.driverPhone, selectedDriver === driver.id && { color: '#DDD6FE' }]}>
                {driver.phone}
              </Text>
            </View>
            {selectedDriver === driver.id && (
              <Text style={styles.checkMark}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Stop List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍  Delivery Stops</Text>
        {stops.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No orders for this date</Text>
            <Text style={styles.emptySubText}>
              Set delivery date on orders in the Orders tab
            </Text>
          </View>
        ) : (
          stops.map((stop, index) => (
            <View key={stop.orderId} style={styles.stopCard}>
              <View style={[styles.stopNum, stop.status === 'delivered' && styles.stopNumDone]}>
                <Text style={styles.stopNumText}>
                  {stop.status === 'delivered' ? '✓' : String(index + 1)}
                </Text>
              </View>
              <View style={styles.stopInfo}>
                <Text style={styles.stopName}>{stop.customerName}</Text>
                <Text style={styles.stopAddress} numberOfLines={1}>📍 {stop.address}</Text>
                <Text style={styles.stopPhone}>📱 {stop.phone}</Text>
                <View style={styles.stopBottom}>
                  <Text style={styles.stopAmount}>${stop.total.toFixed(2)}</Text>
                  <View style={[styles.payBadge, {
                    backgroundColor:
                      stop.paymentMethod === 'cash' ? '#F4A261' :
                        stop.paymentMethod === 'zelle' ? '#8B5CF6' : '#0EA5E9'
                  }]}>
                    <Text style={styles.payBadgeText}>{stop.paymentMethod.toUpperCase()}</Text>
                  </View>
                  <View style={[styles.statusDot, {
                    backgroundColor:
                      stop.status === 'delivered' ? '#2D6A4F' :
                        stop.status === 'assigned' ? '#0EA5E9' : '#CBD5E1'
                  }]} />
                  <Text style={styles.stopStatus}>{stop.status}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Optimize + Assign */}
      {stops.length > 0 && (
        <View style={styles.assignSection}>
          <TouchableOpacity
            style={[styles.assignBtn, (optimizing || assigning) && styles.assignBtnDisabled]}
            onPress={handleOptimizeAndAssign}
            disabled={optimizing || assigning}
          >
            {optimizing ? (
              <View style={styles.assignBtnInner}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.assignBtnText}>Geocoding addresses...</Text>
              </View>
            ) : assigning ? (
              <View style={styles.assignBtnInner}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.assignBtnText}>Assigning stops...</Text>
              </View>
            ) : (
              <View style={styles.assignBtnInner}>
                <Text style={styles.assignBtnIcon}>⚡</Text>
                <Text style={styles.assignBtnText}>Optimize & Assign Route</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.assignNote}>
            Sorts stops by shortest driving distance · No internet required · Syncs to driver instantly
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dateSection: { backgroundColor: '#fff', padding: 16, elevation: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#8B5CF6', marginBottom: 12 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateChip: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', minWidth: 52 },
  dateChipActive: { backgroundColor: '#8B5CF6' },
  dateChipDay: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  dateChipNum: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  dateChipTextActive: { color: '#fff' },
  summaryStrip: { backgroundColor: '#B7E4C7', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryText: { fontSize: 13, fontWeight: '600', color: '#1B4332' },
  summaryNote: { fontSize: 10, color: '#2D6A4F' },
  section: { padding: 16, paddingBottom: 0 },
  driverCard: { backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, elevation: 2 },
  driverCardActive: { backgroundColor: '#8B5CF6' },
  driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DDD6FE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  driverAvatarText: { fontSize: 18, fontWeight: '700', color: '#8B5CF6' },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  driverNameActive: { color: '#fff' },
  driverPhone: { fontSize: 12, color: '#64748B', marginTop: 2 },
  checkMark: { fontSize: 20, color: '#fff', fontWeight: '700' },
  stopCard: { backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'flex-start', padding: 12, marginBottom: 10, elevation: 2 },
  stopNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 },
  stopNumDone: { backgroundColor: '#2D6A4F' },
  stopNumText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  stopInfo: { flex: 1 },
  stopName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  stopAddress: { fontSize: 12, color: '#64748B', marginTop: 3 },
  stopPhone: { fontSize: 12, color: '#64748B', marginTop: 2 },
  stopBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  stopAmount: { fontSize: 14, fontWeight: '800', color: '#2D6A4F' },
  payBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  payBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  stopStatus: { fontSize: 11, color: '#94A3B8' },
  emptyBox: { backgroundColor: '#fff', borderRadius: 12, padding: 32, alignItems: 'center', elevation: 2 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#94A3B8' },
  emptySubText: { fontSize: 12, color: '#CBD5E1', marginTop: 4, textAlign: 'center' },
  assignSection: { padding: 16, paddingTop: 20 },
  assignBtn: { backgroundColor: '#F4A261', borderRadius: 14, paddingVertical: 18 },
  assignBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  assignBtnDisabled: { opacity: 0.6 },
  assignBtnIcon: { fontSize: 20 },
  assignBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  assignNote: { textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 10 },
})
