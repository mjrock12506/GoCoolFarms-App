import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert,
  ActivityIndicator, Platform
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useAuth } from '../../hooks/useAuth'
import DateTimePicker from '@react-native-community/datetimepicker'
import AddOrderScreen from '../screens/manager/AddOrderScreen'

const STATUS_COLOR: Record<string, string> = {
  pending:          '#F4A261',
  confirmed:        '#52B788',
  assigned:         '#0EA5E9',
  out_for_delivery: '#8B5CF6',
  delivered:        '#2D6A4F',
  cancelled:        '#EF4444',
}

const PAYMENT_STATUSES = [
  { key: 'unpaid',          label: '❌  Unpaid' },
  { key: 'zelle_pending',   label: '⏳  Zelle Pending' },
  { key: 'zelle_confirmed', label: '✅  Zelle Confirmed' },
  { key: 'cash_pending',    label: '⏳  Cash Pending' },
  { key: 'cash_confirmed',  label: '✅  Cash Confirmed' },
  { key: 'card_pending',    label: '⏳  Card Pending' },
  { key: 'card_confirmed',  label: '✅  Card Confirmed' },
  { key: 'paid',            label: '✅  Paid' },
]

const ORDER_STATUSES = [
  'pending','confirmed','assigned',
  'out_for_delivery','delivered','cancelled'
]

export default function OrderDetailScreen() {
  const { user }        = useAuth()
  const route           = useRoute<any>()
  const navigation      = useNavigation<any>()
  const { orderId }     = route.params

  const [order,    setOrder]    = useState<any>(null)
  const [drivers,  setDrivers]  = useState<any[]>([])
  const [notes,    setNotes]    = useState<any[]>([])
  const [newNote,  setNewNote]  = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [showDate, setShowDate] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    await Promise.all([loadOrder(), loadDrivers(), loadNotes()])
    setLoading(false)
  }

  async function loadOrder() {
    const { data } = await supabase
      .from('orders')
      .select('*, customer:customers(*), order_items(*)')
      .eq('id', orderId)
      .single()
    if (data) setOrder(data)
  }

  async function loadDrivers() {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, phone')
      .eq('role', 'driver')
      .eq('is_active', true)
    setDrivers(data ?? [])
  }

  async function loadNotes() {
    const { data } = await supabase
      .from('order_notes')
      .select('*, author:users(full_name)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    setNotes(data ?? [])
  }

  async function updateStatus(status: string) {
    setSaving(true)
    await supabase.from('orders')
      .update({ status, confirmed_by: user?.id })
      .eq('id', orderId)
    await loadOrder()
    setSaving(false)
  }

  async function updatePaymentStatus(payment_status: string) {
    setSaving(true)
    await supabase.from('orders')
      .update({
        payment_status,
        payment_confirmed_by: user?.id,
        payment_confirmed_at: new Date().toISOString(),
      })
      .eq('id', orderId)
    await loadOrder()
    setSaving(false)
  }

  async function assignDriver(driverId: string) {
    setSaving(true)
    const deliveryDate = order.delivery_date ??
      `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`

    const { data: existing } = await supabase
      .from('deliveries')
      .select('id')
      .eq('order_id', orderId)
      .single()

    if (existing) {
      await supabase.from('deliveries')
        .update({ driver_id: driverId, delivery_date: deliveryDate })
        .eq('order_id', orderId)
    } else {
      await supabase.from('deliveries')
        .insert({ order_id: orderId, driver_id: driverId, delivery_date: deliveryDate })
    }

    await supabase.from('orders')
      .update({ status: 'assigned' })
      .eq('id', orderId)

    await loadOrder()
    setSaving(false)
    Alert.alert('✅ Assigned', 'Driver assigned to this order.')
  }

  async function updateDate(date: Date) {
    setShowDate(false)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    setSaving(true)
    await supabase.from('orders')
      .update({ delivery_date: dateStr, date_adjusted_by: user?.id })
      .eq('id', orderId)
    await loadOrder()
    setSaving(false)
  }

  async function addNote() {
    if (!newNote.trim()) return
    await supabase.from('order_notes').insert({
      order_id:  orderId,
      author_id: user?.id,
      note:      newNote.trim(),
      note_type: 'internal',
    })
    setNewNote('')
    await loadNotes()
  }

  async function deleteTestOrder() {
    Alert.alert(
      '🗑  Delete Test Order?',
      'This will permanently delete this test order and all its data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('order_notes').delete().eq('order_id', orderId)
            await supabase.from('deliveries').delete().eq('order_id', orderId)
            await supabase.from('order_items').delete().eq('order_id', orderId)
            await supabase.from('payments').delete().eq('order_id', orderId)
            await supabase.from('orders').delete().eq('id', orderId)
            navigation.goBack()
          }
        }
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text>Order not found</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}
    >

      {/* Test Order Banner */}
      {order.is_test && (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerText}>
            🧪  This is a TEST order — not included in reports
          </Text>
        </View>
      )}

      {/* Customer */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤  Customer</Text>
        <Text style={styles.bigName}>{order.customer?.full_name}</Text>
        <Text style={styles.detail}>📱  {order.customer?.phone}</Text>
        <Text style={styles.detail}>📍  {order.customer?.address}</Text>
      </View>

      {/* Order Items */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🛒  Order Items</Text>
        {order.order_items?.map((item: any) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.product_name}</Text>
            <Text style={styles.itemQty}>x{item.quantity}</Text>
            <Text style={styles.itemPrice}>
              ${Number(item.unit_price * item.quantity).toFixed(2)}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>
            ${Number(order.total_amount).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Delivery Date */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅  Delivery Date</Text>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setShowDate(true)}
        >
          <Text style={styles.dateBtnText}>
            {order.delivery_date ?? 'Tap to set date'}
          </Text>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
        {showDate && (
          <DateTimePicker
            value={order.delivery_date
              ? new Date(order.delivery_date)
              : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, date) => date && updateDate(date)}
          />
        )}
      </View>

      {/* Order Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋  Order Status</Text>
        <View style={styles.btnGrid}>
          {ORDER_STATUSES.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.statusBtn, {
                backgroundColor: order.status === s
                  ? STATUS_COLOR[s] : '#F1F5F9'
              }]}
              onPress={() => updateStatus(s)}
            >
              <Text style={[styles.statusBtnText, {
                color: order.status === s ? '#fff' : '#64748B'
              }]}>
                {s.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Payment Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💰  Payment</Text>
        <Text style={styles.subLabel}>
          Method: {order.payment_method?.toUpperCase()}
        </Text>
        <View style={styles.btnGrid}>
          {PAYMENT_STATUSES.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.statusBtn, {
                backgroundColor: order.payment_status === p.key
                  ? '#2D6A4F' : '#F1F5F9'
              }]}
              onPress={() => updatePaymentStatus(p.key)}
            >
              <Text style={[styles.statusBtnText, {
                color: order.payment_status === p.key ? '#fff' : '#64748B'
              }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Assign Driver */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🚚  Assign Driver</Text>
        {drivers.length === 0 ? (
          <Text style={styles.detail}>No drivers available</Text>
        ) : (
          drivers.map(driver => (
            <TouchableOpacity
              key={driver.id}
              style={styles.driverRow}
              onPress={() => assignDriver(driver.id)}
            >
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driver.full_name}</Text>
                <Text style={styles.driverPhone}>{driver.phone}</Text>
              </View>
              <View style={styles.assignBtn}>
                <Text style={styles.assignBtnText}>Assign</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Internal Notes */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📝  Internal Notes</Text>
        <View style={styles.noteInput}>
          <TextInput
            style={styles.noteTextInput}
            value={newNote}
            onChangeText={setNewNote}
            placeholder="Add a note..."
            placeholderTextColor="#94A3B8"
            multiline
          />
          <TouchableOpacity style={styles.noteAddBtn} onPress={addNote}>
            <Text style={styles.noteAddBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
        {notes.map(note => (
          <View key={note.id} style={styles.noteRow}>
            <View style={styles.noteHeader}>
              <Text style={styles.noteAuthor}>
                {note.author?.full_name ?? 'Unknown'}
              </Text>
              <Text style={styles.noteDate}>
                {new Date(note.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.noteText}>{note.note}</Text>
          </View>
        ))}
        {notes.length === 0 && (
          <Text style={styles.detail}>No notes yet</Text>
        )}
      </View>

      {/* Delete Test Order */}
      {order.is_test && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={deleteTestOrder}
        >
          <Text style={styles.deleteBtnText}>🗑  Delete Test Order</Text>
        </TouchableOpacity>
      )}

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F8FAFC' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  testBanner:     {
    backgroundColor: '#FFF7ED', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#FED7AA',
    alignItems: 'center',
  },
  testBannerText: { fontSize: 12, fontWeight: '700', color: '#F97316' },
  card:           {
    backgroundColor: '#fff', borderRadius: 12,
    margin: 16, marginBottom: 0, padding: 16, elevation: 2,
  },
  cardTitle:      { fontSize: 13, fontWeight: '700', color: '#8B5CF6', marginBottom: 12 },
  bigName:        { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  detail:         { fontSize: 13, color: '#64748B', marginTop: 4 },
  subLabel:       { fontSize: 12, color: '#64748B', marginBottom: 8 },
  itemRow:        {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  itemName:       { fontSize: 13, color: '#0F172A', flex: 1 },
  itemQty:        { fontSize: 13, color: '#64748B', marginHorizontal: 8 },
  itemPrice:      { fontSize: 13, fontWeight: '700', color: '#2D6A4F' },
  totalRow:       {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 10, marginTop: 4,
  },
  totalLabel:     { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  totalAmount:    { fontSize: 18, fontWeight: '800', color: '#2D6A4F' },
  dateBtn:        {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#F1F5F9', borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  dateBtnText:    { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  editText:       { fontSize: 13, color: '#8B5CF6', fontWeight: '600' },
  btnGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn:      {
    borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 8, marginBottom: 4,
  },
  statusBtnText:  { fontSize: 11, fontWeight: '600' },
  driverRow:      {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  driverInfo:     { flex: 1 },
  driverName:     { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  driverPhone:    { fontSize: 12, color: '#64748B', marginTop: 2 },
  assignBtn:      {
    backgroundColor: '#8B5CF6', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  assignBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  noteInput:      { flexDirection: 'row', gap: 8, marginBottom: 12 },
  noteTextInput:  {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 10,
    padding: 10, fontSize: 13, color: '#0F172A', minHeight: 44,
  },
  noteAddBtn:     {
    backgroundColor: '#8B5CF6', borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  noteAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  noteRow:        {
    backgroundColor: '#F8FAFC', borderRadius: 8,
    padding: 10, marginBottom: 8,
  },
  noteHeader:     {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4,
  },
  noteAuthor:     { fontSize: 11, fontWeight: '700', color: '#8B5CF6' },
  noteDate:       { fontSize: 11, color: '#94A3B8' },
  noteText:       { fontSize: 13, color: '#0F172A' },
  deleteBtn:      {
    backgroundColor: '#FEF2F2', margin: 16, marginTop: 20,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#FECACA',
  },
  deleteBtnText:  { fontSize: 14, fontWeight: '700', color: '#EF4444' },
})
