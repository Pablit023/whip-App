import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        // 1. Ocultamos el título de arriba (si lo hubiera)
        headerShown: false,
        // 2. ¡LA MAGIA! Ocultamos la barra de abajo por completo
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'App',
        }}
      />
    </Tabs>
  );
}