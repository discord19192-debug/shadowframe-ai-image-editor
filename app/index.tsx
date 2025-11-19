
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import {
  AlertCircle,
  Camera,
  Download,
  ImagePlus,
  Merge,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
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

type ActiveTab = 'single' | 'merge';

interface EditHistoryItem {
  image: string;
  prompt: string;
  timestamp: number;
}

const logTag = '[ShadowFrame Editor]' as const;

function resolveWritableDirectory(): string | null {
  const fileSystem = FileSystem as unknown as {
    cacheDirectory?: string | null;
    documentDirectory?: string | null;
  };
  return fileSystem.cacheDirectory ?? fileSystem.documentDirectory ?? null;
}

export default function EditorScreen() {
  const { images, addImage, removeImage, clearImages } = useImages();
  const [prompt, setPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [editHistory, setEditHistory] = useState<EditHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('single');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [permission, requestPermission] = MediaLibrary.usePermissions();

  const triggerSuccessHaptics = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((hapticsError) => {
        console.log(logTag, 'Success haptics error', hapticsError);
      });
    } else {
      console.log(logTag, 'Success haptics skipped on web');
    }
  }, []);

  const triggerFailureHaptics = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch((hapticsError) => {
        console.log(logTag, 'Failure haptics error', hapticsError);
      });
    } else {
      console.log(logTag, 'Failure haptics skipped on web');
    }
  }, []);

  const buildImagePayload = useCallback(() => {
    console.log(logTag, 'Preparing payload for', images.length, 'image(s)');
    return images.map((img) => ({
      type: 'image' as const,
      image: img.base64,
    }));
  }, [images]);

  const parseErrorResponse = useCallback(async (response: Response) => {
    const statusText = `Request failed with status ${response.status}`;
    try {
      const jsonData = await response.clone().json();
      console.log(logTag, 'Error response JSON', jsonData);
      const serialized = typeof jsonData?.error === 'string' ? jsonData.error : JSON.stringify(jsonData?.error ?? {});
      const lower = serialized.toLowerCase();
      if (lower.includes('blocked') || lower.includes('safety')) {
        return 'The request was blocked. Try rewriting the instructions with neutral, descriptive language and avoid sensitive transformations.';
      }
      if (lower.includes('recitation')) {
        return 'The edit references protected content. Describe the change without referencing specific copyrighted material.';
      }
      if (response.status === 422) {
        return 'The edit request was invalid. Check that the prompt and images are supported.';
      }
      if (response.status === 429) {
        return 'Too many requests in a short time. Please wait a few seconds before trying again.';
      }
      return serialized.length > 0 ? serialized : statusText;
    } catch (jsonError) {
      console.log(logTag, 'Error parsing JSON error payload', jsonError);
      try {
        const textData = await response.text();
        console.log(logTag, 'Error response text', textData);
        const lower = textData.toLowerCase();
        if (lower.includes('blocked') || lower.includes('safety')) {
          return 'The request was blocked. Try rewriting the instructions with neutral, descriptive language and avoid sensitive transformations.';
        }
        return textData.length > 0 ? textData : statusText;
      } catch (textError) {
        console.log(logTag, 'Error parsing text error payload', textError);
        return statusText;
      }
    }
  }, []);

  const runEditRequest = useCallback(
    async (promptValue: string) => {
      const payload = buildImagePayload();
      if (payload.length === 0) {
        throw new Error('Add at least one image to continue.');
      }
      console.log(logTag, 'Attempting edit request', {
        promptLength: promptValue.length,
        imageCount: payload.length,
        mode: activeTab,
      });
      const body = JSON.stringify({
        prompt: promptValue,
        images: payload,
        aspectRatio: activeTab === 'merge' ? '3:4' : '16:9',
      });
      let response: Response;
      try {
        response = await fetch('https://toolkit.rork.com/images/edit/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
        });
      } catch (networkError) {
        console.log(logTag, 'Network error when calling edit endpoint', networkError);
        throw new Error('Could not reach the edit service. Check your connection and try again.');
      }
      console.log(logTag, 'Edit response status', response.status);
      if (!response.ok) {
        const message = await parseErrorResponse(response);
        throw new Error(message);
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.log(logTag, 'Failed to parse edit response', jsonError);
        throw new Error('Received an unexpected response from the edit service.');
      }
      const imagePayload = (data as { image?: { base64Data?: string; mimeType?: string }; error?: unknown; text?: unknown }).image;
      if (!imagePayload?.base64Data || !imagePayload?.mimeType) {
        console.log(logTag, 'No image payload returned', data);
        const messageCandidates = [
          typeof (data as { error?: unknown }).error === 'string' ? (data as { error?: string }).error : undefined,
          typeof (data as { text?: unknown }).text === 'string' ? (data as { text?: string }).text : undefined,
        ]
          .filter((candidate): candidate is string => Boolean(candidate))
          .map((candidate) => candidate.toLowerCase());
        if (messageCandidates.some((candidate) => candidate.includes('unable') || candidate.includes('cannot'))) {
          throw new Error('The edit could not be produced. Try simplifying the instructions or removing sensitive requests.');
        }
        throw new Error('No edited image was produced. Try a different prompt.');
      }
      const composed = `data:${imagePayload.mimeType};base64,${imagePayload.base64Data}`;
      console.log(logTag, 'Edit request succeeded');
      return { imageUri: composed, promptUsed: promptValue };
    },
    [activeTab, buildImagePayload, parseErrorResponse],
  );



  const handleSuccess = useCallback(
    ({ imageUri, promptUsed }: { imageUri: string; promptUsed: string }) => {
      console.log(logTag, 'Handling successful edit result');
      setEditHistory((prev) => [
        ...prev,
        {
          image: imageUri,
          prompt: promptUsed,
          timestamp: Date.now(),
        },
      ]);
      setEditedImage(imageUri);
      setPrompt('');
      setError(null);
      triggerSuccessHaptics();
    },
    [triggerSuccessHaptics],
  );

  const pickImage = useCallback(async () => {
    console.log(logTag, 'Opening image picker');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64 && result.assets[0]?.uri) {
      addImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
      console.log(logTag, 'Added image from library');
    }
  }, [addImage]);

  const takePhoto = useCallback(() => {
    console.log(logTag, 'Navigating to camera screen');
    router.push('/camera');
  }, []);

  const continueEditing = useCallback(
    (historyImage: string) => {
      console.log(logTag, 'Continuing editing from history');
      clearImages();
      const base64Data = historyImage.split(',')[1];
      addImage({ uri: historyImage, base64: base64Data });
      setEditedImage(historyImage);
    },
    [addImage, clearImages],
  );

  const undoLastEdit = useCallback(() => {
    console.log(logTag, 'Undoing last edit');
    if (editHistory.length > 1) {
      const updatedHistory = editHistory.slice(0, -1);
      setEditHistory(updatedHistory);
      setEditedImage(updatedHistory[updatedHistory.length - 1].image);
      return;
    }
    setEditHistory([]);
    setEditedImage(null);
  }, [editHistory]);

  const downloadImage = useCallback(
    async (imageUri: string) => {
      console.log(logTag, 'Downloading image');
      if (Platform.OS === 'web') {
        if (typeof document !== 'undefined') {
          const link = document.createElement('a');
          link.href = imageUri;
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
        const filename = `shadowframe-${Date.now()}.png`;
        const directory = resolveWritableDirectory();
        if (!directory) {
          throw new Error('No writable directory available.');
        }
        const fileUri = `${directory}${filename}`;
        const base64Data = imageUri.split(',')[1];
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: 'base64',
        });
        const asset = await MediaLibrary.createAssetAsync(fileUri);
        await MediaLibrary.createAlbumAsync('ShadowFrame', asset, false);
        Alert.alert('Saved', 'Image added to your gallery.');
      } catch (downloadError) {
        console.log(logTag, 'Failed to save image', downloadError);
        Alert.alert('Error', 'Could not save the image.');
      } finally {
        setIsDownloading(false);
      }
    },
    [permission?.granted, requestPermission],
  );

  const generateEdit = useCallback(async () => {
    if (images.length === 0 || prompt.trim().length === 0) {
      console.log(logTag, 'Generate pressed without required input');
      return;
    }
    Keyboard.dismiss();
    setIsGenerating(true);
    setError(null);
    const trimmedPrompt = prompt.trim();
    try {
      const result = await runEditRequest(trimmedPrompt);
      handleSuccess(result);
    } catch (initialError) {
      const initialMessage = initialError instanceof Error ? initialError.message : 'Failed to generate image';
      console.log(logTag, 'Initial edit attempt failed', initialMessage);
      setError(initialMessage);
      triggerFailureHaptics();
    } finally {
      setIsGenerating(false);
    }
  }, [handleSuccess, images.length, prompt, runEditRequest, triggerFailureHaptics]);

  const canGenerate = useMemo(() => {
    if (activeTab === 'single') {
      return images.length > 0 && prompt.trim().length > 0;
    }
    return images.length === 2 && prompt.trim().length > 0;
  }, [activeTab, images.length, prompt]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']} testID="editor-screen">
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
          testID="tab-single"
          style={[styles.tab, activeTab === 'single' && styles.tabActive]}
          onPress={() => setActiveTab('single')}
        >
          <ImagePlus size={20} color={activeTab === 'single' ? Colors.text : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'single' && styles.tabTextActive]}>Single Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-merge"
          style={[styles.tab, activeTab === 'merge' && styles.tabActive]}
          onPress={() => setActiveTab('merge')}
        >
          <Merge size={20} color={activeTab === 'merge' ? Colors.text : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'merge' && styles.tabTextActive]}>Merge Photos</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{activeTab === 'single' ? 'Reference Image' : 'Two Photos to Merge'}</Text>
          <Text style={styles.sectionSubtitle}>
            {activeTab === 'single' ? 'Add an image to edit with AI' : 'Add exactly two photos to merge together'}
          </Text>

          <View style={styles.imageGrid}>
            {images.map((img, index) => (
              <View key={`${img.uri}-${index}`} style={styles.imageCard} testID={`selected-image-${index}`}>
                <Image source={{ uri: img.uri }} style={styles.imagePreview} contentFit="cover" />
                <TouchableOpacity
                  testID={`remove-image-${index}`}
                  style={styles.removeButton}
                  onPress={() => removeImage(index)}
                >
                  <X size={16} color={Colors.text} />
                </TouchableOpacity>
              </View>
            ))}

            {(activeTab === 'single' || (activeTab === 'merge' && images.length < 2)) && (
              <>
                <TouchableOpacity testID="add-gallery" style={styles.addImageButton} onPress={pickImage}>
                  <ImagePlus size={32} color={Colors.purple} />
                  <Text style={styles.addImageText}>Gallery</Text>
                </TouchableOpacity>

                <TouchableOpacity testID="add-camera" style={styles.addImageButton} onPress={takePhoto}>
                  <Camera size={32} color={Colors.blueLight} />
                  <Text style={styles.addImageText}>Camera</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {activeTab === 'merge' && images.length < 2 && (
            <Text style={styles.mergeHint}>Add {2 - images.length} more photo{2 - images.length === 1 ? '' : 's'}</Text>
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
            testID="prompt-input"
            style={styles.promptInput}
            placeholder={
              activeTab === 'single'
                ? "e.g., 'Add neon cyberpunk lighting with moody shadows'"
                : "e.g., 'Blend the face from the first image onto the second in a cinematic portrait style'"
            }
            placeholderTextColor={Colors.textTertiary}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />



          {error && (
            <View style={styles.errorContainer} testID="error-banner">
              <AlertCircle size={20} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            testID="generate-button"
            style={[styles.generateButton, (!canGenerate || isGenerating) && styles.generateButtonDisabled]}
            onPress={generateEdit}
            disabled={!canGenerate || isGenerating}
            accessibilityRole="button"
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
                  <TouchableOpacity testID="undo-edit" style={styles.iconButton} onPress={undoLastEdit}>
                    <Undo2 size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <TouchableOpacity
              testID="result-preview"
              style={styles.resultCard}
              onPress={() => viewFullScreen(editedImage)}
              activeOpacity={0.9}
            >
              <Image source={{ uri: editedImage }} style={styles.resultImage} contentFit="cover" />
              <View style={styles.resultOverlay}>
                <Text style={styles.resultOverlayText}>Tap to view full screen</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.resultButtonsRow}>
              <Pressable
                testID="continue-editing"
                style={styles.continueButton}
                onPress={() => continueEditing(editedImage)}
                accessibilityRole="button"
              >
                <Sparkles size={18} color={Colors.text} />
                <Text style={styles.continueButtonText}>Continue Editing</Text>
              </Pressable>

              <Pressable
                testID="download-result"
                style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
                onPress={() => downloadImage(editedImage)}
                disabled={isDownloading}
                accessibilityRole="button"
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
            <Text style={styles.sectionSubtitle}>{editHistory.length} edit{editHistory.length === 1 ? '' : 's'}</Text>
            <View style={styles.historyContainer}>
              <ScrollView
                testID="history-scroll"
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={styles.historyScroll}
                style={styles.historyScrollView}
                indicatorStyle="white"
              >
                {editHistory.map((item, index) => (
                  <TouchableOpacity
                    key={item.timestamp}
                    testID={`history-card-${index}`}
                    style={styles.historyCard}
                    onPress={() => continueEditing(item.image)}
                  >
                    <Image source={{ uri: item.image }} style={styles.historyImage} contentFit="cover" />
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

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function viewFullScreen(imageUri: string) {
  console.log(logTag, 'Opening full screen preview');
  router.push(`/preview?image=${encodeURIComponent(imageUri)}`);
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
  mergeHint: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.blueLight,
    fontWeight: '600' as const,
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
  infoContainer: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.purple,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: Colors.accent,
    fontSize: 14,
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
  bottomSpacer: {
    height: 40,
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
});