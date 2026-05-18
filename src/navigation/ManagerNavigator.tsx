import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text } from 'react-native'
import DashboardScreen     from '../screens/manager/DashboardScreen'
import OrdersScreen        from '../screens/manager/OrdersScreen'
import OrderDetailScreen   from '../screens/manager/OrderDetailScreen'
import ProductsScreen      from '../screens/manager/ProductsScreen'
import RoutesPlannerScreen from '../screens/manager/RoutesPlannerScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

const screenOptions = {
  headerStyle:      { backgroundColor: '#8B5CF6' },
  headerTintColor:  '#fff',
  headerTitleStyle: { fontWeight: '700' },
}

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ title: 'GoCoolFarms' }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ title: 'Order Detail' }}
      />
    </Stack.Navigator>
  )
}

function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="OrdersList"
        component={OrdersScreen}
        options={{ title: 'Orders' }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ title: 'Order Detail' }}
      />
    </Stack.Navigator>
  )
}

export default function ManagerNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor:   '#8B5CF6',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor:  '#E2E8F0',
          height: 60,
          paddingBottom: 8,
        },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardStack}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>⊞</Text>,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersStack}
        options={{
          tabBarLabel: 'Orders',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🗒</Text>,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsScreen}
        options={{
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📦</Text>,
          headerTitle: 'Products',
          headerStyle:      { backgroundColor: '#8B5CF6' },
          headerTintColor:  '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
      <Tab.Screen
        name="Routes"
        component={RoutesPlannerScreen}
        options={{
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🗺</Text>,
          headerTitle: 'Route Planner',
          headerStyle:      { backgroundColor: '#8B5CF6' },
          headerTintColor:  '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
    </Tab.Navigator>
  )
}
