import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Download, Info } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';

const logTag = '[ShadowFrame Preview]' as const;

function resolveWritableDirectory(): string | null {
  const fileSystem = FileSystem as unknown as {
    cacheDirectory?: string | null;
    documentDirectory?: string | null;
  };
  return fileSystem.cacheDirectory ?? fileSystem.documentDirectory ?? null;
}

export default function PreviewScreen() {
  const params = useLocalSearchParams<{ image: string }>();
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const insets = useSafeAreaInsets();
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef<number>(1);
  const lastTranslateX = useRef<number>(0);
  const lastTranslateY = useRef<number>(0);
  const lastTap = useRef<number>(0);

  const hasImage = useMemo(() => typeof params.image === 'string' && params.image.length > 0, [params.image]);
  const topPadding = useMemo(() => Math.max(insets.top + 20, 32), [insets.top]);
  const bottomPadding = useMemo(() => Math.max(insets.bottom + 24, 32), [insets.bottom]);

  const resetZoom = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
      }),
    ]).start();
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
  }, [scale, translateX, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5 || gestureState.numberActiveTouches === 2;
      },
      onPanResponderGrant: (evt) => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          if (lastScale.current > 1) {
            resetZoom();
          } else {
            Animated.parallel([
              Animated.spring(scale, {
                toValue: 2.5,
                useNativeDriver: true,
                friction: 7,
              }),
            ]).start();
            lastScale.current = 2.5;
          }
        }
        lastTap.current = now;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.numberActiveTouches === 2) {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const touch1 = touches[0];
            const touch2 = touches[1];
            const distance = Math.sqrt(
              Math.pow(touch2.pageX - touch1.pageX, 2) + Math.pow(touch2.pageY - touch1.pageY, 2)
            );
            const baseDistance = Math.sqrt(
              Math.pow(
                (touch2.pageX - gestureState.dx) - (touch1.pageX - gestureState.dx),
                2
              ) +
                Math.pow(
                  (touch2.pageY - gestureState.dy) - (touch1.pageY - gestureState.dy),
                  2
                )
            );
            if (baseDistance > 0) {
              const newScale = Math.max(1, Math.min(5, lastScale.current * (distance / baseDistance)));
              scale.setValue(newScale);
            }
          }
        } else if (lastScale.current > 1) {
          translateX.setValue(lastTranslateX.current + gestureState.dx);
          translateY.setValue(lastTranslateY.current + gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.numberActiveTouches === 0) {
          lastScale.current = (scale as Animated.Value & { _value: number })._value;
          lastTranslateX.current = (translateX as Animated.Value & { _value: number })._value;
          lastTranslateY.current = (translateY as Animated.Value & { _value: number })._value;

          if (lastScale.current < 1.2) {
            resetZoom();
          }
        }
      },
    })
  ).current;

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => !prev);
  }, []);

  const handleBack = useCallback(() => {
    console.log(logTag, 'Returning to editor');
    router.back();
  }, []);

  const openPhotopea = useCallback(() => {
    console.log(logTag, 'Opening Photopea');
    Linking.openURL('https://www.photopea.com');
  }, []);

  const downloadImage = useCallback(async () => {
    if (!hasImage || typeof params.image !== 'string') {
      console.log(logTag, 'No image available for download');
      Alert.alert('Error', 'No image available to download.');
      return;
    }
    console.log(logTag, 'Initiating download');
    
    if (Platform.OS === 'web') {
      try {
        if (typeof document !== 'undefined') {
          const link = document.createElement('a');
          link.href = params.image;
          link.download = `shadowframe-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          console.log(logTag, 'Web download initiated');
        } else {
          console.log(logTag, 'Document not available for web download');
          Alert.alert('Error', 'Download not available on this platform.');
        }
      } catch (webError) {
        console.log(logTag, 'Web download failed', webError);
        Alert.alert('Error', 'Failed to download image.');
      }
      return;
    }

    if (!permission?.granted) {
      console.log(logTag, 'Requesting media library permission');
      const permissionResult = await requestPermission();
      if (!permissionResult.granted) {
        console.log(logTag, 'Permission denied by user');
        Alert.alert('Permission Required', 'Please allow gallery access in settings to save images.');
        return;
      }
    }

    setIsDownloading(true);
    try {
      const directory = resolveWritableDirectory();
      if (!directory) {
        throw new Error('No writable directory available.');
      }
      const filename = `shadowframe-${Date.now()}.png`;
      const fileUri = `${directory}${filename}`;
      
      let base64Data: string;
      if (params.image.includes('base64,')) {
        base64Data = params.image.split('base64,')[1];
      } else if (params.image.includes(',')) {
        base64Data = params.image.split(',')[1];
      } else {
        base64Data = params.image;
      }
      
      if (!base64Data || base64Data.length === 0) {
        throw new Error('Invalid image data.');
      }

      console.log(logTag, 'Writing file to', fileUri);
      await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: 'base64' });
      
      console.log(logTag, 'Creating media library asset');
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      
      try {
        await MediaLibrary.createAlbumAsync('ShadowFrame', asset, false);
        console.log(logTag, 'Image saved to ShadowFrame album');
      } catch (albumError) {
        console.log(logTag, 'Album creation skipped or failed', albumError);
      }
      
      console.log(logTag, 'Image saved successfully');
      Alert.alert('Success', 'Image saved to your gallery!');
    } catch (error) {
      console.log(logTag, 'Failed to save image', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not save the image.';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsDownloading(false);
    }
  }, [hasImage, params.image, permission?.granted, requestPermission]);

  if (!hasImage) {
    return (
      <View style={styles.emptyState} testID="preview-empty">
        <Text style={styles.emptyTitle}>No image selected</Text>
        <Text style={styles.emptySubtitle}>Return to the editor to generate an image first.</Text>
        <Pressable style={styles.emptyButton} onPress={handleBack} accessibilityRole="button">
          <Text style={styles.emptyButtonText}>Back to editor</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']} testID="preview-screen">
      <Animated.View
        style={[
          styles.imageContainer,
          {
            transform: [
              { scale },
              { translateX },
              { translateY },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Image source={{ uri: params.image }} style={styles.image} contentFit="contain" />
      </Animated.View>

      {controlsVisible && (
        <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: topPadding }]} pointerEvents="box-none">
          <TouchableOpacity testID="preview-back" style={styles.button} onPress={handleBack}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: bottomPadding }]} pointerEvents="box-none">
          <View style={styles.photopeaHint} testID="photopea-hint">
            <Info size={14} color={Colors.textTertiary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.photopeaText}>
                Use{' '}
                <Text 
                  style={styles.photopeaLink} 
                  onPress={openPhotopea}
                  suppressHighlighting={false}
                >
                  photopea.com
                </Text>{' '}
                to remove the Rork logo from photos
              </Text>
            </View>
          </View>

          <Pressable
            testID="preview-download"
            style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
            onPress={downloadImage}
            disabled={isDownloading}
            accessibilityRole="button"
          >
            {isDownloading ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Download size={20} color={Colors.text} />
                <Text style={styles.downloadButtonText}>Download</Text>
              </>
            )}
          </Pressable>
        </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.toggleControlsButton}
        onPress={toggleControls}
        activeOpacity={0.7}
        testID="toggle-controls"
      >
        <View style={styles.toggleControlsIndicator} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: 20,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    paddingHorizontal: 20,
    gap: 12,
  },
  photopeaHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(138, 43, 226, 0.15)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.purple,
  },
  photopeaText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  photopeaLink: {
    color: Colors.purple,
    fontWeight: '700' as const,
    textDecorationLine: 'underline' as const,
  },
  downloadButton: {
    backgroundColor: Colors.purple,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  downloadButtonDisabled: {
    opacity: 0.5,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  emptyState: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.purple,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  toggleControlsButton: {
    position: 'absolute',
    top: '50%',
    right: 12,
    width: 56,
    height: 56,
    marginTop: -28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleControlsIndicator: {
    width: 6,
    height: 40,
    borderRadius: 3,
    backgroundColor: 'rgba(138, 43, 226, 0.5)',
  },
});