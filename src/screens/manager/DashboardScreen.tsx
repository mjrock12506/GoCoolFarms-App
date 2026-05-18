import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, ActivityIndicator
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useNavigation } from '@react-navigation/native'

interface Stats {
  pendingOrders: number
  todayDeliveries: number
  revenueToday: number
  unpaidOrders: number
}

interface RecentOrder {
  id: string
  customer: { full_name: string }
  status: string
  payment_status: string
  total_amount: number
  delivery_date: string | null
  is_test: boolean
  updated_at: string
}

const STATUS_COLOR: Record<string, string> = {
  pending:          '#F4A261',
  confirmed:        '#52B788',
  assigned:         '#0EA5E9',
  out_for_delivery: '#8B5CF6',
  delivered:        '#2D6A4F',
  cancelled:        '#EF4444',
}

export default function DashboardScreen() {
  const { user, signOut }           = useAuth()
  const navigation                  = useNavigation<any>()
  const [stats,     setStats]       = useState<Stats>({
    pendingOrders: 0, todayDeliveries: 0,
    revenueToday: 0,  unpaidOrders: 0,
  })
  const [orders,    setOrders]      = useState<RecentOrder[]>([])
  const [loading,   setLoading]     = useState(true)
  const [refreshing,setRefreshing]  = useState(false)

  useEffect(() => {
    loadData()

    // Real-time: refresh stats when any order changes
    const sub = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders'
      }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  function getToday() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  async function loadData() {
    try {
      const today = getToday()

      const { count: pendingCount } = await supabase
        .from('orders').select('*', { count: 'exact', head: true })
        .eq('status', 'pending').eq('is_test', false)

      const { count: todayCount } = await supabase
        .from('orders').select('*', { count: 'exact', head: true })
        .eq('delivery_date', today).eq('is_test', false)
        .neq('status', 'cancelled')

      const { data: revenueData } = await supabase
        .from('orders').select('total_amount')
        .eq('delivery_date', today)
        .in('payment_status', ['paid','cash_confirmed','zelle_confirmed','card_confirmed'])
        .eq('is_test', false)

      const revenue = revenueData?.reduce(
        (sum, o) => sum + Number(o.total_amount), 0) ?? 0

      const { count: unpaidCount } = await supabase
        .from('orders').select('*', { count: 'exact', head: true })
        .eq('payment_status', 'unpaid')
        .eq('is_closed', false)
        .eq('is_test', false)
        .neq('status', 'cancelled')

      setStats({
        pendingOrders:   pendingCount  ?? 0,
        todayDeliveries: todayCount    ?? 0,
        revenueToday:    revenue,
        unpaidOrders:    unpaidCount   ?? 0,
      })

      // Recent orders = most recently UPDATED first (catches paid, status changes)
      const { data: recentData } = await supabase
        .from('orders')
        .select(`
          id, status, payment_status,
          total_amount, delivery_date,
          is_test, updated_at,
          customer:customers(full_name)
        `)
        .neq('status', 'cancelled')
        .order('updated_at', { ascending: false })
        .limit(6)

      setOrders((recentData as any) ?? [])
    } catch (e) {
      console.log('Dashboard error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function onRefresh() { setRefreshing(true); loadData() }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Good {getTimeOfDay()}, {user?.full_name?.split(' ')[0]} 👋
          </Text>
          <Text style={styles.date}>{getTodayDate()}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Stat Cards — all tappable */}
      <View style={styles.statsGrid}>
        <StatCard
          value={String(stats.pendingOrders)}
          label="Pending Orders"
          color="#F4A261"
          onPress={() => navigation.navigate('OrdersTab', {
            screen: 'OrdersList', params: { initialFilter: 'Pending' }
          })}
        />
        <StatCard
          value={String(stats.todayDeliveries)}
          label="Deliveries Today"
          color="#8B5CF6"
          onPress={() => navigation.navigate('OrdersTab', {
            screen: 'OrdersList', params: { initialFilter: 'Assigned' }
          })}
        />
        <StatCard
          value={`$${stats.revenueToday.toFixed(0)}`}
          label="Revenue Today"
          color="#2D6A4F"
          onPress={() => navigation.navigate('OrdersTab', {
            screen: 'OrdersList', params: { initialFilter: 'Paid' }
          })}
        />
        <StatCard
          value={String(stats.unpaidOrders)}
          label="Unpaid Orders"
          color="#EF4444"
          onPress={() => navigation.navigate('OrdersTab', {
            screen: 'OrdersList', params: { initialFilter: 'Unpaid' }
          })}
        />
      </View>

      {/* Recent Orders — sorted by last updated */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Text style={styles.sectionSub}>sorted by last updated</Text>
        </View>

        {orders.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No orders yet</Text>
          </View>
        ) : (
          orders.map(order => (
            <TouchableOpacity
              key={order.id}
              style={[styles.orderCard,
                order.is_test && styles.orderCardTest
              ]}
              onPress={() => navigation.navigate('OrderDetail',
                { orderId: order.id })}
              activeOpacity={0.85}
            >
              <View style={[styles.orderAccent,
                { backgroundColor: STATUS_COLOR[order.status] ?? '#CBD5E1' }
              ]} />
              <View style={styles.orderInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.orderName}>
                    {order.customer?.full_name ?? 'Unknown'}
                  </Text>
                  {order.is_test && (
                    <View style={styles.testBadge}>
                      <Text style={styles.testBadgeText}>TEST</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.orderDate}>
                  📅 {order.delivery_date ?? 'No date'}
                </Text>
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.orderAmount}>
                  ${Number(order.total_amount).toFixed(2)}
                </Text>
                <View style={[styles.statusBadge,
                  { backgroundColor: STATUS_COLOR[order.status] ?? '#CBD5E1' }
                ]}>
                  <Text style={styles.statusText}>
                    {order.status.replace(/_/g, ' ')}
                  </Text>
                </View>
                {['paid','cash_confirmed','zelle_confirmed','card_confirmed']
                  .includes(order.payment_status) && (
                  <Text style={styles.paidTag}>✅ paid</Text>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  )
}

function StatCard({ value, label, color, onPress }: {
  value: string; label: string; color: string; onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={styles.statCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.statBar, { backgroundColor: color }]} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statTap}>tap to view →</Text>
    </TouchableOpacity>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function getTodayDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F8FAFC' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         {
    backgroundColor: '#8B5CF6', padding: 20, paddingTop: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  greeting:       { fontSize: 18, fontWeight: '700', color: '#fff' },
  date:           { fontSize: 13, color: '#DDD6FE', marginTop: 2 },
  signOutBtn:     {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  signOutText:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  statCard:       {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    width: '47%', elevation: 2, overflow: 'hidden',
  },
  statBar:        {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
  },
  statValue:      { fontSize: 28, fontWeight: '800', marginTop: 8 },
  statLabel:      { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  statTap:        { fontSize: 9, color: '#CBD5E1', marginTop: 4 },
  section:        { paddingHorizontal: 16, marginTop: 4 },
  sectionHeader:  {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between', marginBottom: 12,
  },
  sectionTitle:   { fontSize: 16, fontWeight: '700', color: '#1B4332' },
  sectionSub:     { fontSize: 11, color: '#94A3B8' },
  emptyBox:       {
    backgroundColor: '#fff', borderRadius: 12,
    padding: 32, alignItems: 'center', elevation: 2,
  },
  emptyText:      { fontSize: 15, fontWeight: '600', color: '#94A3B8' },
  orderCard:      {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', elevation: 2, overflow: 'hidden',
  },
  orderCardTest:  { opacity: 0.55 },
  orderAccent:    { width: 5, alignSelf: 'stretch' },
  orderInfo:      { flex: 1, padding: 12 },
  nameRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderName:      { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  testBadge:      {
    backgroundColor: '#F1F5F9', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  testBadgeText:  { fontSize: 8, fontWeight: '800', color: '#94A3B8' },
  orderDate:      { fontSize: 12, color: '#94A3B8', marginTop: 3 },
  orderRight:     { padding: 12, alignItems: 'flex-end' },
  orderAmount:    { fontSize: 15, fontWeight: '700', color: '#2D6A4F' },
  statusBadge:    {
    borderRadius: 6, paddingHorizontal: 8,
    paddingVertical: 3, marginTop: 4,
  },
  statusText:     { fontSize: 10, fontWeight: '700', color: '#fff' },
  paidTag:        { fontSize: 10, color: '#2D6A4F', fontWeight: '700', marginTop: 2 },
})
