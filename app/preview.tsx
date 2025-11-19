import { Image } from 'expo-image';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useMediaLibraryPermissionsSafe } from '@/hooks/useMediaLibraryPermissions';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Download, Info } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';

export default function PreviewScreen() {
  const params = useLocalSearchParams<{ image: string }>();
  const insets = useSafeAreaInsets();
  const [isDownloading, setIsDownloading] = useState(false);
  const [permission, requestPermission] = useMediaLibraryPermissionsSafe();

  const downloadImage = async () => {
    if (!params.image) return;

    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = params.image;
      link.download = `shadowframe-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Permission Required',
          'Please grant permission to save images to your gallery'
        );
        return;
      }
    }

    setIsDownloading(true);
    try {
      const filename = `shadowframe-${Date.now()}.png`;
      const file = new File(Paths.cache, filename);

      const base64Data = params.image.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      
      file.create();
      file.write(byteArray);

      const asset = await MediaLibrary.createAssetAsync(file.uri);
      await MediaLibrary.createAlbumAsync('ShadowFrame', asset, false);

      Alert.alert('Success', 'Image saved to gallery!');
    } catch (error) {
      console.error('Error saving image:', error);
      Alert.alert('Error', 'Failed to save image');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: params.image }} style={styles.image} contentFit="contain" />

      <View style={styles.overlay}>
        <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.back()}
            testID="preview-back-button"
          >
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.photopeaHint}>
            <Info size={14} color={Colors.textTertiary} />
            <Text style={styles.photopeaText}>
              Use{' '}
              <Text style={styles.photopeaLink}>photopea.com</Text>
              {' '}to remove the Rork logo from photos
            </Text>
          </View>

          <Pressable
            style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
            onPress={downloadImage}
            disabled={isDownloading}
            testID="preview-download-button"
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
    </View>
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
    backgroundColor: 'transparent',
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    fontWeight: '500' as const,
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
});
