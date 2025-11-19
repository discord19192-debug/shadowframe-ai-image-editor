import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useMediaLibraryPermissionsSafe } from '@/hooks/useMediaLibraryPermissions';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { Camera, ImagePlus, Sparkles, X, Download, Undo2, AlertCircle, Merge } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useImages } from '@/contexts/ImagesContext';

interface EditHistoryItem {
  image: string;
  prompt: string;
  timestamp: number;
}

export default function EditorScreen() {
  const { images, addImage, removeImage, clearImages } = useImages();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [editHistory, setEditHistory] = useState<EditHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'single' | 'merge'>('single');
  const [isDownloading, setIsDownloading] = useState(false);
  const [permission, requestPermission] = useMediaLibraryPermissionsSafe();

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const base64 = asset.base64;
      if (base64) {
        addImage({ uri: asset.uri, base64: base64 });
      }
    }
  };

  const takePhoto = () => {
    router.push('/camera');
  };

  const generateEdit = async () => {
    const trimmedPrompt = prompt.trim();
    if (images.length === 0 || !trimmedPrompt) return;

    Keyboard.dismiss();
    setIsGenerating(true);
    setError(null);

    const promptForRequest = trimmedPrompt;

    try {
      const imageData = images.map((img) => ({
        type: 'image' as const,
        image: img.base64,
      }));

      const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
      const endpoint = baseUrl ? `${baseUrl}/api/images/edit` : '/api/images/edit';

      console.log('Sending edit request with', imageData.length, 'images');
      console.log('Using prompt:', promptForRequest);
      console.log('Endpoint:', endpoint);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptForRequest,
          images: imageData,
          aspectRatio: '16:9',
        }),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error payload:', errorText);
        let errorMessage = 'Failed to generate image. Please try again.';

        if (errorText) {
          try {
            const parsed = JSON.parse(errorText) as { message?: unknown; error?: unknown };
            const candidate = typeof parsed.message === 'string' ? parsed.message : typeof parsed.error === 'string' ? parsed.error : null;
            if (candidate && candidate.length > 0) {
              errorMessage = candidate;
            }
          } catch (parseError) {
            console.error('Error parsing JSON error response:', parseError);
            errorMessage = errorText;
          }
        }

        if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
        } else if (response.status === 422) {
          errorMessage = 'Invalid request. Please verify your images and instructions.';
        } else if (response.status === 503) {
          errorMessage = 'Service temporarily unavailable. Please retry shortly.';
        } else if (response.status === 504) {
          errorMessage = 'The request timed out. Please try again.';
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Received edited image');
      const base64Image = `data:${data.image.mimeType};base64,${data.image.base64Data}`;
      
      setEditHistory((prev) => [
        ...prev,
        {
          image: base64Image,
          prompt: promptForRequest,
          timestamp: Date.now(),
        },
      ]);
      setEditedImage(base64Image);
      setPrompt('');
    } catch (caughtError) {
      console.error('Error generating image:', caughtError);
      if (caughtError instanceof TypeError) {
        setError('Network error: Unable to reach the image editing service. Please check your connection and try again.');
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to generate image');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const viewFullScreen = () => {
    if (editedImage) {
      router.push(`/preview?image=${encodeURIComponent(editedImage)}`);
    }
  };

  const continueEditing = (historyImage: string) => {
    clearImages();
    const base64Data = historyImage.split(',')[1];
    addImage({ uri: historyImage, base64: base64Data });
    setEditedImage(historyImage);
  };

  const undoLastEdit = () => {
    if (editHistory.length > 1) {
      const newHistory = [...editHistory];
      newHistory.pop();
      setEditHistory(newHistory);
      setEditedImage(newHistory[newHistory.length - 1].image);
    } else if (editHistory.length === 1) {
      setEditHistory([]);
      setEditedImage(null);
    }
  };

  const downloadImage = async (imageUri: string) => {
    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = imageUri;
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

      const base64Data = imageUri.split(',')[1];
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

  const canGenerate = activeTab === 'single' 
    ? images.length > 0 && prompt.trim().length > 0
    : images.length === 2 && prompt.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Sparkles size={24} color={Colors.accent} />
          </View>
          <Text style={styles.logo}>ShadowFrame</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'single' && styles.tabActive]}
          onPress={() => setActiveTab('single')}
        >
          <ImagePlus size={20} color={activeTab === 'single' ? Colors.text : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'single' && styles.tabTextActive]}>
            Single Edit
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'merge' && styles.tabActive]}
          onPress={() => setActiveTab('merge')}
        >
          <Merge size={20} color={activeTab === 'merge' ? Colors.text : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'merge' && styles.tabTextActive]}>
            Merge Photos
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeTab === 'single' ? 'Reference Image' : 'Two Photos to Merge'}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {activeTab === 'single'
              ? 'Add an image to edit with AI'
              : 'Add exactly 2 photos to merge together'}
          </Text>

          <View style={styles.imageGrid}>
            {images.map((img, index) => (
              <View key={index} style={styles.imageCard}>
                <Image source={{ uri: img.uri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeImage(index)}
                  testID={`remove-image-${index}`}
                >
                  <X size={16} color={Colors.text} />
                </TouchableOpacity>
              </View>
            ))}

            {(activeTab === 'single' || (activeTab === 'merge' && images.length < 2)) && (
              <>
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={pickImage}
                  testID="add-image-from-library-button"
                >
                  <ImagePlus size={32} color={Colors.purple} />
                  <Text style={styles.addImageText}>Gallery</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={takePhoto}
                  testID="open-camera-button"
                >
                  <Camera size={32} color={Colors.blueLight} />
                  <Text style={styles.addImageText}>Camera</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {activeTab === 'merge' && images.length < 2 && (
            <Text style={styles.mergeHint}>
              Add {2 - images.length} more photo{2 - images.length === 1 ? '' : 's'}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Edit Instructions</Text>
          <Text style={styles.sectionSubtitle}>
            {activeTab === 'single'
              ? 'Describe how you want to transform the image'
              : 'Describe how to merge the two photos'}
          </Text>

          <TextInput
            style={styles.promptInput}
            placeholder={
              activeTab === 'single'
                ? "e.g., 'Make it look cyberpunk' or 'Add dramatic lighting'"
                : "e.g., 'Blend both portraits into a cinematic double exposure'"
            }
            placeholderTextColor={Colors.textTertiary}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {error && (
            <View style={styles.errorContainer}>
              <AlertCircle size={20} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[
              styles.generateButton,
              (!canGenerate || isGenerating) && styles.generateButtonDisabled,
            ]}
            onPress={generateEdit}
            disabled={!canGenerate || isGenerating}
            testID="generate-edit-button"
          >
            {isGenerating ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Sparkles size={20} color={Colors.text} />
                <Text style={styles.generateButtonText}>Generate Edit</Text>
              </>
            )}
          </Pressable>
        </View>

        {editedImage && (
          <View style={styles.section}>
            <View style={styles.resultHeader}>
              <Text style={styles.sectionTitle}>Result</Text>
              <View style={styles.resultActions}>
                {editHistory.length > 0 && (
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={undoLastEdit}
                    testID="undo-last-edit-button"
                  >
                    <Undo2 size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.resultCard}
              onPress={viewFullScreen}
              activeOpacity={0.9}
              testID="view-fullscreen-result"
            >
              <Image
                source={{ uri: editedImage }}
                style={styles.resultImage}
                contentFit="cover"
              />
              <View style={styles.resultOverlay}>
                <Text style={styles.resultOverlayText}>
                  Tap to view full screen
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.resultButtonsRow}>
              <Pressable
                style={styles.continueButton}
                onPress={() => continueEditing(editedImage)}
                testID="continue-edit-button"
              >
                <Sparkles size={18} color={Colors.text} />
                <Text style={styles.continueButtonText}>Continue Editing</Text>
              </Pressable>

              <Pressable
                style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
                onPress={() => downloadImage(editedImage)}
                disabled={isDownloading}
                testID="download-edited-image-button"
              >
                {isDownloading ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <>
                    <Download size={18} color={Colors.text} />
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {editHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Edit History</Text>
            <Text style={styles.sectionSubtitle}>
              {editHistory.length} edit{editHistory.length === 1 ? '' : 's'}
            </Text>
            <View style={styles.historyContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={true}
                contentContainerStyle={styles.historyScroll}
                style={styles.historyScrollView}
                indicatorStyle="white"
              >
              {editHistory.map((item, index) => (
                <TouchableOpacity
                  key={item.timestamp}
                  style={styles.historyCard}
                  onPress={() => continueEditing(item.image)}
                  testID={`history-card-${index}`}
                >
                  <Image
                    source={{ uri: item.image }}
                    style={styles.historyImage}
                    contentFit="cover"
                  />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyNumber}>Edit #{index + 1}</Text>
                    <Text style={styles.historyPrompt} numberOfLines={2}>
                      {item.prompt}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              </ScrollView>
              <View style={styles.scrollBarTrack}>
                <View style={styles.scrollBarThumb} />
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logo: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imageCard: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addImageText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  promptInput: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  generateButton: {
    marginTop: 16,
    backgroundColor: Colors.purple,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  resultCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  resultOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
  },
  resultOverlayText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.purple,
    borderColor: Colors.purple,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.text,
  },
  mergeHint: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.blueLight,
    fontWeight: '600' as const,
  },
  errorContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.error,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  continueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.purple,
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  downloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.purple,
  },
  downloadButtonDisabled: {
    opacity: 0.5,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  historyContainer: {
    position: 'relative',
  },
  historyScrollView: {
    paddingBottom: 12,
  },
  historyScroll: {
    gap: 12,
    paddingRight: 20,
  },
  scrollBarTrack: {
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  scrollBarThumb: {
    height: 4,
    width: '40%',
    backgroundColor: Colors.purple,
    borderRadius: 2,
  },
  historyCard: {
    width: 160,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  historyImage: {
    width: '100%',
    height: 120,
  },
  historyInfo: {
    padding: 12,
    gap: 4,
  },
  historyNumber: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.purple,
  },
  historyPrompt: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});
