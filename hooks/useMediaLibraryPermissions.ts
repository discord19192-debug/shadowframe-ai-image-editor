import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type MediaLibraryPermissionTuple = [MediaLibrary.PermissionResponse | null, () => Promise<MediaLibrary.PermissionResponse>];

const webGrantedPermission: MediaLibrary.PermissionResponse = {
  canAskAgain: false,
  expires: 'never',
  granted: true,
  status: MediaLibrary.PermissionStatus.GRANTED,
};

export function useMediaLibraryPermissionsSafe(): MediaLibraryPermissionTuple {
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(
    Platform.OS === 'web' ? webGrantedPermission : null,
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let isMounted = true;

    MediaLibrary.getPermissionsAsync()
      .then((response) => {
        if (isMounted) {
          setPermission(response);
        }
      })
      .catch((error) => {
        console.error('Failed to fetch media library permissions', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermission(webGrantedPermission);
      return webGrantedPermission;
    }

    try {
      const response = await MediaLibrary.requestPermissionsAsync();
      setPermission(response);
      return response;
    } catch (error) {
      console.error('Failed to request media library permissions', error);
      if (permission) {
        return permission;
      }
      return {
        canAskAgain: false,
        expires: 'never',
        granted: false,
        status: MediaLibrary.PermissionStatus.DENIED,
      } as MediaLibrary.PermissionResponse;
    }
  }, [permission]);

  return [permission, requestPermission];
}
