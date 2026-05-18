import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl,
  ActivityIndicator, Linking, Alert, ScrollView
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useNavigation } from '@react-navigation/native'
import { getLocalDateStr } from '../../utils/date'
import * as Location from 'expo-location'
import { sortStopsByDistance } from '../../utils/routing'

const ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImNjOGU2ZTVkYjZmYzQxOGY4OWE0ZjhiMmVlYmViNjc3IiwiaCI6Im11cm11cjY0In0='

interface Stop {
  deliveryId: string
  orderId: string
  stopNumber: number
  status: string
  customerName: string
  phone: string
  address: string
  total: number
  paymentMethod: string
  paymentStatus: string
  lat: number | null
  lng: number | null
}

function getWeekDays() {
  const days = []
  const today = new Date()
  for (let i = -1; i <= 6; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const day = String(d.getDate()).padStart(2,'0')
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      day:   d.getDate(),
      value: `${y}-${m}-${day}`,
      isToday: i === 0,
    })
  }
  return days
}

export default function RouteScreen() {
  const { user, signOut }           = useAuth()
  const navigation                  = useNavigation<any>()
  const [selectedDate, setSelectedDate] = useState(getLocalDateStr())
  const [stops,      setStops]      = useState<Stop[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)

  useEffect(() => {
    if (user?.id) loadStops()
    else setLoading(false)

    const sub = supabase
      .channel('driver-deliveries')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'deliveries',
        filter: `driver_id=eq.${user?.id}`,
      }, () => loadStops())
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [user?.id, selectedDate])

  async function loadStops() {
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .select(`
          id, stop_number, status, delivery_date,
          order:orders(
            id, total_amount, payment_method, payment_status,
            customer:customers(full_name, phone, address, lat, lng),
            order_items(product_name, quantity)
          )
        `)
        .eq('driver_id', user?.id)
        .eq('delivery_date', selectedDate)
        .order('stop_number', { ascending: true })

      if (error) throw error

      const mapped: Stop[] = (data ?? []).map((d: any) => ({
        deliveryId:    d.id,
        orderId:       d.order?.id,
        stopNumber:    d.stop_number ?? 0,
        status:        d.status,
        customerName:  d.order?.customer?.full_name ?? 'Unknown',
        phone:         d.order?.customer?.phone ?? '',
        address:       d.order?.customer?.address ?? '',
        total:         Number(d.order?.total_amount ?? 0),
        paymentMethod: d.order?.payment_method ?? 'cash',
        paymentStatus: d.order?.payment_status ?? 'unpaid',
        lat:           d.order?.customer?.lat ?? null,
        lng:           d.order?.customer?.lng ?? null,
      }))

      setStops(mapped)
    } catch (e) {
      console.log('Load stops error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }
  async function optimizeFromMyLocation() {
    const undelivered = stops.filter(s => s.status !== 'delivered')
    if (undelivered.length < 2) {
      Alert.alert('Nothing to optimize', 'Need at least 2 remaining stops.')
      return
    }

    setOptimizing(true)

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access required.')
        setOptimizing(false)
        return
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      })

      // Sort by nearest neighbor from current location — no API needed
      const { sortStopsByDistance } = await import('../../utils/routing')
      const ordered = sortStopsByDistance(
        loc.coords.latitude,
        loc.coords.longitude,
        undelivered
      )

      // Renumber stops
      let nextNum = stops.filter(s => s.status === 'delivered').length + 1
      for (const stop of ordered) {
        await supabase.from('deliveries')
          .update({ stop_number: nextNum })
          .eq('id', stop.deliveryId)
        nextNum++
      }

      await loadStops()
      Alert.alert(
        '✅ Route Optimized',
        'Stops sorted by nearest distance from your location.'
      )
    } catch (e: any) {
      console.log('Optimize error:', e)
      Alert.alert('Error', 'Could not get your location. Check permissions.')
    } finally {
      setOptimizing(false)
    }
  }

  async function geocodeAddress(address: string): Promise<[number,number] | null> {
    try {
      const res = await fetch(
        `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(address + ' USA')}&size=1`
      )
      const json = await res.json()
      const c = json?.features?.[0]?.geometry?.coordinates
      return c ? [c[0], c[1]] : null
    } catch { return null }
  }

  function openMaps(address: string) {
    const encoded = encodeURIComponent(address)
    const url     = `google.navigation:q=${encoded}&mode=d`
    Linking.canOpenURL(url).then(ok => {
      Linking.openURL(ok ? url :
        `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`)
    })
  }

  function callCustomer(phone: string) {
    Linking.openURL(`tel:${phone}`)
  }

  const done      = stops.filter(s => s.status === 'delivered').length
  const remaining = stops.filter(s => s.status !== 'delivered').length
  const weekDays  = getWeekDays()

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    )
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerName}>
            {user?.full_name?.split(' ')[0]} 🚚
          </Text>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long', month: 'short', day: 'numeric'
            })}
          </Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Date Selector */}
      <View style={styles.dateSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.dateRow}>
            {weekDays.map(d => (
              <TouchableOpacity
                key={d.value}
                style={[styles.dateChip,
                  selectedDate === d.value && styles.dateChipActive,
                  d.isToday && selectedDate !== d.value && styles.dateChipToday,
                ]}
                onPress={() => {
                  setSelectedDate(d.value)
                  setLoading(true)
                }}
              >
                <Text style={[styles.dateChipDay,
                  selectedDate === d.value && styles.dateChipTextActive
                ]}>
                  {d.isToday ? 'Today' : d.label}
                </Text>
                <Text style={[styles.dateChipNum,
                  selectedDate === d.value && styles.dateChipTextActive
                ]}>
                  {d.day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Progress + Optimize */}
      {stops.length > 0 && (
        <View style={styles.progressStrip}>
          <View style={styles.progressTop}>
            <Text style={styles.progressText}>
              ✅ {done} done · 📍 {remaining} remaining
            </Text>
            {remaining >= 2 && (
              <TouchableOpacity
                style={[styles.optimizeBtn,
                  optimizing && styles.optimizeBtnDisabled
                ]}
                onPress={optimizeFromMyLocation}
                disabled={optimizing}
              >
                {optimizing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.optimizeBtnText}>⚡ Optimize</Text>
                }
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {
              width: `${stops.length > 0
                ? (done / stops.length) * 100 : 0}%`
            }]} />
          </View>
        </View>
      )}

      {stops.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🗺</Text>
          <Text style={styles.emptyText}>No deliveries</Text>
          <Text style={styles.emptySubText}>
            {selectedDate === getLocalDateStr()
              ? 'No deliveries assigned for today'
              : `No deliveries for ${selectedDate}`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={stops}
          keyExtractor={item => item.deliveryId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadStops() }}
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item, index }) => {
            const isDone = item.status === 'delivered'
            const isNext = !isDone &&
              stops.findIndex(s => s.status !== 'delivered') === index

            return (
              <TouchableOpacity
                style={[
                  styles.stopCard,
                  isNext && styles.stopCardActive,
                  isDone && styles.stopCardDone,
                ]}
                onPress={() => navigation.navigate('StopDetail', {
                  deliveryId: item.deliveryId,
                  orderId:    item.orderId,
                })}
                activeOpacity={0.85}
              >
                <View style={[
                  styles.stopBubble,
                  isNext && styles.stopBubbleActive,
                  isDone && styles.stopBubbleDone,
                ]}>
                  <Text style={styles.stopBubbleText}>
                    {isDone ? '✓' : String(item.stopNumber)}
                  </Text>
                </View>

                <View style={styles.stopInfo}>
                  {isNext && (
                    <Text style={styles.nextLabel}>▶  NEXT STOP</Text>
                  )}
                  <Text style={[styles.stopName, isDone && styles.textDone]}>
                    {item.customerName}
                  </Text>
                  <Text style={[styles.stopAddress, isDone && styles.textDone]}
                    numberOfLines={1}>
                    📍 {item.address}
                  </Text>
                  <View style={styles.stopMeta}>
                    <Text style={styles.stopAmount}>
                      ${item.total.toFixed(2)}
                    </Text>
                    <View style={[styles.payBadge, {
                      backgroundColor:
                        item.paymentMethod === 'cash'  ? '#F4A261' :
                        item.paymentMethod === 'zelle' ? '#8B5CF6' : '#0EA5E9'
                    }]}>
                      <Text style={styles.payBadgeText}>
                        {item.paymentMethod.toUpperCase()}
                      </Text>
                    </View>
                    {['cash_confirmed','zelle_confirmed',
                      'card_confirmed','paid'].includes(item.paymentStatus) && (
                      <Text style={styles.paidTag}>✅ PAID</Text>
                    )}
                  </View>
                </View>

                <View style={styles.quickBtns}>
                  <TouchableOpacity
                    style={styles.mapBtn}
                    onPress={() => openMaps(item.address)}
                  >
                    <Text style={styles.mapBtnText}>🗺</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => callCustomer(item.phone)}
                  >
                    <Text style={styles.callBtnText}>📞</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F8FAFC' },
  center:             { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             {
    backgroundColor: '#F97316', padding: 20, paddingTop: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerName:         { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerDate:         { fontSize: 13, color: '#FED7AA', marginTop: 2 },
  signOutBtn:         {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  signOutText:        { color: '#fff', fontSize: 12, fontWeight: '600' },
  dateSection:        {
    backgroundColor: '#fff', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  dateRow:            { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  dateChip:           {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, backgroundColor: '#F1F5F9', minWidth: 52,
  },
  dateChipActive:     { backgroundColor: '#F97316' },
  dateChipToday:      { borderWidth: 1.5, borderColor: '#F97316' },
  dateChipDay:        { fontSize: 9, color: '#94A3B8', fontWeight: '700' },
  dateChipNum:        { fontSize: 17, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  dateChipTextActive: { color: '#fff' },
  progressStrip:      {
    backgroundColor: '#fff', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  progressTop:        {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  progressText:       { fontSize: 13, fontWeight: '600', color: '#475569' },
  optimizeBtn:        {
    backgroundColor: '#F97316', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  optimizeBtnDisabled:{ opacity: 0.6 },
  optimizeBtnText:    { fontSize: 12, fontWeight: '800', color: '#fff' },
  progressBar:        {
    height: 6, backgroundColor: '#E2E8F0',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill:       { height: '100%', backgroundColor: '#2D6A4F', borderRadius: 3 },
  emptyBox:           {
    flex: 1, alignItems: 'center',
    justifyContent: 'center', padding: 40,
  },
  emptyIcon:          { fontSize: 60, marginBottom: 16 },
  emptyText:          { fontSize: 18, fontWeight: '700', color: '#94A3B8' },
  emptySubText:       {
    fontSize: 13, color: '#CBD5E1',
    marginTop: 8, textAlign: 'center',
  },
  stopCard:           {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', padding: 14, elevation: 2,
  },
  stopCardActive:     {
    backgroundColor: '#FFF7ED',
    borderWidth: 2, borderColor: '#F97316',
  },
  stopCardDone:       { opacity: 0.55 },
  stopBubble:         {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  stopBubbleActive:   { backgroundColor: '#F97316' },
  stopBubbleDone:     { backgroundColor: '#2D6A4F' },
  stopBubbleText:     { fontSize: 16, fontWeight: '800', color: '#fff' },
  stopInfo:           { flex: 1 },
  nextLabel:          { fontSize: 10, fontWeight: '800', color: '#F97316', marginBottom: 3 },
  stopName:           { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  stopAddress:        { fontSize: 12, color: '#64748B', marginTop: 3 },
  textDone:           { color: '#94A3B8' },
  stopMeta:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  stopAmount:         { fontSize: 15, fontWeight: '800', color: '#2D6A4F' },
  payBadge:           { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  payBadgeText:       { fontSize: 9, fontWeight: '700', color: '#fff' },
  paidTag:            { fontSize: 10, fontWeight: '700', color: '#2D6A4F' },
  quickBtns:          { gap: 8, marginLeft: 8 },
  mapBtn:             {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  mapBtnText:         { fontSize: 18 },
  callBtn:            {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center',
  },
  callBtnText:        { fontSize: 18 },
})
