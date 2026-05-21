import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
  Platform, Modal, FlatList
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useNavigation } from '@react-navigation/native'
import DateTimePicker from '@react-native-community/datetimepicker'

interface Product {
  id: string
  name: string
  price: number
  unit: string
  category: string
}

interface OrderItem {
  product: Product
  quantity: number
}

interface Customer {
  id: string
  full_name: string
  phone: string
  address: string
}

export default function AddOrderScreen() {
  const { user }       = useAuth()
  const navigation     = useNavigation<any>()

  // Customer fields
  const [searchPhone,    setSearchPhone]    = useState('')
  const [foundCustomer,  setFoundCustomer]  = useState<Customer | null>(null)
  const [isNewCustomer,  setIsNewCustomer]  = useState(false)
  const [customerName,   setCustomerName]   = useState('')
  const [customerPhone,  setCustomerPhone]  = useState('')
  const [customerAddress,setCustomerAddress]= useState('')

  // Order fields
  const [items,          setItems]          = useState<OrderItem[]>([])
  const [paymentMethod,  setPaymentMethod]  = useState<'cash'|'zelle'|'card'>('zelle')
  const [deliveryDate,   setDeliveryDate]   = useState<Date | null>(null)
  const [notes,          setNotes]          = useState('')
  const [showDate,       setShowDate]       = useState(false)

  // Products
  const [products,       setProducts]       = useState<Product[]>([])
  const [showProducts,   setShowProducts]   = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [searching,      setSearching]      = useState(false)

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('id, name, price, unit, category')
      .eq('is_active', true)
      .order('sort_order')
    setProducts(data ?? [])
  }

  async function searchCustomer() {
    if (!searchPhone.trim()) return
    setSearching(true)
    const clean = searchPhone.replace(/[\s\-\(\)]/g, '')
    const { data } = await supabase
      .from('customers')
      .select('id, full_name, phone, address')
      .eq('phone', clean)
      .single()

    if (data) {
      setFoundCustomer(data)
      setIsNewCustomer(false)
      setCustomerName(data.full_name)
      setCustomerPhone(data.phone)
      setCustomerAddress(data.address)
    } else {
      setFoundCustomer(null)
      setIsNewCustomer(true)
      setCustomerPhone(clean)
      setCustomerName('')
      setCustomerAddress('')
    }
    setSearching(false)
  }

  function addProduct(product: Product) {
    const existing = items.findIndex(i => i.product.id === product.id)
    if (existing >= 0) {
      const updated = [...items]
      updated[existing].quantity += 1
      setItems(updated)
    } else {
      setItems([...items, { product, quantity: 1 }])
    }
    setShowProducts(false)
  }

  function updateQty(index: number, qty: number) {
    if (qty <= 0) {
      setItems(items.filter((_, i) => i !== index))
      return
    }
    const updated = [...items]
    updated[index].quantity = qty
    setItems(updated)
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0)

  function getDateStr(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  }

  async function submitOrder() {
    if (!customerName.trim()) { Alert.alert('Missing', 'Customer name is required.'); return }
    if (!customerPhone.trim()) { Alert.alert('Missing', 'Customer phone is required.'); return }
    if (!customerAddress.trim()) { Alert.alert('Missing', 'Delivery address is required.'); return }
    if (items.length === 0) { Alert.alert('Missing', 'Add at least one product.'); return }

    setSaving(true)
    try {
      let customerId = foundCustomer?.id

      // Create or update customer
      if (isNewCustomer || !customerId) {
        const clean = customerPhone.replace(/[\s\-\(\)]/g, '')
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', clean)
          .single()

        if (existing) {
          customerId = existing.id
          await supabase.from('customers')
            .update({ full_name: customerName, address: customerAddress })
            .eq('id', customerId)
        } else {
          const { data: newC, error } = await supabase
            .from('customers')
            .insert({
              full_name: customerName,
              phone:     clean,
              address:   customerAddress,
              source:    'manual',
              is_active: true,
            })
            .select('id')
            .single()
          if (error) throw error
          customerId = newC.id
        }
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id:    customerId,
          status:         'pending',
          payment_method: paymentMethod,
          payment_status: 'unpaid',
          total_amount:   total,
          delivery_date:  deliveryDate ? getDateStr(deliveryDate) : null,
          notes:          notes.trim() || null,
          confirmed_by:   user?.id,
          is_test:        false,
        })
        .select('id')
        .single()

      if (orderError) throw orderError

      // Create order items
      for (const item of items) {
        await supabase.from('order_items').insert({
          order_id:     order.id,
          product_id:   item.product.id,
          product_name: item.product.name,
          unit_price:   item.product.price,
          quantity:     item.quantity,
        })
      }

      Alert.alert(
        '✅ Order Created',
        `Order for ${customerName} created successfully.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>

      {/* Customer Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤  Customer</Text>

        {/* Phone search */}
        <Text style={styles.label}>Search by Phone</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={searchPhone}
            onChangeText={setSearchPhone}
            placeholder="Enter phone number"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={searchCustomer}
            disabled={searching}
          >
            {searching
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.searchBtnText}>Search</Text>
            }
          </TouchableOpacity>
        </View>

        {foundCustomer && (
          <View style={styles.foundBanner}>
            <Text style={styles.foundText}>✅  Existing customer found</Text>
          </View>
        )}
        {isNewCustomer && (
          <View style={styles.newBanner}>
            <Text style={styles.newText}>➕  New customer — fill details below</Text>
          </View>
        )}

        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={styles.input}
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="Customer full name"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.label}>Phone *</Text>
        <TextInput
          style={styles.input}
          value={customerPhone}
          onChangeText={setCustomerPhone}
          placeholder="10-digit phone number"
          placeholderTextColor="#94A3B8"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Delivery Address *</Text>
        <TextInput
          style={[styles.input, { minHeight: 72 }]}
          value={customerAddress}
          onChangeText={setCustomerAddress}
          placeholder="Full delivery address"
          placeholderTextColor="#94A3B8"
          multiline
        />
      </View>

      {/* Products Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🛒  Order Items</Text>

        {items.map((item, i) => (
          <View key={item.product.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.product.name}</Text>
              <Text style={styles.itemPrice}>
                ${item.product.price.toFixed(2)} / {item.product.unit}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQty(i, item.quantity - 1)}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQty(i, item.quantity + 1)}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtotal}>
              ${(item.product.price * item.quantity).toFixed(2)}
            </Text>
            <TouchableOpacity onPress={() => removeItem(i)}>
              <Text style={styles.removeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={styles.addProductBtn}
          onPress={() => setShowProducts(true)}
        >
          <Text style={styles.addProductBtnText}>+ Add Product</Text>
        </TouchableOpacity>

        {items.length > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>
          </View>
        )}
      </View>

      {/* Delivery Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅  Delivery Details</Text>

        <Text style={styles.label}>Delivery Date</Text>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setShowDate(true)}
        >
          <Text style={styles.dateBtnText}>
            {deliveryDate ? getDateStr(deliveryDate) : 'Tap to set date'}
          </Text>
          <Text style={styles.editText}>Set</Text>
        </TouchableOpacity>

        {showDate && (
          <DateTimePicker
            value={deliveryDate ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, date) => {
              setShowDate(false)
              if (date) setDeliveryDate(date)
            }}
          />
        )}

        <Text style={styles.label}>Payment Method</Text>
        <View style={styles.methodRow}>
          {(['cash','zelle','card'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.methodChip,
                paymentMethod === m && styles.methodChipActive
              ]}
              onPress={() => setPaymentMethod(m)}
            >
              <Text style={[styles.methodText,
                paymentMethod === m && styles.methodTextActive
              ]}>
                {m === 'cash' ? '💵 Cash' : m === 'zelle' ? '📱 Zelle' : '💳 Card'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, { minHeight: 72 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any special instructions..."
          placeholderTextColor="#94A3B8"
          multiline
        />
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, saving && { opacity: 0.6 }]}
        onPress={submitOrder}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.submitBtnText}>✓  Create Order</Text>
        }
      </TouchableOpacity>

      {/* Product Picker Modal */}
      <Modal
        visible={showProducts}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProducts(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Product</Text>
              <TouchableOpacity onPress={() => setShowProducts(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={products}
              keyExtractor={p => p.id}
              renderItem={({ item: p }) => (
                <TouchableOpacity
                  style={styles.productItem}
                  onPress={() => addProduct(p)}
                >
                  <View style={styles.productItemInfo}>
                    <Text style={styles.productItemName}>{p.name}</Text>
                    <Text style={styles.productItemUnit}>{p.unit} · {p.category}</Text>
                  </View>
                  <Text style={styles.productItemPrice}>
                    ${p.price.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F8FAFC' },
  card:             { backgroundColor: '#fff', borderRadius: 12, margin: 16, marginBottom: 0, padding: 16, elevation: 2 },
  cardTitle:        { fontSize: 13, fontWeight: '700', color: '#8B5CF6', marginBottom: 12 },
  label:            { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 12 },
  input:            { backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, fontSize: 14, color: '#0F172A' },
  searchRow:        { flexDirection: 'row', gap: 10 },
  searchBtn:        { backgroundColor: '#8B5CF6', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },
  foundBanner:      { backgroundColor: '#DCFCE7', borderRadius: 8, padding: 10, marginTop: 8 },
  foundText:        { fontSize: 12, fontWeight: '700', color: '#2D6A4F' },
  newBanner:        { backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10, marginTop: 8 },
  newText:          { fontSize: 12, fontWeight: '700', color: '#0EA5E9' },
  itemRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 8 },
  itemInfo:         { flex: 1 },
  itemName:         { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  itemPrice:        { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  qtyRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn:           { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText:       { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  qtyText:          { fontSize: 15, fontWeight: '700', color: '#0F172A', minWidth: 20, textAlign: 'center' },
  subtotal:         { fontSize: 13, fontWeight: '700', color: '#2D6A4F', minWidth: 55, textAlign: 'right' },
  removeBtn:        { fontSize: 14, color: '#EF4444', paddingHorizontal: 4 },
  addProductBtn:    { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  addProductBtnText:{ fontSize: 14, fontWeight: '700', color: '#8B5CF6' },
  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  totalLabel:       { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  totalAmount:      { fontSize: 20, fontWeight: '900', color: '#2D6A4F' },
  dateBtn:          { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, alignItems: 'center' },
  dateBtnText:      { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  editText:         { fontSize: 13, color: '#8B5CF6', fontWeight: '600' },
  methodRow:        { flexDirection: 'row', gap: 10 },
  methodChip:       { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#F1F5F9', borderWidth: 2, borderColor: '#E2E8F0' },
  methodChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  methodText:       { fontSize: 12, fontWeight: '700', color: '#64748B' },
  methodTextActive: { color: '#fff' },
  submitBtn:        { backgroundColor: '#2D6A4F', margin: 16, marginTop: 20, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  submitBtnText:    { fontSize: 17, fontWeight: '900', color: '#fff' },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:         { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle:       { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  modalClose:       { fontSize: 16, color: '#94A3B8', fontWeight: '700' },
  productItem:      { flexDirection: 'row', alignItems: 'center', padding: 16 },
  productItemInfo:  { flex: 1 },
  productItemName:  { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  productItemUnit:  { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  productItemPrice: { fontSize: 15, fontWeight: '800', color: '#2D6A4F' },
  divider:          { height: 1, backgroundColor: '#F1F5F9' },
})
