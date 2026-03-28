import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useState } from 'react';

export interface SelectedImage {
  uri: string;
  base64: string;
}

export const [ImagesContext, useImages] = createContextHook(() => {
  const [images, setImages] = useState<SelectedImage[]>([]);

  const addImage = useCallback((image: SelectedImage) => {
    setImages((prev) => [...prev, image]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  return {
    images,
    addImage,
    removeImage,
    clearImages,
  };
});
