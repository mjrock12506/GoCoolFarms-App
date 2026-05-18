import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Text } from 'react-native'
import RouteScreen     from '../screens/driver/RouteScreen'
import StopDetailScreen from '../screens/driver/StopDetailScreen'

const Tab   = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function RouteStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:      { backgroundColor: '#F97316' },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="RouteList"
        component={RouteScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StopDetail"
        component={StopDetailScreen}
        options={{ title: 'Stop Detail' }}
      />
    </Stack.Navigator>
  )
}

export default function DriverNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor:   '#F97316',
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
        name="RouteTab"
        component={RouteStack}
        options={{
          tabBarLabel: 'My Route',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>��</Text>,
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  )
}
