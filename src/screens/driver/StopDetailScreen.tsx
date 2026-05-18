import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking, Alert,
  ActivityIndicator, TextInput, Platform, Modal
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useAuth } from '../../hooks/useAuth'

const PAYMENT_METHODS = [
  { key: 'cash',  label: '💵  Cash',  color: '#F4A261' },
  { key: 'zelle', label: '📱  Zelle', color: '#8B5CF6' },
  { key: 'card',  label: '💳  Card',  color: '#0EA5E9' },
]

const ZELLE_NUMBER = '919-225-6343'
const ZELLE_NAME   = 'Goldston Group'

export default function StopDetailScreen() {
  const { user }       = useAuth()
  const route          = useRoute<any>()
  const navigation     = useNavigation<any>()
  const { deliveryId, orderId } = route.params

  const [order,          setOrder]          = useState<any>(null)
  const [delivery,       setDelivery]       = useState<any>(null)
  const [note,           setNote]           = useState('')
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  const [showZelle,      setShowZelle]      = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: orderData }, { data: deliveryData }] = await Promise.all([
      supabase.from('orders').select(`
        *, customer:customers(*), order_items(*)
      `).eq('id', orderId).single(),
      supabase.from('deliveries').select('*')
        .eq('id', deliveryId).single(),
    ])
    setOrder(orderData)
    setDelivery(deliveryData)
    if (orderData?.payment_method) {
      setSelectedMethod(orderData.payment_method)
    }
    setLoading(false)
  }

  // ── Fix 1: Proper navigation directions URL ──────────────
  function openNavigation() {
    const address = order?.customer?.address ?? ''
    const encoded = encodeURIComponent(address)

    // Android: opens Google Maps turn-by-turn navigation
    // iOS: opens Apple Maps with directions
    const url = Platform.select({
      android: `google.navigation:q=${encoded}&mode=d`,
      ios:     `http://maps.apple.com/?daddr=${encoded}&dirflg=d`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
    })

    Linking.canOpenURL(url!).then(supported => {
      if (supported) {
        Linking.openURL(url!)
      } else {
        // Fallback to Google Maps web
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`
        )
      }
    })
  }

  function callCustomer() {
    Linking.openURL(`tel:${order?.customer?.phone}`)
  }

  async function updateDeliveryStatus(status: string) {
    setSaving(true)
    await supabase.from('deliveries')
      .update({ status })
      .eq('id', deliveryId)
    await loadData()
    setSaving(false)
  }

  async function markDelivered() {
    Alert.alert(
      'Mark as Delivered?',
      'This will mark the order as delivered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delivered',
          onPress: async () => {
            setSaving(true)
            await supabase.from('deliveries')
              .update({ status: 'delivered', actual_arrival: new Date().toISOString() })
              .eq('id', deliveryId)
            await supabase.from('orders')
              .update({ status: 'delivered' })
              .eq('id', orderId)
            setSaving(false)
            navigation.goBack()
          }
        }
      ]
    )
  }

  // ── Fix 2 + 3: Payment confirmation + undo ───────────────
  async function confirmPayment(method: string) {
    const statusMap: Record<string, string> = {
      cash:  'cash_confirmed',
      zelle: 'zelle_confirmed',
      card:  'card_confirmed',
    }
    setSaving(true)
    await supabase.from('orders')
      .update({
        payment_method:      method,
        payment_status:      statusMap[method],
        payment_confirmed_by: user?.id,
        payment_confirmed_at: new Date().toISOString(),
      })
      .eq('id', orderId)
    await loadData()
    setSaving(false)
    setShowZelle(false)
  }

  async function undoPayment() {
    Alert.alert(
      'Undo Payment?',
      'This will reset the payment status back to unpaid.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            setSaving(true)
            await supabase.from('orders')
              .update({
                payment_status:      'unpaid',
                payment_confirmed_by: null,
                payment_confirmed_at: null,
              })
              .eq('id', orderId)
            await loadData()
            setSaving(false)
          }
        }
      ]
    )
  }

  async function addNote() {
    if (!note.trim()) return
    await supabase.from('order_notes').insert({
      order_id:  orderId,
      author_id: user?.id,
      note:      note.trim(),
      note_type: 'delivery_note',
    })
    setNote('')
    Alert.alert('✅', 'Note saved.')
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    )
  }

  const customer    = order?.customer
  const isPaid      = ['cash_confirmed','zelle_confirmed',
                       'card_confirmed','paid'].includes(order?.payment_status)
  const isDelivered = delivery?.status === 'delivered'

  return (
    <ScrollView style={styles.container}
      contentContainerStyle={{ paddingBottom: 48 }}>

      {/* Customer Banner */}
      <View style={styles.banner}>
        <View style={styles.stopCircle}>
          <Text style={styles.stopNum}>{delivery?.stop_number ?? '?'}</Text>
        </View>
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerName}>{customer?.full_name}</Text>
          <Text style={styles.bannerAddress} numberOfLines={2}>
            📍 {customer?.address}
          </Text>
          <Text style={styles.bannerPhone}>📱 {customer?.phone}</Text>
        </View>
      </View>

      {/* Navigate + Call — Fix 1 */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.navBtn} onPress={openNavigation}>
          <Text style={styles.actionIcon}>🗺</Text>
          <Text style={styles.navBtnText}>Navigate</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.callBtn} onPress={callCustomer}>
          <Text style={styles.actionIcon}>📞</Text>
          <Text style={styles.callBtnText}>Call</Text>
        </TouchableOpacity>
      </View>

      {/* Order Items */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🛒  Order Items</Text>
        {order?.order_items?.map((item: any) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.product_name}</Text>
            <Text style={styles.itemQty}>x{item.quantity}</Text>
            <Text style={styles.itemPrice}>
              ${(item.unit_price * item.quantity).toFixed(2)}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Due</Text>
          <Text style={styles.totalAmount}>
            ${Number(order?.total_amount).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Payment Section — Fix 2 + 3 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💰  Payment</Text>

        {isPaid ? (
          /* ── PAID STATE ── */
          <View>
            <View style={styles.paidBanner}>
              <Text style={styles.paidBannerText}>
                ✅  PAID via {order?.payment_method?.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.paidSub}>
              Confirmed by {user?.full_name}
            </Text>
            {/* Undo button */}
            <TouchableOpacity
              style={styles.undoBtn}
              onPress={undoPayment}
            >
              <Text style={styles.undoBtnText}>↩  Undo Payment</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── UNPAID STATE ── */
          <View>
            {/* Amount */}
            <Text style={styles.bigAmount}>
              ${Number(order?.total_amount).toFixed(2)}
            </Text>

            {/* Method selector */}
            <Text style={styles.methodLabel}>Select Payment Method</Text>
            <View style={styles.methodRow}>
              {PAYMENT_METHODS.map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.methodChip,
                    selectedMethod === m.key && {
                      backgroundColor: m.color,
                      borderColor: m.color,
                    }
                  ]}
                  onPress={() => setSelectedMethod(m.key)}
                >
                  <Text style={[styles.methodChipText,
                    selectedMethod === m.key && { color: '#fff' }
                  ]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Method-specific UI */}
            {selectedMethod === 'cash' && (
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#F4A261' }]}
                onPress={() => confirmPayment('cash')}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.confirmBtnText}>
                      💵  Confirm Cash Received
                    </Text>
                }
              </TouchableOpacity>
            )}

            {selectedMethod === 'zelle' && (
              <View>
                <View style={styles.zelleBox}>
                  <Text style={styles.zelleTitle}>Send to Zelle:</Text>
                  <Text style={styles.zelleName}>{ZELLE_NAME}</Text>
                  <Text style={styles.zelleNumber}>{ZELLE_NUMBER}</Text>
                  <TouchableOpacity
                    style={styles.zelleQRBtn}
                    onPress={() => setShowZelle(true)}
                  >
                    <Text style={styles.zelleQRBtnText}>
                      📷  Show QR Code
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: '#8B5CF6' }]}
                  onPress={() => confirmPayment('zelle')}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.confirmBtnText}>
                        ✅  Confirm Zelle Received
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            )}

            {selectedMethod === 'card' && (
              <View>
                <View style={styles.cardBox}>
                  <Text style={styles.cardBoxText}>
                    💳  Ask customer to pay via card link or tap to pay.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: '#0EA5E9' }]}
                  onPress={() => confirmPayment('card')}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.confirmBtnText}>
                        ✅  Confirm Card Payment
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Delivery Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋  My Status</Text>
        <View style={styles.statusBtns}>
          {['assigned','navigating','arrived'].map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.statusBtn,
                delivery?.status === s && styles.statusBtnActive
              ]}
              onPress={() => updateDeliveryStatus(s)}
            >
              <Text style={[styles.statusBtnText,
                delivery?.status === s && styles.statusBtnTextActive
              ]}>
                {s === 'assigned'   ? '📋 Assigned'   :
                 s === 'navigating' ? '🚗 Navigating' : '📍 Arrived'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Note */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📝  Add Note</Text>
        <View style={styles.noteRow}>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Add delivery note..."
            placeholderTextColor="#94A3B8"
            multiline
          />
          <TouchableOpacity style={styles.noteBtn} onPress={addNote}>
            <Text style={styles.noteBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mark Delivered */}
      {!isDelivered ? (
        <TouchableOpacity
          style={[styles.deliveredBtn, saving && { opacity: 0.6 }]}
          onPress={markDelivered}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.deliveredBtnText}>✓  MARK DELIVERED</Text>
          }
        </TouchableOpacity>
      ) : (
        <View style={styles.deliveredDone}>
          <Text style={styles.deliveredDoneText}>✅  Delivered</Text>
        </View>
      )}

      {/* Zelle QR Modal */}
      <Modal
        visible={showZelle}
        transparent
        animationType="slide"
        onRequestClose={() => setShowZelle(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📱  Zelle Payment</Text>
            <Text style={styles.modalSub}>Ask customer to scan or send to:</Text>

            <View style={styles.zelleModalInfo}>
              <Text style={styles.zelleModalName}>{ZELLE_NAME}</Text>
              <Text style={styles.zelleModalNumber}>{ZELLE_NUMBER}</Text>
            </View>

            {/* QR Placeholder — replace with real QR image later */}
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrPlaceholderText}>
                📷{'\n'}Add your Zelle QR{'\n'}code image here
              </Text>
            </View>
            <Text style={styles.qrNote}>
              Screenshot your Zelle QR from the Zelle app and we will embed it here
            </Text>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowZelle(false)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={() => confirmPayment('zelle')}
              >
                <Text style={styles.modalConfirmText}>✅  Confirm Received</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#F8FAFC' },
  center:              { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner:              {
    backgroundColor: '#F97316', padding: 20,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  stopCircle:          {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  stopNum:             { fontSize: 22, fontWeight: '900', color: '#fff' },
  bannerInfo:          { flex: 1 },
  bannerName:          { fontSize: 18, fontWeight: '800', color: '#fff' },
  bannerAddress:       { fontSize: 12, color: '#FED7AA', marginTop: 4 },
  bannerPhone:         { fontSize: 12, color: '#FED7AA', marginTop: 2 },
  actionRow:           { flexDirection: 'row', padding: 16, gap: 12 },
  navBtn:              {
    flex: 1, backgroundColor: '#2D6A4F', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 14, gap: 8,
  },
  callBtn:             {
    flex: 1, backgroundColor: '#0EA5E9', borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 14, gap: 8,
  },
  actionIcon:          { fontSize: 20 },
  navBtnText:          { fontSize: 15, fontWeight: '700', color: '#fff' },
  callBtnText:         { fontSize: 15, fontWeight: '700', color: '#fff' },
  card:                {
    backgroundColor: '#fff', borderRadius: 12,
    margin: 16, marginBottom: 0, padding: 16, elevation: 2,
  },
  cardTitle:           { fontSize: 13, fontWeight: '700', color: '#F97316', marginBottom: 12 },
  itemRow:             {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  itemName:            { fontSize: 13, color: '#0F172A', flex: 1 },
  itemQty:             { fontSize: 13, color: '#64748B', marginHorizontal: 8 },
  itemPrice:           { fontSize: 13, fontWeight: '700', color: '#2D6A4F' },
  totalRow:            {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 10, marginTop: 4,
  },
  totalLabel:          { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  totalAmount:         { fontSize: 18, fontWeight: '800', color: '#2D6A4F' },
  bigAmount:           {
    fontSize: 44, fontWeight: '900', color: '#F97316',
    textAlign: 'center', marginVertical: 12,
  },
  methodLabel:         { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginBottom: 10 },
  methodRow:           { flexDirection: 'row', gap: 8, marginBottom: 16 },
  methodChip:          {
    flex: 1, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', borderWidth: 2, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  methodChipText:      { fontSize: 12, fontWeight: '700', color: '#475569' },
  confirmBtn:          {
    borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  confirmBtnText:      { fontSize: 15, fontWeight: '800', color: '#fff' },
  zelleBox:            {
    backgroundColor: '#F5F3FF', borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 12,
  },
  zelleTitle:          { fontSize: 12, color: '#8B5CF6', fontWeight: '600', marginBottom: 6 },
  zelleName:           { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  zelleNumber:         { fontSize: 24, fontWeight: '900', color: '#8B5CF6', marginTop: 4 },
  zelleQRBtn:          {
    marginTop: 12, backgroundColor: '#8B5CF6',
    borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8,
  },
  zelleQRBtnText:      { color: '#fff', fontWeight: '700', fontSize: 13 },
  cardBox:             {
    backgroundColor: '#EFF6FF', borderRadius: 12,
    padding: 16, marginBottom: 12,
  },
  cardBoxText:         { fontSize: 13, color: '#0EA5E9', fontWeight: '600', textAlign: 'center' },
  paidBanner:          {
    backgroundColor: '#DCFCE7', borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 8,
  },
  paidBannerText:      { fontSize: 18, fontWeight: '800', color: '#2D6A4F' },
  paidSub:             { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginBottom: 12 },
  undoBtn:             {
    backgroundColor: '#FEF2F2', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#FECACA',
  },
  undoBtnText:         { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  statusBtns:          { flexDirection: 'row', gap: 8 },
  statusBtn:           {
    flex: 1, borderRadius: 8, paddingVertical: 10,
    alignItems: 'center', backgroundColor: '#F1F5F9',
  },
  statusBtnActive:     { backgroundColor: '#F97316' },
  statusBtnText:       { fontSize: 11, fontWeight: '600', color: '#64748B' },
  statusBtnTextActive: { color: '#fff' },
  noteRow:             { flexDirection: 'row', gap: 8 },
  noteInput:           {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 10,
    padding: 10, fontSize: 13, color: '#0F172A', minHeight: 44,
  },
  noteBtn:             {
    backgroundColor: '#F97316', borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  noteBtnText:         { color: '#fff', fontWeight: '700' },
  deliveredBtn:        {
    backgroundColor: '#2D6A4F', margin: 16, marginTop: 20,
    borderRadius: 14, paddingVertical: 20, alignItems: 'center',
  },
  deliveredBtnText:    { fontSize: 18, fontWeight: '900', color: '#fff' },
  deliveredDone:       {
    backgroundColor: '#DCFCE7', margin: 16, borderRadius: 14,
    paddingVertical: 20, alignItems: 'center',
  },
  deliveredDoneText:   { fontSize: 18, fontWeight: '800', color: '#2D6A4F' },
  modalOverlay:        {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalBox:            {
    backgroundColor: '#fff', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24,
  },
  modalTitle:          { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  modalSub:            { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
  zelleModalInfo:      {
    backgroundColor: '#F5F3FF', borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 16,
  },
  zelleModalName:      { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  zelleModalNumber:    { fontSize: 28, fontWeight: '900', color: '#8B5CF6', marginTop: 6 },
  qrPlaceholder:       {
    height: 180, backgroundColor: '#F1F5F9', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed',
  },
  qrPlaceholderText:   {
    fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 22,
  },
  qrNote:              {
    fontSize: 11, color: '#CBD5E1', textAlign: 'center', marginBottom: 16,
  },
  modalBtns:           { flexDirection: 'row', gap: 12 },
  modalClose:          {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCloseText:      { fontSize: 15, fontWeight: '600', color: '#64748B' },
  modalConfirm:        {
    flex: 1, backgroundColor: '#8B5CF6', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  modalConfirmText:    { fontSize: 14, fontWeight: '700', color: '#fff' },
})
