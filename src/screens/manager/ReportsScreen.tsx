import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl
} from 'react-native'
import { supabase } from '../../lib/supabase'

type Range = 'today' | 'week' | 'month' | 'all'

const PAID = ['paid','cash_confirmed','zelle_confirmed','card_confirmed']

interface Stats {
  totalRevenue: number
  totalOrders: number
  deliveredOrders: number
  pendingPayments: number
  cashTotal: number
  zelleTotal: number
  cardTotal: number
  topProducts: { name: string; qty: number; revenue: number }[]
}

export default function ReportsScreen() {
  const [range,      setRange]      = useState<Range>('week')
  const [stats,      setStats]      = useState<Stats | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadStats() }, [range])

  function getDateRange() {
    const now   = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    if (range === 'today') return { from: today, to: today }
    if (range === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - 7)
      return { from: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, to: today }
    }
    if (range === 'month') {
      const d = new Date(now); d.setDate(now.getDate() - 30)
      return { from: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, to: today }
    }
    return null
  }

  async function loadStats() {
    try {
      const dateRange = getDateRange()
      let query = supabase.from('orders').select('*').eq('is_test', false)
      if (dateRange) {
        query = query.gte('delivery_date', dateRange.from).lte('delivery_date', dateRange.to)
      }
      const { data: orders } = await query
      if (!orders) { setLoading(false); return }

      const paid       = orders.filter(o => PAID.includes(o.payment_status))
      const revenue    = paid.reduce((s, o) => s + Number(o.total_amount), 0)
      const cashTotal  = paid.filter(o => o.payment_method === 'cash').reduce((s, o) => s + Number(o.total_amount), 0)
      const zelleTotal = paid.filter(o => o.payment_method === 'zelle').reduce((s, o) => s + Number(o.total_amount), 0)
      const cardTotal  = paid.filter(o => o.payment_method === 'card').reduce((s, o) => s + Number(o.total_amount), 0)

      const orderIds = orders.map(o => o.id)
      let topProducts: Stats['topProducts'] = []

      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from('order_items')
          .select('product_name, quantity, unit_price')
          .in('order_id', orderIds)

        if (items) {
          const map: Record<string, { qty: number; revenue: number }> = {}
          items.forEach(i => {
            if (!map[i.product_name]) map[i.product_name] = { qty: 0, revenue: 0 }
            map[i.product_name].qty     += Number(i.quantity)
            map[i.product_name].revenue += Number(i.quantity) * Number(i.unit_price)
          })
          topProducts = Object.entries(map)
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 6)
        }
      }

      setStats({
        totalRevenue: revenue,
        totalOrders: orders.length,
        deliveredOrders: orders.filter(o => o.status === 'delivered').length,
        pendingPayments: orders.filter(o => !PAID.includes(o.payment_status) && o.status !== 'cancelled').length,
        cashTotal, zelleTotal, cardTotal, topProducts,
      })
    } catch (e) {
      console.log('Reports error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  function onRefresh() { setRefreshing(true); loadStats() }

  const ranges: { key: Range; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: '7 Days' },
    { key: 'month', label: '30 Days' },
    { key: 'all',   label: 'All Time' },
  ]

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
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.rangeRow}>
        {ranges.map(r => (
          <TouchableOpacity
            key={r.key}
            style={[styles.rangeChip, range === r.key && styles.rangeChipActive]}
            onPress={() => { setRange(r.key); setLoading(true) }}
          >
            <Text style={[styles.rangeText, range === r.key && styles.rangeTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!stats ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No data for this period</Text>
        </View>
      ) : (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Total Revenue</Text>
            <Text style={styles.heroAmount}>${stats.totalRevenue.toFixed(2)}</Text>
            <Text style={styles.heroSub}>
              from {stats.deliveredOrders} delivered orders · excludes test data
            </Text>
          </View>

          <View style={styles.grid}>
            <StatBox label="Total Orders"    value={String(stats.totalOrders)}       color="#8B5CF6" />
            <StatBox label="Delivered"       value={String(stats.deliveredOrders)}   color="#2D6A4F" />
            <StatBox label="Pending Payment" value={String(stats.pendingPayments)}   color="#F4A261" />
            <StatBox label="Cash Collected"  value={`$${stats.cashTotal.toFixed(0)}`}  color="#F97316" />
            <StatBox label="Zelle Collected" value={`$${stats.zelleTotal.toFixed(0)}`} color="#8B5CF6" />
            <StatBox label="Card Collected"  value={`$${stats.cardTotal.toFixed(0)}`}  color="#0EA5E9" />
          </View>

          {stats.totalRevenue > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Breakdown</Text>
              <View style={styles.barCard}>
                <View style={styles.barRow}>
                  {stats.cashTotal  > 0 && <View style={[styles.barSeg, { flex: stats.cashTotal,  backgroundColor: '#F97316' }]} />}
                  {stats.zelleTotal > 0 && <View style={[styles.barSeg, { flex: stats.zelleTotal, backgroundColor: '#8B5CF6' }]} />}
                  {stats.cardTotal  > 0 && <View style={[styles.barSeg, { flex: stats.cardTotal,  backgroundColor: '#0EA5E9' }]} />}
                </View>
                <View style={styles.legendRow}>
                  {[
                    { label: 'Cash',  amount: stats.cashTotal,  color: '#F97316' },
                    { label: 'Zelle', amount: stats.zelleTotal, color: '#8B5CF6' },
                    { label: 'Card',  amount: stats.cardTotal,  color: '#0EA5E9' },
                  ].filter(l => l.amount > 0).map(l => (
                    <View key={l.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                      <Text style={styles.legendText}>{l.label}  ${l.amount.toFixed(0)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {stats.topProducts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Products</Text>
              {stats.topProducts.map((p, i) => (
                <View key={p.name} style={styles.productRow}>
                  <View style={[styles.rankBadge, {
                    backgroundColor: i === 0 ? '#F4A261' : i === 1 ? '#94A3B8' : '#CBD5E1'
                  }]}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{p.name}</Text>
                    <Text style={styles.productQty}>qty: {p.qty}</Text>
                  </View>
                  <Text style={styles.productRevenue}>${p.revenue.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statBar, { backgroundColor: color }]} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F8FAFC' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rangeRow:       {
    flexDirection: 'row', padding: 16, gap: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  rangeChip:      { flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center' },
  rangeChipActive:{ backgroundColor: '#8B5CF6' },
  rangeText:      { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  rangeTextActive:{ color: '#fff' },
  heroCard:       { backgroundColor: '#2D6A4F', margin: 16, borderRadius: 16, padding: 24, alignItems: 'center' },
  heroLabel:      { fontSize: 13, color: '#B7E4C7', fontWeight: '600' },
  heroAmount:     { fontSize: 48, fontWeight: '900', color: '#fff', marginVertical: 8 },
  heroSub:        { fontSize: 11, color: '#B7E4C7', textAlign: 'center' },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10, marginBottom: 8 },
  statBox:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, width: '30.5%', elevation: 2, overflow: 'hidden' },
  statBar:        { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  statValue:      { fontSize: 20, fontWeight: '800', marginTop: 6 },
  statLabel:      { fontSize: 9, color: '#94A3B8', marginTop: 3 },
  section:        { paddingHorizontal: 16, marginTop: 8 },
  sectionTitle:   { fontSize: 14, fontWeight: '700', color: '#1B4332', marginBottom: 10 },
  barCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
  barRow:         { flexDirection: 'row', height: 20, borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  barSeg:         { height: '100%' },
  legendRow:      { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:      { width: 10, height: 10, borderRadius: 5 },
  legendText:     { fontSize: 12, color: '#475569', fontWeight: '600' },
  productRow:     { backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', padding: 12, elevation: 2 },
  rankBadge:      { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rankText:       { fontSize: 12, fontWeight: '800', color: '#fff' },
  productInfo:    { flex: 1 },
  productName:    { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  productQty:     { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  productRevenue: { fontSize: 15, fontWeight: '800', color: '#2D6A4F' },
  emptyBox:       { alignItems: 'center', paddingTop: 80 },
  emptyText:      { fontSize: 15, color: '#94A3B8', fontWeight: '600' },
})
