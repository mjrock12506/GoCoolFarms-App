import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useAuth } from '../hooks/useAuth'
import LoginScreen      from '../screens/auth/LoginScreen'
import ManagerNavigator from './ManagerNavigator'
import DriverNavigator  from './DriverNavigator'

export default function RootNavigator() {
  const { user, loading } = useAuth()

  // Still checking if user is logged in
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2D6A4F" />
      </View>
    )
  }

  // Not logged in → show login
  if (!user) return <LoginScreen />

  // Logged in → show correct app based on role
  if (user.role === 'manager') return <ManagerNavigator />
  if (user.role === 'driver')  return <DriverNavigator />

  return <LoginScreen />
}