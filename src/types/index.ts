export type UserRole = 'manager' | 'driver'

export interface AppUser {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: UserRole
  is_active: boolean
}

export interface Customer {
  id: string
  full_name: string
  phone: string
  address: string
  lat: number | null
  lng: number | null
  notes: string | null
}

export interface Product {
  id: string
  name: string
  description: string | null
  category: string
  price: number
  unit: string
  stock_qty: number
  image_url: string | null
  is_active: boolean
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
}

export interface Order {
  id: string
  customer_id: string
  status: 'pending' | 'confirmed' | 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled'
  delivery_date: string | null
  payment_method: 'cash' | 'zelle' | 'card'
  payment_status: string
  total_amount: number
  internal_notes: string | null
  payment_notes: string | null
  is_closed: boolean
  customer?: Customer
  order_items?: OrderItem[]
}

export interface Delivery {
  id: string
  order_id: string
  driver_id: string
  delivery_date: string
  stop_number: number | null
  status: 'assigned' | 'navigating' | 'arrived' | 'delivered'
  order?: Order
}