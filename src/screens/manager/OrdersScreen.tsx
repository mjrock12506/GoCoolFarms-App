import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useNavigation, useRoute } from '@react-navigation/native'

const TABS = ['All','Pending','Confirmed','Assigned','Delivered','Paid','Unpaid','Cancelled']

const STATUS_COLOR: Record<string, string> = {
  pending:          '#F4A261',
  confirmed:        '#52B788',
  assigned:         '#0EA5E9',
  out_for_delivery: '#8B5CF6',
  delivered:        '#2D6A4F',
  cancelled:        '#EF4444',
}

interface Order {
  id: string
  status: string
  delivery_date: string | null
  payment_method: string
  payment_status: string
  total_amount: number
  is_closed: boolean
  is_test: boolean
  customer: { full_name: string; phone: string; address: string }
  order_items: { product_name: string; quantity: number }[]
}

const PAID_STATUSES = ['paid','cash_confirmed','zelle_confirmed','card_confirmed']

export default function OrdersScreen() {
  const navigation              = useNavigation<any>()
  const route                   = useRoute<any>()

  const [orders,     setOrders]     = useState<Order[]>([])
  const [filtered,   setFiltered]   = useState<Order[]>([])
  const [activeTab,  setActiveTab]  = useState(
    route.params?.initialFilter ?? 'All'
  )
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Re-apply filter when navigating back with new params
  useEffect(() => {
    const newFilter = route.params?.initialFilter
    if (newFilter && newFilter !== activeTab) {
      setActiveTab(newFilter)
    }
  }, [route.params?.initialFilter])

  useEffect(() => {
    loadOrders()
    const sub = supabase
      .channel('orders-list')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders'
      }, () => loadOrders())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  useEffect(() => {
    applyFilter(activeTab, orders)
  }, [activeTab, orders])

  function applyFilter(tab: string, allOrders: Order[]) {
    switch (tab) {
      case 'All':
        setFiltered(allOrders)
        break
      case 'Pending':
        setFiltered(allOrders.filter(o => o.status === 'pending'))
        break
      case 'Confirmed':
        setFiltered(allOrders.filter(o => o.status === 'confirmed'))
        break
      case 'Assigned':
        setFiltered(allOrders.filter(o =>
          o.status === 'assigned' || o.status === 'out_for_delivery'))
        break
      case 'Delivered':
        setFiltered(allOrders.filter(o => o.status === 'delivered'))
        break
      case 'Paid':
        setFiltered(allOrders.filter(o =>
          PAID_STATUSES.includes(o.payment_status)))
        break
      case 'Unpaid':
        // All active orders that still owe money
        setFiltered(allOrders.filter(o =>
          !PAID_STATUSES.includes(o.payment_status) &&
          o.status !== 'cancelled'))
        break
      case 'Cancelled':
        setFiltered(allOrders.filter(o => o.status === 'cancelled'))
        break
      default:
        setFiltered(allOrders)
    }
  }

  function tabCount(tab: string, allOrders: Order[]) {
    switch (tab) {
      case 'All':       return allOrders.length
      case 'Pending':   return allOrders.filter(o => o.status === 'pending').length
      case 'Confirmed': return allOrders.filter(o => o.status === 'confirmed').length
      case 'Assigned':  return allOrders.filter(o =>
        o.status === 'assigned' || o.status === 'out_for_delivery').length
      case 'Delivered': return allOrders.filter(o => o.status === 'delivered').length
      case 'Paid':      return allOrders.filter(o =>
        PAID_STATUSES.includes(o.payment_status)).length
      case 'Unpaid':    return allOrders.filter(o =>
        !PAID_STATUSES.includes(o.payment_status) && o.status !== 'cancelled').length
      case 'Cancelled': return allOrders.filter(o => o.status === 'cancelled').length
      default:          return 0
    }
  }

  async function loadOrders() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, delivery_date,
          payment_method, payment_status,
          total_amount, is_closed, is_test,
          customer:customers(full_name, phone, address),
          order_items(product_name, quantity)
        `)
        .order('updated_at', { ascending: false })
      if (error) throw error
      setOrders((data as any) ?? [])
    } catch (e) {
      console.log('Orders error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function cancelOrder(orderId: string) {
    Alert.alert(
      'Cancel Order?',
      'This will cancel the order. You can undo this.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('orders')
              .update({ status: 'cancelled' }).eq('id', orderId)
            loadOrders()
          }
        }
      ]
    )
  }

  async function undoCancel(orderId: string) {
    await supabase.from('orders')
      .update({ status: 'pending' }).eq('id', orderId)
    loadOrders()
  }

  function onRefresh() { setRefreshing(true); loadOrders() }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    )
  }

  // Revenue total for paid tab
  const paidTotal = filtered
    .filter(o => PAID_STATUSES.includes(o.payment_status))
    .reduce((sum, o) => sum + Number(o.total_amount), 0)

  return (
    <View style={styles.container}>

      {/* Filter Tabs */}
      <View style={styles.tabContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TABS}
          keyExtractor={t => t}
          contentContainerStyle={styles.tabRow}
          renderItem={({ item: tab }) => {
            const count = tabCount(tab, orders)
            return (
              <TouchableOpacity
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText,
                  activeTab === tab && styles.tabTextActive
                ]}>
                  {tab}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabCount,
                    activeTab === tab && styles.tabCountActive
                  ]}>
                    <Text style={[styles.tabCountText,
                      activeTab === tab && styles.tabCountTextActive
                    ]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          }}
        />
      </View>

      {/* Revenue summary for Paid tab */}
      {activeTab === 'Paid' && filtered.length > 0 && (
        <View style={styles.revenueStrip}>
          <Text style={styles.revenueLabel}>Total Collected</Text>
          <Text style={styles.revenueAmount}>${paidTotal.toFixed(2)}</Text>
        </View>
      )}

      <Text style={styles.countText}>
        {filtered.length} order{filtered.length !== 1 ? 's' : ''}
        {activeTab !== 'All' ? ` · ${activeTab}` : ''}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>
              {activeTab === 'Cancelled' ? '🚫' :
               activeTab === 'Paid'      ? '💰' : '📋'}
            </Text>
            <Text style={styles.emptyText}>
              No {activeTab.toLowerCase()} orders
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card,
              item.is_test      && styles.cardTest,
              item.status === 'cancelled' && styles.cardCancelled,
            ]}
            onPress={() => navigation.navigate('OrderDetail',
              { orderId: item.id })}
            activeOpacity={0.85}
          >
            <View style={[styles.accent,
              { backgroundColor: STATUS_COLOR[item.status] ?? '#CBD5E1' }
            ]} />
            <View style={styles.cardBody}>

              <View style={styles.row}>
                <View style={styles.nameBlock}>
                  <Text style={[styles.customerName,
                    item.status === 'cancelled' && styles.textCancelled
                  ]}>
                    {item.customer?.full_name ?? 'Unknown'}
                  </Text>
                  <View style={styles.tags}>
                    {item.is_test && (
                      <View style={styles.testBadge}>
                        <Text style={styles.testBadgeText}>TEST</Text>
                      </View>
                    )}
                    {item.status === 'cancelled' && (
                      <View style={styles.cancelledBadge}>
                        <Text style={styles.cancelledBadgeText}>CANCELLED</Text>
                      </View>
                    )}
                    {PAID_STATUSES.includes(item.payment_status) && (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>✅ PAID</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.amount}>
                  ${Number(item.total_amount).toFixed(2)}
                </Text>
              </View>

              <Text style={styles.phone}>📱 {item.customer?.phone ?? '—'}</Text>
              <Text style={styles.address} numberOfLines={1}>
                📍 {item.customer?.address ?? '—'}
              </Text>
              <Text style={styles.items} numberOfLines={1}>
                🛒 {item.order_items?.map(i =>
                  `${i.product_name} x${i.quantity}`
                ).join(', ') || 'No items'}
              </Text>

              <View style={styles.row}>
                <View style={styles.bottomLeft}>
                  <View style={[styles.badge,
                    { backgroundColor: STATUS_COLOR[item.status] ?? '#CBD5E1' }
                  ]}>
                    <Text style={styles.badgeText}>
                      {item.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={[styles.badge, {
                    backgroundColor: PAID_STATUSES.includes(item.payment_status)
                      ? '#2D6A4F' : '#F4A261'
                  }]}>
                    <Text style={styles.badgeText}>
                      {item.payment_method?.toUpperCase()}
                      {' · '}
                      {item.payment_status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.date}>
                  📅 {item.delivery_date ?? 'No date'}
                </Text>
              </View>

              <View style={styles.actionRow}>
                {item.status !== 'cancelled' &&
                 item.status !== 'delivered' && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => cancelOrder(item.id)}
                  >
                    <Text style={styles.cancelBtnText}>🚫  Cancel Order</Text>
                  </TouchableOpacity>
                )}
                {item.status === 'cancelled' && (
                  <TouchableOpacity
                    style={styles.undoBtn}
                    onPress={() => undoCancel(item.id)}
                  >
                    <Text style={styles.undoBtnText}>↩  Undo Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F8FAFC' },
  center:             { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabContainer:       {
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  tabRow:             { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  tab:                {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#F1F5F9',
  },
  tabActive:          { backgroundColor: '#8B5CF6' },
  tabText:            { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  tabTextActive:      { color: '#fff' },
  tabCount:           {
    backgroundColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  tabCountActive:     { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabCountText:       { fontSize: 10, fontWeight: '800', color: '#64748B' },
  tabCountTextActive: { color: '#fff' },
  revenueStrip:       {
    backgroundColor: '#DCFCE7', padding: 12,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLabel:       { fontSize: 13, fontWeight: '700', color: '#2D6A4F' },
  revenueAmount:      { fontSize: 20, fontWeight: '900', color: '#2D6A4F' },
  countText:          {
    fontSize: 12, color: '#94A3B8',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  card:               {
    backgroundColor: '#fff', borderRadius: 12,
    marginBottom: 12, flexDirection: 'row',
    elevation: 2, overflow: 'hidden',
  },
  cardTest:           { opacity: 0.6 },
  cardCancelled:      { opacity: 0.7, borderWidth: 1, borderColor: '#FECACA' },
  accent:             { width: 5 },
  cardBody:           { flex: 1, padding: 12 },
  row:                {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameBlock:          { flex: 1, marginRight: 8 },
  customerName:       { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  textCancelled:      { color: '#94A3B8', textDecorationLine: 'line-through' },
  tags:               { flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  testBadge:          {
    backgroundColor: '#F1F5F9', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  testBadgeText:      { fontSize: 8, fontWeight: '800', color: '#94A3B8' },
  cancelledBadge:     {
    backgroundColor: '#FEE2E2', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  cancelledBadgeText: { fontSize: 8, fontWeight: '800', color: '#EF4444' },
  paidBadge:          {
    backgroundColor: '#DCFCE7', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  paidBadgeText:      { fontSize: 8, fontWeight: '800', color: '#2D6A4F' },
  amount:             { fontSize: 16, fontWeight: '800', color: '#2D6A4F' },
  phone:              { fontSize: 12, color: '#64748B', marginTop: 4 },
  address:            { fontSize: 12, color: '#64748B', marginTop: 2 },
  items:              { fontSize: 12, color: '#64748B', marginTop: 2, marginBottom: 8 },
  bottomLeft:         { flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' },
  badge:              { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText:          { fontSize: 9, fontWeight: '700', color: '#fff' },
  date:               { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  actionRow:          { marginTop: 8 },
  cancelBtn:          {
    backgroundColor: '#FEF2F2', borderRadius: 8,
    paddingVertical: 7, alignItems: 'center',
    borderWidth: 1, borderColor: '#FECACA',
  },
  cancelBtnText:      { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  undoBtn:            {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingVertical: 7, alignItems: 'center',
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  undoBtnText:        { fontSize: 12, fontWeight: '700', color: '#3B82F6' },
  emptyBox:           { alignItems: 'center', paddingTop: 60 },
  emptyIcon:          { fontSize: 40, marginBottom: 12 },
  emptyText:          { fontSize: 15, color: '#94A3B8', fontWeight: '600' },
})
