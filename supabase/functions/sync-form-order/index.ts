import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { customer, order, items, ordered_at } = await req.json()

        if (!customer?.full_name) return fail('Missing name', cors)
        if (!customer?.phone) return fail('Missing phone', cors)
        if (!customer?.address) return fail('Missing address', cors)
        if (!items?.length) return fail('No items', cors)

        const phone = customer.phone
            .replace(/[\s\-\(\)]/g, '')
            .replace(/^\+?1/, '')

        if (phone.length < 10) return fail('Invalid phone: ' + phone, cors)

        const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', phone)
            .single()

        let customerId: string

        if (existing) {
            await supabase.from('customers').update({
                full_name: customer.full_name,
                address: customer.address,
                source: 'google_form',
            }).eq('phone', phone)
            customerId = existing.id
        } else {
            const { data: newC, error: cErr } = await supabase
                .from('customers')
                .insert({
                    full_name: customer.full_name,
                    phone,
                    address: customer.address,
                    source: 'google_form',
                    is_active: true,
                })
                .select('id').single()
            if (cErr) return fail('Customer error: ' + cErr.message, cors)
            customerId = newC.id
        }

        const total = items.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0)

        const { data: newOrder, error: oErr } = await supabase
            .from('orders')
            .insert({
                customer_id: customerId,
                status: 'pending',
                payment_method: order.payment_method ?? 'zelle',
                payment_status: 'unpaid',
                total_amount: total,
                is_test: false,
                ordered_at: ordered_at ?? null,
            })
            .select('id').single()

        if (oErr) return fail('Order error: ' + oErr.message, cors)

        for (const item of items) {
            const { error: itemError } = await supabase
                .from('order_items')
                .insert({
                    order_id: newOrder.id,
                    product_name: item.product_name,
                    unit_price: item.unit_price,
                    quantity: item.quantity,
                })
            if (itemError) {
                console.error('Item error:', itemError.message, JSON.stringify(item))
            }
        }

        return new Response(
            JSON.stringify({ success: true, order_id: newOrder.id, customer_id: customerId }),
            { headers: { ...cors, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (e: any) {
        return fail('Server error: ' + e.message, cors)
    }
})

function fail(msg: string, cors: any) {
    console.error(msg)
    return new Response(
        JSON.stringify({ success: false, error: msg }),
        { headers: { ...cors, 'Content-Type': 'application/json' }, status: 400 }
    )
}