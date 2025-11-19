import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Download, Info } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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

  const hasImage = useMemo(() => typeof params.image === 'string' && params.image.length > 0, [params.image]);
  const topPadding = useMemo(() => Math.max(insets.top + 20, 32), [insets.top]);
  const bottomPadding = useMemo(() => Math.max(insets.bottom + 24, 32), [insets.bottom]);

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
      return;
    }
    console.log(logTag, 'Initiating download');
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        const link = document.createElement('a');
        link.href = params.image;
        link.download = `shadowframe-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        console.log(logTag, 'Document not available for web download');
      }
      return;
    }
    if (!permission?.granted) {
      const permissionResult = await requestPermission();
      if (!permissionResult.granted) {
        Alert.alert('Permission required', 'Allow gallery access to save your image.');
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
      const base64Data = params.image.split(',')[1];
      await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: 'base64' });
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      await MediaLibrary.createAlbumAsync('ShadowFrame', asset, false);
      Alert.alert('Saved', 'Image added to your gallery.');
    } catch (error) {
      console.log(logTag, 'Failed to save image', error);
      Alert.alert('Error', 'Could not save the image.');
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
      <Image source={{ uri: params.image }} style={styles.image} contentFit="contain" />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: topPadding }]} pointerEvents="box-none">
          <TouchableOpacity testID="preview-back" style={styles.button} onPress={handleBack}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: bottomPadding }]} pointerEvents="box-none">
          <View style={styles.photopeaHint} testID="photopea-hint">
            <Info size={14} color={Colors.textTertiary} />
            <Text style={styles.photopeaText}>
              Use{' '}
              <Text style={styles.photopeaLink} onPress={openPhotopea}>
                photopea.com
              </Text>{' '}
              to remove the Rork logo from photos
            </Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.accent,
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
});