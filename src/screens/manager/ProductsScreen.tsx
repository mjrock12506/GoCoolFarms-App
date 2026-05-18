import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, TextInput, Modal
} from 'react-native'
import { supabase } from '../../lib/supabase'

const CATEGORY_COLOR: Record<string, string> = {
  meat:      '#EF4444',
  pickles:   '#F59E0B',
  produce:   '#22C55E',
  dairy:     '#3B82F6',
  bakery:    '#F97316',
  beverages: '#8B5CF6',
  wellness:  '#EC4899',
  other:     '#94A3B8',
}

interface Product {
  id: string
  name: string
  description: string | null
  category: string
  price: number
  unit: string
  stock_qty: number
  is_active: boolean
  is_preorder: boolean
}

export default function ProductsScreen() {
  const [products,   setProducts]   = useState<Product[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing,    setEditing]    = useState<Product | null>(null)
  const [editPrice,  setEditPrice]  = useState('')
  const [editStock,  setEditStock]  = useState('')
  const [editDesc,   setEditDesc]   = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
    setProducts(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }

  function onRefresh() { setRefreshing(true); loadProducts() }

  async function toggleActive(product: Product) {
    await supabase.from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id)
    loadProducts()
  }

  function openEdit(product: Product) {
    setEditing(product)
    setEditPrice(String(product.price))
    setEditStock(String(product.stock_qty))
    setEditDesc(product.description ?? '')
  }

  async function saveEdit() {
    if (!editing) return
    const price = parseFloat(editPrice)
    const stock = parseInt(editStock)
    if (isNaN(price) || price < 0) {
      Alert.alert('Invalid price', 'Please enter a valid price.')
      return
    }
    setSaving(true)
    await supabase.from('products')
      .update({ price, stock_qty: stock, description: editDesc })
      .eq('id', editing.id)
    setSaving(false)
    setEditing(null)
    loadProducts()
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {/* Category colour bar on left */}
            <View style={[styles.catBar,
              { backgroundColor: CATEGORY_COLOR[item.category] ?? '#94A3B8' }
            ]} />

            <View style={styles.cardBody}>

              {/* Product name + category badge */}
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={[styles.catBadge,
                  { backgroundColor: CATEGORY_COLOR[item.category] ?? '#94A3B8' }
                ]}>
                  <Text style={styles.catBadgeText}>{item.category}</Text>
                </View>
              </View>

              {/* Price and unit */}
              <Text style={styles.price}>
                ${Number(item.price).toFixed(2)}
                <Text style={styles.unit}> / {item.unit}</Text>
              </Text>

              {/* Description */}
              {item.description ? (
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              {/* ── Two separate status rows ── */}

              {/* Row 1: LISTING STATUS — is it visible in the app */}
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>App Listing</Text>
                <TouchableOpacity
                  style={[styles.statusToggle,
                    item.is_active ? styles.toggleOn : styles.toggleOff
                  ]}
                  onPress={() => toggleActive(item)}
                >
                  <Text style={styles.toggleText}>
                    {item.is_active ? '👁  Visible to customers' : '��  Hidden from customers'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Row 2: STOCK — physical quantity on hand */}
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Stock</Text>
                <View style={[styles.stockBadge,
                  item.stock_qty === 0 ? styles.stockEmpty : styles.stockAvail
                ]}>
                  <Text style={styles.stockText}>
                    {item.stock_qty === 0
                      ? '⚠️  Out of stock'
                      : `📦  ${item.stock_qty} units available`}
                  </Text>
                </View>
              </View>

              {item.is_preorder && (
                <View style={styles.preorderRow}>
                  <Text style={styles.preorderText}>🔖 Pre-order item</Text>
                </View>
              )}

              {/* Edit button */}
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openEdit(item)}
              >
                <Text style={styles.editBtnText}>✏️  Edit Price & Stock</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Edit Modal */}
      <Modal
        visible={!!editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              Edit — {editing?.name}
            </Text>

            <Text style={styles.modalLabel}>Price ($)</Text>
            <TextInput
              style={styles.modalInput}
              value={editPrice}
              onChangeText={setEditPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.modalLabel}>Stock Quantity</Text>
            <TextInput
              style={styles.modalInput}
              value={editStock}
              onChangeText={setEditStock}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 80 }]}
              value={editDesc}
              onChangeText={setEditDesc}
              multiline
              placeholder="Product description..."
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditing(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveEdit}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Save Changes</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F8FAFC' },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card:         {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    flexDirection: 'row', elevation: 2, overflow: 'hidden',
  },
  catBar:       { width: 5 },
  cardBody:     { flex: 1, padding: 12 },
  row:          {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  name:         { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  catBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  catBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  price:        { fontSize: 17, fontWeight: '800', color: '#2D6A4F', marginBottom: 4 },
  unit:         { fontSize: 12, fontWeight: '400', color: '#94A3B8' },
  desc:         { fontSize: 12, color: '#94A3B8', marginBottom: 8 },

  // Two separate status rows
  statusRow:    {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 6, gap: 10,
  },
  statusLabel:  {
    fontSize: 11, fontWeight: '700',
    color: '#94A3B8', width: 70,
  },

  // Listing toggle button
  statusToggle: {
    flex: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  toggleOn:     { backgroundColor: '#DCFCE7' },
  toggleOff:    { backgroundColor: '#FEE2E2' },
  toggleText:   { fontSize: 11, fontWeight: '600', color: '#0F172A' },

  // Stock badge
  stockBadge:   { flex: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  stockAvail:   { backgroundColor: '#EFF6FF' },
  stockEmpty:   { backgroundColor: '#FFF7ED' },
  stockText:    { fontSize: 11, fontWeight: '600', color: '#0F172A' },

  preorderRow:  { marginBottom: 6 },
  preorderText: { fontSize: 11, color: '#8B5CF6', fontWeight: '600' },

  editBtn:      {
    backgroundColor: '#F1F5F9', borderRadius: 8,
    paddingVertical: 8, alignItems: 'center', marginTop: 4,
  },
  editBtnText:  { fontSize: 13, fontWeight: '600', color: '#8B5CF6' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox:     {
    backgroundColor: '#fff', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 24,
  },
  modalTitle:   { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  modalLabel:   { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, marginTop: 12 },
  modalInput:   {
    backgroundColor: '#F1F5F9', borderRadius: 10,
    padding: 12, fontSize: 15, color: '#0F172A',
  },
  modalBtns:    { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:    {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  cancelBtnText:{ fontSize: 15, fontWeight: '600', color: '#64748B' },
  saveBtn:      {
    flex: 1, backgroundColor: '#2D6A4F', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
})
