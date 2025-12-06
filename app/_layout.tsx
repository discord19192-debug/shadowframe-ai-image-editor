import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { View, Platform } from "react-native";

import { ImagesContext } from "@/contexts/ImagesContext";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen 
        name="camera" 
        options={{ 
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "slide_from_bottom"
        }} 
      />
      <Stack.Screen 
        name="preview" 
        options={{ 
          headerShown: false,
          presentation: "fullScreenModal"
        }} 
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const GestureWrapper = Platform.OS === 'web' 
    ? ({ children }: { children: React.ReactNode }) => <View style={{ flex: 1 }}>{children}</View>
    : require('react-native-gesture-handler').GestureHandlerRootView;

  return (
    <QueryClientProvider client={queryClient}>
      <ImagesContext>
        <GestureWrapper style={{ flex: 1 }}>
          <RootLayoutNav />
        </GestureWrapper>
      </ImagesContext>
    </QueryClientProvider>
  );
}
